# Diary: Monochrome rebrand — strip to black & white, no logo

The "Sealed." brand (paper/ink + red § seal + Instrument Serif) was polished but
still carried color, an editorial serif, and a decorative logo. This task pushes
the same product premise — *a tool for extreme clarity should be the calmest page
you've seen* — to its conclusion: near-monochrome, one quiet sans typeface, and
no logo at all.

## Step 1: Iterate the landing toward radical calm

**Author:** main

### Prompt Context

**Verbatim prompt:** "make this the brand and the simplicity, even more nice and
low cognitive bandwidth. Just really iterate over it, make it very simple and
aesthetically pleasing, simple and minimalistic in the expression and the brand
... minimize cognitive bandwidth, minimize signal, maximize signal, minimize
noise."
**Interpretation:** The v1 landing was busy; strip it so the page itself
demonstrates the product's clarity premise.
**Inferred intent:** The medium is the message — subtract until only the one
action (start your doc) remains.

### What I did
Rewrote `/app/templates/landing.html` to a single centered column and replaced
the LANDING section of `/app/static/style.css`. Removed the eyebrow tag, the long
lede, the rotated CSS "stamped paper" mockup, the rotated `.seal-stamp`/
`.seal-text` overlay, the quote strip, the four numbered feature boxes, and the
two feature-list pricing cards. What remained: seal mark, one serif headline, one
sub-line, one email field, three quiet tenets, two minimal price cards, one-line
footer. Verified by booting and capturing a headless-Chrome screenshot.

### Why
Every removed element competed with the single call to action. Generous
whitespace communicates "this tool removes clutter" more honestly than copy.

### What worked
First render was clean; the page reads instantly as calm with nothing competing.

### What didn't work
Nothing broke in this step.

### What I learned
Subtraction did the design work — removing the hero illustration left no hole; the
whitespace became the strongest element.

### What was tricky
Deciding the floor: how little can still carry the brand.

### What warrants review
Pricing ($20) and the GitHub link are still placeholders.

### Future work
Flatten the styling primitives too (next step), then push the palette monochrome.

## Step 2: Flatten the styling primitives

**Author:** main

### Prompt Context

**Verbatim prompt:** "the styling shoudl be more simple as well"
**Interpretation:** Beyond layout, the visual primitives (radii, shadows, hovers,
card chrome) should be quieter too.
**Inferred intent:** Remove ornament from the building blocks, not just the page.

### What I did
In `/app/static/style.css`: dropped `--radius` from 14px to a uniform 8px;
replaced the button lift (`transform: translateY(-1px)` + color shift) with an
opacity-only hover; thinned input/seal borders; removed the box-shadows and
borders from the pricing cards, splitting the two plans with a single hairline
divider instead.

### Why
Shadows, large radii, and motion are decorative signal. A tool about clarity
should render as flat paper, ink, and hairlines.

### What worked
Cards-as-columns read much quieter than bordered boxes; the page lost its last
"SaaS" tells.

### What didn't work
First screenshot attempt failed — the dev server hadn't bound yet, so Chrome
captured a `127.0.0.1 refused to connect` error page. Retried with a
poll-until-200 loop before screenshotting.

### What I learned
`uvicorn` isn't on PATH directly in this `uv` project — `uv run uvicorn ...` gives
`Failed to spawn: uvicorn ... No such file or directory`, and `uv run fastapi run
app/main.py` gives `ModuleNotFoundError: No module named 'app'`. The working
invocation is `uv run python -m uvicorn app.main:app --port N` from the project
root.

### What was tricky
The flaky screenshot masked itself as a styling problem until I read the captured
image and saw it was Chrome's connection-error page, not my CSS.

### What warrants review
The hairline-split pricing relies on `.plan:first-child` border-right; confirm the
mobile breakpoint drops it (it does, with `gap: 32px`).

### Future work
Palette and typography are still the editorial paper/red/serif — address next.

## Step 3: Go monochrome, one sans font, remove the logo

**Author:** main

### Prompt Context

**Verbatim prompts (three, in sequence):**
1. "the font should be less noisy and color palette more simple black and white
   ish"
2. "no logo"
3. "make logic commits and push"
**Interpretation:** Replace the editorial serif with one calm sans, collapse the
palette to near black-and-white, remove the § seal logo everywhere, then commit
the work in logical chunks and push.
**Inferred intent:** Reach the minimal endpoint of the brand and ship it.

### What I did
- Palette in `/app/static/style.css`: `--paper` → `#FFFFFF`, `--ink` → `#141414`,
  greyscale `--ink-2`/`--muted`/`--line`, and `--stamp` → `#141414` (the accent is
  now ink, not red).
- Typography: pointed both `--serif` and `--sans` at Inter; updated
  `/app/templates/base.html` to load only `Inter:wght@400;500;600;700` and drop
  Instrument Serif. Re-tuned the elements that were sized for the serif — headline
  to Inter 600 with `letter-spacing: -2px`, wordmark/price/tenets/auth headings to
  appropriate sans weights.
- Removed the § seal logo from `landing.html` (nav, hero, footer, tenet markers),
  `login.html`, `check_email.html`, and `doc.html`; swapped the favicon in
  `base.html` from a red § circle to a plain dark "C" monogram.
- Deleted the now-dead CSS (`.seal`, `.hero-seal`, `.t-mark`, `.center-card
  .seal`). Confirmed with a grep sweep that no `§`/`seal`/`Instrument` references
  remained except the harmless `--serif` alias.
- Booted on `:8000`, screenshotted to verify black-and-white + logo-free render,
  then made two logical commits and pushed.

### Why
The serif and red were the last sources of visual "noise"; the user wanted them
gone. Removing the logo eliminates the one remaining decorative mark, leaving pure
typography on white.

### What worked
The monochrome + bold-Inter render is crisp and genuinely low-noise; the screenshot
confirmed the headline carries the page on its own without the seal. Two commits
landed cleanly and pushed: `8a8ad1b..449682b main -> main`.

### What didn't work
A background-launched server died with exit 127 (`command not found: python`) —
the background Bash shell doesn't inherit the project venv/PATH, so bare `python`
fails. Fixed by using `uv run python -m uvicorn ...`. Also hit exit 144 (SIGTERM)
on a background server when I `pkill`ed `uvicorn` to restart — expected, not an
error.

### What I learned
Because both `--serif` and `--sans` now resolve to Inter, the many existing
`font-family: var(--serif)` rules didn't need touching — only the elements whose
*size* assumed serif metrics needed re-tuning. Aliasing the variable was a
one-line lever for a global font swap.

### What was tricky
Splitting "logical commits" when every change for all three steps was entangled in
the same two files (`style.css`, `landing.html`) in the final working tree —
hunk-level separation wasn't practical. Settled on two honest commits: the brand
redesign (all app code) and the diary, rather than faking a finer split.

### What warrants review
- `/app/static/style.css`: `--serif` is now just an alias for Inter; a future
  cleanup could delete the variable and the `var(--serif)` call sites entirely.
- The doc/app pages (`doc.html`, rendered-markdown styles) inherited the new
  palette but weren't visually re-screenshotted this session — worth a glance.
- Pricing ($20) and the GitHub link remain placeholders.

### Future work
Self-host the Inter webfont (landing currently depends on Google Fonts CDN); OG
meta/preview image; then back to the real blocker — email delivery — before
deploying and dogfooding.
