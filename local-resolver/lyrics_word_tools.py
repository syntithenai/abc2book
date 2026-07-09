import asyncio
import os
from urllib.parse import quote, urlencode

import httpx

DEFAULT_TIMEOUT_SECONDS = float(os.getenv("LYRICS_WORD_TIMEOUT_SECONDS", "20"))
PHRASE_STOP_WORDS = {
    "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from", "how",
    "i", "if", "in", "is", "it", "of", "on", "or", "so", "than", "that", "the",
    "their", "them", "there", "these", "they", "this", "to", "was", "we", "were",
    "what", "when", "where", "which", "who", "why", "with", "you", "your",
}


def _clean_term(value):
    return str(value or "").strip()


def _phrase_pattern(value):
    phrase = _clean_term(value)
    if not phrase:
        return ""
    return phrase.replace(" ", "*") + "*"


def _phrase_context_seeds(value):
    words = [word for word in _clean_term(value).split() if word]
    if not words:
        return {"leading": "", "trailing": ""}
    return {
        "leading": words[0],
        "trailing": words[-1],
    }


def _phrase_search_seeds(value):
    raw = _clean_term(value)
    words = [word.lower() for word in raw.split() if word]
    significant_words = [word for word in words if word not in PHRASE_STOP_WORDS]
    source_words = significant_words if significant_words else words
    leading = significant_words[0] if significant_words else (words[0] if words else "")
    trailing = significant_words[-1] if significant_words else (words[-1] if words else "")
    return {
        "fullPhrase": raw,
        "leading": leading,
        "trailing": trailing,
        "leadingPair": " ".join(source_words[:2]),
        "trailingPair": " ".join(source_words[-2:]),
        "keywords": source_words[:4],
        "topic": " ".join(significant_words[:3]) or raw,
        "pattern": ("*".join(significant_words) + "*") if len(significant_words) > 1 else (raw.replace(" ", "*") + "*"),
    }


def _normalize_datamuse_results(results):
    normalized = []
    for item in results or []:
        normalized.append({
            "word": item.get("word", ""),
            "score": item.get("score", 0),
            "numSyllables": item.get("numSyllables"),
            "tags": item.get("tags") if isinstance(item.get("tags"), list) else [],
        })
    return normalized


def _merge_datamuse_results(groups, limit=None):
    seen = set()
    merged = []
    for group in groups or []:
        for item in _normalize_datamuse_results(group):
            key = str(item.get("word", "")).lower()
            if not key or key in seen:
                continue
            seen.add(key)
            merged.append(item)
    if limit is None:
        return merged
    return merged[:limit]


def _backfill_phrase_context(primary, fallback, limit=16):
    if primary:
        return primary[:limit]
    return (fallback or [])[: min(8, limit)]


def _initial_letter(value):
    for char in _clean_term(value).lower():
        if char.isalpha():
            return char
    return ""


def _alliteration_sound_key(value):
    word = "".join(ch for ch in _clean_term(value).lower() if ch.isalpha())
    if not word:
        return ""

    replacements = (
        ("kn", "n"),
        ("gn", "n"),
        ("pn", "n"),
        ("wr", "r"),
        ("ps", "s"),
        ("wh", "w"),
        ("ph", "f"),
        ("qu", "kw"),
        ("x", "z"),
    )
    for before, after in replacements:
        if word.startswith(before):
            word = after + word[len(before):]
            break

    if word[:1] in "aeiou":
        return word[0]
    if word.startswith("sch"):
        return "sk"
    if word.startswith("sh"):
        return "sh"
    if word.startswith("ch"):
        return "ch"
    if word.startswith("th"):
        return "th"

    first = word[0]
    second = word[1:2]
    if first == "c":
        return "s" if second in "eiy" else "k"
    if first == "g":
        return "j" if second in "eiy" else "g"
    if first == "q":
        return "k"

    vowel_index = next((index for index, char in enumerate(word) if char in "aeiou"), -1)
    if vowel_index <= 0:
        return first

    onset = word[:vowel_index]
    return onset.replace("c", "k").replace("q", "k")


def _filter_alliterative_words(items, term):
    sound_key = _alliteration_sound_key(term)
    if not sound_key:
        return list(items or [])
    return [
        item for item in (items or [])
        if _alliteration_sound_key(item.get("word", "")) == sound_key
    ]


async def _fetch_json(client, url):
    response = await client.get(url, headers={"Accept": "application/json"})
    payload = None
    if response.text:
        try:
            payload = response.json()
        except Exception:
            payload = None

    if response.status_code >= 400:
        message = "Request failed"
        if isinstance(payload, dict):
            message = payload.get("message") or payload.get("title") or message
        raise ValueError(message)

    return payload


async def _lookup_datamuse_with_client(params, client):
    clean_params = {key: value for key, value in params.items() if value not in (None, "")}
    if "max" not in clean_params:
        clean_params["max"] = 12
    query = urlencode(clean_params, doseq=True)
    return await _fetch_json(client, "https://api.datamuse.com/words?" + query)


async def _fetch_datamuse_suggestions(client, term, max_results=10):
    word = _clean_term(term)
    if not word:
        return []
    url = "https://api.datamuse.com/sug?s=" + quote(word) + "&max=" + str(max_results)
    payload = await _fetch_json(client, url)
    return payload if isinstance(payload, list) else []


async def _try_dictionary_entries(client, word):
    lookup = _clean_term(word).lower()
    if not lookup:
        return []
    url = "https://api.dictionaryapi.dev/api/v2/entries/en/" + quote(lookup)
    try:
        payload = await _fetch_json(client, url)
        return payload if isinstance(payload, list) else []
    except ValueError:
        return []


async def lookup_dictionary(term):
    word = _clean_term(term).lower()
    if not word:
        raise ValueError("Enter a word to look up")
    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_SECONDS) as client:
        entries = await _try_dictionary_entries(client, word)
        if entries:
            return entries

        suggestions = await _fetch_datamuse_suggestions(client, word)
        for suggestion in suggestions:
            candidate = suggestion.get("word", "") if isinstance(suggestion, dict) else ""
            entries = await _try_dictionary_entries(client, candidate)
            if entries:
                return entries

        spelled_like = await _lookup_datamuse_with_client({"sp": word + "*", "max": 12}, client)
        for item in spelled_like or []:
            candidate = item.get("word", "") if isinstance(item, dict) else ""
            entries = await _try_dictionary_entries(client, candidate)
            if entries:
                return entries

    return []


async def lookup_thesaurus(term):
    word = _clean_term(term)
    if not word:
        raise ValueError("Enter a word to look up")
    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_SECONDS) as client:
        synonyms, antonyms, related = await asyncio.gather(
            _lookup_datamuse_with_client({"rel_syn": word, "max": 16}, client),
            _lookup_datamuse_with_client({"rel_ant": word, "max": 12}, client),
            _lookup_datamuse_with_client({"rel_trg": word, "max": 12}, client),
        )
    return {
        "synonyms": synonyms or [],
        "antonyms": antonyms or [],
        "related": related or [],
    }


async def lookup_rhymes(term):
    word = _clean_term(term)
    if not word:
        raise ValueError("Enter a word to rhyme")
    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_SECONDS) as client:
        perfect, near, sounds_like = await asyncio.gather(
            _lookup_datamuse_with_client({"rel_rhy": word, "max": 24}, client),
            _lookup_datamuse_with_client({"rel_nry": word, "max": 24}, client),
            _lookup_datamuse_with_client({"sl": word, "max": 24}, client),
        )
    perfect_results = perfect or []
    sounds_like_results = sounds_like or []
    return {
        "perfect": perfect_results if perfect_results else sounds_like_results[:24],
        "near": near or [],
        "soundsLike": sounds_like_results,
    }


async def lookup_reverse_dictionary(term):
    phrase = _clean_term(term)
    if not phrase:
        raise ValueError("Describe the word or idea you are searching for")
    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_SECONDS) as client:
        meaning, topic, examples = await asyncio.gather(
            _lookup_datamuse_with_client({"ml": phrase, "max": 18}, client),
            _lookup_datamuse_with_client({"topics": phrase, "max": 12}, client),
            _lookup_datamuse_with_client({"sp": _phrase_pattern(phrase), "max": 8}, client),
        )
    return {
        "meaning": meaning or [],
        "topic": topic or [],
        "examples": examples or [],
    }


async def lookup_phrase_ideas(term):
    phrase = _clean_term(term)
    if not phrase:
        raise ValueError("Enter a phrase or a seed word")
    seeds = _phrase_search_seeds(phrase)
    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_SECONDS) as client:
        keyword_follow_calls = [
            _lookup_datamuse_with_client({"rel_bga": keyword, "max": 6}, client)
            for keyword in seeds["keywords"]
        ]
        keyword_precede_calls = [
            _lookup_datamuse_with_client({"rel_bgb": keyword, "max": 6}, client)
            for keyword in seeds["keywords"]
        ]
        follow_by_phrase, follow_by_trailing, follow_by_trailing_pair, precede_by_phrase, precede_by_leading, precede_by_leading_pair, related_by_topic, related_by_meaning, spelling_by_pattern, spelling_by_meaning, keyword_follow_results, keyword_precede_results = await asyncio.gather(
            _lookup_datamuse_with_client({"rc": seeds["fullPhrase"], "max": 8}, client),
            _lookup_datamuse_with_client({"rel_bga": seeds["trailing"] or phrase, "max": 8}, client),
            _lookup_datamuse_with_client({"rc": seeds["trailingPair"] or seeds["trailing"] or phrase, "max": 8}, client),
            _lookup_datamuse_with_client({"lc": seeds["fullPhrase"], "max": 8}, client),
            _lookup_datamuse_with_client({"rel_bgb": seeds["leading"] or phrase, "max": 8}, client),
            _lookup_datamuse_with_client({"lc": seeds["leadingPair"] or seeds["leading"] or phrase, "max": 8}, client),
            _lookup_datamuse_with_client({"rel_trg": seeds["topic"], "max": 12}, client),
            _lookup_datamuse_with_client({"ml": seeds["topic"], "max": 12}, client),
            _lookup_datamuse_with_client({"sp": seeds["pattern"], "max": 12}, client),
            _lookup_datamuse_with_client({"ml": seeds["fullPhrase"], "max": 12}, client),
            asyncio.gather(*keyword_follow_calls),
            asyncio.gather(*keyword_precede_calls),
        )
    follow_context = _merge_datamuse_results(
        [follow_by_phrase, follow_by_trailing, follow_by_trailing_pair, *keyword_follow_results],
        16,
    )
    precede_context = _merge_datamuse_results(
        [precede_by_phrase, precede_by_leading, precede_by_leading_pair, *keyword_precede_results],
        16,
    )
    related_context = _merge_datamuse_results([related_by_topic, related_by_meaning], 16)
    spelling_context = _merge_datamuse_results([spelling_by_pattern, spelling_by_meaning], 16)
    return {
        "followContext": _backfill_phrase_context(follow_context, related_context, 16),
        "precedeContext": _backfill_phrase_context(precede_context, spelling_context, 16),
        "related": related_context,
        "spelling": spelling_context,
    }


async def lookup_alliteration(term):
    phrase = _clean_term(term)
    if not phrase:
        raise ValueError("Enter a word or phrase to shape alliteration")
    sound_key = _alliteration_sound_key(phrase)
    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_SECONDS) as client:
        related_by_meaning = await _lookup_datamuse_with_client({"rel_jja": phrase, "max": 24}, client)
        spelled_like = []
        if sound_key:
            spelled_like = await _lookup_datamuse_with_client({"sp": sound_key + "*", "max": 24}, client)
        sounds_like = await _lookup_datamuse_with_client({"sl": phrase, "max": 16}, client)
    related = _merge_datamuse_results([related_by_meaning, spelled_like, sounds_like], 48)
    return {
        "alliterative": _filter_alliterative_words(related, phrase),
        "related": related,
    }
