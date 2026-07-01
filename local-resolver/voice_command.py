import json
import os
import re
import time

import httpx

LLM_BASE_URL = (
    os.getenv("VOICE_COMMAND_LLM_BASE_URL")
    or os.getenv("RESEARCH_LLM_BASE_URL", "http://host.docker.internal:1234/v1")
).rstrip("/")
LLM_MODEL = os.getenv("VOICE_COMMAND_LLM_MODEL") or os.getenv(
    "RESEARCH_LLM_MODEL", "google/gemma-3-4b-it"
)
LLM_API_KEY = os.getenv("VOICE_COMMAND_LLM_API_KEY") or os.getenv(
    "RESEARCH_LLM_API_KEY", "lm-studio"
)
LLM_TIMEOUT_SECONDS = float(os.getenv("VOICE_COMMAND_LLM_TIMEOUT_SECONDS", "30"))
LLM_MAX_TOKENS = int(os.getenv("VOICE_COMMAND_LLM_MAX_TOKENS", "300"))
MAX_BOOKS = int(os.getenv("VOICE_COMMAND_MAX_BOOKS", "200"))
MAX_TAGS = int(os.getenv("VOICE_COMMAND_MAX_TAGS", "200"))
VOICE_WHISPER_PROMPT = os.getenv(
    "VOICE_COMMAND_WHISPER_PROMPT",
    "Voice commands show search open go to find filter book tag artist. "
    "Open metronome tool, open tuner tool, open chords tool, open keyboard tool.",
)
REGEX_CONFIDENCE = float(os.getenv("VOICE_COMMAND_REGEX_CONFIDENCE", "0.92"))
BARE_TITLE_CONFIDENCE = float(os.getenv("VOICE_COMMAND_BARE_TITLE_CONFIDENCE", "0.75"))
SEARCH_PREFIX_CONFIDENCE = float(os.getenv("VOICE_COMMAND_SEARCH_PREFIX_CONFIDENCE", "0.80"))
LLM_CONFIDENCE_THRESHOLD = float(os.getenv("VOICE_COMMAND_LLM_CONFIDENCE_THRESHOLD", "0.55"))

OPEN_TOOL_SUFFIX_RE = re.compile(
    r"^(?:show|open|go to|play)\s+(?:the\s+)?(.+?)\s+tool$", re.I
)
SHOW_PREFIX_RE = re.compile(r"^(?:show|open|go to|play)\s+(?:the\s+)?(.+)$", re.I)
SEARCH_PREFIX_RE = re.compile(r"^(?:search|find|filter)\s+(?:for\s+)?(.+)$", re.I)
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
        "tags": [],
        "searchText": "",
        "confidence": 0.0,
        "parseMethod": parse_method,
    }


def _intent_result(
    transcript,
    tool,
    title="",
    artist="",
    book="",
    tags=None,
    search_text="",
    confidence=0.0,
    parse_method="regex",
):
    return {
        "transcript": transcript,
        "tool": tool,
        "title": _normalize_space(title),
        "artist": _normalize_space(artist),
        "book": _normalize_space(book),
        "tags": list(tags or []),
        "searchText": _normalize_space(search_text),
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


def _parse_voice_intent_regex(text):
    normalized = _normalize_space(text).lower()
    if not normalized:
        return None, 0.0, None

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
    if tool not in {"SHOW", "SEARCH", "OPEN_TOOL", "NONE"}:
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
    return _intent_result(
        transcript,
        tool,
        title=str(data.get("title") or ""),
        artist=str(data.get("artist") or ""),
        book=str(data.get("book") or ""),
        tags=tags,
        search_text=str(data.get("searchText") or data.get("search_text") or ""),
        confidence=confidence,
        parse_method="llm",
    )


async def parse_voice_intent_llm(transcript, books, tags, narrow=False, narrow_text=""):
    books = list(books or [])[:MAX_BOOKS]
    tags = list(tags or [])[:MAX_TAGS]
    if narrow:
        system_prompt = (
            "Extract tunebook search filters from the user's phrase. "
            "Respond with JSON only, no markdown. "
            'Schema: {"book":"","tags":[],"artist":"","searchText":"","confidence":0.0-1.0} '
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
            'Schema: {"tool":"SHOW"|"SEARCH"|"OPEN_TOOL"|"NONE","title":"","artist":"","book":"","tags":[],"searchText":"","confidence":0.0-1.0}\n'
            "Rules:\n"
            "- SHOW: user wants to open/jump to a specific song. Bare song title without search/filter language is SHOW.\n"
            "- OPEN_TOOL: user wants an app tool page. Only when the phrase ends with the word 'tool' "
            "(e.g. 'open metronome tool', 'open tuner tool', 'open chords tool', 'open keyboard tool'). "
            "Put the tool name in title: metronome, tuner, chords, or keyboard.\n"
            "- SEARCH: user wants to filter the tune list. Extract book, tags (array), artist/composer, and general searchText.\n"
            "- Map book and tag strings to the closest entry from the provided catalogs; use exact catalog spelling when matched.\n"
            "- If book/tag not in catalog, leave empty rather than inventing.\n"
            "- NONE: unintelligible or unrelated to music navigation."
        )
        user_prompt = (
            f'TRANSCRIPT: "{transcript}"\n'
            f"BOOKS: {json.dumps(books)}\n"
            f"TAGS: {json.dumps(tags)}"
        )
        force_tool = None

    async with httpx.AsyncClient(timeout=LLM_TIMEOUT_SECONDS) as client:
        resp = await client.post(
            f"{LLM_BASE_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {LLM_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": LLM_MODEL,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "temperature": 0.2,
                "max_tokens": LLM_MAX_TOKENS,
            },
        )
        resp.raise_for_status()
        payload = resp.json()

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
        "tags": list(body.get("tags") or []),
        "searchText": str(body.get("searchText") or ""),
        "confidence": float(body.get("confidence") or 0.0),
        "parseMethod": str(body.get("parseMethod") or "none"),
        "timing": {
            "transcribeMs": int(timing.get("transcribeMs") or 0),
            "parseMs": int(timing.get("parseMs") or 0),
            "totalMs": int(timing.get("totalMs") or 0),
        },
    }


async def parse_voice_intent(transcript, books, tags):
    intent, confidence, search_remainder = _parse_voice_intent_regex(transcript)
    if intent and confidence >= REGEX_CONFIDENCE:
        return intent

    parse_started = time.monotonic()
    try:
        if search_remainder:
            llm_intent = await parse_voice_intent_llm(
                transcript,
                books,
                tags,
                narrow=True,
                narrow_text=search_remainder,
            )
            llm_intent["parseMethod"] = "llm"
            if llm_intent.get("confidence", 0) < SEARCH_PREFIX_CONFIDENCE:
                llm_intent["confidence"] = SEARCH_PREFIX_CONFIDENCE
            return llm_intent

        if intent and intent.get("tool") == "SHOW":
            return intent

        llm_intent = await parse_voice_intent_llm(transcript, books, tags)
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
