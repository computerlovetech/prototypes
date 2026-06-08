"""Stripe billing: a flat per-team subscription with a free trial.

Disabled entirely when ``BILLING_ENABLED`` is false (dev / self-host) — every
team then has full access, no trial, no paywall. When enabled:

* each new team gets a ``TRIAL_DAYS`` free trial (tracked by ``trial_ends_at``);
* once the trial ends, editing locks (read-only) until the team subscribes via
  Stripe Checkout;
* teams whose members match the comp allowlist (``COMP_EMAILS`` /
  ``COMP_DOMAINS``) are always free — this is how the owner dogfoods for free.

Truth about a subscription comes from Stripe webhooks, not the redirect back
from Checkout. We only treat a team as paid once a webhook says so.
"""
import math
from dataclasses import dataclass
from typing import Optional

import stripe
from sqlmodel import Session, select

from app.config import settings
from app.models import Team, User, utcnow

# Stripe subscription statuses that grant editing access. `past_due` is included
# so a team keeps working during Stripe's automatic retry/dunning window rather
# than locking the instant a card renewal blips.
ACTIVE_STATUSES = {"active", "trialing", "past_due"}


@dataclass
class Access:
    """The billing-derived access state for a team."""

    state: str  # "off" | "exempt" | "active" | "trialing" | "locked"
    can_edit: bool
    days_left: Optional[int] = None  # trial days remaining, when trialing
    status: Optional[str] = None  # raw Stripe status, when relevant


def _comp_emails() -> set[str]:
    return {e.strip().lower() for e in settings.COMP_EMAILS.split(",") if e.strip()}


def _comp_domains() -> set[str]:
    return {d.strip().lower().lstrip("@") for d in settings.COMP_DOMAINS.split(",") if d.strip()}


def team_is_comp(session: Session, team: Team) -> bool:
    """True if any member of the team is on the comp allowlist."""
    emails = _comp_emails()
    domains = _comp_domains()
    if not emails and not domains:
        return False
    members = session.exec(select(User).where(User.team_id == team.id)).all()
    for m in members:
        addr = m.email.strip().lower()
        if addr in emails:
            return True
        if "@" in addr and addr.split("@", 1)[1] in domains:
            return True
    return False


def access(session: Session, team: Team) -> Access:
    """Compute whether this team may currently edit, and why."""
    if not settings.BILLING_ENABLED:
        return Access("off", can_edit=True)
    if team_is_comp(session, team):
        return Access("exempt", can_edit=True)
    if team.subscription_status in ACTIVE_STATUSES:
        return Access("active", can_edit=True, status=team.subscription_status)
    now = utcnow()
    if team.trial_ends_at and now < team.trial_ends_at:
        days_left = max(1, math.ceil((team.trial_ends_at - now).total_seconds() / 86400))
        return Access("trialing", can_edit=True, days_left=days_left,
                      status=team.subscription_status)
    return Access("locked", can_edit=False, status=team.subscription_status)


# ---------- Stripe API ----------

def _configure() -> None:
    if not settings.STRIPE_SECRET_KEY:
        raise RuntimeError("BILLING_ENABLED is true but STRIPE_SECRET_KEY is not set")
    stripe.api_key = settings.STRIPE_SECRET_KEY


def create_checkout_url(team: Team, user: User, base_url: str) -> str:
    """Start a subscription Checkout session and return its hosted URL."""
    _configure()
    if not settings.STRIPE_PRICE_ID:
        raise RuntimeError("STRIPE_PRICE_ID is not set")
    params = {
        "mode": "subscription",
        "line_items": [{"price": settings.STRIPE_PRICE_ID, "quantity": 1}],
        "success_url": f"{base_url}/{team.slug}?billing=success",
        "cancel_url": f"{base_url}/{team.slug}?billing=cancel",
        "client_reference_id": str(team.id),
        "metadata": {"team_id": str(team.id)},
        "subscription_data": {"metadata": {"team_id": str(team.id)}},
        "allow_promotion_codes": True,
    }
    # Reuse the team's customer if we have one, else let Stripe make one keyed to
    # the signed-in user's email.
    if team.stripe_customer_id:
        params["customer"] = team.stripe_customer_id
    else:
        params["customer_email"] = user.email
    return stripe.checkout.Session.create(**params).url


def create_portal_url(team: Team, base_url: str) -> str:
    """Open the Stripe Customer Portal so the team can manage/cancel billing."""
    _configure()
    if not team.stripe_customer_id:
        raise RuntimeError("Team has no Stripe customer yet")
    return stripe.billing_portal.Session.create(
        customer=team.stripe_customer_id,
        return_url=f"{base_url}/{team.slug}",
    ).url


# ---------- Webhooks ----------

def _find_team(session: Session, obj: dict) -> Optional[Team]:
    """Locate the team a Stripe object belongs to, by metadata then customer."""
    team_id = (obj.get("metadata") or {}).get("team_id") or obj.get("client_reference_id")
    if team_id:
        team = session.get(Team, int(team_id))
        if team:
            return team
    customer = obj.get("customer")
    if customer:
        return session.exec(
            select(Team).where(Team.stripe_customer_id == customer)
        ).first()
    return None


def handle_webhook(session: Session, payload: bytes, sig_header: str) -> str:
    """Verify and apply a Stripe webhook event. Returns the event type.

    Raises stripe.error.SignatureVerificationError / ValueError on a bad
    payload so the caller can return 400.
    """
    _configure()
    event = stripe.Webhook.construct_event(
        payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
    )
    etype = event["type"]
    obj = event["data"]["object"]

    if etype == "checkout.session.completed":
        team = _find_team(session, obj)
        if team:
            team.stripe_customer_id = obj.get("customer") or team.stripe_customer_id
            team.stripe_subscription_id = obj.get("subscription") or team.stripe_subscription_id
            team.subscription_status = "active"
            session.add(team)
            session.commit()
    elif etype in (
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
    ):
        team = _find_team(session, obj)
        if team:
            team.stripe_customer_id = obj.get("customer") or team.stripe_customer_id
            team.stripe_subscription_id = obj.get("id") or team.stripe_subscription_id
            team.subscription_status = (
                "canceled" if etype.endswith("deleted") else obj.get("status")
            )
            session.add(team)
            session.commit()

    return etype
