# Word Chase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new fun page where you outrun a chaser by typing a chain of real words, each starting with the previous word's last letter.

**Architecture:** Pure game rules live in a tiny dependency-free script (`pages/wordchase-logic.js`) that works both in the browser (global `WordChase`) and in Node (`module.exports`) so it can be unit tested. `pages/wordchase.html` is a self-contained page (inline CSS + JS, like the other fun pages) that loads the word list, draws the canvas runner, and uses the logic module for every rule decision.

**Tech Stack:** Plain HTML/CSS/JS, Canvas 2D, Node's built-in `node:test` for logic tests, pre-installed Playwright for a browser smoke test. No build step, no npm dependencies.

**Spec:** `docs/superpowers/specs/2026-11-26-word-chase-design.md`

## Global Constraints

- Rules: random start letter; next word must start with previous word's last letter; no repeated word in a run; repeated letters fine; each letter of an accepted word = one step.
- Minimum word length 2. Submit with Enter. Rejected word shakes the input; no other penalty.
- Start letter never one of: `q x z j k v y` (hard-to-continue letters). *(Spec example starts at Z; the spec's own rule says no near-impossible starts — Z excluded.)*
- Chaser moves at a steady pace that slowly speeds up; caught = game over.
- Score = words chained; distance also shown. Best score in `localStorage` key `wordchase-best`.
- Dictionary: ENABLE list committed at `pages/words.txt`, one lowercase word per line, loaded once into a `Set`. No external API at play time.
- Visual style matches home page: bg `#0c0705`, ink `#fff4e8`, muted `#b9a08c`, accents `#ff3d1f #ff6b00 #ffb703`, font Space Grotesk.
- Chaser is an original creature drawn in code. "Back home" link (`<a class="back" href="/">Back home</a>`) like other pages.
- Works on phones (input stays visible above the on-screen keyboard). Honors `prefers-reduced-motion` (no shake/particles; still playable).
- Non-goals: accounts, online leaderboards, multiplayer, definitions.

## Review Focus

- Messy input like `"  Zoo "`, `"ZOO"` → normalized (trim + lowercase) and accepted.
- Non-letters (`don't`, `ice-cream`, `zo0`) → rejected as not a word, never crash.
- Typing/Enter before the word list finishes loading → input disabled with "loading words…", no false "not a word".
- Word list fails to load → visible error with a Retry button, game doesn't start.
- Tab hidden / window blurred → game pauses (chaser must not catch you while away); resumes on return.

---

## File Structure

- Create `pages/words.txt` — ENABLE word list (172,823 lines).
- Create `pages/wordchase-logic.js` — rules only; no DOM, no canvas.
- Create `pages/wordchase.html` — page, rendering, input, game loop.
- Create `tests/wordchase-logic.test.js` — Node unit tests.
- Create `tests/wordchase-smoke.js` — Playwright smoke test.
- Modify `index.html` — add a card to the Experiments grid (`#fun .grid`).

---

### Task 1: Word list + rules module

**Files:**
- Create: `pages/words.txt`, `pages/wordchase-logic.js`
- Test: `tests/wordchase-logic.test.js`

**Interfaces:**
- Produces (global `WordChase` in browser, `module.exports` in Node):
  - `parseWords(text: string) -> Set<string>` — split on newlines, trim, lowercase, drop empties.
  - `START_LETTERS: string` — `"abcdefghilmnoprstuw"`.
  - `randomStartLetter(rng = Math.random) -> string` — one char from `START_LETTERS`.
  - `newRun(startLetter: string) -> Run` where `Run = { need: string, used: Set<string>, words: string[], steps: number }`.
  - `normalize(input: string) -> string` — trim + lowercase.
  - `checkWord(run: Run, input: string, dict: Set<string>) -> { ok: true, word: string } | { ok: false, reason: 'short'|'letter'|'notword'|'used' }` — checks in that order: length ≥ 2, starts with `run.need`, `/^[a-z]+$/` and in `dict`, not in `run.used`.
  - `applyWord(run: Run, word: string) -> number` — adds to `used`/`words`, `steps += word.length`, `need = last letter`; returns steps gained.

- [ ] **Step 1: Fetch the list**

Run: `curl -sSfL -o pages/words.txt https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt && wc -l pages/words.txt`
Expected: `172823 pages/words.txt` (strip `\r` if present: `sed -i 's/\r$//' pages/words.txt`).

- [ ] **Step 2: Write failing tests** (`node:test` + `node:assert/strict`)

```js
const W = require('../pages/wordchase-logic.js');
const dict = W.parseWords('zoo\norb\r\nbreak\n\nKey\n');
test('parseWords', () => { assert.deepEqual([...dict].sort(), ['break','key','orb','zoo']); });
test('spec chain z→zoo→orb→break', () => {
  const r = W.newRun('z');
  for (const w of ['zoo','orb','break']) { const c = W.checkWord(r, w, dict); assert.equal(c.ok, true); W.applyWord(r, c.word); }
  assert.equal(r.need, 'k'); assert.equal(r.steps, 11); assert.deepEqual(r.words, ['zoo','orb','break']);
});
test('normalizes messy input', () => { assert.deepEqual(W.checkWord(W.newRun('z'), '  ZoO ', dict), {ok:true, word:'zoo'}); });
test('reasons', () => {
  const r = W.newRun('z');
  assert.equal(W.checkWord(r, 'z', dict).reason, 'short');
  assert.equal(W.checkWord(r, 'orb', dict).reason, 'letter');
  assert.equal(W.checkWord(r, 'zzz', dict).reason, 'notword');
  assert.equal(W.checkWord(r, "zo'o", dict).reason, 'notword');
  W.applyWord(r, 'zoo'); r.need = 'z';
  assert.equal(W.checkWord(r, 'zoo', dict).reason, 'used');
});
test('start letters', () => {
  for (let i = 0; i < 200; i++) assert.ok(W.START_LETTERS.includes(W.randomStartLetter()));
  assert.equal(W.randomStartLetter(() => 0), 'a');
  assert.ok(!/[qxzjkvy]/.test(W.START_LETTERS));
});
test('real list sanity', () => {
  const big = W.parseWords(require('fs').readFileSync(__dirname + '/../pages/words.txt', 'utf8'));
  assert.equal(big.size, 172823); for (const w of ['zoo','orb','break']) assert.ok(big.has(w));
});
```

- [ ] **Step 3: Run, expect FAIL** — `node --test tests/` → "Cannot find module".
- [ ] **Step 4: Implement `pages/wordchase-logic.js`** — IIFE that assigns to `module.exports` if defined, else `window.WordChase`.
- [ ] **Step 5: Run, expect PASS** — `node --test tests/` → all pass.
- [ ] **Step 6: Commit** — `git add pages/words.txt pages/wordchase-logic.js tests/wordchase-logic.test.js && git commit -m "Word Chase: word list and rules"`

---

### Task 2: The game page

**Files:**
- Create: `pages/wordchase.html`
- Test: `tests/wordchase-smoke.js`

**Interfaces:**
- Consumes: everything from Task 1 via `<script src="/pages/wordchase-logic.js">`; fetches `/pages/words.txt`.
- Produces (for the smoke test): `#word` input, `#need` (shows required letter, uppercase), `#score`, `#best`, `#over` (game-over panel, gets class `show`), `#again` button, `#status` (loading/error text), `#retry` button; `window.__wc = { run, state }` where `state` is `'loading'|'error'|'ready'|'playing'|'paused'|'over'`; test hook `window.__wcSetNeed(letter: string)` starts a fresh run with that start letter and refreshes the HUD.

Game model (world units = px at 1x; tuned values are the builder's, these are starting points):
- One step = 28 world px. Runner starts at x=0; chaser starts at x=-260.
- Runner eases toward `run.steps * 28` (it visibly runs, laying one glowing letter tile per step under its feet with the typed letter on it).
- Chaser speed starts 22 px/s, +1.2 px/s every 5 s, starts moving on first keystroke of the run (state `ready` → `playing`).
- Caught when `chaserX + chaserWidth >= runnerX` → state `over`, show `#over` with words, distance (`steps` m), best; update `localStorage['wordchase-best']` if beaten.
- Camera keeps runner ~62% across the screen. HUD shows required letter big, score, best, and a gap meter.
- Rejected word: input gets class `shake` (removed on `animationend`) and a short reason line ("not a word", "must start with K", "already used", "too short").
- `visibilitychange` hidden or window `blur` while `playing` → `paused` with "paused — click to resume"; resume on focus/click into input.
- `prefers-reduced-motion`: no shake animation (reason line only), no particles.
- Mobile: input fixed near bottom, `font-size:16px` (prevents iOS zoom), `autocapitalize=off autocomplete=off autocorrect=off spellcheck=false`, use `visualViewport` resize to keep it above the keyboard.
- Load: input disabled + `#status` "loading words…" until the `Set` is built; on fetch failure `#status` shows "couldn't load the dictionary" and `#retry` re-fetches.

- [ ] **Step 1: Write smoke test** `tests/wordchase-smoke.js` (Playwright, serves repo with `python3 -m http.server 8766`):
  1. Open page; wait for `__wc.state === 'ready'`; assert `#word` enabled.
  2. Call `window.__wcSetNeed('z')`; type `zoo⏎orb⏎break⏎`; assert `#score` text `3`, `#need` text `K`, `__wc.run.steps === 11`.
  3. Need is now `k`: type `kzzz⏎` → `#word` gets class `shake` (or reason text "not a word" under reduced motion), score still `3`.
  4. Dispatch `visibilitychange` with `document.hidden` stubbed true → `__wc.state === 'paused'`.
  5. Block `**/words.txt` with `page.route(... abort)` on a fresh page → `#status` contains "couldn't load" and `#retry` visible.
  6. Fast-forward: set chaser x to runner x via `__wc` and wait a frame → `#over` has class `show`.
  7. Screenshot to scratchpad at deviceScaleFactor 1 for a visual check.
  Exit non-zero on any failed assertion.
- [ ] **Step 2: Run, expect FAIL** — `node tests/wordchase-smoke.js` → 404 / timeout.
- [ ] **Step 3: Build `pages/wordchase.html`** to the model above.
- [ ] **Step 4: Run, expect PASS**; look at the screenshot (runner, chaser, tiles, HUD all visible, nothing overlapping on a 390×844 phone viewport too).
- [ ] **Step 5: Commit** — `git add pages/wordchase.html tests/wordchase-smoke.js && git commit -m "Word Chase: game page"`

---

### Task 3: Home page card

**Files:** Modify `index.html` (`#fun .grid`, append after the "Bad design" card).

- [ ] **Step 1:** Add `<a class="card mag glass" href="/pages/wordchase.html"><h3>Word chase</h3><p>Something's coming. Chain words to run. Every letter is a step.</p></a>`
- [ ] **Step 2: Verify** — load `/` in Playwright, click the card, assert URL ends with `/pages/wordchase.html` and `__wc.state` reaches `ready`. Re-run `node --test tests/` and `node tests/wordchase-smoke.js`.
- [ ] **Step 3: Commit** — `git add index.html && git commit -m "Link Word Chase from home page"`
