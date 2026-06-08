import os


class Settings:
    SECRET_KEY: str = os.getenv("SECRET_KEY", "dev-insecure-change-me")
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./canonicaldoc.db")
    BASE_URL: str = os.getenv("BASE_URL", "http://localhost:8000")
    # When false (dev / self-host), magic links are printed to the console
    # instead of emailed, and billing is skipped.
    EMAIL_ENABLED: bool = os.getenv("EMAIL_ENABLED", "false").lower() == "true"
    # Email delivery via Resend (required when EMAIL_ENABLED is true).
    RESEND_API_KEY: str = os.getenv("RESEND_API_KEY", "")
    EMAIL_FROM: str = os.getenv("EMAIL_FROM", "CanonicalDoc <login@canonicaldoc.com>")
    MAGIC_TOKEN_TTL_MINUTES: int = int(os.getenv("MAGIC_TOKEN_TTL_MINUTES", "30"))

    # ---- Billing (Stripe) ----
    # When false (dev / self-host) billing is skipped entirely: every team has
    # full access, no trial, no paywall. When true, each new team gets a
    # TRIAL_DAYS free trial, after which editing locks until they subscribe.
    BILLING_ENABLED: bool = os.getenv("BILLING_ENABLED", "false").lower() == "true"
    STRIPE_SECRET_KEY: str = os.getenv("STRIPE_SECRET_KEY", "")
    # The recurring Price for the flat per-team plan (price_... from Stripe).
    STRIPE_PRICE_ID: str = os.getenv("STRIPE_PRICE_ID", "")
    # Signing secret for the Stripe webhook endpoint (whsec_...).
    STRIPE_WEBHOOK_SECRET: str = os.getenv("STRIPE_WEBHOOK_SECRET", "")
    TRIAL_DAYS: int = int(os.getenv("TRIAL_DAYS", "14"))
    # Comp / dogfood allowlist: any team with a member whose email is in
    # COMP_EMAILS, or whose domain is in COMP_DOMAINS, is always free.
    # Comma-separated, e.g. COMP_EMAILS="me@acme.com", COMP_DOMAINS="acme.com".
    COMP_EMAILS: str = os.getenv("COMP_EMAILS", "")
    COMP_DOMAINS: str = os.getenv("COMP_DOMAINS", "")


settings = Settings()
