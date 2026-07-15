"""Asset specifications: the exact prompts and the 32-team table.

The prompts encode the two hard rules that make auto-integration work:
  1. Uniforms are GREYSCALE (recolored to team colors at runtime).
  2. Background is flat pure #FF00FF with nothing else on it (chroma key).
Plus: hard-edged pixel art, one subject per image, consistent scale/lighting.
"""

# Shared style preamble prepended to every character/logo prompt.
STYLE = (
    "8-bit / 16-bit retro sprite art, chunky big-head cartoon proportions: "
    "oversized helmet with a protruding grey facemask, big shoulder pads, thick "
    "dark outline around the whole figure, flat two-tone cel shading (one "
    "highlight, one shadow), limited palette. No anti-aliasing, no blur, no "
    "gradients, hard pixel edges. The uniform, pads, helmet, pants and socks are "
    "GREYSCALE ONLY (white, light grey, mid grey, dark grey) with absolutely no "
    "color on them. Skin tone and hair are in natural color. The background is a "
    "single flat pure-magenta #FF00FF fill with nothing else on it: no border, no "
    "grid lines, no text, no shadow cast on the background. The subject is "
    "centered and fills most of the frame."
)

SKIN_TONES = [
    "light/pale skin, brown hair",
    "light tan skin, dark hair",
    "medium olive skin, black hair",
    "brown skin, black hair",
    "dark brown skin, black hair",
    "deep dark skin, short black hair",
]

# 12 on-field frames, matching the game's Pose set. Generated as separate images
# (optionally chained off frame 0 as a reference) then assembled 4 x 3.
PLAYER_FRAMES = [
    "running, mid-stride frame 1 of a 4-step run cycle, one leg forward one back, arms pumping",
    "running, mid-stride frame 2 of a 4-step run cycle, legs passing under the body",
    "running, mid-stride frame 3 of a 4-step run cycle, opposite leg forward, arms pumping",
    "running, mid-stride frame 4 of a 4-step run cycle, legs passing under the body",
    "standing idle in an athletic ready stance, arms slightly bent",
    "quarterback throwing wind-up, ball cocked back behind the head",
    "quarterback throw release, throwing arm extended forward, ball leaving the hand",
    "reaching up to catch, both arms raised overhead",
    "blocking, arms extended forward, braced low and leaning into a hit",
    "diving tackle lunge, body stretched forward horizontally, both arms reaching out",
    "knocked down, lying on the ground on his back",
    "celebrating, both arms raised in the air",
]


def player_prompt(frame_desc: str, skin: str) -> str:
    return (
        f"{STYLE} A single American-football player, SIDE PROFILE facing RIGHT, "
        f"full body, {skin}. Pose: {frame_desc}. One character, centered on flat "
        f"#FF00FF. Greyscale uniform so it can be recolored; keep the same "
        f"character design, proportions and camera framing every time."
    )


def headshot_prompt(skin: str, expr: str) -> str:
    return (
        f"{STYLE} A single American-football player helmet portrait, head and "
        f"shoulders, FRONT-FACING, {skin}, {expr}. Grey facemask over the face, "
        f"greyscale helmet and shoulder pads, natural skin. One face centered on "
        f"flat #FF00FF. No text."
    )


HEADSHOT_EXPRESSIONS = ["neutral", "clean-shaven", "with a beard", "with a mustache",
                        "with stubble", "serious game face", "slight smirk", "intense stare"]


def football_prompt() -> str:
    return (
        f"{STYLE.replace('The uniform, pads, helmet, pants and socks are GREYSCALE ONLY (white, light grey, mid grey, dark grey) with absolutely no color on them. Skin tone and hair are in natural color. ', '')} "
        "A single American football: brown leather in NATURAL brown color (do not "
        "make it greyscale), white laces and white end stripes. Side view, long "
        "axis horizontal, classic pointed-oval shape, thick dark outline, chunky "
        "pixel shading with one highlight and one shadow. One ball centered on flat #FF00FF."
    )


FIELD_TILES = {
    "turf": ("Top-down American-football field turf, seamless tileable on all four "
             "edges, two shades of green with subtle vertical mowing stripes, flat "
             "16-bit pixel shading, no lines, no perspective, pure overhead view."),
    "yardline": ("Top-down American-football field: a single crisp white yard-line "
                 "stripe across green turf, seamless left-right, flat pixel style, "
                 "pure overhead view."),
    "hash": ("Top-down American-football field: white hash marks on green turf, flat "
             "16-bit pixel style, pure overhead view, tileable."),
    "endzone": ("Top-down American-football end zone: solid darker-green zone with a "
                "thick white goal line, flat 16-bit pixel style, pure overhead view."),
}


def field_prompt(desc: str) -> str:
    # Field art keeps its greens — no greyscale/magenta rule here.
    return (
        "8-bit / 16-bit retro pixel art, flat two-tone cel shading, hard pixel edges, "
        "no anti-aliasing, no gradients, no perspective. " + desc +
        " Fill the whole square frame with the turf (no magenta, no border, no text)."
    )


def logo_prompt(team: dict) -> str:
    return (
        "8-bit / 16-bit pixel-art sports team logo emblem, centered on a flat pure "
        "#FF00FF background with nothing else on it (no border, no grid, no extra "
        f"text). A bold {team['mascot']} mascot emblem inside a {team['badge']} crest, "
        f"in the team colors {team['primary']} and {team['secondary']}. Thick dark "
        "outline, flat two-tone shading, clean chunky pixels, no anti-aliasing, no "
        "gradient, readable at small size like a classic sports video-game badge. "
        "Keep the emblem in its real colors (do not desaturate)."
    )


# 32 teams — city, nickname, abbr, colors and a mascot/badge hint for the logo.
# Pulled verbatim from src/engine/names.ts (colors) so tints match in-game.
_BADGES = ["roundel", "shield", "diamond", "banner", "circle-with-banner"]

TEAMS = [
    {"city": "Boston", "name": "Minutemen", "abbr": "BOS", "primary": "#1d3557", "secondary": "#e63946", "mascot": "colonial minuteman with a tricorn hat"},
    {"city": "Brooklyn", "name": "Bruisers", "abbr": "BRK", "primary": "#2b2d42", "secondary": "#8d99ae", "mascot": "clenched brawler's fist"},
    {"city": "Philadelphia", "name": "Founders", "abbr": "PHI", "primary": "#004225", "secondary": "#c9a227", "mascot": "liberty bell with a quill"},
    {"city": "Washington", "name": "Generals", "abbr": "WAS", "primary": "#5b1a2e", "secondary": "#d4af37", "mascot": "five-star general's insignia"},
    {"city": "Chicago", "name": "Blaze", "abbr": "CHI", "primary": "#c1440e", "secondary": "#101820", "mascot": "roaring flame"},
    {"city": "Detroit", "name": "Motors", "abbr": "DET", "primary": "#0f4c81", "secondary": "#c0c0c0", "mascot": "engine piston and gear"},
    {"city": "Cleveland", "name": "Rockers", "abbr": "CLE", "primary": "#4b306a", "secondary": "#f2a900", "mascot": "electric guitar and lightning bolt"},
    {"city": "Milwaukee", "name": "Herd", "abbr": "MIL", "primary": "#2e5339", "secondary": "#e8d3a2", "mascot": "charging bison head"},
    {"city": "Atlanta", "name": "Firebirds", "abbr": "ATL", "primary": "#b3202c", "secondary": "#2b2b2b", "mascot": "rising phoenix firebird"},
    {"city": "Miami", "name": "Stingrays", "abbr": "MIA", "primary": "#008e97", "secondary": "#f58220", "mascot": "gliding stingray"},
    {"city": "Charlotte", "name": "Aviators", "abbr": "CHA", "primary": "#00538c", "secondary": "#a2aaad", "mascot": "winged propeller"},
    {"city": "Nashville", "name": "Rhythm", "abbr": "NSH", "primary": "#41b6e6", "secondary": "#ffb81c", "mascot": "music note and guitar pick"},
    {"city": "St. Louis", "name": "Archers", "abbr": "STL", "primary": "#7a0019", "secondary": "#ffcc33", "mascot": "drawn bow and arrow"},
    {"city": "Kansas City", "name": "Scouts", "abbr": "KC", "primary": "#cc0000", "secondary": "#ffd700", "mascot": "scout arrowhead"},
    {"city": "Minneapolis", "name": "Northmen", "abbr": "MIN", "primary": "#3f2a56", "secondary": "#f0b323", "mascot": "horned viking helmet"},
    {"city": "Indianapolis", "name": "Racers", "abbr": "IND", "primary": "#003da5", "secondary": "#ffffff", "mascot": "race car with a checkered flag"},
    {"city": "Dallas", "name": "Wranglers", "abbr": "DAL", "primary": "#0b2265", "secondary": "#b0b7bc", "mascot": "cowboy hat and lasso"},
    {"city": "Houston", "name": "Comets", "abbr": "HOU", "primary": "#d22630", "secondary": "#0c1c47", "mascot": "streaking comet"},
    {"city": "San Antonio", "name": "Defenders", "abbr": "SA", "primary": "#3a3a3a", "secondary": "#c4ced4", "mascot": "fortress shield"},
    {"city": "New Orleans", "name": "Brass", "abbr": "NO", "primary": "#101820", "secondary": "#d3bc8d", "mascot": "brass trumpet"},
    {"city": "Seattle", "name": "Evergreens", "abbr": "SEA", "primary": "#0b3d2e", "secondary": "#69be28", "mascot": "tall pine tree"},
    {"city": "Portland", "name": "Lumberjacks", "abbr": "POR", "primary": "#5c4033", "secondary": "#e35205", "mascot": "crossed axe and log"},
    {"city": "Salt Lake City", "name": "Summit", "abbr": "SLC", "primary": "#2d2926", "secondary": "#f9a01b", "mascot": "snow-capped mountain peak"},
    {"city": "Denver", "name": "Bighorns", "abbr": "DEN", "primary": "#4b3f2f", "secondary": "#fb4f14", "mascot": "bighorn ram head"},
    {"city": "Los Angeles", "name": "Quakes", "abbr": "LA", "primary": "#552583", "secondary": "#fdb927", "mascot": "seismic fault crack"},
    {"city": "San Diego", "name": "Mariners", "abbr": "SD", "primary": "#002244", "secondary": "#ffb612", "mascot": "ship's anchor and wheel"},
    {"city": "Phoenix", "name": "Scorpions", "abbr": "PHX", "primary": "#8c1d40", "secondary": "#ffc627", "mascot": "scorpion with a raised tail"},
    {"city": "Las Vegas", "name": "Aces", "abbr": "LV", "primary": "#101820", "secondary": "#c8102e", "mascot": "ace playing card"},
    {"city": "San Francisco", "name": "Fog", "abbr": "SF", "primary": "#41424c", "secondary": "#b9975b", "mascot": "suspension bridge in rolling fog"},
    {"city": "Oakland", "name": "Oaks", "abbr": "OAK", "primary": "#1b4d3e", "secondary": "#efb21e", "mascot": "mighty oak tree and acorn"},
    {"city": "Sacramento", "name": "Miners", "abbr": "SAC", "primary": "#5a2d81", "secondary": "#63727a", "mascot": "pickaxe and gold nugget"},
    {"city": "Honolulu", "name": "Volcanoes", "abbr": "HON", "primary": "#aa0000", "secondary": "#00a3e0", "mascot": "erupting volcano"},
]

for _i, _t in enumerate(TEAMS):
    _t.setdefault("badge", _BADGES[_i % len(_BADGES)])
