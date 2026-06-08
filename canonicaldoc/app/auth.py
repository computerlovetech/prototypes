import re
import secrets
from datetime import timedelta
from typing import Optional

from fastapi import Request
from itsdangerous import BadSignature, URLSafeSerializer
from sqlmodel import Session, select

from app.config import settings
from app.models import MagicToken, User, utcnow

_serializer = URLSafeSerializer(settings.SECRET_KEY, salt="session")
SESSION_COOKIE = "cdoc_session"
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def valid_email(email: str) -> bool:
    return bool(_EMAIL_RE.match(email.strip().lower()))


def sign_session(user_id: int) -> str:
    return _serializer.dumps({"uid": user_id})


def read_session(request: Request) -> Optional[int]:
    raw = request.cookies.get(SESSION_COOKIE)
    if not raw:
        return None
    try:
        return _serializer.loads(raw).get("uid")
    except BadSignature:
        return None


def current_user(request: Request, session: Session) -> Optional[User]:
    uid = read_session(request)
    if uid is None:
        return None
    return session.get(User, uid)


def create_magic_token(session: Session, email: str) -> MagicToken:
    token = secrets.token_urlsafe(32)
    mt = MagicToken(
        email=email.strip().lower(),
        token=token,
        expires_at=utcnow() + timedelta(minutes=settings.MAGIC_TOKEN_TTL_MINUTES),
    )
    session.add(mt)
    session.commit()
    session.refresh(mt)
    return mt


def consume_magic_token(session: Session, token: str) -> Optional[str]:
    """Return the email if the token is valid & unused, else None. Marks used."""
    mt = session.exec(select(MagicToken).where(MagicToken.token == token)).first()
    if not mt or mt.used or mt.expires_at < utcnow():
        return None
    mt.used = True
    session.add(mt)
    session.commit()
    return mt.email
