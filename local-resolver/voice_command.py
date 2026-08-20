import json
import os
import re
import time

import httpx

LLM_BASE_URL = (
    os.getenv("VOICE_COMMAND_LLM_BASE_URL")
    or os.getenv("RESEARCH_LLM_BASE_URL", "http://host.docker.internal:12340/v1")
).rstrip("/")
LLM_MODEL = os.getenv("VOICE_COMMAND_LLM_MODEL") or os.getenv(
    "RESEARCH_LLM_MODEL", "qwen3.8-off"
)
LLM_API_KEY = os.getenv("VOICE_COMMAND_LLM_API_KEY") or os.getenv(
    "RESEARCH_LLM_API_KEY", "local"
)
LLM_TIMEOUT_SECONDS = float(os.getenv("VOICE_COMMAND_LLM_TIMEOUT_SECONDS", "30"))
LLM_MAX_TOKENS = int(os.getenv("VOICE_COMMAND_LLM_MAX_TOKENS", "300"))
MAX_BOOKS = int(os.getenv("VOICE_COMMAND_MAX_BOOKS", "200"))
MAX_TAGS = int(os.getenv("VOICE_COMMAND_MAX_TAGS", "200"))
VOICE_WHISPER_PROMPT = os.getenv(
    "VOICE_COMMAND_WHISPER_PROMPT",
    "Voice commands show play search open go to find filter book tag artist. "
    "Open metronome tool, open tuner tool, open chords tool, open keyboard tool.",
)
REGEX_CONFIDENCE = float(os.getenv("VOICE_COMMAND_REGEX_CONFIDENCE", "0.92"))
BARE_TITLE_CONFIDENCE = float(os.getenv("VOICE_COMMAND_BARE_TITLE_CONFIDENCE", "0.75"))
SEARCH_PREFIX_CONFIDENCE = float(os.getenv("VOICE_COMMAND_SEARCH_PREFIX_CONFIDENCE", "0.80"))
LLM_CONFIDENCE_THRESHOLD = float(os.getenv("VOICE_COMMAND_LLM_CONFIDENCE_THRESHOLD", "0.55"))
VOICE_MODE_PLAYBACK = "playback"
VOICE_MODE_HELP = "help"

OPEN_TOOL_SUFFIX_RE = re.compile(
    r"^(?:show|open|go to|play)\s+(?:the\s+)?(.+?)\s+tool$", re.I
)
SHOW_PREFIX_RE = re.compile(r"^(?:show|open|go to)\s+(?:the\s+)?(.+)$", re.I)
PLAY_TUNE_RE = re.compile(r"^(?:play)\s+(?:the\s+)?(.+)$", re.I)
SEARCH_PREFIX_RE = re.compile(r"^(?:search|find|filter)\s+(?:for\s+)?(.+)$", re.I)
STOP_PLAYBACK_RE = re.compile(r"^(?:stop|pause|halt|cancel)\s+(?:playing|playback|music|the music)?$", re.I)
PLAY_FILTER_RE = re.compile(
    r"^(?:play|queue|start)\s+(?:songs?\s+)?(?:by\s+)?(title|artist|genre|tag|book)\s+(?:the\s+)?(.+)$",
    re.I,
)
APP_TOOL_ALIASES = {
    "metronome": "metronome",
    "tuner": "tuner",
    "chords": "chords",
    "chord": "chords",
    "keyboard": "keyboard",
    "piano": "keyboard",
}
SEARCH_CUE_WORDS = {
    "search",
    "find",
    "filter",
    "book",
    "tag",
    "tagged",
    "in",
    "by",
    "from",
    "with",
}

HELP_LINKS = [
    ("start-here", "Start here", "Getting started and basic workflow"),
    ("what-you-can-do", "What you can do", "Overview of app capabilities"),
    ("organise", "Add and organise", "Books, tags, genres, and filters"),
    ("edit-music", "Edit music", "Music editor and notation editing"),
    ("practise", "Practise with media", "Playback and practice controls"),
    ("tuner", "Tuner", "Instrument tuner and intonation checks"),
    ("lyrics-chords", "Lyrics and chords", "Lyrics, chords, and background info"),
    ("offline-sync", "Offline and sync", "Offline use and sync troubleshooting"),
    ("media-resolver", "Media resolver", "Resolver-dependent features"),
    ("automatic-detection", "Automatic detection", "Lyrics, chords, and melody analysis"),
    ("import-from-media", "Import from media", "Importing from audio/video"),
    ("chord-sheet-import", "Chord sheet import and export", "Chord sheet workflows"),
    ("foot-pedal", "Foot pedal / page turn", "Bluetooth foot pedal scrolling and page turn"),
    ("performance-sets", "Performance sets and Gig Mode", "Gig and set playback"),
    ("more-features", "More features", "Extra tools and tips"),
    ("youtube", "YouTube and linked media", "Linked media and YouTube playback"),
    ("abc-notation", "ABC notation", "ABC syntax and notation details"),
    ("chords-detail", "Chords in detail", "Chord notation guidance"),
    ("confidence", "Confidence tracking", "Confidence and difficulty tracking"),
]

# Short how-to blurbs used for LLM context and offline fallbacks when the model
# returns an empty answer.
HELP_ANSWER_BLURBS = {
    "start-here": (
        "Use the header Add button to create or import a tune, open it from the "
        "tune list, then Edit from the tune menu. Link media with the yellow Links "
        "button, and practise with generated playback or linked audio/video."
    ),
    "what-you-can-do": (
        "ABC Tune Book lets you collect tunes (ABC, MusicXML, YouTube, media import), "
        "edit notation and metadata, organise with books/tags/genres, and practise "
        "with playback, loops, tuner, and linked media."
    ),
    "organise": (
        "Assign books, tags, genre, and artist/composer on a tune's Edit → Info tab. "
        "Filter the tune list by book, tag, genre, or search text from the tunes page."
    ),
    "edit-music": (
        "Open a tune, then use the tune menu → Edit. Use the Music tab for note lines "
        "per voice, or the ABC tab for raw notation. Tap the tempo mark or key "
        "signature in the music view for quick changes; undo/redo are in the editor toolbar."
    ),
    "practise": (
        "On a tune page, play generated MIDI or linked media. Use the media controls "
        "dropdown for Playback speed, Audio Filters, and named Loop settings. "
        "Book Tools can play a whole book; Practice in the header starts guided sessions."
    ),
    "tuner": (
        "Open Tuner from the header menu. Choose your instrument and tuning preset, "
        "then play each string into the mic. Pair Bluetooth accessories first if needed; "
        "Advanced settings include A4 reference pitch and intonation checks."
    ),
    "lyrics-chords": (
        "In the editor, use the Lyrics and Chords tabs to search, clean, and save "
        "lyrics/chords. Background information lives on the Info tab, with Research "
        "Background when the media resolver is available."
    ),
    "offline-sync": (
        "The app works offline with local storage. Log in with the green header button "
        "to sync your tune book to Google Drive when you want cloud backup."
    ),
    "media-resolver": (
        "The local media resolver powers Whisper, MIDI import, Import from media, "
        "stem separation, and other analysis features. Start it from Settings when "
        "those tools are unavailable."
    ),
    "automatic-detection": (
        "When the resolver is available, analysis can detect lyrics, chords, and "
        "melody from linked media. Use Import from media or related editor wizards "
        "to run detection and review results."
    ),
    "import-from-media": (
        "Use Add → Import from media, or the editor Wizards button, to analyse "
        "audio/video and draft lyrics, chords, and melody. Review each step before "
        "saving into a tune."
    ),
    "chord-sheet-import": (
        "Import chord sheets from Add → Import → Select A File, or paste/edit chords "
        "in the editor Chords tab. Export chord sheets from tune or book tools when needed."
    ),
    "foot-pedal": (
        "Pair a Bluetooth foot pedal (AirTurn, PageFlip, etc.) in your device settings, "
        "then configure keys in Settings → Pedal. Page Down scrolls the chart and advances "
        "to the next tune at the bottom; Page Up scrolls up and goes to the previous tune at the top."
    ),
    "performance-sets": (
        "Build performance sets from books or selected tunes, then use Gig Mode for "
        "stage-friendly navigation and page turns during a set."
    ),
    "more-features": (
        "Check Help for extra tools such as metronome, keyboard, chords lookup, "
        "foot-pedal page turn, confidence tracking, and bulk edit/check actions."
    ),
    "youtube": (
        "Attach YouTube or other media with the yellow Links button on a tune page. "
        "Search YouTube when logged in, or add a link manually, then practise against it."
    ),
    "abc-notation": (
        "ABC is plain-text music notation. Edit it on the editor ABC tab, or use the "
        "Music tab for structured note lines. Header fields like T: (title), M: (meter), "
        "K: (key), and Q: (tempo) control playback and display."
    ),
    "chords-detail": (
        "Enter chords in the Chords tab as chord symbols aligned with the tune. "
        "Use Search Chords when available, Clean Text to tidy layout, then Save. "
        "See Chords in detail in Help for symbol conventions."
    ),
    "confidence": (
        "On a tune page, use the confidence button (number badge) to set confidence 0–20 "
        "and optional difficulty. Sort or group the tune list by confidence, and bulk-set "
        "selected tunes from the Tunes page selection menu."
    ),
}

HELP_LINK_HINTS = {
    "start-here": ["start", "begin", "getting started", "new", "intro"],
    "what-you-can-do": ["what can", "capabilities", "overview", "features"],
    "organise": ["book", "books", "tag", "tags", "genre", "genres", "artist", "artists", "filter", "organise", "organize"],
    "edit-music": ["edit", "editor", "notation", "music editor", "abc editor", "change notes", "transpose"],
    "practise": ["practice", "practise", "playback", "play", "media", "loop", "tempo", "pitch"],
    "tuner": ["tuner", "tuning", "intonation", "tune my", "string tuning"],
    "lyrics-chords": ["lyrics", "chords", "background", "song info"],
    "offline-sync": ["offline", "sync", "google drive", "login", "save"],
    "media-resolver": ["resolver", "media resolver", "backend", "midi import"],
    "automatic-detection": ["automatic", "detect", "detection", "lyrics and chords", "melody"],
    "import-from-media": ["import from media", "import media", "audio", "video", "transcribe", "analyze media", "analyse media"],
    "chord-sheet-import": ["chord sheet", "export", "import sheet", "sheet import"],
    "foot-pedal": [
        "foot pedal",
        "foot pedals",
        "page turn",
        "page turner",
        "bluetooth pedal",
        "airturn",
        "pageflip",
        "pedal",
        "scroll-then-song",
    ],
    "performance-sets": ["gig", "set", "sets", "performance", "gig mode"],
    "more-features": ["more features", "tips", "extras", "shortcuts"],
    "youtube": ["youtube", "linked media", "link", "media links"],
    "abc-notation": ["abc", "notation", "abc notation"],
    "chords-detail": ["chord theory", "chord notation", "chords in detail"],
    "confidence": ["confidence", "difficulty", "boost"],
}

HELP_FALLBACK_LINKS = ["/help#start-here", "/help#what-you-can-do", "/help#edit-music", "/help#practise"]

HELP_RANK_STOPWORDS = {
    "a",
    "an",
    "the",
    "i",
    "me",
    "my",
    "you",
    "your",
    "how",
    "do",
    "does",
    "did",
    "to",
    "for",
    "in",
    "on",
    "of",
    "and",
    "or",
    "is",
    "are",
    "can",
    "could",
    "would",
    "should",
    "what",
    "where",
    "when",
    "why",
    "with",
    "from",
    "use",
    "using",
    "get",
    "got",
    "please",
    "about",
    "into",
}

VOICE_WHISPER_OPTIONS = {
    "whisperPrompt": VOICE_WHISPER_PROMPT,
    "whisperLanguage": "en",
    "whisperBestOf": 1,
    "whisperBeamSize": 1,
}


def _normalize_space(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _empty_intent(transcript="", parse_method="none"):
    return {
        "transcript": transcript,
        "tool": "NONE",
        "title": "",
        "artist": "",
        "book": "",
        "genre": "",
        "tags": [],
        "searchText": "",
        "filterKind": "",
        "filterValue": "",
        "helpAnswer": "",
        "helpLinks": [],
        "confidence": 0.0,
        "parseMethod": parse_method,
    }


def _intent_result(
    transcript,
    tool,
    title="",
    artist="",
    book="",
    genre="",
    tags=None,
    search_text="",
    filter_kind="",
    filter_value="",
    help_answer="",
    help_links=None,
    confidence=0.0,
    parse_method="regex",
):
    return {
        "transcript": transcript,
        "tool": tool,
        "title": _normalize_space(title),
        "artist": _normalize_space(artist),
        "book": _normalize_space(book),
        "genre": _normalize_space(genre),
        "tags": list(tags or []),
        "searchText": _normalize_space(search_text),
        "filterKind": _normalize_space(filter_kind),
        "filterValue": _normalize_space(filter_value),
        "helpAnswer": _normalize_space(help_answer),
        "helpLinks": list(help_links or []),
        "confidence": float(confidence),
        "parseMethod": parse_method,
    }


def _has_search_cue_words(text):
    words = set(re.findall(r"[a-z']+", text.lower()))
    return bool(words.intersection(SEARCH_CUE_WORDS))


def _is_meaningful_transcript(text):
    return bool(re.search(r"[a-z0-9]{2,}", str(text or "").lower()))


def _resolve_app_tool_name(spoken):
    spoken_norm = _normalize_space(spoken).lower()
    if not spoken_norm:
        return ""
    return APP_TOOL_ALIASES.get(spoken_norm, "")


def _normalize_help_link(link):
    value = _normalize_space(link)
    if not value:
        return ""
    if value.startswith("/help#"):
        return value
    if value.startswith("#"):
        return "/help" + value
    if value in {item[0] for item in HELP_LINKS}:
        return "/help#" + value
    return ""


def _help_link_id(link):
    normalized = _normalize_help_link(link)
    if not normalized:
        return ""
    return normalized.split("#", 1)[-1]


def build_fallback_help_answer(links=None, question=""):
    """Build a concrete how-to from ranked help topics when the LLM answer is empty."""
    candidates = list(links or [])
    if not candidates:
        candidates = rank_help_links(question)
    for link in candidates:
        link_id = _help_link_id(link)
        blurb = HELP_ANSWER_BLURBS.get(link_id)
        if blurb:
            return blurb
    for link_id, _title, summary in HELP_LINKS:
        if any(_help_link_id(link) == link_id for link in candidates):
            return summary
    return (
        "Open the related help topic below for step-by-step guidance on this question."
    )


def _is_vague_help_answer(answer):
    normalized = _normalize_space(answer).lower().rstrip(".")
    vague = {
        "open the help section for the closest topic",
        "open the related help topic below for step-by-step guidance on this question",
        "see the related help",
        "see help",
    }
    return normalized in vague or normalized.startswith("open the help section")


def _fallback_help_links(text):
    normalized = _normalize_space(text).lower()
    rules = [
        ("foot pedal", "/help#foot-pedal"),
        ("page turn", "/help#foot-pedal"),
        ("airturn", "/help#foot-pedal"),
        ("pageflip", "/help#foot-pedal"),
        ("pedal", "/help#foot-pedal"),
        ("import from media", "/help#import-from-media"),
        ("import", "/help#import-from-media"),
        ("resolver", "/help#media-resolver"),
        ("media", "/help#media-resolver"),
        ("edit", "/help#edit-music"),
        ("notation", "/help#edit-music"),
        ("abc", "/help#abc-notation"),
        ("chord sheet", "/help#chord-sheet-import"),
        ("chord", "/help#lyrics-chords"),
        ("lyrics", "/help#lyrics-chords"),
        ("tuner", "/help#tuner"),
        ("tuning", "/help#tuner"),
        ("practice", "/help#practise"),
        ("practise", "/help#practise"),
        ("playback", "/help#practise"),
        ("confidence", "/help#confidence"),
        ("gig", "/help#performance-sets"),
        ("sync", "/help#offline-sync"),
        ("offline", "/help#offline-sync"),
        ("book", "/help#organise"),
        ("tag", "/help#organise"),
        ("genre", "/help#organise"),
        ("start", "/help#start-here"),
        ("help", "/help#what-you-can-do"),
    ]
    links = []
    for keyword, link in rules:
        if keyword in normalized and link not in links:
            links.append(link)
    for link in HELP_FALLBACK_LINKS:
        if link not in links:
            links.append(link)
    return links[:4]


def rank_help_links(text, limit=3):
    normalized = _normalize_space(text).lower()
    if not normalized:
        return HELP_FALLBACK_LINKS[:limit]

    token_set = {
        token
        for token in re.findall(r"[a-z0-9']+", normalized)
        if token and token not in HELP_RANK_STOPWORDS and len(token) > 1
    }
    scored = []
    for link_id, title, summary in HELP_LINKS:
        score = 0
        haystack = f"{title} {summary}".lower()
        if link_id in normalized or link_id.replace("-", " ") in normalized:
            score += 8
        id_parts = [part for part in link_id.split("-") if len(part) > 2]
        if id_parts and all(part in token_set for part in id_parts):
            score += 8
        for hint in HELP_LINK_HINTS.get(link_id, []):
            if hint in normalized:
                score += 5 if " " in hint or len(hint) > 4 else 3
        for token in token_set:
            if token in haystack:
                score += 1
        if score > 0:
            scored.append((score, "/help#" + link_id))

    if not scored:
        return _fallback_help_links(normalized)[:limit]

    scored.sort(key=lambda item: (-item[0], HELP_FALLBACK_LINKS.index(item[1]) if item[1] in HELP_FALLBACK_LINKS else 999))
    ranked = []
    for _score, link in scored:
        if link not in ranked:
            ranked.append(link)
    for link in _fallback_help_links(normalized):
        if link not in ranked:
            ranked.append(link)
    return ranked[:limit]


def _parse_voice_intent_regex(text, voice_mode=VOICE_MODE_PLAYBACK):
    normalized = _normalize_space(text).lower()
    if not normalized:
        return None, 0.0, None

    if voice_mode == VOICE_MODE_HELP:
        return None, 0.0, None

    stop_match = STOP_PLAYBACK_RE.match(normalized)
    if stop_match:
        return (
            _intent_result(text, "STOP_PLAYBACK", confidence=REGEX_CONFIDENCE, parse_method="regex"),
            REGEX_CONFIDENCE,
            None,
        )

    play_filter_match = PLAY_FILTER_RE.match(normalized)
    if play_filter_match:
        filter_kind = _normalize_space(play_filter_match.group(1)).lower()
        filter_value = _normalize_space(play_filter_match.group(2))
        if filter_kind and filter_value and _is_meaningful_transcript(filter_value):
            kwargs = {
                "filter_kind": filter_kind,
                "filter_value": filter_value,
                "confidence": REGEX_CONFIDENCE,
                "parse_method": "regex",
            }
            if filter_kind == "title":
                kwargs["title"] = filter_value
            elif filter_kind == "artist":
                kwargs["artist"] = filter_value
            elif filter_kind == "genre":
                kwargs["genre"] = filter_value
            elif filter_kind == "tag":
                kwargs["tags"] = [filter_value]
            elif filter_kind == "book":
                kwargs["book"] = filter_value
            return (
                _intent_result(text, "PLAY_FILTER", **kwargs),
                REGEX_CONFIDENCE,
                None,
            )

    play_tune_match = PLAY_TUNE_RE.match(normalized)
    if play_tune_match:
        title = _normalize_space(play_tune_match.group(1))
        if title and _is_meaningful_transcript(title):
            return (
                _intent_result(text, "PLAY", title=title, confidence=REGEX_CONFIDENCE),
                REGEX_CONFIDENCE,
                None,
            )

    open_tool_match = OPEN_TOOL_SUFFIX_RE.match(normalized)
    if open_tool_match:
        spoken_tool = _normalize_space(open_tool_match.group(1))
        tool_name = _resolve_app_tool_name(spoken_tool)
        return (
            _intent_result(
                text,
                "OPEN_TOOL",
                title=tool_name or spoken_tool,
                confidence=REGEX_CONFIDENCE if tool_name else 0.0,
            ),
            REGEX_CONFIDENCE if tool_name else 0.0,
            None,
        )

    show_match = SHOW_PREFIX_RE.match(normalized)
    if show_match:
        title = _normalize_space(show_match.group(1))
        if title and _is_meaningful_transcript(title):
            return (
                _intent_result(text, "SHOW", title=title, confidence=REGEX_CONFIDENCE),
                REGEX_CONFIDENCE,
                None,
            )

    search_match = SEARCH_PREFIX_RE.match(normalized)
    if search_match:
        remainder = _normalize_space(search_match.group(1))
        if remainder and _is_meaningful_transcript(remainder):
            return (
                None,
                SEARCH_PREFIX_CONFIDENCE,
                remainder,
            )

    if (
        not _has_search_cue_words(normalized)
        and len(normalized.split()) >= 1
        and _is_meaningful_transcript(normalized)
    ):
        return (
            _intent_result(text, "SHOW", title=text.strip(), confidence=BARE_TITLE_CONFIDENCE),
            BARE_TITLE_CONFIDENCE,
            None,
        )

    return None, 0.0, None


def parse_voice_intent_regex(text):
    intent, confidence, _remainder = _parse_voice_intent_regex(text)
    return intent, confidence


def match_catalog_name(spoken, catalog):
    spoken_norm = _normalize_space(spoken).lower()
    if not spoken_norm or not catalog:
        return ""

    for entry in catalog:
        entry_norm = _normalize_space(entry).lower()
        if entry_norm == spoken_norm:
            return entry

    for entry in catalog:
        entry_norm = _normalize_space(entry).lower()
        if spoken_norm in entry_norm or entry_norm in spoken_norm:
            return entry

    return ""


def apply_catalog_matches(intent, books, tags):
    if not intent:
        return intent
    book = match_catalog_name(intent.get("book", ""), books)
    if book:
        intent["book"] = book
    matched_tags = []
    for tag in intent.get("tags") or []:
        canonical = match_catalog_name(tag, tags)
        if canonical and canonical not in matched_tags:
            matched_tags.append(canonical)
    intent["tags"] = matched_tags
    return intent


def _extract_llm_message_text(message_or_content):
    if isinstance(message_or_content, dict):
        content = str(message_or_content.get("content") or "").strip()
        if content:
            return content
        reasoning = str(message_or_content.get("reasoning_content") or "").strip()
        if reasoning:
            fenced = re.search(r"```(?:json)?\s*(\{.*\})\s*```", reasoning, re.S)
            if fenced:
                return fenced.group(1)
            object_match = re.search(r"(\{.*\})", reasoning, re.S)
            if object_match:
                return object_match.group(1)
        return ""
    return str(message_or_content or "").strip()


def parse_llm_voice_json(content):
    text = _extract_llm_message_text(content)
    if not text:
        raise ValueError("LLM returned empty text")
    fenced = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.S)
    if fenced:
        text = fenced.group(1)
    else:
        object_match = re.search(r"(\{.*\})", text, re.S)
        if object_match:
            text = object_match.group(1)
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError("LLM voice response was not a JSON object")
    return data


def normalize_voice_intent_from_llm(data, transcript, force_tool=None):
    tool = force_tool or str(data.get("tool") or "NONE").strip().upper()
    if tool not in {"SHOW", "PLAY", "SEARCH", "OPEN_TOOL", "PLAY_FILTER", "STOP_PLAYBACK", "ASK_HELP", "NONE"}:
        tool = "NONE"
    tags = data.get("tags")
    if isinstance(tags, str) and tags.strip():
        tags = [tags.strip()]
    elif not isinstance(tags, list):
        tags = []
    tags = [_normalize_space(tag) for tag in tags if _normalize_space(tag)]
    confidence = data.get("confidence", 0.0)
    try:
        confidence = float(confidence)
    except (TypeError, ValueError):
        confidence = 0.0

    help_links = data.get("helpLinks") or data.get("help_links") or []
    if isinstance(help_links, str):
        help_links = [help_links]
    help_links = [normalized for normalized in (_normalize_help_link(link) for link in help_links) if normalized]

    return _intent_result(
        transcript,
        tool,
        title=str(data.get("title") or ""),
        artist=str(data.get("artist") or ""),
        book=str(data.get("book") or ""),
        genre=str(data.get("genre") or ""),
        tags=tags,
        search_text=str(data.get("searchText") or data.get("search_text") or ""),
        filter_kind=str(data.get("filterKind") or data.get("filter_kind") or ""),
        filter_value=str(data.get("filterValue") or data.get("filter_value") or ""),
        help_answer=str(data.get("helpAnswer") or data.get("help_answer") or ""),
        help_links=help_links,
        confidence=confidence,
        parse_method="llm",
    )


def _help_answer_prompt(transcript):
    help_index = []
    for link_id, title, summary in HELP_LINKS:
        blurb = HELP_ANSWER_BLURBS.get(link_id) or summary
        help_index.append(f"- /help#{link_id}: {title} — {blurb}")
    system_prompt = (
        "You answer help questions for ABC Tune Book. Respond with JSON only, no markdown. "
        "Schema: {\"tool\":\"ASK_HELP\",\"helpAnswer\":\"\",\"helpLinks\":[],\"confidence\":0.0-1.0} "
        "Write a concrete 1-3 sentence how-to in helpAnswer using the topic blurbs. "
        "Do not say vague things like 'open the help section' or 'see the closest topic'. "
        "Then choose up to 3 relevant helpLinks from the allowed list. "
        "Never invent links outside the list."
    )
    user_prompt = (
        f'QUESTION: "{transcript}"\n'
        "ALLOWED HELP LINKS:\n"
        + "\n".join(help_index)
    )
    return system_prompt, user_prompt


async def parse_help_intent_llm(transcript):
    from llm_runtime import (
        enrich_chat_completion_payload,
        get_active_llm_config,
        llm_auth_headers,
        llm_chat_url,
        llm_model,
    )

    system_prompt, user_prompt = _help_answer_prompt(transcript)
    help_max_tokens = max(LLM_MAX_TOKENS, 450)
    cfg = get_active_llm_config(voice=True)
    async with httpx.AsyncClient(timeout=LLM_TIMEOUT_SECONDS) as client:
        resp = await client.post(
            llm_chat_url(cfg),
            headers=llm_auth_headers(cfg),
            json=enrich_chat_completion_payload({
                "model": llm_model(cfg),
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "temperature": 0.2,
                "max_tokens": help_max_tokens,
            }, cfg),
        )
        resp.raise_for_status()
        payload = resp.json()
        from llm_runtime import note_chat_completion_usage

        note_chat_completion_usage(payload)

    choices = payload.get("choices") or []
    if not choices:
        raise ValueError("LLM returned no choices")
    message = choices[0].get("message") or {}
    data = parse_llm_voice_json(message)
    data["tool"] = "ASK_HELP"
    intent = normalize_voice_intent_from_llm(data, transcript, force_tool="ASK_HELP")
    ranked_links = rank_help_links(transcript)
    if intent.get("helpLinks"):
        merged_links = []
        for link in list(intent.get("helpLinks") or []) + ranked_links:
            normalized = _normalize_help_link(link)
            if normalized and normalized not in merged_links:
                merged_links.append(normalized)
        intent["helpLinks"] = merged_links[:3]
    else:
        intent["helpLinks"] = ranked_links
    help_answer = _normalize_space(intent.get("helpAnswer"))
    if not help_answer or _is_vague_help_answer(help_answer):
        intent["helpAnswer"] = build_fallback_help_answer(
            intent.get("helpLinks"),
            question=transcript,
        )
    else:
        intent["helpAnswer"] = help_answer
    return intent


async def parse_voice_intent_llm(transcript, books, tags, narrow=False, narrow_text="", voice_mode=VOICE_MODE_PLAYBACK):
    books = list(books or [])[:MAX_BOOKS]
    tags = list(tags or [])[:MAX_TAGS]
    if voice_mode == VOICE_MODE_HELP:
        return await parse_help_intent_llm(transcript)
    if narrow:
        system_prompt = (
            "Extract tunebook search filters from the user's phrase. "
            "Respond with JSON only, no markdown. "
            'Schema: {"book":"","tags":[],"artist":"","genre":"","searchText":"","confidence":0.0-1.0} '
            "Map book and tags to the closest catalog entry when possible."
        )
        user_prompt = (
            f'PHRASE: "{narrow_text}"\n'
            f"BOOKS: {json.dumps(books)}\n"
            f"TAGS: {json.dumps(tags)}"
        )
        force_tool = "SEARCH"
    else:
        system_prompt = (
            "You classify tunebook voice commands. Respond with JSON only, no markdown.\n"
            'Schema: {"tool":"SHOW"|"PLAY"|"SEARCH"|"OPEN_TOOL"|"PLAY_FILTER"|"STOP_PLAYBACK"|"ASK_HELP"|"NONE","title":"","artist":"","book":"","genre":"","tags":[],"searchText":"","filterKind":"","filterValue":"","helpAnswer":"","helpLinks":[],"confidence":0.0-1.0}\n'
            "Rules:\n"
            "- SHOW: user wants to open/jump to a specific song without starting playback. Bare song title without search/filter language is SHOW.\n"
            "- PLAY: user wants to open a specific song and start playing it (e.g. 'play smoke on the water'). Put the song title in title.\n"
            "- PLAY_FILTER: user wants to create a queue from a single filter. Use exactly one filterKind/value pair: title, artist, genre, tag, or book.\n"
            "- STOP_PLAYBACK: user wants to stop or pause playback.\n"
            "- OPEN_TOOL: user wants an app tool page. Only when the phrase ends with the word 'tool' "
            "(e.g. 'open metronome tool', 'open tuner tool', 'open chords tool', 'open keyboard tool'). "
            "Put the tool name in title: metronome, tuner, chords, or keyboard.\n"
            "- SEARCH: user wants to filter the tune list. Extract book, tags (array), artist/composer, and general searchText.\n"
            "- Map book and tag strings to the closest entry from the provided catalogs; use exact catalog spelling when matched.\n"
            "- If book/tag not in catalog, leave empty rather than inventing.\n"
            "- NONE: unintelligible or unrelated to music navigation.\n"
            "- ASK_HELP is not used in playback mode."
        )
        user_prompt = (
            f'TRANSCRIPT: "{transcript}"\n'
            f"BOOKS: {json.dumps(books)}\n"
            f"TAGS: {json.dumps(tags)}"
        )
        force_tool = None

    from llm_runtime import (
        enrich_chat_completion_payload,
        get_active_llm_config,
        llm_auth_headers,
        llm_chat_url,
        llm_model,
    )

    cfg = get_active_llm_config(voice=True)
    async with httpx.AsyncClient(timeout=LLM_TIMEOUT_SECONDS) as client:
        resp = await client.post(
            llm_chat_url(cfg),
            headers=llm_auth_headers(cfg),
            json=enrich_chat_completion_payload({
                "model": llm_model(cfg),
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "temperature": 0.2,
                "max_tokens": LLM_MAX_TOKENS,
            }, cfg),
        )
        resp.raise_for_status()
        payload = resp.json()
        from llm_runtime import note_chat_completion_usage

        note_chat_completion_usage(payload)

    choices = payload.get("choices") or []
    if not choices:
        raise ValueError("LLM returned no choices")
    message = choices[0].get("message") or {}
    data = parse_llm_voice_json(message)
    intent = normalize_voice_intent_from_llm(data, transcript, force_tool=force_tool)
    return apply_catalog_matches(intent, books, tags)


def normalize_voice_command_response(body, timing=None):
    if not isinstance(body, dict):
        raise ValueError("Invalid voice command response")
    timing = timing if isinstance(timing, dict) else {}
    return {
        "transcript": str(body.get("transcript") or ""),
        "tool": str(body.get("tool") or "NONE").upper(),
        "title": str(body.get("title") or ""),
        "artist": str(body.get("artist") or ""),
        "book": str(body.get("book") or ""),
        "genre": str(body.get("genre") or ""),
        "tags": list(body.get("tags") or []),
        "searchText": str(body.get("searchText") or ""),
        "filterKind": str(body.get("filterKind") or ""),
        "filterValue": str(body.get("filterValue") or ""),
        "helpAnswer": str(body.get("helpAnswer") or ""),
        "helpLinks": list(body.get("helpLinks") or []),
        "confidence": float(body.get("confidence") or 0.0),
        "parseMethod": str(body.get("parseMethod") or "none"),
        "timing": {
            "transcribeMs": int(timing.get("transcribeMs") or 0),
            "parseMs": int(timing.get("parseMs") or 0),
            "totalMs": int(timing.get("totalMs") or 0),
        },
    }


async def parse_voice_intent(transcript, books, tags, voice_mode=VOICE_MODE_PLAYBACK):
    intent, confidence, search_remainder = _parse_voice_intent_regex(transcript, voice_mode=voice_mode)
    if intent and confidence >= REGEX_CONFIDENCE:
        return intent

    if voice_mode == VOICE_MODE_HELP:
        try:
            return await parse_help_intent_llm(transcript)
        except Exception:
            help_links = rank_help_links(transcript)
            fallback = _intent_result(
                transcript,
                "ASK_HELP",
                help_answer=build_fallback_help_answer(help_links, question=transcript),
                help_links=help_links,
                confidence=LLM_CONFIDENCE_THRESHOLD,
                parse_method="fallback",
            )
            return fallback

    parse_started = time.monotonic()
    try:
        if search_remainder:
            llm_intent = await parse_voice_intent_llm(
                transcript,
                books,
                tags,
                narrow=True,
                narrow_text=search_remainder,
                voice_mode=voice_mode,
            )
            llm_intent["parseMethod"] = "llm"
            if llm_intent.get("confidence", 0) < SEARCH_PREFIX_CONFIDENCE:
                llm_intent["confidence"] = SEARCH_PREFIX_CONFIDENCE
            return llm_intent

        if intent and intent.get("tool") == "SHOW":
            return intent

        llm_intent = await parse_voice_intent_llm(transcript, books, tags, voice_mode=voice_mode)
        if llm_intent.get("confidence", 0) < LLM_CONFIDENCE_THRESHOLD and llm_intent.get("tool") == "NONE":
            if intent:
                return intent
        return llm_intent
    except Exception:
        if intent:
            return intent
        raise
    finally:
        _ = time.monotonic() - parse_started


def parse_catalog_json(raw_value, label):
    if not raw_value:
        return []
    try:
        parsed = json.loads(raw_value)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid {label} JSON") from exc
    if not isinstance(parsed, list):
        raise ValueError(f"{label} must be a JSON array")
    return [str(item) for item in parsed if str(item or "").strip()][:MAX_BOOKS if label == "books" else MAX_TAGS]
