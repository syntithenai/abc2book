import re
from urllib.parse import quote, quote_plus, unquote, urlparse

import httpx

from recording_artists import is_generic_artist

BROWSER_USER_AGENT = (
    "Mozilla/5.0 (compatible; ABC2BookResolver/1.0; +https://tunebook.net)"
)
MARKDOWN_LINK_RE = re.compile(r"\[[^\]]+\]\([^)]+\)")
MAX_WIKIPEDIA_LOOKUPS = 12

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


async def enrich_background_markdown(client, text, sources, tune_artist=""):
    artists, albums = collect_entities_from_sources(sources, tune_artist=tune_artist)
    if not artists and not albums:
        return text
    resolved_artists, resolved_albums = await resolve_entity_links(client, artists, albums)
    return enrich_markdown_with_entity_links(text, resolved_artists, resolved_albums)
