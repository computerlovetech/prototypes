# Diary: CanonicalDoc MVP

Building the simplest possible SaaS for canonicaldoc.com — implementing Naomi
Gleit's "Canonical Everything" idea for teams. Open source (AGPL), self-hostable,
paid hosting later. First user: the author's own startup. Scope narrowed during
design to **one company, one canonical doc** (vision/strategy/roles/OKRs), not
per-project. Stack: FastAPI + SQLModel + SQLite, server-rendered Jinja2, `uv`.

## Step 1: Scope the product

**Author:** main

### Prompt Context

**Verbatim prompt:** "I want to build a super simple saas on the domain
canonicaldoc.com that implements and achieves this for teams: [Naomi Gleit
'Canonical Everything' article]. What is the absolute simplest product I can
make to achieve this?" (paid + open source, wants to dogfood first).
**Interpretation:** Design the minimal product that delivers the article's core
promise — one link where a team finds everything it needs to know.
**Inferred intent:** Avoid over-building; ship something usable fast and
validate by self-use before selling.

### What I did
Reduced the article to one primitive: a single canonical page per team with an
opinionated template. Used AskUserQuestion to pin three decisions. Answers:
clean empty markdown (not structured fields), dogfood with the company team,
Python/FastAPI. Then the user further narrowed scope to **one doc per company**
(no per-project docs) — so v0 has no doc list, no "new doc" button.

### Why
The opinion *is* the product. Freeform markdown + the one-link-per-company
constraint is the thinnest thing that still embodies "Canonical Everything."

### What worked
The scope conversation collapsed the data model from {teams, projects, docs} to
{team, one doc}. Much smaller surface.

### What didn't work
N/A — design only.

### What I learned
The user reads verbosely-formatted responses poorly; they explicitly asked for
short answers midway. Keep responses terse going forward.

### What was tricky
Resisting the urge to build structured fields (workstreams/owners as DB rows).
The user wanted plain markdown; the structure lives in a template, not the schema.

### What warrants review
Whether plain markdown is too thin (risk: "just a wiki"). The differentiation is
the one-doc constraint + future recursion. Dogfooding will tell.

### Future work
Recursion ("promote a section to its own canonical doc") is the real
differentiator, deferred until the single doc feels too big.

## Step 2: Scaffold the FastAPI app

**Author:** main

### Prompt Context

**Verbatim prompt:** "let's go with simplest. (also remember to use uv). GO!"
**Interpretation:** Build the MVP now with uv.
**Inferred intent:** Stop designing, produce running code.

### What I did
`uv init canonicaldoc`, added deps (`fastapi[standard]`, `sqlmodel`,
`itsdangerous`, `markdown`, `python-multipart`, `jinja2`). Created:
- `/app/config.py` — env-driven settings, `EMAIL_ENABLED`/`BILLING_ENABLED` seams
- `/app/models.py` — `User`, `Team`, `Doc` (one per team, unique team_id),
  `MagicToken`, `Invite`
- `/app/db.py` — engine + `init_db()` on lifespan
- `/app/auth.py` — magic-link tokens, `itsdangerous`-signed session cookie,
  `deliver_magic_link` (prints to console in dev)
- `/app/template.py` — the canonical doc starter (Vision/Strategy/Roles &
  Owners/OKRs/People/Nomenclature/Links)
- `/app/main.py` — routes: `/`, `/login`, `/auth`, `/logout`, `/{slug}`,
  `/{slug}/save`, `/{slug}/invite`
- Jinja templates (login, check_email, doc) + `/app/static/style.css`
- `Dockerfile`, `README.md`, `.gitignore`

Auth/onboarding logic: on first login, a pending `Invite` → join that team;
otherwise create a new team + fresh doc. Returning users just get a session.

### Why
Server-rendered + SQLite = single `docker run` self-host, minimal moving parts.

### What worked
Whole flow verified by curl on first complete pass once bugs (below) fixed:
login → magic link → auth (cookie set, team+doc created) → view → save → invite
→ unauth redirect.

### What didn't work
Two real failures:

1. `uv init` selected **Python 3.14**. Jinja2's template cache crashed:
   `TypeError: cannot use 'tuple' as a dict key (unhashable type: 'dict')`.
   Fix: pinned `requires-python = ">=3.12"`, `.python-version` 3.13, Docker
   `python:3.13-slim`.

2. **Starlette 1.2.1** changed `TemplateResponse` signature — `request` is now
   the first positional arg. Calling `TemplateResponse("login.html", {...})`
   made `name` the dict → `TypeError: unhashable type: 'dict'`. Fixed all four
   call sites to `TemplateResponse(request, "name.html", {...})`.

### What I learned
Starlette 1.x is a real breaking change from 0.x — the legacy
`TemplateResponse(name, context)` order is gone. Watch for it in any FastAPI
project pulling current deps.

### What was tricky
Both errors surfaced as the same opaque "unhashable" message from deep in Jinja,
masking two unrelated root causes. Had to read the full traceback in the server
log to separate the Python-version issue from the Starlette signature issue.

### What warrants review
- `app/auth.py`: session cookie TTL is hardcoded 30 days; secret defaults to an
  insecure dev key. `app/main.py` `onboard()`: anyone with no invite silently
  gets their own team+doc — fine for now, revisit before public launch.

### Future work
Real email delivery (next blocker for invites), deploy, then recursion/Stripe.

## Step 3: Deployment config

**Author:** main

### Prompt Context

**Verbatim prompt:** "can this be deployed on a free cloudflare worker?" → then
"I also have coolify, on a server" → "yes" (to docker-compose).
**Interpretation:** Find a real deploy target; produce compose for Coolify.
**Inferred intent:** Get it hostable on existing infra.

### What I did
Confirmed Cloudflare Workers can't run a Python/FastAPI server (JS/WASM only).
User has Coolify, which runs the Dockerfile directly. Wrote
`/docker-compose.yml`: builds the image, maps 8000, mounts named volume
`cdoc-data` at `/data` (where SQLite lives), wires env vars with sane defaults
and a required `SECRET_KEY`.

### Why
Coolify + compose gives persistent SQLite across redeploys via the named volume.

### What worked
Compose is minimal and matches the Dockerfile's `/data` volume + env seams.

### What didn't work
N/A.

### What I learned
Render/Railway free tiers have ephemeral disk (SQLite resets) — Fly.io or a
self-hosted Coolify with a volume are the realistic free SQLite hosts.

### What was tricky
Nothing.

### What warrants review
Confirm the Coolify resource mounts `cdoc-data` and sets `SECRET_KEY`/`BASE_URL`
before first deploy, or SQLite data won't persist and magic links will point at
the wrong host.

### Future work
Wire real email before inviting anyone; deploy; dogfood a week.

## Step 4: Edit-conflict safety + AGPL license

**Author:** main

### Prompt Context

**Verbatim prompt:** "great. build it!" (referring to the two self-contained
next-iteration items I proposed: AGPL LICENSE + edit-conflict version check).
**Interpretation:** Implement optimistic concurrency on save and add the license.
**Inferred intent:** Prevent silent data loss on the source-of-truth doc; make
the repo honestly open source.

### What I did
- Fetched official GNU AGPL-3.0 text into `/LICENSE`.
- Added `version_token(doc)` (= `updated_at.isoformat()`), a shared
  `_render_doc()` helper, and optimistic-concurrency logic in `save_doc`: the
  edit form carries a hidden `base_version`; if it no longer matches the doc's
  current token, the save is rejected, a conflict banner is shown, and the
  user's draft text is preserved in the textarea (`editor_body`).
- Updated `/app/templates/doc.html` (hidden field, conflict banner, editor_body)
  and `/app/static/style.css` (conflict styling).

### Why
Last-write-wins on a shared "one source of truth" doc means silent clobbering.
Optimistic concurrency is the cheapest fix that avoids the CRDT rabbit hole.

### What worked
Verified by curl: captured `base_version`, save #1 with valid token → 303
(success); save #2 reusing the stale token → 200 with "saved a newer version"
banner and the draft preserved; doc retained "First edit" — stale write blocked,
no data loss.

### What didn't work
N/A — passed on first test run.

### What I learned
Revision-as-timestamp is sufficient as an opaque version token for a single-doc
app; no need for a separate version column.

### What was tricky
Threading the draft body back into the editor on conflict so the user doesn't
lose typing — handled via `editor_body` (draft on conflict, else `doc.body`).

### What warrants review
`save_doc` in `/app/main.py`: conflict path returns the *server's* current doc
for rendering but the *user's* draft in the textarea. There's no side-by-side
merge UI — the user must reload (cancel) to see the current version. Acceptable
for v0; revisit if conflicts become common.

### Future work
Next blocker: real email delivery (Postmark/Resend) so invites work. Then commit
+ deploy to Coolify, dogfood, then recursion / Stripe billing. Nothing committed
to git yet — repo still at the single initial commit.
