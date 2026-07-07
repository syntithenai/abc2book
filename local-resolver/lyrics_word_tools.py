import asyncio
import os
from urllib.parse import quote, urlencode

import httpx

DEFAULT_TIMEOUT_SECONDS = float(os.getenv("LYRICS_WORD_TIMEOUT_SECONDS", "20"))


def _clean_term(value):
    return str(value or "").strip()


def _phrase_pattern(value):
    phrase = _clean_term(value)
    if not phrase:
        return ""
    return phrase.replace(" ", "*") + "*"


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


async def lookup_dictionary(term):
    word = _clean_term(term).lower()
    if not word:
        raise ValueError("Enter a word to look up")
    url = "https://api.dictionaryapi.dev/api/v2/entries/en/" + quote(word)
    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_SECONDS) as client:
        return await _fetch_json(client, url)


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
            _lookup_datamuse_with_client({"sl": word, "max": 12}, client),
        )
    return {
        "perfect": perfect or [],
        "near": near or [],
        "soundsLike": sounds_like or [],
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
    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_SECONDS) as client:
        left_context, right_context, spelling = await asyncio.gather(
            _lookup_datamuse_with_client({"lc": phrase, "max": 16}, client),
            _lookup_datamuse_with_client({"rc": phrase, "max": 16}, client),
            _lookup_datamuse_with_client({"sp": _phrase_pattern(phrase), "max": 12}, client),
        )
    return {
        "leftContext": left_context or [],
        "rightContext": right_context or [],
        "spelling": spelling or [],
    }
