#!/usr/bin/env python3
"""Gridiron Land asset agent — generates every game asset with Gemini and runs
each one through the game's auto-clean pipeline.

Setup:
    pip install -r requirements.txt
    export GEMINI_API_KEY=your_key_here

Usage:
    python agent.py --all
    python agent.py --only players --skins 0,3,4
    python agent.py --only headshots
    python agent.py --only football
    python agent.py --only field
    python agent.py --only logos --teams BOS,MIA,SEA
    python agent.py --all --model imagen-3.0-generate-002   # alternate backend
    python agent.py --only logos --dry-run                   # print prompts, no API

Outputs (under ./out):
    raw/        what Gemini returned (magenta background, untouched)
    processed/  keyed, trimmed, quantized PNGs (transparent)
    preview/    checkerboard + team-tint previews for QA
    ts/         inlined TS sheet modules ready to drop into src/game/
"""

from __future__ import annotations
import argparse
import os
import sys
import time
from pathlib import Path
from typing import List, Optional

from PIL import Image

import assets
import imaging as im

OUT = Path(__file__).parent / "out"
DIRS = {k: OUT / k for k in ("raw", "processed", "preview", "ts")}


# --- Gemini plumbing --------------------------------------------------------

API = "https://generativelanguage.googleapis.com/v1beta"


def make_client():
    """Return the API key (the 'client' is just the key for the REST backend)."""
    key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not key:
        sys.exit("Set GEMINI_API_KEY in your environment.")
    try:
        import requests  # noqa: F401
    except ImportError:
        sys.exit("requests not installed. Run: pip install -r requirements.txt")
    return key


def _extract_image(payload: dict) -> Optional[bytes]:
    import base64
    # Gemini generateContent: candidates[].content.parts[].inlineData.data (b64)
    for cand in payload.get("candidates", []):
        for part in cand.get("content", {}).get("parts", []):
            inline = part.get("inlineData") or part.get("inline_data")
            if inline and inline.get("data"):
                return base64.b64decode(inline["data"])
    # Imagen predict: predictions[].bytesBase64Encoded
    for pred in payload.get("predictions", []):
        b64 = pred.get("bytesBase64Encoded") or pred.get("image", {}).get("imageBytes")
        if b64:
            return base64.b64decode(b64)
    return None


def gen_image(client, model: str, prompt: str, refs: Optional[List[bytes]] = None,
              retries: int = 4) -> bytes:
    """Return PNG/JPEG bytes for one image via the Gemini REST API, with backoff."""
    import base64
    import requests
    key = client
    last = None
    for attempt in range(retries):
        try:
            if model.startswith("imagen"):
                url = f"{API}/models/{model}:predict?key={key}"
                body = {"instances": [{"prompt": prompt}],
                        "parameters": {"sampleCount": 1, "aspectRatio": "1:1"}}
            else:
                url = f"{API}/models/{model}:generateContent?key={key}"
                parts: list = [{"text": prompt}]
                for rb in refs or []:
                    parts.append({"inlineData": {"mimeType": "image/png",
                                                 "data": base64.b64encode(rb).decode()}})
                body = {"contents": [{"parts": parts}]}
            r = requests.post(url, json=body, timeout=120)
            if r.status_code != 200:
                raise RuntimeError(f"HTTP {r.status_code}: {r.text[:300]}")
            img = _extract_image(r.json())
            if not img:
                raise RuntimeError(f"no image in response: {r.text[:300]}")
            return img
        except Exception as e:  # noqa: BLE001 — network/quota/parse, all retryable
            last = e
            wait = 2 ** attempt
            print(f"    ! attempt {attempt + 1} failed ({e}); retrying in {wait}s")
            time.sleep(wait)
    raise RuntimeError(f"generation failed after {retries} tries: {last}")


def _bytes_to_img(data: bytes) -> Image.Image:
    from io import BytesIO
    return Image.open(BytesIO(data)).convert("RGBA")


# --- per-asset builders -----------------------------------------------------

def _save_raw(name: str, data: bytes) -> Image.Image:
    (DIRS["raw"] / f"{name}.png").write_bytes(data)
    return _bytes_to_img(data)


def _save_processed(name: str, img: Image.Image, tint_team=None):
    img.save(DIRS["processed"] / f"{name}.png")
    im.checker(img).save(DIRS["preview"] / f"{name}_alpha.png")
    if tint_team:
        im.checker(im.tint(img.copy(), tint_team["primary"], tint_team["secondary"])) \
            .save(DIRS["preview"] / f"{name}_tint_{tint_team['abbr']}.png")


def gen_players(client, model, skins: List[int], chain: bool, dry: bool):
    """12-frame animation per skin tone, assembled into ONE combined sheet.

    Layout: 4 columns (frame%4) x (3 rows per skin), skins stacked vertically.
    Frame order matches the game's Pose enum: run0-3, idle, throw, release,
    reach, block, tackle, down, celebrate. Emitted as src/game/playerSheet.ts.
    """
    sample = assets.TEAMS[0]
    all_cells: list = []
    for si in skins:
        skin = assets.SKIN_TONES[si]
        print(f"  players: skin {si} ({skin})")
        ref = None
        for fi, fdesc in enumerate(assets.PLAYER_FRAMES):
            prompt = assets.player_prompt(fdesc, skin)
            if dry:
                print(f"    [{si}.{fi}] {prompt}\n"); continue
            data = gen_image(client, model, prompt, refs=[ref] if (chain and ref) else None)
            raw = _save_raw(f"player_s{si}_f{fi}", data)
            if chain and ref is None:
                ref = data  # frame 0 anchors the character for the rest
            all_cells.append(im.trim(im.key_magenta(raw)))
    if dry or not all_cells:
        return
    sheet, cw, ch = im.assemble_grid(all_cells, cols=4, baseline=True)
    sheet = im.quantize(sheet, 64)
    _save_processed("players", sheet, tint_team=sample)
    im.write_ts_sheet(
        DIRS["ts"] / "playerSheet.ts",
        {"PLAYER_COLS": 4, "PLAYER_ROWS_PER_SKIN": 3, "PLAYER_SKINS": len(skins),
         "PLAYER_CW": cw, "PLAYER_CH": ch},
        "PLAYER_SHEET", sheet,
        "Auto-generated on-field player animation sheet, magenta-keyed. Frame order: "
        "run0-3, idle, throw, release, reach, block, tackle, down, celebrate.",
    )


def gen_headshots(client, model, dry: bool):
    """24 front-facing helmet portraits, assembled 6x4 (matches headshotSheet.ts)."""
    print("  headshots: 24 portraits (6x4)")
    cells = []
    for i in range(24):
        skin = assets.SKIN_TONES[i % len(assets.SKIN_TONES)]
        expr = assets.HEADSHOT_EXPRESSIONS[i % len(assets.HEADSHOT_EXPRESSIONS)]
        prompt = assets.headshot_prompt(skin, expr)
        if dry:
            print(f"    [{i}] {prompt}\n"); continue
        data = gen_image(client, model, prompt)
        raw = _save_raw(f"headshot_{i:02d}", data)
        cells.append(im.trim(im.key_magenta(raw)))
    if dry or not cells:
        return
    sheet, cw, ch = im.assemble_grid(cells, cols=6, baseline=False)
    sheet = im.quantize(sheet, 64)
    _save_processed("headshots", sheet, tint_team=assets.TEAMS[0])
    im.write_ts_sheet(
        DIRS["ts"] / "headshotSheet.ts",
        {"HEADSHOT_COLS": 6, "HEADSHOT_ROWS": 4},
        "HEADSHOT_SHEET", sheet,
        "Auto-generated helmet headshot sheet, magenta pre-keyed to transparent.",
    )


def gen_football(client, model, dry: bool):
    print("  football: 1 ball")
    prompt = assets.football_prompt()
    if dry:
        print(f"    {prompt}\n"); return
    data = gen_image(client, model, prompt)
    raw = _save_raw("football", data)
    ball = im.quantize(im.trim(im.key_magenta(raw, kill_grid=True)), 32)
    _save_processed("football", ball)
    im.write_ts_sheet(
        DIRS["ts"] / "ballSheet.ts",
        {"BALL_W": ball.width, "BALL_H": ball.height},
        "BALL_SPRITE", ball,
        "Auto-generated hand-drawn football, magenta-keyed to transparent.",
    )


def gen_field(client, model, dry: bool):
    print("  field: turf + line + hash + endzone tiles")
    for name, desc in assets.FIELD_TILES.items():
        prompt = assets.field_prompt(desc)
        if dry:
            print(f"    [{name}] {prompt}\n"); continue
        data = gen_image(client, model, prompt)
        raw = _save_raw(f"field_{name}", data)
        raw.save(DIRS["processed"] / f"field_{name}.png")  # green art: no keying


def gen_logos(client, model, teams: List[dict], dry: bool):
    """One logo per team, also assembled into an abbr-indexed sheet -> logoSheet.ts."""
    print(f"  logos: {len(teams)} teams")
    cells, abbrs = [], []
    for t in teams:
        prompt = assets.logo_prompt(t)
        if dry:
            print(f"    [{t['abbr']}] {prompt}\n"); continue
        data = gen_image(client, model, prompt)
        raw = _save_raw(f"logo_{t['abbr']}", data)
        logo = im.quantize(im.trim(im.key_magenta(raw)), 48)
        logo.save(DIRS["processed"] / f"logo_{t['abbr']}.png")
        im.checker(logo).save(DIRS["preview"] / f"logo_{t['abbr']}_alpha.png")
        cells.append(logo)
        abbrs.append(t["abbr"])
    if dry or not cells:
        return
    sheet, cw, ch = im.assemble_grid(cells, cols=8, baseline=False)
    im.write_ts_sheet(
        DIRS["ts"] / "logoSheet.ts",
        {"LOGO_COLS": 8, "LOGO_CW": cw, "LOGO_CH": ch,
         "LOGO_ABBRS": repr(abbrs).replace("'", '"')},
        "LOGO_SHEET", im.quantize(sheet, 64),
        "Auto-generated hand-drawn team logos, magenta-keyed. LOGO_ABBRS gives the "
        "abbr at each grid cell (row-major, 8 columns).",
    )


# --- CLI --------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description="Generate Gridiron Land assets with Gemini.")
    ap.add_argument("--all", action="store_true", help="generate every asset")
    ap.add_argument("--only", choices=["players", "headshots", "football", "field", "logos"])
    ap.add_argument("--model", default=os.environ.get("GEMINI_IMAGE_MODEL", "gemini-3.1-flash-image"),
                    help="image model (default gemini-3.1-flash-image; also gemini-2.5-flash-image, "
                         "gemini-3-pro-image, or imagen-4.0-generate-001). NOTE: image generation "
                         "requires a billing-enabled Google project — the free tier has a 0 quota.")
    ap.add_argument("--skins", default="0,1,2,3,4,5", help="player skin-tone indices, comma-separated")
    ap.add_argument("--teams", default="", help="logo team abbrs, comma-separated (default all 32)")
    ap.add_argument("--no-chain", action="store_true", help="don't use frame 0 as a character reference")
    ap.add_argument("--dry-run", action="store_true", help="print prompts without calling the API")
    args = ap.parse_args()

    if not args.all and not args.only:
        ap.error("pass --all or --only <asset>")

    for d in DIRS.values():
        d.mkdir(parents=True, exist_ok=True)

    client = None if args.dry_run else make_client()
    skins = [int(x) for x in args.skins.split(",") if x.strip() != ""]
    picked = [a.strip().upper() for a in args.teams.split(",") if a.strip()]
    teams = [t for t in assets.TEAMS if t["abbr"] in picked] if picked else assets.TEAMS

    want = args.only or "all"
    print(f"model={args.model} dry_run={args.dry_run}")
    if want in ("players", "all"):
        gen_players(client, args.model, skins, chain=not args.no_chain, dry=args.dry_run)
    if want in ("headshots", "all"):
        gen_headshots(client, args.model, dry=args.dry_run)
    if want in ("football", "all"):
        gen_football(client, args.model, dry=args.dry_run)
    if want in ("field", "all"):
        gen_field(client, args.model, dry=args.dry_run)
    if want in ("logos", "all"):
        gen_logos(client, args.model, teams, dry=args.dry_run)

    if not args.dry_run:
        print(f"\nDone. See {OUT}/ — processed/ has transparent PNGs, preview/ has "
              f"tint QA, ts/ has drop-in modules for src/game/.")


if __name__ == "__main__":
    main()
