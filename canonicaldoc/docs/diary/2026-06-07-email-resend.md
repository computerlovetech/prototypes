# Diary: Wire up email delivery via Resend

Email was the standing functional blocker — magic links only printed to the
console and invites were stored but never sent, so no real user could sign in or
be onboarded. This task wires real transactional email through Resend so both the
magic-link sign-in and teammate invites actually reach inboxes.

## Step 1: Resend-backed email module + invite delivery

**Author:** main

### Prompt Context

**Verbatim prompt:** "Yes please wire up email. Use resend."
**Interpretation:** Replace the `deliver_magic_link` stub (which raised
`NotImplementedError` when `EMAIL_ENABLED`) with a real Resend integration, and
make invites send too.
**Inferred intent:** Close the #1 pre-revenue blocker so the magic-link signup
and invite flows work against real email.

### What I did
- `uv add resend` (2.30.1).
- New `/app/emails.py`: a single module owning all transactional email. Public
  `send_magic_link(to, link)` and `send_invite(to, team_name, login_url)`; in dev
  (`EMAIL_ENABLED=false`) both print to the console (preserving the old
  copy-the-link dev workflow), in prod both render a minimal monochrome HTML
  email (brand-matched: white/ink, system font, one dark CTA button + raw-link
  fallback) and send via `resend.Emails.send`. A missing `RESEND_API_KEY` in prod
  raises a clear `RuntimeError`.
- `/app/config.py`: added `RESEND_API_KEY` (default empty) and `EMAIL_FROM`
  (default `CanonicalDoc <login@canonicaldoc.com>`).
- `/app/auth.py`: deleted the old `deliver_magic_link` stub.
- `/app/main.py`: `login` now calls `emails.send_magic_link`; the `invite` route
  now calls `emails.send_invite` right after persisting the pending invite — so an
  invited teammate actually gets an email telling them to sign in with that
  address.
- Docs: README env table (added `RESEND_API_KEY`/`EMAIL_FROM`, clarified
  `EMAIL_ENABLED`), README roadmap (email no longer pending — only Stripe left),
  and `docker-compose.yml` (passes the two new vars through).

### Why
Centralizing both email types in one `emails.py` keeps content + the
dev/prod switch in one place and makes the next templates (e.g. billing receipts)
trivial to add. Sending the invite email inside the existing invite route was the
missing half of the "invite teammates by email" promise — the DB row already
existed, it just never notified anyone.

### What worked
- Direct unit check of both paths: dev prints; prod (with `resend.Emails.send`
  monkeypatched) builds the correct payload — right `to`, `from`, subject, and the
  link present in the HTML; missing-key guard raises.
- Full route test through `TestClient` (as a context manager so the lifespan
  `init_db()` runs): `/login` → 200 check-email, `/auth?token=...` → 303 into the
  team doc, `/{slug}/invite` → 303 with the pending invite row created and the
  invite email dispatched. All green.

### What didn't work
First `TestClient` run hit `no such table: magictoken` — the app creates tables in
the FastAPI lifespan, which only fires when `TestClient` is used as a context
manager (`with TestClient(app) as c:`). Instantiating it plainly skips lifespan.
Fixed the test, not the app.

### What I learned
Named the module `emails.py`, not `email.py`, to avoid shadowing both the stdlib
`email` package and the `email` form-field parameter used throughout the routes.

### What was tricky
Nothing structural — the existing `EMAIL_ENABLED` seam and the `deliver_magic_link`
call site made this a clean swap. The only judgment call was scope: I treated
"wire up email" as including invite emails, since the diaries repeatedly framed
email as "the blocker for invites" and the invite route was silently half-done.

### What warrants review
- The Resend sender domain must be verified and `EMAIL_FROM` set to a matching
  address before production send, or Resend will reject the request.
- `resend.Emails.send` is called synchronously inside the request handler (in a
  threadpool via FastAPI's sync route). Fine at low volume; revisit with a
  background task if send latency becomes user-visible.
- No retry/queue on send failure yet — a Resend outage surfaces as a 500 on
  login/invite. Acceptable for v0.

### Future work
With email done, the remaining pre-revenue blockers are Stripe billing and the
actual deploy/dogfood. Optional polish: self-host the Inter webfont, OG meta.
