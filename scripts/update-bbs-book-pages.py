#!/usr/bin/env python3
"""Update Begged Borrowed and Stolen ABC with bookPages, index titles, and aliases."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import time
from pathlib import Path

BOOK = "begged borrowed and stolen"
ABC_PATH = Path("/home/stever/Downloads/begged borrowed and stolen.abc")
CLARE_JIG_PATH = Path("/home/stever/Downloads/The Clare Jig.abc")
MCMAHON_SOURCE = Path(__file__).resolve().parent.parent / "abcresources/robinson/abc_tune_robinson_9906.abc"

# (page, index_title, rhythm or None to keep existing)
INDEX = [
    (1, "Amazing Grace", "waltz"),
    (2, "Rose of Aranmore", "waltz"),
    (3, "Bonnie Doon", "waltz"),
    (4, "South Wind", "waltz"),
    (5, "Munster Cloak", "waltz"),
    (6, "Will Ye Go, Lassie?", "waltz"),
    (7, "Blackthorn Stick", "jig"),
    (8, "Rakes of Kildare", "jig"),
    (9, "Haste to the Wedding", "jig"),
    (10, "Joe Burke's Jig", "jig"),
    (11, "Over the Oceans", "jig"),
    (12, "Saddle the Pony", "jig"),
    (13, "The Miller of Glanmire", "jig"),
    (14, "The Fairhaired Boy", "jig"),
    (15, "Tenpenny Bit", "jig"),
    (16, "Lanigan's Ball", "jig"),
    (17, "Top of Cork Road", "jig"),
    (18, "Tripping up the Stairs", "jig"),
    (19, "Shandon Bells", "jig"),
    (20, "Knights of St. Patrick", "jig"),
    (21, "Muckin' of Geordie's Byre", "jig"),
    (22, "Drumdelgie", "jig"),
    (23, "Clare Jig", "jig"),
    (24, "Battering Ram", "jig"),
    (25, "Merrily Kiss the Quaker's Wife", "jig"),
    (26, "Bride's Favourite", "jig"),
    (27, "Banish Misfortune", "jig"),
    (28, "Off She Goes!", "jig"),
    (29, "Smash the Windows", "jig"),
    (30, "The Foxhunter's Jig", "slip jig"),
    (31, "Rocky Road to Dublin", "slip jig"),
    (32, "Slip Jig", "slip jig"),
    (33, "Another Jig Will Do", "slip jig"),
    (34, "Kid on the Mountain", "slip jig"),
    (35, "Pat Horgan's #1", "polka"),
    (36, "Pat Horgan's #2", "polka"),
    (37, "£40 Float", "polka"),
    (38, "Sweeney's", "polka"),
    (39, "Scarterglen", "polka"),
    (40, "St. Mary's", "polka"),
    (41, "Church St.", "polka"),
    (42, "Denis Murphy's", "polka"),
    (43, "New York Girls", "polka"),
    (44, "Siege of Ennis", "polka"),
    (45, "Rose Tree", "polka"),
    (46, "Bog Down in the Valley", "polka"),
    (47, "Dashing White Sergeant", "polka"),
    (48, "Staten Island", "polka"),
    (49, "The Galopede", "polka"),
    (50, "Nancy", "polka"),
    (51, "The Newcastle", "polka"),
    (52, "Portsmouth", "polka"),
    (53, "Rakes of Mallow", "polka"),
    (54, "Davy Knick-Knack", "polka"),
    (55, "Soldier's Joy", "polka"),
    (56, "O'Keefe's Slide", "slide"),
    (57, "Cock O' the North", "slide"),
    (58, "100 Pipers", "slide"),
    (59, "Sweets of May", "slide"),
    (60, "Dennis Murphy's", "slide"),
    (61, "O'Keefe's #2", "slide"),
    (62, "Roddy McCorley", "march"),
    (63, "Mountains of Pomeroy", "march"),
    (64, "The Centenary March", "march"),
    (65, "After the Battle of Aughrim", "march"),
    (66, "The Green Cockade", "march"),
    (67, "Lord Mayo", "march"),
    (68, "The Halting March", "march"),
    (69, "March of the King of Laoise", "march"),
    (70, "Dunphy's", "hornpipe"),
    (71, "Off to California", "hornpipe"),
    (72, "Boys of Bluehill", "hornpipe"),
    (73, "Harvest Home", "hornpipe"),
    (74, "Greencastle", "hornpipe"),
    (75, "The Trumpet", "hornpipe"),
    (76, "The Wonder Hornpipe", "hornpipe"),
    (77, "The Rights of Man", "hornpipe"),
    (78, "Sligo Maid", "reel"),
    (79, "Junior Crehan's", "reel"),
    (80, "McMahon's", "reel"),
    (81, "The Glenallen", "reel"),
    (82, "Sally Gardens", "reel"),
    (83, "The Swallow's Tail", "reel"),
    (84, "Sporting Paddy", "reel"),
    (85, "Drowsy Maggie", "reel"),
    (86, "Rolling in the Ryegrass", "reel"),
    (87, "The Silver Spear", "reel"),
    (88, "Rattigan's", "reel"),
    (89, "The Merry Blacksmith", "reel"),
    (90, "The Ash Plant", "reel"),
    (91, "Paddy White", "reel"),
    (92, "High Reel", "reel"),
    (93, "O'Carolan's Concerto", None),
    (94, "King of the Fairies", None),
    (95, "Give Me Your Hand", None),
    (96, "Si beag si mhor", None),
    (97, "Planxty Irwin", None),
    (98, "For Ireland I'd Not Tell Her Name", None),
]

# page -> normalized ABC primary title key
MATCH_KEYS = {
    3: "ye banks and braes",
    6: "will ye go lassie go",
    10: "joe burke s",
    11: "out on the ocean",
    13: "lilting banshee",
    17: "on the top of cork road",
    20: "knights of saint patrick",
    21: "muckin o geordie s byre",
    25: "merrily kissed the quaker",
    26: "bride s favourite",
    28: "off she goes",
    30: "foxhunter",
    31: "rocky road to dublin",
    34: "kid on the mountain",
    35: "ballydesmond",
    36: "glenside",
    37: "john ryan s polka",
    40: "st mary s polka",
    41: "church street polka",
    42: "denis murphy s polka",
    44: "siege of ennis",
    45: "rose tree",
    46: "bog down in the valley oh",
    49: "australian galopede",
    54: "davy davy knick knack",
    56: "o keeffe s slide",
    57: "cock of the north 1",
    58: "hundred pipers",
    59: "sweets of may",
    60: "denis murphy s slide",
    61: "o keefe s #2",
    63: "mountains of pomeroy",
    65: "after the battle of aughrim",
    69: "march of the kings of laois",
    72: "boys of bluehill",
    73: "harvest home the",
    75: "trumpet hornpipe pugwash",
    78: "sligo maid the",
    79: "junior crehan s favourite",
    81: "glen allen",
    82: "sally gardens",
    83: "swallow s tail",
    87: "silver spear",
    89: "merry blacksmith",
    90: "ashplant",
    91: "laurel tree",
    92: "high reel aka duffy the dancer",
    93: "carolan s concerto",
    98: "for ireland i won t say her name",
}

EXTRA_ALIASES = {
    3: ["Ye Banks And Braes"],
    10: ["Joe Burke's"],
    11: ["Out On The Ocean"],
    13: ["The Lilting Banshee"],
    17: ["On The Top Of Cork Road"],
    25: ["Merrily Kissed The Quaker"],
    30: ["The Foxhunter"],
    35: ["The Ballydesmond"],
    36: ["The Glenside"],
    37: ["John Ryan's Polka", "Forty Pound Float"],
    41: ["Church Street polka"],
    42: ["Denis Murphy's Polka"],
    46: ["The Bog Down in the Valley-oh"],
    49: ["Australian Galopede"],
    54: ["Davy-Davy Knick-Knack"],
    56: ["O'Keeffe's Slide"],
    57: ["Cock of the North[1]"],
    58: ["Hundred Pipers"],
    60: ["Denis Murphy's Slide"],
    61: ["O'Keefe's #2"],
    64: ["The Centenary March"],
    66: ["The Green Cockade"],
    68: ["The Halting March"],
    69: ["March of the Kings of Laois"],
    72: ["The Boys Of Bluehill"],
    73: ["Harvest Home, The"],
    75: ["Trumpet Hornpipe (Pugwash)"],
    76: ["The Wonder Hornpipe"],
    77: ["The Rights of Man"],
    78: ["Sligo Maid, The"],
    79: ["Junior Crehan's Favourite"],
    80: ["The Banshee"],
    81: ["Glen Allen"],
    82: ["The Sally Gardens"],
    83: ["The Swallow's Tail"],
    87: ["The Silver Spear"],
    89: ["The Merry Blacksmith"],
    90: ["The Ashplant"],
    91: ["The Laurel Tree", "The Laurel Bush"],
    92: ["The High Reel ( AKA Duffy the Dancer )"],
    93: ["Carolan's Concerto"],
    98: ["For Ireland I Won't Say Her Name"],
}

DROP_X = {"41"}  # instrumental Cock O' The North duplicate
REMOVE_BBS_X = {"80", "81"}  # Saint Anne's Reel, Coloured Aristocracy


def norm_title(s: str) -> str:
    s = s.lower().strip()
    s = re.sub(r"^the\s+", "", s)
    s = re.sub(r"[^\w\s#]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def bump_lastupdated(tune: str, when_ms: int | None = None) -> str:
    stamp = when_ms if when_ms is not None else int(time.time() * 1000)
    if re.search(r"^% abcbook-lastupdated", tune, re.M):
        return re.sub(r"^% abcbook-lastupdated .*$", f"% abcbook-lastupdated {stamp}", tune, flags=re.M)
    # Insert before other abcbook metadata lines
    m = re.search(r"^(% abcbook-)", tune, re.M)
    line = f"% abcbook-lastupdated {stamp}\n"
    if m:
        return tune[: m.start()] + line + tune[m.start() :]
    return tune.rstrip() + "\n" + line


def has_bbs_bookpages(tune: str) -> bool:
    for line in tune.splitlines():
        if not line.startswith("% abcbook-json bookPages"):
            continue
        try:
            payload = line.split(" ", 4)[4]
            data = json.loads(payload)
            if BOOK in data:
                return True
        except (IndexError, json.JSONDecodeError):
            continue
    return False


def bump_timestamps_in_file(path: Path) -> int:
    text = path.read_text(encoding="utf-8", errors="replace")
    prefix, tunes = split_tunes(text)
    stamp = int(time.time() * 1000)
    bumped = 0
    out: list[str] = []
    for tune in tunes:
        if has_bbs_bookpages(tune):
            out.append(bump_lastupdated(tune, stamp + bumped).rstrip() + "\n")
            bumped += 1
        else:
            out.append(tune.rstrip() + "\n")
    path.write_text(prefix.rstrip() + ("\n" if prefix.strip() else "") + "".join(out), encoding="utf-8")
    return bumped


def split_tunes(text: str) -> tuple[str, list[str]]:
    parts = re.split(r"(?=^X:\s*)", text, flags=re.M)
    prefix = parts[0] if parts and not re.match(r"^X:\s*", parts[0]) else ""
    tunes = [p for p in parts if re.match(r"^X:\s*", p)]
    return prefix, tunes


def parse_x(tune: str) -> str | None:
    m = re.search(r"^X:\s*(\S+)", tune, re.M)
    return m.group(1) if m else None


def parse_titles(tune: str) -> list[str]:
    return [t.strip() for t in re.findall(r"^T:(.+)$", tune, re.M)]


def title_key(tune: str) -> str:
    titles = parse_titles(tune)
    return norm_title(titles[0]) if titles else ""


def build_page_map(tunes: list[str]) -> dict[int, str | None]:
    by_key: dict[str, list[str]] = {}
    x_by_key: dict[str, str] = {}
    for tune in tunes:
        x = parse_x(tune)
        if not x:
            continue
        key = title_key(tune)
        if key:
            by_key.setdefault(key, []).append(tune)
            x_by_key[key] = x

    page_to_x: dict[int, str | None] = {}
    unmatched: list[tuple[int, str]] = []
    for page, index_title, _rhythm in INDEX:
        if page in (23, 80):
            page_to_x[page] = None
            continue
        key = MATCH_KEYS.get(page, norm_title(index_title))
        x = x_by_key.get(key)
        if not x and key in by_key:
            x = parse_x(by_key[key][0])
        if x:
            page_to_x[page] = x
        else:
            unmatched.append((page, index_title))

    if unmatched:
        raise SystemExit(f"Unmatched index entries: {unmatched}")
    return page_to_x


def dedupe_aliases(primary: str, aliases: list[str]) -> list[str]:
    seen = {norm_title(primary)}
    out: list[str] = []
    for alias in aliases:
        n = norm_title(alias)
        if not n or n in seen:
            continue
        seen.add(n)
        out.append(alias.strip())
    return out


def collect_aliases(page: int, index_title: str, existing_titles: list[str]) -> list[str]:
    aliases: list[str] = []
    aliases.extend(existing_titles[1:])
    aliases.extend(EXTRA_ALIASES.get(page, []))
    for t in existing_titles:
        if norm_title(t) != norm_title(index_title):
            aliases.append(t)
    return dedupe_aliases(index_title, aliases)


def set_titles(tune: str, primary: str, aliases: list[str]) -> str:
    body = re.sub(r"^T:.*$\n?", "", tune, flags=re.M)
    x_m = re.match(r"^(X:\s*\S+\s*\n)", body)
    if not x_m:
        return tune
    header = x_m.group(1)
    rest = body[len(header) :]
    lines = [f"T:{primary}\n"]
    for alias in aliases:
        lines.append(f"T:{alias}\n")
    return header + "".join(lines) + rest


def set_rhythm(tune: str, rhythm: str | None) -> str:
    if not rhythm:
        return tune
    if re.search(r"^R:", tune, re.M):
        return re.sub(r"^R:.*$", f"R: {rhythm}", tune, flags=re.M)
    m = re.search(r"^(X:\s*\S+\s*\n(?:T:.*\n)*)", tune, re.M)
    if not m:
        return tune
    insert_at = m.end()
    return tune[:insert_at] + f"R: {rhythm}\n" + tune[insert_at:]


def ensure_bbs_book(tune: str) -> str:
    books = [b.strip() for b in re.findall(r"^B:(.+)$", tune, re.M)]
    if any(b.lower() == BOOK for b in books):
        return tune
    m = re.search(r"^(X:\s*\S+\s*\n(?:T:.*\n)*)", tune, re.M)
    if not m:
        return tune
    insert_at = m.end()
    return tune[:insert_at] + f"B: {BOOK}\n" + tune[insert_at:]


def remove_bbs_book(tune: str) -> str:
    return re.sub(rf"^B: {re.escape(BOOK)}\s*\n", "", tune, flags=re.M | re.I)


def strip_bookpages(tune: str) -> str:
    return re.sub(r"^% abcbook-json bookPages.*\n?", "", tune, flags=re.M)


def insert_bookpages(tune: str, page: int) -> str:
    payload = json.dumps({BOOK: {"page": page, "tuneIndex": 1}}, separators=(",", ":"))
    line = f"% abcbook-json bookPages 1/1 {payload}\n"
    tune = strip_bookpages(tune)
    m = re.search(r"^(% abcbook-link-)", tune, re.M)
    if m:
        return tune[: m.start()] + line + tune[m.start() :]
    m2 = re.search(r"^(% abcbook-tune_id)", tune, re.M)
    if m2:
        return tune[: m2.start()] + line + tune[m2.start() :]
    m3 = re.search(r"^(%%text|% [^\\n]+\\n)", tune, re.M)
    if m3:
        return tune[: m3.start()] + line + tune[m3.start() :]
    return tune.rstrip() + "\n" + line


def build_clare_jig(next_x: int) -> str:
    raw = CLARE_JIG_PATH.read_text(encoding="utf-8", errors="replace")
    m = re.search(
        r"(?ms)^X:\s*\d+\s*\nT:.*?\n(?P<body>M:.*?)(?=\n% abcbook|\n%%text|\Z)",
        raw,
    )
    if not m:
        raise SystemExit("Could not parse Clare Jig source")
    body = m.group("body").strip() + "\n"
    tune = (
        f"X: {next_x}\n"
        f"T:Clare Jig\n"
        f"B: tunes\n"
        f"B: {BOOK}\n"
        f"R: jig\n"
        + body
        + f"% abcbook-json bookPages 1/1 {json.dumps({BOOK: {'page': 23, 'tuneIndex': 1}}, separators=(',', ':'))}\n"
    )
    return bump_lastupdated(tune)


def build_mcmahons(next_x: int) -> str:
    raw = MCMAHON_SOURCE.read_text(encoding="utf-8", errors="replace")
    music = re.findall(r"^[^\n%].*$", raw, re.M)
    music_lines = [ln for ln in music if not ln.startswith(("X:", "T:", "M:", "R:", "K:", "E:", "I:"))]
    tune_body = "\n".join(music_lines).strip() + "\n"
    tune = (
        f"X: {next_x}\n"
        f"T:McMahon's\n"
        f"T:The Banshee\n"
        f"B: tunes\n"
        f"B: {BOOK}\n"
        f"M:4/4\n"
        f"L:1/8\n"
        f"R: reel\n"
        f"K:G\n"
        f"V:1 \n"
        + tune_body
        + f"% abcbook-json bookPages 1/1 {json.dumps({BOOK: {'page': 80, 'tuneIndex': 1}}, separators=(',', ':'))}\n"
    )
    return bump_lastupdated(tune)


def apply_tune_updates(tune: str, page: int, index_title: str, rhythm: str | None) -> str:
    existing = parse_titles(tune)
    aliases = collect_aliases(page, index_title, existing)
    tune = set_titles(tune, index_title, aliases)
    tune = set_rhythm(tune, rhythm)
    tune = ensure_bbs_book(tune)
    tune = insert_bookpages(tune, page)
    tune = bump_lastupdated(tune)
    return tune


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--write", action="store_true")
    parser.add_argument(
        "--bump-timestamps",
        action="store_true",
        help="Bump %% abcbook-lastupdated on all BBS bookPages tunes so import detects updates",
    )
    args = parser.parse_args()
    if not args.dry_run and not args.write and not args.bump_timestamps:
        parser.error("Specify --dry-run, --write, or --bump-timestamps")

    if args.bump_timestamps:
        count = bump_timestamps_in_file(ABC_PATH)
        print(f"Bumped lastUpdated on {count} tunes in {ABC_PATH}")
        return

    text = ABC_PATH.read_text(encoding="utf-8", errors="replace")
    prefix, tunes = split_tunes(text)
    page_to_x = build_page_map(tunes)
    x_to_page = {x: page for page, x in page_to_x.items() if x}

    if args.dry_run:
        index_by_page = {p: t for p, t, _ in INDEX}
        for page in sorted(page_to_x):
            x = page_to_x[page]
            title = index_by_page[page]
            if x is None:
                print(f"p.{page:3} INSERT  {title}")
            else:
                print(f"p.{page:3} X:{x:>3}  {title}")
        print(f"\nDrop X:{', X:'.join(sorted(DROP_X))}")
        print(f"Remove BBS from X:{', X:'.join(sorted(REMOVE_BBS_X))}")
        return

    backup = ABC_PATH.with_suffix(".abc.bak")
    shutil.copy2(ABC_PATH, backup)

    out: list[str] = []
    max_x = 0
    for tune in tunes:
        x = parse_x(tune)
        if not x or x in DROP_X:
            continue
        max_x = max(max_x, int(x) if x.isdigit() else max_x)

        if x in REMOVE_BBS_X:
            out.append(remove_bbs_book(strip_bookpages(tune)))
            continue

        page = x_to_page.get(x)
        if page:
            index_title, rhythm = next((t, r) for p, t, r in INDEX if p == page)
            tune = apply_tune_updates(tune, page, index_title, rhythm)
        else:
            tune = strip_bookpages(tune)

        out.append(tune.rstrip() + "\n")

    next_x = max_x + 1
    out.append("\n" + build_clare_jig(next_x) + "\n")
    next_x += 1
    out.append("\n" + build_mcmahons(next_x) + "\n")

    ABC_PATH.write_text(prefix + "\n".join("" if not prefix else [prefix.rstrip()]) + "".join(out), encoding="utf-8")

    # verify
    verify_text = ABC_PATH.read_text(encoding="utf-8")
    bp_count = len(re.findall(r"^% abcbook-json bookPages", verify_text, re.M))
    print(f"Wrote {ABC_PATH}")
    print(f"Backup: {backup}")
    print(f"bookPages entries: {bp_count} (expected 98)")


if __name__ == "__main__":
    main()
