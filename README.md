# 🏈 Gridiron Land

A mobile football game that pairs **playable 2D arcade gameplay** with a **deep franchise simulation** — 32 fictional teams, full seasons, playoffs, a 7-round draft, free agency, trades, player development, awards, and league history. Built as an installable, offline-capable PWA.

## Play it

```bash
npm install
npm run dev        # local dev server
npm run build      # production build (dist/)
npm run preview    # serve the production build
npm test           # sim-engine test suite (vitest)
```

Open on a phone (or a ~390px viewport) for the intended experience. The app is a PWA — "Add to Home Screen" installs it and it works offline.

## What's in the game

### Playable arcade games
- Live 2D games on a scrolling vertical field with touch controls
- **On offense you play every snap**: pick from a playbook of runs and pass concepts (slants, curls, mesh, flood, play-action, streaks, screens…), drag to scramble with the QB, tap a receiver button to throw, control the ball carrier with juke moves
- Blocking engagements (OL vs DL by ratings), man coverage AI, tackle-break / fumble / interception checks — all driven by the same probability model as the season sim, so your games produce statistically honest results
- Kick meter for field goals, punts, and extra points; go-for-2 option
- On defense you call the shell (Balanced / Blitz / Coverage) and watch the CPU drive resolve — or skip it
- Quick-sim your game, sim from any point to the final, or sim the whole league week

### Franchise depth
- 32 fictional teams in 2 conferences × 4 divisions, full 17-game schedules built with a pro-style matchup formula (division round-robins, rotating cross-division play) scheduled via Kempe-chain edge coloring
- Play-by-play game simulation with complete box scores, standings with real tiebreakers (H2H → division → conference → point diff), 14-team playoff bracket, championship
- **Players**: 14 ratings, position archetypes, hidden potential, aging curves by position, breakout seasons, decline, retirement
- **Draft**: generated 230-prospect classes, scouting uncertainty (rating ranges + potential grades), team-needs AI, full draft room UI, tradeable picks
- **Free agency**: day-by-day signing period, AI teams bid by need and cap space, negotiate salary/years with asking prices
- **Contracts & cap**: $220M salary cap, multi-year deals, extensions, releases
- **Trades**: player + pick packages with an AI valuation model and verdicts
- **Injuries** that reshape depth charts mid-season
- **Awards & history**: MVP, OPOY, DPOY, ROY, All-League teams, champions history, single-season record book, per-player career stats and award shelves
- Autosaving IndexedDB save slots — close the tab, come back later

## Tech

- Vite + React + TypeScript (strict), Zustand, Canvas 2D, `idb`, `vite-plugin-pwa`, Vitest
- `src/engine/` is pure, DOM-free TypeScript with a seeded RNG — fully unit-testable (`npm test` sims entire seasons and asserts realistic stat distributions)
- `src/engine/sim/playSim.ts` is the single source of truth for play outcomes; the arcade engine (`src/game/`) reuses its probability helpers with user skill replacing dice rolls

## Roadmap

- **Phase 2** — user-controlled defense, player morale, training focus, full team/player/league editors, roster share codes
- **Phase 3** — career mode (enter the draft as a single player)
- **Phase 4** — college dynasty mode: recruiting classes, program prestige, redshirts, transfer portal, bowls & playoff (the repo name knows where this is headed)

All teams, players, and league branding are fictional and randomly generated.
