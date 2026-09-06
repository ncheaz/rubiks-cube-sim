# Development Story

How this game was built: a single natural-language goal, turned into a
quality bar, then ground against that bar by an agent loop until the result
won blind comparisons against real Google reference material.

The entire build was agent-driven. **GLM-5.3-Flash** (running as the coding
agent in GitHub Copilot Chat, and doubling as the vision model for screenshot
analysis) designed the renderer, wrote and debugged the two-phase solver, ran
its own critic rounds, and verified its own output visually.

## The Gauntlet Loop

The development method was the [gauntlet-loop](https://github.com/robonuggets/gauntlet-loop)
skill, installed in this repo at `.agents/skills/gauntlet-loop/SKILL.md` (the
agent-agnostic standard location, picked up natively by VS Code).

The skill's core idea:

1. **You state a goal** in one sentence.
2. **The skill sets a bar** — a *named, fetchable, comparable* reference the
   result will be judged against (a real site, a real shipped product, not a
   vague adjective). If you didn't name one, it proposes 2–3 candidates.
3. **The skill writes a prompt** that makes an agent split the work into the
   smallest independently judgeable pieces, then for each piece run:
   - a **builder** that improves the piece, and
   - a separate **harsh critic with fresh context** that puts our output next
     to the bar *blind* (labels stripped), says which one is better, and names
     the single biggest remaining gap.
4. **It loops** builder → critic → builder until the critic picks ours blind —
   and is told not to stop before that.

## Step 1 — The input

The whole project started as one paragraph of intent
(`hidden/GAUNTLET-INPUT.md`):

> I want to ask the gauntlet loop to help me generate a rubiks cube 3d game,
> it can solve, it can let me move, gives hints, and allows for full view and
> manipulation of angles. Make the game fit in one web page and runnable
> locally by loading it into a browser with no need for online access.
> Add high value features and make sure it provides the bells and whistles of
> a highly polished well implemented gaming experience.

## Step 2 — The prompt

The gauntlet-loop skill expanded that into a compact, paste-ready prompt
(`hidden/PROMPT.md`) that fixed three things the original didn't specify:

- **The bar:** Google's Cube Lab — compare against the real thing at desktop
  and mobile, not against a description of it.
- **A numbers bar:** solutions under 22 moves, steady 60fps, instant load.
- **The loop rules:** smallest judgeable pieces (rendering, face-drag turning,
  camera orbit, solver, hints, modes, polish), fresh-context harsh critics,
  blind A/B against the bar, keep going until ours wins — plus a live progress
  page so the whole thing could be watched as it happened.

## Step 3 — The bar, honestly

The first thing the run discovered: `cube.google.com` is dead (404, no
Wayback captures). Rather than hallucinate a comparison, the run fell back to
two *real, archived, same-lineage* references from Google Creative Lab and
documented the substitution in `reference/BAR.md`:

- **Chrome Cube Lab** (chrome.com/cubelab, archived 2017) — dark hero, radial
  glow, thick black bevels, isometric cube.
- **Google's Rubik's Cube Doodle** (google.com/doodles/rubiks-cube, archived
  2014) — Google's most-shipped cube game.

Screenshots of both were captured at desktop and mobile viewports
(`reference/`) — these are what every critic round judged against.

## Step 4 — The loop

The prompt was pasted into a **fresh GitHub Copilot Chat session** and run to
completion. GLM-5.3-Flash was the model on both sides of the loop: builder
and critic, and also the vision model inspecting rendered screenshots
(`Analyzing the attached image with GLM-5.3-Flash`).

What happened, round by round (full log: `progress.html`):

| Round | What happened |
|---|---|
| Setup | Bar captured from archived Cube Lab + Doodle, desktop & mobile |
| v1 build | All seven pieces built: WebGL renderer, drag-to-turn, orbit camera, two-phase solver, hints, modes, HUD |
| Solver debugging | Three real bugs found & fixed: phase-2 moves indexed with the phase-1 move list; `searchPhase2Recorded` returning stale entries from failed branches; a wrong solved-check |
| Vision checks | Rendered output inspected with GLM-5.3-Flash vision (after some initial HTTP 400 failures were retried); solved/scrambled × desktop/mobile all verified |
| Critic R1–R2 | Blind A/B, fresh-context critic: **mixed** — bar won desktop (ours had flat lighting), ours won mobile, 42–41. Named fix: real lighting/material depth |
| Build R2 | Lighting pass: Blinn-Phong specular, glossy stickers, saturation boost, larger stickers. Two rounds had also been judged on broken upscaled captures — the capture pipeline was fixed (CDP 1440px override, synchronous queue drain) |
| Critic R3–R5 | **Ours wins desktop AND mobile**, scores improving each round |
| Exit | Critic picked ours blind on both viewports **three consecutive rounds** → gauntlet exit. R5 verdict: *"A is an actual game hero screen… B is a gallery listing"* |

Final measured numbers at exit (all green):

| Metric | Bar | Achieved |
|---|---|---|
| Solution length | < 22 moves | max 22 / avg 20.4 (0 over 22, n=100) |
| FPS sustained | 60 | 82.5 |
| Load to ready | instant | 24.4 ms, one file |
| Size / network | 1 file, 0 calls | ~70.6 KB, 0 calls, fully offline |

The solver's correctness was pinned down with 45 unit tests
(`test/solver.test.js` — still 45/45 green today).

## Step 5 — The chart

`progress.html` is the **live progress page** the gauntlet prompt demanded
("Keep a live progress page updating as the work evolves so I can watch it").
The agent updated it as the loop ran: goal card, status per piece, the
numbers table, and a timestamped round log — setup → build → vision → critic
verdicts → fix → exit. It is the primary record of how the loop unfolded.

## Step 6 — Post-gauntlet hardening (v1.2 → v1.5)

The gauntlet proved the game *looked* and *measured* better than the bar, but
human playtesting found real bugs the critic's screenshots couldn't. Each was
root-caused and fixed by the agent:

- **Squares turned black mid-rotation** — the renderer recomputed sticker
  positions from solved-state face normals instead of the cubie's current
  orientation, placing stickers on the wrong side of turning cubies.
- **"Solved" cube didn't look solved** — the solver was never wrong (its 45
  tests stayed green); the bug was in the drag layer: dragging a **middle
  slice** desynced the rendered cube from the solver's logical state.
- **Some sides refused to rotate** — the v1.3 desync fix made middle-band
  drags snap back because only face moves were modeled; slice moves were
  added so any layer turns freely (v1.5).
- Plus a background restyle of the render area (lighter warm gray, realistic
  lighting, subtle natural texture).

## Step 7 — Shipping

From the current session: repo created on GitHub ("Initial Version"), then
published to GitHub Pages — **play it at
https://ncheaz.github.io/rubiks-cube-sim/**

## Why this worked

- **The bar was real.** Every comparison was against fetched screenshots of
  shipped Google work, never against a description. When the named URL turned
  out to be dead, the run said so and substituted honestly instead of
  pretending.
- **The critic was blind and harsh.** Fresh context each round, labels
  stripped, praise explicitly useless. It genuinely rejected our desktop
  render in round 1 — and the named gap (lighting) is exactly what the next
  build fixed.
- **Numbers ran alongside taste.** <22 moves / 60fps / instant load gave the
  loop an objective exit condition, and the unit tests kept the solver honest
  while the renderer churned above it.
- **Human eyes closed the loop.** The gauntlet can't feel a drag desync.
  Post-loop playtesting caught what blind screenshots couldn't, and the same
  agent fixed each report end-to-end.
