# Cube — a 3D Rubik's Game

A polished, fully offline 3D Rubik's Cube simulator for the browser. The entire
game — renderer, logic, and a two-phase (Kociemba) solver — is inlined into a
single self-contained `cube.html` you can open directly in any browser. No
server, no build tools, and no internet connection required to play.

## Features

- **True 3D cube** — drag to orbit, full free view and angle manipulation
- **Scramble** — randomize the cube
- **Solve** — instantly computes and plays a near-optimal solution using a
  two-phase (Kociemba) solver with precomputed pruning tables
- **Hint** — get the next best move when you're stuck
- **Undo** — walk back your move history
- **Free / Speed mode** (`T`) — toggle between casual play and speedcubing
- **Sound** — movable audio feedback (mutable)
- **Keyboard + mouse controls** for face turns and camera rotation

## Play

**Play online:** https://ncheaz.github.io/rubiks-cube-sim/

Or play offline — just open **`cube.html`** in your browser. That's it —
everything is inlined.

## Development

```
src/
  game.js        3D rendering, input handling, game state
  solver.js      two-phase (Kociemba) solver (runs in browser and Node)
  style.css      UI styling
  template.html  page skeleton with {{CSS}}/{{SOLVER}}/{{GAME}} slots
```

Rebuild the self-contained `cube.html` (and `index.html` for GitHub Pages)
after editing sources:

```sh
node build.js
```

Run the solver test suite (plain Node, no dependencies):

```sh
node test/solver.test.js
```

## Requirements

- To play: any modern browser
- To develop/test: [Node.js](https://nodejs.org/) (no npm packages needed)
