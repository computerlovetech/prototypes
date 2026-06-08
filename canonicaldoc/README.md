# CanonicalDoc

The one doc to rule them all. One company, one canonical doc — vision,
strategy, roles, OKRs, nomenclature — at one stable link your whole team
bookmarks. Inspired by Naomi Gleit's "Canonical Everything".

Open source (AGPL) and self-hostable. Paid SaaS hosting at canonicaldoc.com.

## What it does (v0)

- Magic-link sign in (no passwords)
- Each company gets **one** canonical markdown doc, pre-filled with a template
- Invite teammates by email; everyone shares the same doc at `/<team-slug>`
- Markdown editor + rendered view, "last edited by" stamp

## Run locally

```bash
uv run uvicorn app.main:app --reload
```

Open http://localhost:8000. Email is off in dev, so the magic link is
**printed to the console** — copy it into your browser.

## Configuration (env vars)

| Var | Default | Notes |
| --- | --- | --- |
| `SECRET_KEY` | dev key | set in production |
| `DATABASE_URL` | `sqlite:///./canonicaldoc.db` | Postgres supported |
| `BASE_URL` | `http://localhost:8000` | for magic-link URLs |
| `EMAIL_ENABLED` | `false` | when true, magic links + invites are emailed via Resend |
| `RESEND_API_KEY` | — | Resend API key (required when `EMAIL_ENABLED`) |
| `EMAIL_FROM` | `CanonicalDoc <login@canonicaldoc.com>` | verified Resend sender |
| `BILLING_ENABLED` | `false` | when true, teams get a free trial then must subscribe via Stripe |
| `STRIPE_SECRET_KEY` | — | Stripe secret key (`sk_live_…` / `sk_test_…`) |
| `STRIPE_PRICE_ID` | — | recurring Price for the per-team plan (`price_…`) |
| `STRIPE_WEBHOOK_SECRET` | — | signing secret for the webhook endpoint (`whsec_…`) |
| `TRIAL_DAYS` | `14` | free-trial length before editing locks |
| `COMP_EMAILS` | — | comma-separated emails that are always free (dogfood) |
| `COMP_DOMAINS` | — | comma-separated domains that are always free (dogfood) |

### Billing (Stripe)

When `BILLING_ENABLED=false` (dev / self-host) billing is skipped entirely —
every team has full access. When `true`:

1. Each new team gets a **`TRIAL_DAYS`** free trial; after it ends the doc goes
   **read-only** until the team subscribes.
2. Subscribing uses **Stripe Checkout**; managing/canceling uses the **Customer
   Portal**. Both are Stripe-hosted — we only redirect.
3. Truth about a subscription comes from the **webhook**, not the redirect.

Setup:

- In Stripe, create a recurring **Product + Price** → put the price id in
  `STRIPE_PRICE_ID`.
- Add a webhook endpoint pointing at `https://<your-host>/stripe/webhook`,
  subscribed to `checkout.session.completed` and `customer.subscription.*`.
  Put its signing secret in `STRIPE_WEBHOOK_SECRET`.
- Use `sk_test_…` keys + Stripe test mode while developing; swap to `sk_live_…`
  to go live.
- **Dogfood for free:** set `COMP_EMAILS` (or `COMP_DOMAINS`) to your own
  address — any team you're a member of is then exempt from billing.

## Self-host with Docker

```bash
docker build -t canonicaldoc .
docker run -p 8000:8000 -v $PWD/data:/data \
  -e SECRET_KEY=$(openssl rand -hex 32) canonicaldoc
```

## Roadmap

- Recursion: promote a section into its own linked canonical doc
- Edit-conflict handling / "X is editing" indicator

## Notes

- canonical.team
- canonical.work