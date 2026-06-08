from sqlmodel import Session, SQLModel, create_engine

from app.config import settings

connect_args = {"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(settings.DATABASE_URL, connect_args=connect_args)


def init_db() -> None:
    import app.models  # noqa: F401  ensure models are registered

    SQLModel.metadata.create_all(engine)
    _migrate_billing_columns()


# New billing columns added to `team` after first release. `create_all` never
# alters existing tables, so for the long-lived SQLite file we add them by hand.
_TEAM_BILLING_COLUMNS = {
    "trial_ends_at": "DATETIME",
    "stripe_customer_id": "VARCHAR",
    "stripe_subscription_id": "VARCHAR",
    "subscription_status": "VARCHAR",
}


def _migrate_billing_columns() -> None:
    if not settings.DATABASE_URL.startswith("sqlite"):
        return  # non-sqlite deployments should use real migrations
    with engine.begin() as conn:
        existing = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(team)")}
        added = []
        for col, sql_type in _TEAM_BILLING_COLUMNS.items():
            if col not in existing:
                conn.exec_driver_sql(f"ALTER TABLE team ADD COLUMN {col} {sql_type}")
                added.append(col)
        # Backfill trials for teams that predate the column so they aren't
        # instantly locked: give them a trial window from their creation date.
        if "trial_ends_at" in added:
            conn.exec_driver_sql(
                "UPDATE team SET trial_ends_at = datetime(created_at, ?) "
                "WHERE trial_ends_at IS NULL",
                (f"+{settings.TRIAL_DAYS} days",),
            )


def get_session():
    with Session(engine) as session:
        yield session
