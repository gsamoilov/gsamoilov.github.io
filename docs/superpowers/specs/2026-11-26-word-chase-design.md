# Word Chase — design (short)

## Intent
A new "fun page" game: something chases you, and you escape by typing a chain of
words. Each word must start with the last letter of the previous word. Every letter
of an accepted word is a step your character runs. It joins the Experiments grid on
the home page alongside the lava lamp, ball pit, etc.

## Rules (Greg's)
- Run starts with a random first letter.
- Type a word starting with the required letter; next required letter = its last letter.
  Example: start Z → zoo → orb → break.
- No repeating a word within a run. Repeated letters are fine.
- Each letter of an accepted word = one step forward under the character.

## Rules (my calls — correct if wrong)
- Word is submitted with Enter and checked against a real dictionary.
- Rejected words (not a word / wrong first letter / already used) shake the input and
  cost nothing but time.
- The chaser advances at a steady pace that slowly speeds up; caught = game over.
- Score = words chained (distance shown too). Best score saved in localStorage.
- Starting letter is never one with almost no follow-ups (e.g. not X); if a word ends
  in a letter that's hard to continue, that's part of the game.
- Minimum word length 2.

## Approaches
1. **Side-scrolling canvas runner** — character runs right, chaser closes in from the
   left, each typed letter drops as a tile under their feet. **Picked by Greg.**
2. Text-first with a distance bar — fastest to build, but doesn't feel like a chase.
3. Top-down maze chase — steering and typing fight each other. Rejected.

## How (my calls)
- One self-contained page `pages/wordchase.html` (inline CSS/JS, same as the other
  fun pages), plus a "Back home" link and a card in the home page's Experiments grid.
- Dictionary: ENABLE word list (public domain, 172,823 words, ~1.7 MB raw / ~450 KB
  gzipped by GitHub Pages) committed as `pages/words.txt`, loaded once into a `Set`.
  No external API at play time.
- Canvas side view: ground line, character on the right-of-centre, chaser on the left;
  camera follows the character. Letter tiles land as stepping stones under the runner.
- Chaser is an original creature drawn in code (no copyrighted characters).
- Visual style matches the home page's ember/glass look (dark bg, orange/yellow glow,
  Space Grotesk).
- Works on phones: the on-screen keyboard is the input; layout keeps the input above it.
- Respects prefers-reduced-motion (less camera shake / particles, game still playable).

## Non-goals
- No accounts, online leaderboards, or multiplayer.
- No definitions shown for words.

## Left to the builder
Exact speeds/tuning, art details for runner and chaser, sound (optional, off by default).
