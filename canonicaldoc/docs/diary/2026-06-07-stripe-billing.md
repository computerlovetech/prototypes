# Diary: Stripe billing

Turning CanonicalDoc into a live paid product: teams get a free trial, then pay
a flat per-team subscription via Stripe to keep editing. The owner dogfoods for
free via a comp allowlist.

## Step 1: Wire Stripe Checkout + Customer Portal billing

**Author:** main

### Prompt Context

**Verbatim prompt:** "I would like to add support for Stripe payment ... so
users or customers can actually pay for it ... I would also [like to] have an
account myself ... which I can dogfood ... it should be live ... I should have a
special account ... where we can use it for free." (Asked me to raise clarifying
questions first.)
**Interpretation:** Add real, live Stripe billing gating the product, plus a
comped account so the owner can use it free while dogfooding.
**Inferred intent:** Validate willingness-to-pay without locking himself out.

Used AskUserQuestion to pin four decisions. Answers: **flat per-team
subscription**, **free trial then lock editing**, **env allowlist** for the comp
account, **Stripe Checkout + Customer Portal** (hosted).

### What I did
The MVP already had a `BILLING_ENABLED` seam, so this slotted in cleanly.
- `config.py`: `STRIPE_SECRET_KEY` / `STRIPE_PRICE_ID` / `STRIPE_WEBHOOK_SECRET`,
  `TRIAL_DAYS` (14), `COMP_EMAILS` / `COMP_DOMAINS`.
- `models.py`: `Team` gains `trial_ends_at` (default now+`TRIAL_DAYS`),
  `stripe_customer_id`, `stripe_subscription_id`, `subscription_status`.
- `db.py`: a tiny SQLite migration (`PRAGMA table_info` → `ALTER TABLE ADD
  COLUMN`) that adds the new columns to the long-lived DB and backfills
  `trial_ends_at` from `created_at` so existing teams aren't instantly locked.
- `billing.py` (new): `access(team) -> Access(state, can_edit, days_left)` —
  `off` (billing disabled) / `exempt` (comp) / `active` / `trialing` / `locked`.
  Plus `create_checkout_url`, `create_portal_url`, and a `handle_webhook` that
  is the *source of truth* (Checkout's redirect is not trusted).
- `main.py`: gate `save`/`invite` on `can_edit`; new routes
  `POST /{slug}/billing/checkout`, `POST /{slug}/billing/portal`,
  `POST /stripe/webhook`.
- `doc.html` + `style.css`: a banner — trial countdown / "subscribe to keep
  editing" lock / "manage billing" when active — and the Edit button hidden when
  locked.
- README + docker-compose: documented the env vars and Stripe setup.

### Why
Hosted Checkout + Portal means almost no payment code and no PCI surface —
fits the server-rendered, minimal-moving-parts ethos. Webhook-as-truth avoids
granting access off a spoofable redirect. The comp allowlist keeps the owner
(and any teammate on his domain) free without a code change.

### What worked
Verified three ways with throwaway scripts: (1) `access()` across all states
incl. comp-by-email, comp-by-domain, canceled re-lock, billing-off; (2) a full
TestClient HTTP flow — trial edit → expire → save+invite blocked + Edit hidden →
fake `checkout.session.completed` webhook flips the team to active → editing
works + "Manage billing" shows → bad signature returns 400; (3) the SQLite
migration on a hand-built *old* schema, backfilling `trial_ends_at` to
created+14d and re-running idempotently.

### What didn't work
TestClient didn't trigger the lifespan (so `init_db` never ran → "no such table")
until I called `init_db()` explicitly in the harness. Not an app bug.

### What I learned
SQLModel/`create_all` never alters existing tables, so adding columns to a
deployed SQLite file needs an explicit `ALTER TABLE` pass. Cheap to hand-roll
for one table; would reach for Alembic if the schema churns more.

### What was tricky
Two notions of "trialing": our app-level pre-subscription trial
(`trial_ends_at`) vs. Stripe's own trial. Kept it simple — no Stripe trial;
Checkout creates an immediately-active subscription, and our trial is the only
free window. `past_due` is treated as still-active so a renewal blip doesn't
instantly lock a paying team during Stripe's dunning retries.

### What warrants review
- The owner must do the out-of-band Stripe setup: create the Product/Price
  (`STRIPE_PRICE_ID`), add the webhook endpoint (`/stripe/webhook`) for
  `checkout.session.completed` + `customer.subscription.*`, and set live keys.
- `COMP_EMAILS`/`COMP_DOMAINS` must be set to the owner's address to dogfood free.
- No proration/seat logic — flat per-team by design.

### Future work
Optional: surface trial state on the landing page; dunning emails on `past_due`;
annual plan. Recursion (promote a section to its own doc) still the real
differentiator.
