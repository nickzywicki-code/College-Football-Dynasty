# Gridiron Legacy

A mobile-first college football dynasty game. Take over a program in a fully
original universe — 80 fictional teams across 10 conferences — and build it
from the ground up over as many seasons as you want to play.

Runs entirely client-side (React + TypeScript + Zustand), with saves stored
locally via IndexedDB. Installable as a PWA for a native, app-like feel on a
phone.

## Features

- **Recruiting** — scout, contact, offer, and host visits for a class of
  prospects competing against 79 AI programs; resolves on signing day.
- **Roster & depth chart** — set your starters and rotation at every position.
- **Game plan** — pick offensive/defensive schemes and tune tempo, run/pass
  balance, aggressiveness, and 4th-down decision-making.
- **Drive-by-drive simulation** — your games play out drive by drive with a
  live scrolling play log and full box score, driven by your roster ratings
  and game plan.
- **Full season loop** — round-robin conference schedule + non-conference
  games, a computed Top 25 poll, conference standings, a 12-team playoff,
  and bowl games for everyone else.
- **Offseason progression** — player development, graduation, early draft
  entries, walk-on roster fill, facility upgrades, booster funds, and a
  coaching carousel with job offers driven by your career record.
- **Coach career** — track your record, titles, and season-by-season history
  across programs as your reputation grows.

## Development

```bash
npm install
npm run dev      # start the dev server
npm run build    # typecheck + production build
```
