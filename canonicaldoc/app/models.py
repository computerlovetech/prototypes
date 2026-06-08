from datetime import datetime, timedelta
from typing import Optional

from sqlmodel import Field, SQLModel

from app.config import settings


def utcnow() -> datetime:
    return datetime.utcnow()


def default_trial_end() -> datetime:
    return utcnow() + timedelta(days=settings.TRIAL_DAYS)


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    team_id: Optional[int] = Field(default=None, foreign_key="team.id", index=True)
    created_at: datetime = Field(default_factory=utcnow)


class Team(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    slug: str = Field(index=True, unique=True)
    created_at: datetime = Field(default_factory=utcnow)
    # ---- Billing ----
    # End of the free trial; after this, editing locks until subscribed.
    trial_ends_at: Optional[datetime] = Field(default_factory=default_trial_end)
    stripe_customer_id: Optional[str] = Field(default=None, index=True)
    stripe_subscription_id: Optional[str] = Field(default=None, index=True)
    # Raw Stripe subscription status: active / past_due / canceled / ... or None.
    subscription_status: Optional[str] = Field(default=None)


class Doc(SQLModel, table=True):
    """The one canonical doc per team."""

    id: Optional[int] = Field(default=None, primary_key=True)
    team_id: int = Field(foreign_key="team.id", index=True, unique=True)
    body: str = Field(default="")
    updated_at: datetime = Field(default_factory=utcnow)
    updated_by: Optional[str] = Field(default=None)


class MagicToken(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True)
    token: str = Field(index=True, unique=True)
    expires_at: datetime
    used: bool = Field(default=False)


class Invite(SQLModel, table=True):
    """Pending invite: when this email logs in, they join team_id."""

    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True)
    team_id: int = Field(foreign_key="team.id", index=True)
    created_at: datetime = Field(default_factory=utcnow)
