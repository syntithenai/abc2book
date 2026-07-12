import asyncio
import os
import re
from urllib.parse import parse_qs, quote, quote_plus, unquote, urlparse

import httpx

from recording_artists import is_generic_artist

BROWSER_USER_AGENT = (
    "Mozilla/5.0 (compatible; ABC2BookResolver/1.0; +https://tunebook.net)"
)
MARKDOWN_LINK_RE = re.compile(r"\[[^\]]+\]\([^)]+\)")
HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$", re.MULTILINE)
LABELS_RELEASES_HEADING_RE = re.compile(
    r"\b(record\s+labels?\s+and\s+releases?|labels?\s+and\s+releases?|"
    r"releases?\s+and\s+(record\s+)?labels?|record\s+labels?)\b",
    re.IGNORECASE,
)
YOUTUBE_SECTION_HEADING_RE = re.compile(
    r"^(notable\s+recordings\s+and\s+)?youtube(\s+links)?\b",
    re.IGNORECASE,
)
REFERENCES_SECTION_HEADING_RE = re.compile(
    r"^references\b",
    re.IGNORECASE,
)
YOUTUBE_VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
MAX_WIKIPEDIA_LOOKUPS = 12
MAX_YOUTUBE_LINKS = int(os.getenv("RESEARCH_MAX_YOUTUBE_LINKS", "12"))
MAX_YOUTUBE_ARTIST_QUERIES = int(os.getenv("RESEARCH_MAX_YOUTUBE_ARTIST_QUERIES", "8"))
YOUTUBE_RESULTS_PER_QUERY = int(os.getenv("RESEARCH_YOUTUBE_RESULTS_PER_QUERY", "2"))

GENERIC_ALBUM_KEYS = frozenset({
    "",
    "traditional",
    "various",
    "unknown",
    "single",
    "ep",
    "album",
})


def _normalize_space(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _normalize_entity_key(value):
    return re.sub(r"[^a-z0-9]+", "", (value or "").lower())


def _is_valid_artist_name(name):
    text = _normalize_space(name)
    if len(text) < 2:
        return False
    if is_generic_artist(text):
        return False
    if text.lower() in {"the", "and", "feat", "featuring"}:
        return False
    return bool(re.search(r"[A-Za-z]", text))


def _is_valid_album_name(name):
    text = _normalize_space(name)
    if len(text) < 3:
        return False
    key = _normalize_entity_key(text)
    if key in GENERIC_ALBUM_KEYS:
        return False
    if is_generic_artist(text):
        return False
    return bool(re.search(r"[A-Za-z]", text))


def _split_artist_names(value):
    names = []
    for part in re.split(r",|\s+&\s+|\s+and\s+", value or ""):
        name = _normalize_space(part)
        if _is_valid_artist_name(name):
            names.append(name)
    return names


def _split_release_names(value):
    names = []
    for part in re.split(r";|,", value or ""):
        name = _normalize_space(part)
        if _is_valid_album_name(name):
            names.append(name)
    return names


def _discogs_search_url(album_name):
    return (
        "https://www.discogs.com/search/?q="
        + quote_plus(album_name)
        + "&type=release"
    )


def _wikipedia_page_url(page_title):
    return "https://en.wikipedia.org/wiki/" + quote(page_title.replace(" ", "_"))


def _title_from_wikipedia_url(url):
    parsed = urlparse(url)
    if "wikipedia.org" not in (parsed.hostname or "").lower():
        return ""
    path = parsed.path or ""
    if "/wiki/" not in path:
        return ""
    slug = unquote(path.split("/wiki/", 1)[-1].split("#")[0])
    if not slug or slug.startswith("Special:"):
        return ""
    return _normalize_space(slug.replace("_", " "))


def _title_from_discogs_url(url):
    title = _normalize_space(urlparse(url).path.rsplit("/", 1)[-1].replace("-", " "))
    return title if _is_valid_album_name(title) else ""


def collect_entities_from_sources(sources, tune_artist=""):
    artists = {}
    albums = {}

    tune_artist = _normalize_space(tune_artist)
    if _is_valid_artist_name(tune_artist):
        artists.setdefault(tune_artist, None)

    for source in sources or []:
        url = (source.get("url") or "").strip()
        snippet = (source.get("snippet") or "").strip()
        title = _normalize_space(source.get("title") or "")
        lower_url = url.lower()

        if "wikipedia.org" in lower_url:
            page_title = _title_from_wikipedia_url(url)
            if page_title and _is_valid_artist_name(page_title):
                artists[page_title] = url.split("#")[0]

        if "discogs.com" in lower_url:
            album_name = title or _title_from_discogs_url(url)
            if _is_valid_album_name(album_name):
                albums[album_name] = url.split("#")[0]

        if "musicbrainz.org/recording" in lower_url:
            artists_match = re.search(r"Artists?:\s*([^.]+)", snippet, re.I)
            if artists_match:
                for name in _split_artist_names(artists_match.group(1)):
                    artists.setdefault(name, None)
            releases_match = re.search(r"Releases?:\s*([^.]+)", snippet, re.I)
            if releases_match:
                for name in _split_release_names(releases_match.group(1)):
                    albums.setdefault(name, _discogs_search_url(name))

        if "genius.com" in lower_url and " - " in title:
            artist_name = _normalize_space(title.split(" - ", 1)[0])
            if _is_valid_artist_name(artist_name):
                artists.setdefault(artist_name, None)

    return artists, albums


async def _resolve_wikipedia_url(client, name):
    try:
        response = await client.get(
            "https://en.wikipedia.org/w/api.php",
            params={
                "action": "opensearch",
                "search": name,
                "limit": 1,
                "namespace": 0,
                "format": "json",
            },
            headers={"User-Agent": BROWSER_USER_AGENT},
        )
        response.raise_for_status()
        data = response.json()
        if not isinstance(data, list) or len(data) < 4:
            return None
        titles = data[1] if isinstance(data[1], list) else []
        urls = data[3] if isinstance(data[3], list) else []
        if not titles or not urls:
            return None
        return urls[0]
    except Exception:
        return None


async def resolve_entity_links(client, artists, albums):
    resolved_artists = {}
    resolved_albums = {}
    lookups = 0

    for name, url in sorted(artists.items(), key=lambda item: len(item[0]), reverse=True):
        if url:
            resolved_artists[name] = url.split("#")[0]
            continue
        if lookups >= MAX_WIKIPEDIA_LOOKUPS:
            continue
        if not _is_valid_artist_name(name):
            continue
        wiki_url = await _resolve_wikipedia_url(client, name)
        lookups += 1
        if wiki_url:
            resolved_artists[name] = wiki_url.split("#")[0]

    for name, url in sorted(albums.items(), key=lambda item: len(item[0]), reverse=True):
        if not _is_valid_album_name(name):
            continue
        resolved_albums[name] = (url or _discogs_search_url(name)).split("#")[0]

    return resolved_artists, resolved_albums


def _replace_entity_in_plain(segment, name, url):
    if not segment:
        return segment
    pattern = re.compile(r"(?<!\w)" + re.escape(name) + r"(?!\w)", re.IGNORECASE)

    def repl(match):
        return "[" + match.group(0) + "](" + url + ")"

    return pattern.sub(repl, segment)


def _linkify_entity(text, name, url):
    if not text or not name or not url:
        return text
    parts = []
    last = 0
    for match in MARKDOWN_LINK_RE.finditer(text):
        parts.append(_replace_entity_in_plain(text[last:match.start()], name, url))
        parts.append(match.group(0))
        last = match.end()
    parts.append(_replace_entity_in_plain(text[last:], name, url))
    return "".join(parts)


def enrich_markdown_with_entity_links(text, artists, albums):
    result = str(text or "")
    if not result:
        return result

    artist_entities = sorted(artists.items(), key=lambda item: len(item[0]), reverse=True)
    album_entities = sorted(albums.items(), key=lambda item: len(item[0]), reverse=True)

    for name, url in album_entities:
        result = _linkify_entity(result, name, url)
    for name, url in artist_entities:
        result = _linkify_entity(result, name, url)
    return result


def _youtube_video_id(url):
    parsed = urlparse((url or "").strip())
    host = (parsed.hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    path = parsed.path or ""

    if host == "youtu.be":
        video_id = path.strip("/").split("/")[0]
        return video_id if YOUTUBE_VIDEO_ID_RE.match(video_id) else ""

    if host not in {"youtube.com", "m.youtube.com", "music.youtube.com"}:
        return ""

    if path.startswith("/watch"):
        video_id = (parse_qs(parsed.query).get("v") or [""])[0]
        return video_id if YOUTUBE_VIDEO_ID_RE.match(video_id) else ""

    for prefix in ("/embed/", "/shorts/", "/v/", "/live/"):
        if path.startswith(prefix):
            video_id = path[len(prefix):].split("/")[0]
            return video_id if YOUTUBE_VIDEO_ID_RE.match(video_id) else ""

    return ""


def _normalize_youtube_watch_url(url):
    video_id = _youtube_video_id(url)
    if not video_id:
        return ""
    return f"https://www.youtube.com/watch?v={video_id}"


def _clean_youtube_title(title, url=""):
    text = _normalize_space(title)
    if not text:
        return ""
    text = re.sub(r"\s*[-|]\s*YouTube\s*$", "", text, flags=re.IGNORECASE).strip()
    text = re.sub(r"\s*\(\s*YouTube\s*\)\s*$", "", text, flags=re.IGNORECASE).strip()
    if not text or text.lower() in {"youtube", "watch", "video"}:
        return ""
    if url and text.lower() == url.lower():
        return ""
    return text


def artists_mentioned_in_text(text, artists):
    """Return known artist names that appear in the generated background text."""
    body = str(text or "")
    if not body:
        return []

    matches = []
    for name in artists or []:
        artist = _normalize_space(name)
        if not _is_valid_artist_name(artist):
            continue
        pattern = re.compile(r"(?<!\w)" + re.escape(artist) + r"(?!\w)", re.IGNORECASE)
        match = pattern.search(body)
        if match:
            matches.append((match.start(), artist))

    matches.sort(key=lambda item: (item[0], -len(item[1])))
    mentioned = []
    seen = set()
    for _, artist in matches:
        key = artist.lower()
        if key in seen:
            continue
        seen.add(key)
        mentioned.append(artist)
    return mentioned


def build_youtube_search_queries(title, artists):
    """Build YouTube queries: title+artist for each artist, then title alone."""
    title = _normalize_space(title)
    if not title:
        return []

    queries = []
    seen = set()
    for artist in artists or []:
        artist = _normalize_space(artist)
        if not _is_valid_artist_name(artist):
            continue
        query = f"{title} {artist}"
        key = query.lower()
        if key in seen:
            continue
        seen.add(key)
        queries.append(query)

    title_key = title.lower()
    if title_key not in seen:
        queries.append(title)
    return queries


def _youtube_result_from_video_item(item):
    if not isinstance(item, dict):
        return None
    publisher = _normalize_space(item.get("publisher") or "").lower()
    url = (
        item.get("content")
        or item.get("url")
        or item.get("href")
        or item.get("embed_url")
        or ""
    )
    normalized = _normalize_youtube_watch_url(url)
    if not normalized:
        return None
    if publisher and publisher not in {"youtube", "youtu.be"}:
        # Keep only direct YouTube results when publisher is present.
        return None
    video_id = _youtube_video_id(normalized)
    title = _clean_youtube_title(item.get("title") or "", normalized)
    return {
        "title": title or f"YouTube video ({video_id})",
        "url": normalized,
    }


async def search_youtube_videos(query, max_results=YOUTUBE_RESULTS_PER_QUERY):
    query = _normalize_space(query)
    if not query or max_results <= 0:
        return []

    def _run():
        results = []
        seen = set()
        try:
            from ddgs import DDGS
        except ImportError:
            return results
        try:
            with DDGS() as ddgs:
                # Fetch extra hits so non-YouTube publishers can be filtered out.
                for item in ddgs.videos(query, max_results=max(max_results * 3, max_results)):
                    parsed = _youtube_result_from_video_item(item)
                    if not parsed:
                        continue
                    video_id = _youtube_video_id(parsed["url"])
                    if not video_id or video_id in seen:
                        continue
                    seen.add(video_id)
                    results.append(parsed)
                    if len(results) >= max_results:
                        break
        except Exception:
            return results
        return results

    return await asyncio.to_thread(_run)


async def search_youtube_links_for_tune(
    title,
    text,
    artists,
    limit=MAX_YOUTUBE_LINKS,
    results_per_query=YOUTUBE_RESULTS_PER_QUERY,
):
    mentioned = artists_mentioned_in_text(text, artists)[:MAX_YOUTUBE_ARTIST_QUERIES]
    queries = build_youtube_search_queries(title, mentioned)
    links = []
    seen = set()
    for query in queries:
        for item in await search_youtube_videos(query, max_results=results_per_query):
            video_id = _youtube_video_id(item.get("url") or "")
            if not video_id or video_id in seen:
                continue
            seen.add(video_id)
            links.append(item)
            if len(links) >= limit:
                return links
    return links


def format_youtube_links_section(links):
    if not links:
        return ""
    lines = ["## YouTube", ""]
    for link in links:
        title = _normalize_space(link.get("title") or "YouTube")
        url = (link.get("url") or "").strip()
        if not url:
            continue
        lines.append(f"- [{title}]({url})")
    if len(lines) <= 2:
        return ""
    return "\n".join(lines).rstrip() + "\n"


def _heading_matches(pattern, heading_text):
    return bool(pattern.search(_normalize_space(heading_text)))


def _section_end_offset(text, heading_match, headings):
    level = len(heading_match.group(1))
    start = heading_match.end()
    for other in headings:
        if other.start() <= heading_match.start():
            continue
        if len(other.group(1)) <= level:
            return other.start()
    return len(text)


def _existing_youtube_urls(text):
    urls = set()
    for match in MARKDOWN_LINK_RE.finditer(text or ""):
        url = match.group(0).rsplit("(", 1)[-1].rstrip(")")
        normalized = _normalize_youtube_watch_url(url)
        if normalized:
            urls.add(normalized)
    for match in re.finditer(r"https?://(?:www\.)?(?:youtube\.com|youtu\.be)/[^\s)>\]]+", text or ""):
        normalized = _normalize_youtube_watch_url(match.group(0))
        if normalized:
            urls.add(normalized)
    return urls


def _remove_youtube_sections(text):
    result = str(text or "")
    while True:
        headings = list(HEADING_RE.finditer(result))
        youtube_heading = next(
            (
                heading
                for heading in headings
                if _heading_matches(YOUTUBE_SECTION_HEADING_RE, heading.group(2))
            ),
            None,
        )
        if not youtube_heading:
            return result.rstrip()
        end = _section_end_offset(result, youtube_heading, headings)
        before = result[:youtube_heading.start()].rstrip()
        after = result[end:].lstrip("\n")
        result = before + ("\n\n" + after if after else "\n")


def insert_youtube_links_section(text, links):
    result = _remove_youtube_sections(text)
    existing_urls = _existing_youtube_urls(result)
    new_links = [link for link in links if link.get("url") not in existing_urls]
    section = format_youtube_links_section(new_links)
    if not section:
        return (result + "\n") if result else result

    if not result:
        return section.rstrip() + "\n"

    headings = list(HEADING_RE.finditer(result))
    labels_heading = next(
        (
            heading
            for heading in headings
            if _heading_matches(LABELS_RELEASES_HEADING_RE, heading.group(2))
        ),
        None,
    )
    if labels_heading:
        end = _section_end_offset(result, labels_heading, headings)
        before = result[:end].rstrip()
        after = result[end:].lstrip("\n")
        return (
            before + "\n\n" + section.rstrip() + ("\n\n" + after if after else "\n")
        ).rstrip() + "\n"

    references_heading = next(
        (
            heading
            for heading in headings
            if _heading_matches(REFERENCES_SECTION_HEADING_RE, heading.group(2))
        ),
        None,
    )
    if references_heading:
        before = result[:references_heading.start()].rstrip()
        after = result[references_heading.start():].lstrip("\n")
        return (
            before + "\n\n" + section.rstrip() + ("\n\n" + after if after else "\n")
        ).rstrip() + "\n"

    return (result + "\n\n" + section.rstrip() + "\n").rstrip() + "\n"


async def enrich_background_markdown(client, text, sources, tune_artist="", tune_title=""):
    result = str(text or "")
    artists, albums = collect_entities_from_sources(sources, tune_artist=tune_artist)
    if artists or albums:
        resolved_artists, resolved_albums = await resolve_entity_links(client, artists, albums)
        result = enrich_markdown_with_entity_links(result, resolved_artists, resolved_albums)
    youtube_links = await search_youtube_links_for_tune(
        tune_title,
        result,
        list(artists.keys()),
    )
    if youtube_links:
        result = insert_youtube_links_section(result, youtube_links)
    return result
