# Diary: Brand & landing page — "Sealed."

Give CanonicalDoc an irresistible look and feel for canonicaldoc.com. The MVP
worked but `/` just showed a bare login form. Goal: a brand identity and a
landing page premium enough that landing on the site makes you want to use it —
without being complicated.

## Step 1: Define the brand and build the landing page

**Author:** main

### Prompt Context

**Verbatim prompt:** "great. you need to work on the brand. it should have an
irresistable look and feel. go deep on this. doesnt have to be complicated. but
daamn, it sohuold be iresistable to use when landing on canonicaldoc.com"
**Interpretation:** Design a cohesive visual brand and a marketing landing page
that feels premium and distinctive, then apply it across the app.
**Inferred intent:** Make the product feel trustworthy and desirable on first
glance — the look has to *sell* the "single source of truth" promise.

### What I did
Picked an opinionated brand direction — **"Sealed."** — built on the article's
own framing: a Canonical Doc is the *official* document, so the identity leans
into the official seal/stamp metaphor. The logomark is a wax-seal circle
containing **§** (the section mark — the symbol of documents and canon).

Design tokens (in `/app/static/style.css`):
- Paper `#FBF9F4`, ink `#1B1A17`, single accent "stamp" `#D6432B`
- Display font **Instrument Serif** (editorial, free), body **Inter**
- Deliberately avoided generic SaaS-blue; near-monochrome with sparing red

Implemented:
- `/app/templates/landing.html` — new landing: nav with seal wordmark, hero
  ("One doc to rule them all.") with an inline email form posting to `/login`,
  a CSS-built "stamped paper" mockup (a mini canonical doc with an overlaid
  rotated wax-seal stamp reading "CANONICAL · OFFICIAL ·" around a big §), a
  quote strip ("Where can I find out what I need to know? → Here."), four
  editorial feature blocks, two-plan pricing ($20/mo hosted vs free self-host),
  footer.
- `/app/templates/base.html` — Google Fonts preconnect + Instrument Serif/Inter,
  an inline-SVG seal favicon, better default title.
- Rebranded `/app/templates/login.html`, `/app/templates/check_email.html`,
  `/app/templates/doc.html` (topbar seal) to match.
- Rewrote `/app/static/style.css` as a full design system (buttons, seal
  component, landing sections, auth pages, the doc/rendered-markdown styling).
- `/app/main.py`: `/` now renders `landing.html` when logged out (was
  `login.html`); `/login` still renders `login.html` for the form/error path.

Verified by booting on port 8015 and capturing headless-Chrome screenshots of
the full page and a hero crop.

### Why
A document product is judged on typography and restraint. An editorial,
paper-and-ink aesthetic with one authoritative accent communicates "trustworthy
source of truth" far better than a typical gradient SaaS hero. The seal/§ gives
an ownable, memorable mark tied directly to the product's meaning.

### What worked
First full render looked polished with no layout fixes needed. The headless
screenshot confirmed the hero is genuinely striking: the serif headline plus the
stamped-paper mockup reads instantly as "the official, sealed document." The
`.seal-text` ("CANONICAL · OFFICIAL ·") even reads like a real rubber stamp
arched at the top of the seal. Brand carries consistently across nav, login,
doc app, and favicon.

### What didn't work
Nothing broke. No errors in the server log; routes returned 200 on first try.

### What I learned
Instrument Serif at large sizes (`clamp(52px, 7vw, 88px)`) does most of the
"premium" work on its own — minimal additional styling needed. A single
saturated accent against warm paper is more memorable than a multi-color palette.

### What was tricky
Making the seal read as an authentic stamp without an SVG `textPath`: I faked it
with a bordered circle, an inset pseudo-element ring, a centered serif §, and a
small letter-spaced caption pinned to the top. It looks intentionally
hand-stamped rather than broken, but it's a visual approximation, not true
circular text.

### What warrants review
- `/app/static/style.css` `.seal-stamp` / `.seal-text`: the caption isn't truly
  circular and slightly overlaps the "Jonas" pill in the mockup — acceptable as
  styling, revisit if it bothers. A real `textPath` SVG would be the upgrade.
- Pricing ($20/mo) and GitHub link (`kasperjunge/prototypes`) are placeholders.
- Landing depends on Google Fonts CDN; self-hosters offline would fall back to
  Georgia/system — fine, but worth self-hosting the fonts before launch.

### Future work
Real `textPath` SVG seal; self-host the webfonts; finalize price; a proper OG
image/meta tags for link previews; then back to the functional blocker — email
delivery — before deploying and dogfooding. Brand work not yet committed to git.

## Step 2: Radical simplification — minimize cognitive bandwidth

**Author:** main

### Prompt Context

**Verbatim prompt:** "make this the brand and the simplicity, even more nice and
low cognitive bandwidth... make it very simple and aesthetically pleasing,
simple and minimalistic... the entire idea of this application is to make it
very simple to create extreme clarity... minimize cognitive bandwidth, maximize
signal, minimize noise."
**Interpretation:** The v1 brand was polished but busy; pare it down so the
landing page itself *demonstrates* the product's clarity premise.
**Inferred intent:** The medium is the message — a tool for extreme clarity
should land as the calmest page you've seen.

### What I did
Stripped the landing to one calm centered column (`landing.html` + the LANDING
section of `style.css`). Removed: the eyebrow tag, the long two-clause lede, the
rotated CSS "stamped paper" mockup, the rotated `.seal-stamp`/`.seal-text`
overlay (the approximate, overlapping element the v1 diary itself flagged), the
quote strip, the four numbered feature boxes, and the two feature-list pricing
cards.

What remains, top to bottom: a quiet seal mark, one serif headline ("One doc. /
The whole truth."), one short sub-line, one email field + "Start", three quiet
tenets as borderless rows (no numbers, no boxes), two minimal price cards (number
only), one-line footer. The stamp-red now appears *only* inside the § seals —
used once per region, never as fill. Hero seal de-rotated and centered (the
playful `-7deg` tilt read as noise at hero scale).

### Why
Every removed element was signal competing with the one thing that matters: start
your doc. A near-empty page with generous vertical rhythm communicates "this tool
removes clutter" far more honestly than copy claiming it does.

### What worked
Booted on 8016, route 200, headless screenshot confirms it: the page is mostly
warm paper whitespace with a single dark CTA. Reads instantly, nothing competes,
brand identity (seal + serif + paper/ink) fully intact at a fraction of the
elements.

### What didn't work
Nothing broke; `.seal` base rotation needed an explicit `transform: none`
override on `.hero-seal` so the hero mark sits straight.

### What I learned
Subtraction did the design work. Removing the illustration didn't leave a hole —
the whitespace became the strongest element, and it's on-brand by definition.

### What was tricky
Deciding the floor: how little can carry the brand. Kept exactly three brand
signatures (seal, Instrument Serif headline, paper/ink) and let everything else
go.

### What warrants review
Pricing ($20) and GitHub link still placeholders. No social proof / FAQ — a
deliberate omission; revisit only if conversion needs it. Not committed to git.

### Future work
Unchanged from Step 1 (real `textPath` seal, self-host fonts, OG meta, then email
delivery). The minimalist pass should make those quicker since there's less
surface.
