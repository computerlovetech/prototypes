import re
from contextlib import asynccontextmanager
from pathlib import Path

import markdown as md
from fastapi import Depends, FastAPI, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlmodel import Session, select

from app import auth, billing, emails
from app.config import settings
from app.db import engine, get_session, init_db
from app.models import Doc, Invite, Team, User, utcnow
from app.template import starter_body

BASE = Path(__file__).parent
templates = Jinja2Templates(directory=str(BASE / "templates"))


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="CanonicalDoc", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=str(BASE / "static")), name="static")


# ---------- helpers ----------

def slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s or "team"


def unique_slug(session: Session, base: str) -> str:
    slug = base
    n = 2
    while session.exec(select(Team).where(Team.slug == slug)).first():
        slug = f"{base}-{n}"
        n += 1
    return slug


def onboard(session: Session, email: str) -> User:
    """Find or create the user. New users join a pending invite team, or get
    their own team + a fresh canonical doc."""
    user = session.exec(select(User).where(User.email == email)).first()
    if user:
        return user

    user = User(email=email)
    invite = session.exec(select(Invite).where(Invite.email == email)).first()
    if invite:
        user.team_id = invite.team_id
        session.add(user)
        session.delete(invite)
        session.commit()
        session.refresh(user)
        return user

    # Brand new owner: create their team + doc.
    company = email.split("@")[0]
    team = Team(name=company, slug=unique_slug(session, slugify(company)))
    session.add(team)
    session.commit()
    session.refresh(team)
    session.add(Doc(team_id=team.id, body=starter_body(team.name)))
    user.team_id = team.id
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def render_md(text: str) -> str:
    return md.markdown(text, extensions=["tables", "fenced_code", "sane_lists", "toc"])


# ---------- routes ----------

@app.get("/", response_class=HTMLResponse)
def index(request: Request, session: Session = Depends(get_session)):
    user = auth.current_user(request, session)
    if user and user.team_id:
        team = session.get(Team, user.team_id)
        return RedirectResponse(f"/{team.slug}", status_code=303)
    return templates.TemplateResponse(request, "landing.html")


@app.post("/login", response_class=HTMLResponse)
def login(request: Request, email: str = Form(...), session: Session = Depends(get_session)):
    email = email.strip().lower()
    if not auth.valid_email(email):
        return templates.TemplateResponse(
            request, "login.html", {"error": "Enter a valid email."}
        )
    mt = auth.create_magic_token(session, email)
    link = f"{settings.BASE_URL}/auth?token={mt.token}"
    emails.send_magic_link(email, link)
    dev_link = None if settings.EMAIL_ENABLED else link
    return templates.TemplateResponse(
        request, "check_email.html", {"email": email, "dev_link": dev_link}
    )


@app.get("/auth")
def authenticate(token: str, session: Session = Depends(get_session)):
    email = auth.consume_magic_token(session, token)
    if not email:
        return HTMLResponse("Invalid or expired link.", status_code=400)
    user = onboard(session, email)
    team = session.get(Team, user.team_id)
    resp = RedirectResponse(f"/{team.slug}", status_code=303)
    resp.set_cookie(
        auth.SESSION_COOKIE,
        auth.sign_session(user.id),
        httponly=True,
        samesite="lax",
        max_age=60 * 60 * 24 * 30,
    )
    return resp


@app.get("/logout")
def logout():
    resp = RedirectResponse("/", status_code=303)
    resp.delete_cookie(auth.SESSION_COOKIE)
    return resp


def _require_member(request: Request, slug: str, session: Session):
    user = auth.current_user(request, session)
    if not user:
        return None, None, None
    team = session.exec(select(Team).where(Team.slug == slug)).first()
    if not team or user.team_id != team.id:
        return user, None, None
    doc = session.exec(select(Doc).where(Doc.team_id == team.id)).first()
    return user, team, doc


def version_token(doc: Doc) -> str:
    """Opaque token identifying the current saved revision."""
    return doc.updated_at.isoformat()


def _render_doc(request, session, team, doc, user, *, edit=False, conflict=None,
                draft_body=None, flash=None):
    members = session.exec(select(User).where(User.team_id == team.id)).all()
    pending = session.exec(select(Invite).where(Invite.team_id == team.id)).all()
    access = billing.access(session, team)
    # A locked team can never be in the editor.
    edit = edit and access.can_edit
    return templates.TemplateResponse(
        request,
        "doc.html",
        {
            "team": team,
            "doc": doc,
            "user": user,
            "edit": edit,
            "rendered": render_md(doc.body),
            "members": members,
            "pending": pending,
            "version": version_token(doc),
            "conflict": conflict,
            # the text shown in the editor textarea (their draft on conflict)
            "editor_body": draft_body if draft_body is not None else doc.body,
            "billing": access,
            "flash": flash,
        },
    )


_FLASHES = {
    "success": "Subscription active — thanks for supporting CanonicalDoc.",
    "cancel": "Checkout canceled. You can subscribe any time to keep editing.",
}


@app.get("/{slug}", response_class=HTMLResponse)
def view_doc(slug: str, request: Request, edit: bool = False, billing: str = "",
             session: Session = Depends(get_session)):
    user, team, doc = _require_member(request, slug, session)
    if not user:
        return RedirectResponse("/", status_code=303)
    if not team:
        return HTMLResponse("Not found.", status_code=404)
    return _render_doc(request, session, team, doc, user, edit=edit,
                       flash=_FLASHES.get(billing))


@app.post("/{slug}/save")
def save_doc(
    slug: str,
    request: Request,
    body: str = Form(...),
    base_version: str = Form(""),
    session: Session = Depends(get_session),
):
    user, team, doc = _require_member(request, slug, session)
    if not user or not team:
        return RedirectResponse("/", status_code=303)
    # Paywall: a locked (trial-expired, unsubscribed) team is read-only.
    if not billing.access(session, team).can_edit:
        return RedirectResponse(f"/{slug}", status_code=303)
    # Optimistic concurrency: reject if the doc changed since this edit began.
    if base_version and base_version != version_token(doc):
        return _render_doc(
            request,
            session,
            team,
            doc,
            user,
            edit=True,
            conflict=f"{doc.updated_by or 'Someone'} saved a newer version while you "
            "were editing. Your text is preserved below — merge it with the current "
            "version (shown by canceling) before saving again.",
            draft_body=body,
        )
    doc.body = body
    doc.updated_at = utcnow()
    doc.updated_by = user.email
    session.add(doc)
    session.commit()
    return RedirectResponse(f"/{slug}", status_code=303)


@app.post("/{slug}/invite")
def invite(slug: str, request: Request, email: str = Form(...), session: Session = Depends(get_session)):
    user, team, _ = _require_member(request, slug, session)
    if not user or not team:
        return RedirectResponse("/", status_code=303)
    # Locked teams can't grow until they subscribe.
    if not billing.access(session, team).can_edit:
        return RedirectResponse(f"/{slug}", status_code=303)
    email = email.strip().lower()
    if auth.valid_email(email):
        existing = session.exec(select(User).where(User.email == email)).first()
        already = session.exec(
            select(Invite).where(Invite.email == email, Invite.team_id == team.id)
        ).first()
        if not existing and not already:
            session.add(Invite(email=email, team_id=team.id))
            session.commit()
            emails.send_invite(email, team.name, settings.BASE_URL)
    return RedirectResponse(f"/{slug}", status_code=303)


# ---------- billing ----------

@app.post("/{slug}/billing/checkout")
def billing_checkout(slug: str, request: Request, session: Session = Depends(get_session)):
    user, team, _ = _require_member(request, slug, session)
    if not user or not team:
        return RedirectResponse("/", status_code=303)
    if not settings.BILLING_ENABLED:
        return RedirectResponse(f"/{slug}", status_code=303)
    url = billing.create_checkout_url(team, user, settings.BASE_URL)
    return RedirectResponse(url, status_code=303)


@app.post("/{slug}/billing/portal")
def billing_portal(slug: str, request: Request, session: Session = Depends(get_session)):
    user, team, _ = _require_member(request, slug, session)
    if not user or not team:
        return RedirectResponse("/", status_code=303)
    if not settings.BILLING_ENABLED or not team.stripe_customer_id:
        return RedirectResponse(f"/{slug}", status_code=303)
    url = billing.create_portal_url(team, settings.BASE_URL)
    return RedirectResponse(url, status_code=303)


@app.post("/stripe/webhook")
async def stripe_webhook(request: Request, session: Session = Depends(get_session)):
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    try:
        billing.handle_webhook(session, payload, sig)
    except Exception:
        # Bad signature or malformed payload — tell Stripe to retry/ignore.
        return HTMLResponse("invalid", status_code=400)
    return HTMLResponse("ok")
