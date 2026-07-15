from background_markdown_links import enrich_background_markdown
import asyncio
import json
import os
import re
import time
from urllib.parse import quote_plus, urlparse

import httpx

BROWSER_USER_AGENT = (
    "Mozilla/5.0 (compatible; ABC2BookResolver/1.0; +https://tunebook.net)"
)
SEARCH_TIMEOUT_SECONDS = float(os.getenv("RESEARCH_SEARCH_TIMEOUT_SECONDS", "20"))
LLM_BASE_URL = os.getenv("RESEARCH_LLM_BASE_URL", "http://host.docker.internal:1234/v1").rstrip("/")
LLM_MODEL = os.getenv("RESEARCH_LLM_MODEL", "google/gemma-3-4b-it")
LLM_API_KEY = os.getenv("RESEARCH_LLM_API_KEY", "lm-studio")
LLM_TIMEOUT_SECONDS = float(os.getenv("RESEARCH_LLM_TIMEOUT_SECONDS", "120"))
MIN_WORDS = int(os.getenv("RESEARCH_MIN_WORDS", "700"))
TARGET_WORDS = int(os.getenv("RESEARCH_TARGET_WORDS", "800"))
MAX_WORDS = int(os.getenv("RESEARCH_MAX_WORDS", "950"))
LLM_MAX_TOKENS = int(os.getenv("RESEARCH_LLM_MAX_TOKENS", "2800"))
MAX_SOURCES_IN_PROMPT = int(os.getenv("RESEARCH_MAX_SOURCES_IN_PROMPT", "80"))
MAX_SNIPPET_CHARS = int(os.getenv("RESEARCH_MAX_SNIPPET_CHARS", "1200"))
SEARCH_RESULTS_PER_QUERY = int(os.getenv("RESEARCH_SEARCH_RESULTS_PER_QUERY", "5"))
MAX_SUPPLEMENTAL_QUERIES = int(os.getenv("RESEARCH_MAX_SUPPLEMENTAL_QUERIES", "4"))
MIN_SOURCES_BEFORE_SKIP_SUPPLEMENTAL = int(
    os.getenv("RESEARCH_MIN_SOURCES_BEFORE_SKIP_SUPPLEMENTAL", "12")
)
SEARCH_QUERY_CONCURRENCY = int(os.getenv("RESEARCH_SEARCH_QUERY_CONCURRENCY", "3"))
SUPPLEMENTAL_QUERY_LLM_MAX_TOKENS = int(os.getenv("RESEARCH_SUPPLEMENTAL_QUERY_LLM_MAX_TOKENS", "600"))
MAX_LYRICS_CHARS = int(os.getenv("RESEARCH_MAX_LYRICS_CHARS", "8000"))
MAX_EXISTING_BACKGROUND_CHARS = int(os.getenv("RESEARCH_MAX_EXISTING_BACKGROUND_CHARS", "12000"))
MAX_REFERENCES = int(os.getenv("RESEARCH_MAX_REFERENCES", "20"))
CRITIQUE_LLM_MAX_TOKENS = int(os.getenv("RESEARCH_CRITIQUE_LLM_MAX_TOKENS", str(LLM_MAX_TOKENS)))
SEARCH_BACKEND = os.getenv("RESEARCH_SEARCH_BACKEND", "duckduckgo").strip().lower()
REFERENCES_HEADING_RE = re.compile(
    r"^#{1,6}\s+references\b",
    re.IGNORECASE | re.MULTILINE,
)
BRAVE_SEARCH_API_KEY = os.getenv("BRAVE_SEARCH_API_KEY", "").strip()
SEARXNG_BASE_URL = os.getenv("SEARXNG_BASE_URL", "").strip().rstrip("/")
SERPER_API_KEY = os.getenv("SERPER_API_KEY", "").strip()

ALLOWED_FETCH_HOST_SUFFIXES = (
    "wikipedia.org",
    "wikidata.org",
    "musicbrainz.org",
    "allmusic.com",
    "discogs.com",
    "secondhandsongs.com",
    "folkopedia.org",
    "thesession.org",
    "youtube.com",
    "youtu.be",
)

HIGH_TRUST_SOURCE_TYPES = frozenset({"wikipedia", "musicbrainz"})
HIGH_TRUST_HOST_SUFFIXES = (
    "wikipedia.org",
    "wikidata.org",
    "musicbrainz.org",
    "allmusic.com",
    "discogs.com",
    "secondhandsongs.com",
    "folkopedia.org",
    "thesession.org",
)


def _normalize_space(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _trim_snippet(value):
    text = _normalize_space(value)
    if len(text) <= MAX_SNIPPET_CHARS:
        return text
    return text[: MAX_SNIPPET_CHARS - 3].rstrip() + "..."


def _finalize_llm_text(value):
    text = str(value or "").strip()
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text


def _normalize_lyrics(value):
    text = str(value or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    if not text:
        return ""
    lines = [line.rstrip() for line in text.split("\n")]
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and not lines[-1].strip():
        lines.pop()
    return "\n".join(lines)


def _trim_lyrics_for_prompt(lyrics):
    text = _normalize_lyrics(lyrics)
    if not text:
        return ""
    if len(text) <= MAX_LYRICS_CHARS:
        return text
    trimmed = text[: MAX_LYRICS_CHARS - 24].rstrip()
    if "\n" in trimmed:
        trimmed = trimmed.rsplit("\n", 1)[0].rstrip()
    return trimmed + "\n[lyrics truncated]"


def _lyrics_prompt_block(lyrics):
    text = _trim_lyrics_for_prompt(lyrics)
    if not text:
        return ""
    return (
        "LYRICS FOR DISAMBIGUATION:\n"
        "The tune being researched has these lyrics. Use them to identify the correct song "
        "when other pieces share the same title, and to inform the \"What the song is about\" "
        "section. Do not quote long passages of lyrics in the article; paraphrase instead.\n\n"
        f"{text}\n\n"
    )


def _normalize_existing_background(value):
    text = str(value or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    if not text:
        return ""
    if len(text) <= MAX_EXISTING_BACKGROUND_CHARS:
        return text
    trimmed = text[: MAX_EXISTING_BACKGROUND_CHARS - 32].rstrip()
    if "\n" in trimmed:
        trimmed = trimmed.rsplit("\n", 1)[0].rstrip()
    return trimmed + "\n[existing background truncated]"


def _existing_background_prompt_block(existing_background):
    text = _normalize_existing_background(existing_background)
    if not text:
        return ""
    return (
        "EXISTING BACKGROUND INFO (preserve these facts):\n"
        "The tune already has the background text below. Treat every factual claim in it as "
        "authoritative unless research notes clearly contradict it with stronger evidence. "
        "Preserve those facts in the new article (rephrase/integrate as needed; do not drop them). "
        "Do not invent contradictions. Expand around this material using the research notes.\n\n"
        f"{text}\n\n"
    )


def _format_sources_for_prompt(sources):
    ranked = rank_sources_for_prompt(sources)
    context_lines = []
    for idx, source in enumerate(ranked[:MAX_SOURCES_IN_PROMPT], start=1):
        context_lines.append(
            f"[{idx}] {source.get('title', '')}\n"
            f"URL: {source.get('url', '')}\n"
            f"Snippet: {source.get('snippet', '')}\n"
            f"Source type: {source.get('source', '')}"
        )
    return "\n\n".join(context_lines)


def _is_meaningful_lyric_line(line):
    text = _normalize_space(line)
    if len(text) < 8:
        return False
    if re.match(r"^\[[^\]]+\]$", text):
        return False
    if re.match(r"^(verse|chorus|bridge|intro|outro|refrain)\b", text, re.I):
        return False
    alpha_count = len(re.findall(r"[A-Za-z]", text))
    return alpha_count >= 6


def _lyrics_search_phrases(lyrics, max_phrases=1):
    text = _normalize_lyrics(lyrics)
    if not text:
        return []
    lines = []
    seen = set()
    for raw_line in text.split("\n"):
        line = _normalize_space(raw_line)
        if not _is_meaningful_lyric_line(line):
            continue
        key = line.lower()
        if key in seen:
            continue
        seen.add(key)
        lines.append(line)
    if not lines:
        return []
    phrases = [lines[0]]
    for line in sorted(lines[1:], key=len, reverse=True):
        if len(phrases) >= max_phrases:
            break
        if line.lower() not in {phrase.lower() for phrase in phrases}:
            phrases.append(line[:120])
    return phrases[:max_phrases]


def build_research_queries(title, artist, lyrics=""):
    title = _normalize_space(title)
    artist = _normalize_space(artist)
    if not title:
        raise ValueError("Song title is required")

    base = f'"{title}"' + (f' "{artist}"' if artist else "")
    artist_part = f" {artist}" if artist else ""
    queries = [
        f"{base} song history origin recording",
        f"{base} covers performers recordings",
        f"{base} alternative names aka",
        f'site:thesession.org "{title}"',
        f'site:discogs.com "{title}"{artist_part}',
    ]
    for phrase in _lyrics_search_phrases(lyrics, max_phrases=1):
        if artist:
            queries.append(f'"{phrase}" "{artist}"')
        else:
            queries.append(f'"{phrase}" song lyrics')
    return queries


def _host_matches_suffix(host, suffix):
    host = (host or "").lower().rstrip(".")
    suffix = (suffix or "").lower().rstrip(".")
    return host == suffix or host.endswith("." + suffix)


def _source_host(url):
    try:
        return (urlparse(url or "").hostname or "").lower()
    except Exception:
        return ""


def _source_trust_rank(source):
    source_type = _normalize_space(source.get("source") or "").lower()
    if source_type in HIGH_TRUST_SOURCE_TYPES:
        return 0
    host = _source_host(source.get("url") or "")
    for suffix in HIGH_TRUST_HOST_SUFFIXES:
        if _host_matches_suffix(host, suffix):
            return 1
    return 2


def rank_sources_for_prompt(sources):
    indexed = list(enumerate(sources or []))
    indexed.sort(
        key=lambda item: (
            _source_trust_rank(item[1]),
            -len(_normalize_space(item[1].get("snippet") or "")),
            item[0],
        )
    )
    return [source for _, source in indexed]


def sources_rich_enough_to_skip_supplemental(sources):
    items = list(sources or [])
    if len(items) < MIN_SOURCES_BEFORE_SKIP_SUPPLEMENTAL:
        return False
    return any(
        _normalize_space(source.get("source") or "").lower() == "wikipedia"
        and len(_normalize_space(source.get("snippet") or "")) >= 80
        for source in items
    )


def _dedupe_queries(queries):
    seen = set()
    ordered = []
    for query in queries:
        normalized = _normalize_space(query).lower()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        ordered.append(_normalize_space(query))
    return ordered


def _extract_llm_message_text(message_or_content):
    if isinstance(message_or_content, dict):
        content = str(message_or_content.get("content") or "").strip()
        if content:
            return content
        reasoning = str(message_or_content.get("reasoning_content") or "").strip()
        if reasoning:
            array_match = re.search(r"(\[.*\])", reasoning, re.S)
            if array_match:
                return array_match.group(1)
        return ""
    return str(message_or_content or "").strip()


def parse_llm_json_array(content):
    text = _extract_llm_message_text(content)
    if not text:
        raise ValueError("LLM returned empty text")
    fenced = re.search(r"```(?:json)?\s*(\[.*\])\s*```", text, re.S)
    if fenced:
        text = fenced.group(1)
    else:
        array_match = re.search(r"(\[.*\])", text, re.S)
        if array_match:
            text = array_match.group(1)
    data = json.loads(text)
    if not isinstance(data, list):
        raise ValueError("LLM query response was not a JSON array")
    queries = []
    for item in data:
        if isinstance(item, str) and _normalize_space(item):
            queries.append(_normalize_space(item))
    return queries


def _source_digest(sources, limit=15, snippet_chars=220):
    lines = []
    for source in sources[:limit]:
        snippet = _normalize_space(source.get("snippet") or "")
        if len(snippet) > snippet_chars:
            snippet = snippet[: snippet_chars - 3].rstrip() + "..."
        title = _normalize_space(source.get("title") or source.get("url") or "")
        source_type = _normalize_space(source.get("source") or "")
        if title:
            lines.append(f"- [{source_type}] {title}: {snippet}".strip(": "))
    return "\n".join(lines)


async def generate_supplemental_queries(
    client, title, artist, sources, lyrics="", existing_background="", already_run_queries=None
):
    digest = _source_digest(sources)
    artist_line = f"Artist/composer: {artist}\n" if artist else ""
    lyrics_block = _lyrics_prompt_block(lyrics)
    existing_block = _existing_background_prompt_block(existing_background)
    already_run = _dedupe_queries(already_run_queries or [])
    already_block = ""
    if already_run:
        already_block = (
            "Queries already run (do not repeat these or near-duplicates):\n"
            + "\n".join(f"- {query}" for query in already_run)
            + "\n\n"
        )
    prompt = (
        f"You are planning a small number of gap-filling web searches for the song/tune \"{title}\".\n"
        f"{artist_line}"
        f"{lyrics_block}"
        f"{existing_block}"
        f"We already collected {len(sources)} source snippets. Sample:\n"
        f"{digest or '(none yet)'}\n\n"
        f"{already_block}"
        "Propose ONLY queries that fill clear gaps in the notes above. Focus on missing topics such as:\n"
        "- identifying the correct song when the title is ambiguous\n"
        "- alternative titles and origins\n"
        "- first recordings and who popularized the piece\n"
        "- notable performers, cover versions, and labels\n"
        "- historical and cultural context\n"
        "- verifying or expanding facts from any existing background info above\n\n"
        "Do not plan a full second research pass. Skip topics already well covered. "
        "Do not request YouTube searches.\n\n"
        f"Return ONLY a JSON array of up to {MAX_SUPPLEMENTAL_QUERIES} search query strings. "
        "Return [] if there are no important gaps."
    )
    resp = await client.post(
        f"{LLM_BASE_URL}/chat/completions",
        headers={
            "Authorization": f"Bearer {LLM_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": LLM_MODEL,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You generate concise gap-filling web search queries for music research. "
                        "Respond with a JSON array of strings only."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.35,
            "max_tokens": SUPPLEMENTAL_QUERY_LLM_MAX_TOKENS,
        },
        timeout=LLM_TIMEOUT_SECONDS,
    )
    resp.raise_for_status()
    data = resp.json()
    choices = data.get("choices") or []
    if not choices:
        raise ValueError("LLM returned no choices for supplemental queries")
    message = choices[0].get("message") or {}
    queries = parse_llm_json_array(message)
    already_normalized = {_normalize_space(query).lower() for query in already_run}
    filtered = [
        query
        for query in _dedupe_queries(queries)
        if _normalize_space(query).lower() not in already_normalized
    ]
    return filtered[:MAX_SUPPLEMENTAL_QUERIES]


def _source_key(url):
    return (url or "").strip().lower()


def _add_source(store, title, url, snippet, source_type):
    url = (url or "").strip()
    if not url:
        return
    key = _source_key(url)
    if key in store:
        return
    store[key] = {
        "title": _normalize_space(title) or url,
        "url": url,
        "snippet": _trim_snippet(snippet),
        "source": source_type,
    }


async def fetch_wikipedia(client, title, artist):
    sources = {}
    search_term = f"{title} {artist}".strip()
    try:
        resp = await client.get(
            "https://en.wikipedia.org/w/api.php",
            params={
                "action": "opensearch",
                "search": search_term,
                "limit": 5,
                "namespace": 0,
                "format": "json",
            },
        )
        resp.raise_for_status()
        data = resp.json()
        if not isinstance(data, list) or len(data) < 4:
            return list(sources.values())
        titles = data[1] if isinstance(data[1], list) else []
        descriptions = data[2] if isinstance(data[2], list) else []
        urls = data[3] if isinstance(data[3], list) else []
        for idx, page_title in enumerate(titles):
            page_url = urls[idx] if idx < len(urls) else ""
            snippet = descriptions[idx] if idx < len(descriptions) else ""
            _add_source(sources, page_title, page_url, snippet, "wikipedia")
            if page_title:
                summary_resp = await client.get(
                    "https://en.wikipedia.org/api/rest_v1/page/summary/"
                    + quote_plus(page_title.replace(" ", "_")),
                )
                if summary_resp.status_code == 200:
                    summary = summary_resp.json()
                    extract = summary.get("extract") or ""
                    if extract:
                        _add_source(
                            sources,
                            summary.get("title") or page_title,
                            summary.get("content_urls", {})
                            .get("desktop", {})
                            .get("page", page_url),
                            extract,
                            "wikipedia",
                        )
    except Exception:
        pass
    return list(sources.values())


async def _musicbrainz_search(client, endpoint, query, source_type, limit=10):
    sources = {}
    try:
        resp = await client.get(
            f"https://musicbrainz.org/ws/2/{endpoint}",
            params={
                "query": query,
                "fmt": "json",
                "limit": limit,
            },
            headers={"User-Agent": BROWSER_USER_AGENT},
        )
        resp.raise_for_status()
        key = "recordings" if endpoint == "recording" else "works"
        items = (resp.json() or {}).get(key) or []
        for item in items[:limit]:
            item_title = item.get("title") or ""
            if endpoint == "recording":
                artist_names = []
                if isinstance(item.get("artist-credit"), list):
                    for credit in item["artist-credit"]:
                        name = credit.get("name") or ""
                        if name:
                            artist_names.append(name)
                snippet_parts = []
                if artist_names:
                    snippet_parts.append("Artists: " + ", ".join(artist_names[:5]))
                if isinstance(item.get("releases"), list) and item["releases"]:
                    release_titles = []
                    for release in item["releases"][:3]:
                        release_title = release.get("title") or ""
                        if release_title:
                            release_titles.append(release_title)
                    if release_titles:
                        snippet_parts.append("Releases: " + "; ".join(release_titles))
                if item.get("first-release-date"):
                    snippet_parts.append(f"First release: {item['first-release-date']}")
                if item.get("length"):
                    snippet_parts.append(f"Length: {item['length']} ms")
                url = f"https://musicbrainz.org/recording/{item.get('id', '')}"
            else:
                snippet_parts = []
                if isinstance(item.get("relations"), list):
                    for relation in item["relations"][:5]:
                        rel_type = relation.get("type") or ""
                        artist = (relation.get("artist") or {}).get("name") or ""
                        if rel_type and artist:
                            snippet_parts.append(f"{rel_type}: {artist}")
                url = f"https://musicbrainz.org/work/{item.get('id', '')}"
            _add_source(
                sources,
                item_title,
                url,
                ". ".join(snippet_parts),
                source_type,
            )
    except Exception:
        pass
    return list(sources.values())


async def fetch_musicbrainz(client, title, artist):
    merged = {}
    search_queries = []
    if artist:
        search_queries.append(f'recording:"{title}" AND artist:"{artist}"')
    search_queries.extend([
        f'recording:"{title}"',
        f'recording:{title}',
        f'work:"{title}"',
    ])
    for query in search_queries:
        endpoint = "work" if query.startswith("work:") else "recording"
        source_type = "musicbrainz-work" if endpoint == "work" else "musicbrainz"
        hits = await _musicbrainz_search(client, endpoint, query, source_type)
        for source in hits:
            _add_source(
                merged,
                source.get("title"),
                source.get("url"),
                source.get("snippet"),
                source.get("source"),
            )
        if len(merged) >= 20:
            break
    return list(merged.values())


async def _search_duckduckgo(client, query):
    results = []

    def _run():
        try:
            from ddgs import DDGS
        except ImportError as exc:
            raise ValueError("ddgs package is not installed") from exc
        with DDGS() as ddgs:
            for item in ddgs.text(query, max_results=SEARCH_RESULTS_PER_QUERY):
                results.append(item)
        return results

    import asyncio
    items = await asyncio.to_thread(_run)
    parsed = []
    for item in items:
        parsed.append({
            "title": item.get("title") or "",
            "url": item.get("href") or item.get("url") or "",
            "snippet": item.get("body") or item.get("snippet") or "",
            "source": "duckduckgo",
        })
    return parsed


async def _search_brave(client, query):
    if not BRAVE_SEARCH_API_KEY:
        raise ValueError("BRAVE_SEARCH_API_KEY is required for brave search backend")
    resp = await client.get(
        "https://api.search.brave.com/res/v1/web/search",
        params={"q": query, "count": SEARCH_RESULTS_PER_QUERY},
        headers={
            "Accept": "application/json",
            "X-Subscription-Token": BRAVE_SEARCH_API_KEY,
        },
    )
    resp.raise_for_status()
    data = resp.json()
    web = (data.get("web") or {}).get("results") or []
    return [{
        "title": item.get("title") or "",
        "url": item.get("url") or "",
        "snippet": item.get("description") or "",
        "source": "brave",
    } for item in web[:SEARCH_RESULTS_PER_QUERY]]


async def _search_searxng(client, query):
    if not SEARXNG_BASE_URL:
        raise ValueError("SEARXNG_BASE_URL is required for searxng search backend")
    resp = await client.get(
        f"{SEARXNG_BASE_URL}/search",
        params={"q": query, "format": "json", "categories": "general"},
    )
    resp.raise_for_status()
    data = resp.json()
    results = data.get("results") or []
    return [{
        "title": item.get("title") or "",
        "url": item.get("url") or "",
        "snippet": item.get("content") or "",
        "source": "searxng",
    } for item in results[:SEARCH_RESULTS_PER_QUERY]]


async def _search_serper(client, query):
    if not SERPER_API_KEY:
        raise ValueError("SERPER_API_KEY is required for serper search backend")
    resp = await client.post(
        "https://google.serper.dev/search",
        headers={
            "X-API-KEY": SERPER_API_KEY,
            "Content-Type": "application/json",
        },
        json={"q": query, "num": SEARCH_RESULTS_PER_QUERY},
    )
    resp.raise_for_status()
    data = resp.json()
    organic = data.get("organic") or []
    return [{
        "title": item.get("title") or "",
        "url": item.get("link") or "",
        "snippet": item.get("snippet") or "",
        "source": "serper",
    } for item in organic[:SEARCH_RESULTS_PER_QUERY]]


async def search_web(client, query):
    backend = SEARCH_BACKEND
    if backend == "brave":
        return await _search_brave(client, query)
    if backend == "searxng":
        return await _search_searxng(client, query)
    if backend == "serper":
        return await _search_serper(client, query)
    return await _search_duckduckgo(client, query)


def _build_llm_prompt(title, artist, sources, lyrics="", existing_background=""):
    context = _format_sources_for_prompt(sources)
    artist_line = f"Artist/composer: {artist}\n" if artist else ""
    lyrics_block = _lyrics_prompt_block(lyrics)
    existing_block = _existing_background_prompt_block(existing_background)
    about_section = (
        "Include a \"What the song is about\" section near the start. Summarize the song's "
        "subject, story, themes, and mood. When lyrics are provided above, base this section "
        "primarily on those lyrics, supplemented by the research notes where helpful."
        if lyrics_block
        else (
            "Include a \"What the song is about\" section near the start when the research notes "
            "describe the song's subject, story, themes, or mood."
        )
    )
    notes_basis = "research notes"
    if lyrics_block:
        notes_basis += ", lyrics"
    if existing_block:
        notes_basis += ", and existing background facts"
    return (
        f"You are writing background information for musicians about the tune/song \"{title}\".\n"
        f"{artist_line}"
        f"{lyrics_block}"
        f"{existing_block}"
        f"Using only the research notes below"
        + (" and the existing background facts above" if existing_block else "")
        + ", write a thorough, factual background article.\n\n"
        f"LENGTH: Aim for about {TARGET_WORDS} words when the notes contain enough detail "
        f"(between {MIN_WORDS} and {MAX_WORDS}). If the notes are sparse, write a shorter "
        "article covering only supported facts rather than padding to meet a word count.\n\n"
        "STRUCTURE: Use clear section headings and multiple paragraphs per section. "
        "Cover these topics when supported by the notes"
        + (" or the provided lyrics" if lyrics_block else "")
        + (" or existing background" if existing_block else "")
        + ":\n"
        "1. What the song is about\n"
        "2. Overview and alternative names\n"
        "3. Origin, first recording, and who popularized the tune\n"
        "4. Notable performers and recorded versions\n"
        "5. Record labels and releases (who released what)\n"
        "6. Historical anecdotes and cultural context\n"
        "7. Musical nature, key, tempo, rhythm, and formal structure\n\n"
        "Do not include a YouTube links section; YouTube links are searched and added "
        "automatically after the record labels and releases section.\n"
        "Do not include a References section yet; references are added in a later step.\n\n"
        f"{about_section}\n\n"
        "STYLE: Write in flowing prose for musicians. Lead with confirmed facts from the notes. "
        "Prefer specific dates, places, people, release names, and labels when the notes include them. "
        "When notes conflict, prefer higher-trust reference sources (Wikipedia, MusicBrainz, Discogs, "
        "The Session, AllMusic, SecondHandSongs) over lyric sites, blogs, or thin search snippets. "
        "Expand each section with specific detail from the notes. "
        f"If a section has no supporting evidence in the {notes_basis}, omit that section "
        "heading entirely. "
        "Do not discuss missing information, research gaps, or what the notes fail to mention. "
        "Never write phrases like 'the provided research notes do not', 'the notes do not list', "
        "'no information was found', or 'the absence of'. "
        "When source material is sparse, write a shorter factual article rather than padding with "
        "meta-commentary about missing data. Do not invent facts not supported by the notes"
        + (" or existing background" if existing_block else "")
        + ".\n\n"
        f"Research notes ({len(rank_sources_for_prompt(sources)[:MAX_SOURCES_IN_PROMPT])} sources):\n{context}"
    )


def _build_critique_prompt(title, artist, draft, sources, existing_background=""):
    context = _format_sources_for_prompt(sources)
    artist_line = f"Artist/composer: {artist}\n" if artist else ""
    existing_block = _existing_background_prompt_block(existing_background)
    return (
        f"You are fact-checking a background article about the tune/song \"{title}\".\n"
        f"{artist_line}"
        f"{existing_block}"
        "Critique and revise the DRAFT article below.\n\n"
        "REQUIREMENTS:\n"
        "1. Verify every factual claim against the research notes"
        + (" and existing background facts" if existing_block else "")
        + ".\n"
        "2. Remove or soften unsupported claims. Correct clear contradictions using the notes"
        + (" and existing background" if existing_block else "")
        + ".\n"
        "3. Preserve factual claims from existing background unless notes clearly contradict them "
        "with stronger evidence.\n"
        "4. Prefer claims that can be tied to a higher-trust source. Prefer Wikipedia, MusicBrainz, "
        "Discogs, The Session, AllMusic, and SecondHandSongs over lyric sites, blogs, or duplicated "
        "thin snippets. Where a specific source supports a key fact, add a light inline marker like "
        "[1] matching the source index below.\n"
        "5. Remove claims that appear only in low-trust or duplicated snippets without corroboration.\n"
        "6. Keep the same readable prose style with section headings. Do not discuss the "
        "critique process or mention that you fact-checked the text.\n"
        "7. Do not include a YouTube section.\n"
        "8. End with a ## References section listing ONLY sources actually used to support "
        "claims in the revised article. Format each as a markdown bullet: "
        "- [Title](url)\n"
        "9. Return ONLY the revised markdown article.\n\n"
        f"Research notes ({len(rank_sources_for_prompt(sources)[:MAX_SOURCES_IN_PROMPT])} sources):\n{context}\n\n"
        f"DRAFT ARTICLE:\n{draft}"
    )


def _format_references_section(sources):
    lines = ["## References", ""]
    count = 0
    for source in sources:
        url = (source.get("url") or "").strip()
        if not url:
            continue
        title = _normalize_space(source.get("title") or url)
        lines.append(f"- [{title}]({url})")
        count += 1
        if count >= MAX_REFERENCES:
            break
    if count == 0:
        return ""
    return "\n".join(lines).rstrip() + "\n"


def _sources_cited_in_text(text, sources):
    body = str(text or "")
    cited = []
    seen = set()
    ranked = rank_sources_for_prompt(sources)
    for idx, source in enumerate(ranked[:MAX_SOURCES_IN_PROMPT], start=1):
        url = (source.get("url") or "").strip()
        title = _normalize_space(source.get("title") or "")
        marker = f"[{idx}]"
        url_hit = bool(url and url in body)
        title_hit = bool(title and len(title) >= 8 and title in body)
        marker_hit = marker in body
        if not (url_hit or title_hit or marker_hit):
            continue
        key = url.lower() if url else title.lower()
        if key in seen:
            continue
        seen.add(key)
        cited.append(source)
    return cited


def ensure_references_section(text, sources):
    result = _finalize_llm_text(text)
    if not result:
        return result
    if REFERENCES_HEADING_RE.search(result):
        return result if result.endswith("\n") else result + "\n"

    cited = _sources_cited_in_text(result, sources)
    fallback = cited if cited else rank_sources_for_prompt(sources)[:MAX_REFERENCES]
    section = _format_references_section(fallback)
    if not section:
        return result if result.endswith("\n") else result + "\n"
    return (result.rstrip() + "\n\n" + section).rstrip() + "\n"


async def summarize_with_llm(
    client, title, artist, sources, lyrics="", existing_background=""
):
    prompt = _build_llm_prompt(title, artist, sources, lyrics, existing_background)
    resp = await client.post(
        f"{LLM_BASE_URL}/chat/completions",
        headers={
            "Authorization": f"Bearer {LLM_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": LLM_MODEL,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You write accurate, readable background articles about songs and tunes "
                        "for musicians. Use the provided research notes"
                        + (
                            " and preserve facts from any existing background"
                            if existing_background
                            else ""
                        )
                        + ". Write prose with section "
                        "headings. Include only sections supported by the notes. Never discuss "
                        "what the notes omit or fail to mention. Aim for the requested word count "
                        f"when the notes support it ({MIN_WORDS}-{TARGET_WORDS} words)."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.45,
            "max_tokens": LLM_MAX_TOKENS,
        },
        timeout=LLM_TIMEOUT_SECONDS,
    )
    resp.raise_for_status()
    data = resp.json()
    choices = data.get("choices") or []
    if not choices:
        raise ValueError("LLM returned no choices")
    message = choices[0].get("message") or {}
    text = _finalize_llm_text(message.get("content") or "")
    if not text:
        raise ValueError("LLM returned empty text")
    return text


async def critique_and_fact_check(
    client, title, artist, draft, sources, existing_background=""
):
    prompt = _build_critique_prompt(title, artist, draft, sources, existing_background)
    resp = await client.post(
        f"{LLM_BASE_URL}/chat/completions",
        headers={
            "Authorization": f"Bearer {LLM_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": LLM_MODEL,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are a careful music-history fact checker. Revise draft background "
                        "articles so every factual claim is supported by the research notes or "
                        "existing background. Remove unsupported claims. End with a ## References "
                        "section of sources actually used. Return only the revised markdown."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.2,
            "max_tokens": CRITIQUE_LLM_MAX_TOKENS,
        },
        timeout=LLM_TIMEOUT_SECONDS,
    )
    resp.raise_for_status()
    data = resp.json()
    choices = data.get("choices") or []
    if not choices:
        raise ValueError("LLM returned no choices for critique")
    message = choices[0].get("message") or {}
    text = _finalize_llm_text(message.get("content") or "")
    if not text:
        raise ValueError("LLM returned empty critique text")
    return ensure_references_section(text, sources)


async def _emit_progress(on_progress, stage, message, progress, elapsed_ms=None):
    if callable(on_progress):
        await on_progress(stage, message, progress, elapsed_ms)


async def _run_search_queries(client, source_store, queries, on_progress, progress_start, progress_end, label_prefix):
    total_queries = len(queries)
    if total_queries == 0:
        return

    # DuckDuckGo is rate-limited; keep those searches serial. Other backends can
    # fan out a little for latency without changing result quality.
    concurrency = 1 if SEARCH_BACKEND == "duckduckgo" else max(1, SEARCH_QUERY_CONCURRENCY)
    completed = 0

    async def run_one(query):
        nonlocal completed
        try:
            hits = await search_web(client, query)
        except Exception:
            hits = []
        for hit in hits:
            _add_source(
                source_store,
                hit.get("title"),
                hit.get("url"),
                hit.get("snippet"),
                hit.get("source") or SEARCH_BACKEND,
            )
        completed += 1
        await _emit_progress(
            on_progress,
            "search",
            f"{label_prefix} ({completed}/{total_queries})...",
            progress_start
            + ((progress_end - progress_start) * completed / max(total_queries, 1)),
        )

    if concurrency <= 1:
        for query in queries:
            await run_one(query)
        return

    semaphore = asyncio.Semaphore(concurrency)

    async def guarded(query):
        async with semaphore:
            await run_one(query)

    await asyncio.gather(*(guarded(query) for query in queries))


async def research_tune_background(
    title, artist="", lyrics="", existing_background="", on_progress=None
):
    title = _normalize_space(title)
    artist = _normalize_space(artist)
    lyrics = _normalize_lyrics(lyrics)
    existing_background = _normalize_existing_background(existing_background)
    if not title:
        raise ValueError("Song title is required")

    started_at = time.monotonic()

    def elapsed_ms():
        return int((time.monotonic() - started_at) * 1000)

    search_started_at = time.monotonic()
    await _emit_progress(
        on_progress, "search", "Searching reference sources...", 0.05, elapsed_ms()
    )
    source_store = {}
    queries = build_research_queries(title, artist, lyrics)

    timeout = httpx.Timeout(SEARCH_TIMEOUT_SECONDS)
    async with httpx.AsyncClient(
        timeout=timeout,
        headers={"User-Agent": BROWSER_USER_AGENT},
        follow_redirects=True,
    ) as client:
        wiki_sources = await fetch_wikipedia(client, title, artist)
        mb_sources = await fetch_musicbrainz(client, title, artist)
        for source in wiki_sources + mb_sources:
            _add_source(
                source_store,
                source.get("title"),
                source.get("url"),
                source.get("snippet"),
                source.get("source"),
            )

        await _run_search_queries(
            client,
            source_store,
            queries,
            on_progress,
            0.05,
            0.45,
            "Web search",
        )

        current_sources = list(source_store.values())
        supplemental_queries = []
        if sources_rich_enough_to_skip_supplemental(current_sources):
            await _emit_progress(
                on_progress,
                "search",
                "Skipping supplemental search (sources already rich)...",
                0.55,
                elapsed_ms(),
            )
        else:
            await _emit_progress(
                on_progress,
                "search",
                "Generating supplemental search queries...",
                0.48,
                elapsed_ms(),
            )
            try:
                supplemental_queries = await generate_supplemental_queries(
                    client,
                    title,
                    artist,
                    current_sources,
                    lyrics,
                    existing_background,
                    already_run_queries=queries,
                )
            except Exception:
                supplemental_queries = []

            if supplemental_queries:
                await _run_search_queries(
                    client,
                    source_store,
                    supplemental_queries,
                    on_progress,
                    0.50,
                    0.62,
                    "Expanded search",
                )

        sources = rank_sources_for_prompt(list(source_store.values()))
        if not sources:
            raise ValueError("No research sources found for this tune")

        search_ms = int((time.monotonic() - search_started_at) * 1000)
        summarize_started_at = time.monotonic()
        await _emit_progress(
            on_progress,
            "summarize",
            f"Summarizing with LLM ({len(sources)} sources)...",
            0.65,
            elapsed_ms(),
        )
        text = await summarize_with_llm(
            client, title, artist, sources, lyrics, existing_background
        )
        await _emit_progress(
            on_progress,
            "critique",
            "Fact-checking and adding references...",
            0.78,
            elapsed_ms(),
        )
        try:
            text = await critique_and_fact_check(
                client, title, artist, text, sources, existing_background
            )
        except Exception:
            text = ensure_references_section(text, sources)
        await _emit_progress(
            on_progress,
            "summarize",
            "Adding artist and album links, searching YouTube...",
            0.88,
            elapsed_ms(),
        )
        text = await enrich_background_markdown(
            client,
            text,
            sources,
            tune_artist=artist,
            tune_title=title,
        )
        summarize_ms = int((time.monotonic() - summarize_started_at) * 1000)

    total_ms = elapsed_ms()
    word_count = len(re.findall(r"\b\w+\b", text))
    await _emit_progress(on_progress, "done", "Research complete", 1.0, total_ms)
    return {
        "text": text,
        "sources": sources,
        "searchBackend": SEARCH_BACKEND,
        "model": LLM_MODEL,
        "title": title,
        "artist": artist,
        "timing": {
            "searchMs": search_ms,
            "summarizeMs": summarize_ms,
            "totalMs": total_ms,
            "wordCount": word_count,
        },
    }
