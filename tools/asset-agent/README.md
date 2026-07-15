# Gridiron Land — Gemini Asset Agent

Generates every game asset with Google's Gemini image model and runs each one
through the same auto-clean pipeline used to integrate the hand-drawn art:
**chroma-key the magenta background → trim → quantize → assemble uniform sheets
→ preview the team-tint → emit inlined TypeScript modules** the game imports.

It encodes the two rules that make assets drop in without hand-editing:

1. **Uniforms are greyscale.** The game recolors jerseys/pads/helmets to each
   team's colors at runtime by tinting the low-saturation (grey) pixels. Skin,
   hair and the ball keep their real color, so they're left untouched.
2. **Flat pure `#FF00FF` background.** That's the chroma key — no grid lines,
   borders, or shadows on the background.

## Setup

```bash
cd tools/asset-agent
pip install -r requirements.txt
export GEMINI_API_KEY=your_key_here        # from https://aistudio.google.com/apikey
```

## Run

```bash
python agent.py --all                       # everything
python agent.py --only headshots            # 24 helmet portraits -> 6x4 sheet
python agent.py --only players --skins 0,3,4 # 12-frame animation sheet per skin tone
python agent.py --only football             # the in-game ball
python agent.py --only field                # turf / yard-line / hash / end-zone tiles
python agent.py --only logos --teams BOS,MIA,SEA   # subset of teams
python agent.py --only logos                # all 32 team logos

python agent.py --all --dry-run             # print every prompt, call no API
python agent.py --all --model imagen-3.0-generate-002   # use Imagen instead
```

### Model

Default is **`gemini-2.5-flash-image`** (aka "Nano Banana") — it follows the
detailed sprite instructions well and supports **reference chaining**: the
player animation frames are generated off frame 0 as a style reference so the
same character stays consistent across all 12 poses (disable with `--no-chain`).
If that id 404s in your region, try `gemini-2.5-flash-image-preview`, or switch
to Imagen with `--model imagen-3.0-generate-002`. Override the default with
`--model` or `GEMINI_IMAGE_MODEL`.

## Output (`./out`)

| folder | contents |
|--------|----------|
| `raw/` | exactly what Gemini returned (magenta background, untouched) |
| `processed/` | keyed, trimmed, quantized **transparent PNGs** |
| `preview/` | `*_alpha.png` on a checkerboard + `*_tint_BOS.png` team-tint QA |
| `ts/` | inlined `*.ts` sheet modules ready to drop into `src/game/` |

**Always check the `preview/*_tint_*.png` files.** If a jersey doesn't recolor
there, Gemini painted a colored uniform — re-run that asset (the greyscale rule
is in the prompt, but the model occasionally ignores it; re-generating usually
fixes it).

## Wiring the results into the game

Already wired (drop the regenerated `ts/` module in and rebuild):

- `ts/headshotSheet.ts` → `src/game/headshotSheet.ts` (menu headshots)
- `ts/ballSheet.ts` → `src/game/ballSheet.ts` (in-game football)

Not yet wired in code (the agent produces the art + module; the render code is a
follow-up):

- `ts/playerSheet_s*.ts` — on-field animated players. The game currently uses a
  procedural 12-pose sprite; swapping to these sheets means pointing the
  renderer's pose lookup at the sheet cells (order matches the `Pose` enum:
  run0-3, idle, throw, release, reach, block, tackle, down, celebrate).
- `processed/field_*.png` — field tiles for a field-renderer rework.
- `processed/logo_*.png` — hand-drawn team logos to replace the procedural crests.

Ask Claude to wire any of these once you've generated art you're happy with.

## Files

- `agent.py` — CLI + Gemini calls + orchestration
- `assets.py` — the prompts and the 32-team table (colors pulled from `src/engine/names.ts`)
- `imaging.py` — the chroma-key / trim / quantize / assemble / tint / inline pipeline
