"""Admin-only background lookup for yoga teacher applicants (Cloud light–safe).

Searches the public web using contact details, scrapes useful pages, and
asks the configured LLM to write a markdown vetting report. Uncertain
name-only health/exercise matches go in a trailing "Could also be" section.

Kept free of tune_background_research / heavy research deps so it can ship
in Dockerfile.light.
"""

from __future__ import annotations

import asyncio
import os
import re
import time
from html import unescape
from typing import Any
from urllib.parse import urlparse

import httpx

BROWSER_USER_AGENT = (
    "Mozilla/5.0 (compatible; YogAppTeacherLookup/1.0; +https://yogapp.app)"
)
SEARCH_TIMEOUT_SECONDS = float(os.getenv("RESEARCH_SEARCH_TIMEOUT_SECONDS", "20"))
SEARCH_BACKEND = os.getenv("RESEARCH_SEARCH_BACKEND", "duckduckgo").strip().lower()
SEARCH_RESULTS_PER_QUERY = int(os.getenv("TEACHER_LOOKUP_RESULTS_PER_QUERY", "5"))
SEARCH_QUERY_CONCURRENCY = int(os.getenv("RESEARCH_SEARCH_QUERY_CONCURRENCY", "3"))
LLM_TIMEOUT_SECONDS = float(os.getenv("RESEARCH_LLM_TIMEOUT_SECONDS", "120"))
LLM_MAX_TOKENS = int(os.getenv("TEACHER_LOOKUP_LLM_MAX_TOKENS", "2800"))
MAX_SNIPPET_CHARS = int(os.getenv("RESEARCH_MAX_SNIPPET_CHARS", "1200"))
MAX_SOURCES_IN_PROMPT = int(os.getenv("TEACHER_LOOKUP_MAX_SOURCES_IN_PROMPT", "40"))
MAX_PAGE_FETCHES = int(os.getenv("TEACHER_LOOKUP_MAX_PAGE_FETCHES", "8"))
MAX_PAGE_CHARS = int(os.getenv("TEACHER_LOOKUP_MAX_PAGE_CHARS", "6000"))
PAGE_FETCH_TIMEOUT_SECONDS = float(
    os.getenv("TEACHER_LOOKUP_PAGE_FETCH_TIMEOUT_SECONDS", "15")
)
MAX_REPORT_SOURCES = int(os.getenv("TEACHER_LOOKUP_MAX_SOURCES", "40"))

BRAVE_SEARCH_API_KEY = os.getenv("BRAVE_SEARCH_API_KEY", "").strip()
SEARXNG_BASE_URL = os.getenv("SEARXNG_BASE_URL", "").strip().rstrip("/")
SERPER_API_KEY = os.getenv("SERPER_API_KEY", "").strip()

TAG_RE = re.compile(r"<script[\s\S]*?</script>|<style[\s\S]*?</style>|<[^>]+>", re.I)
WS_RE = re.compile(r"\s+")

HEALTH_EXERCISE_TERMS = (
    "yoga",
    "pilates",
    "fitness",
    "wellness",
    "meditation",
    "instructor",
    "teacher",
    "trainer",
    "studio",
    "physiotherapy",
    "physical therapy",
    "exercise",
    "gym",
    "ayurveda",
    "mindfulness",
    "breathwork",
    "asana",
)

FORUM_SITES = (
    "reddit.com",
    "quora.com",
    "yogajournal.com",
    "yogabasics.com",
    "elephantjournal.com",
    "mindbodygreen.com",
)


def _normalize_space(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _trim_snippet(value: Any) -> str:
    text = _normalize_space(value)
    if len(text) <= MAX_SNIPPET_CHARS:
        return text
    return text[: MAX_SNIPPET_CHARS - 3].rstrip() + "..."


def _finalize_llm_text(value: Any) -> str:
    text = str(value or "").strip()
    return re.sub(r"\n{3,}", "\n\n", text)


def _html_to_text(html: str) -> str:
    text = TAG_RE.sub(" ", html or "")
    text = unescape(text)
    return WS_RE.sub(" ", text).strip()


def _source_key(url: str) -> str:
    return (url or "").strip().lower().rstrip("/")


def _add_source(store: dict[str, Any], title: Any, url: Any, snippet: Any, source_type: Any) -> None:
    url_s = (url or "").strip()
    if not url_s:
        return
    key = _source_key(url_s)
    if key in store:
        return
    store[key] = {
        "title": _normalize_space(title) or url_s,
        "url": url_s,
        "snippet": _trim_snippet(snippet),
        "source": _normalize_space(source_type) or SEARCH_BACKEND,
    }


def rank_sources_for_prompt(sources: list[dict[str, Any]]) -> list[dict[str, Any]]:
    indexed = list(enumerate(sources or []))
    indexed.sort(
        key=lambda item: (
            -len(_normalize_space(item[1].get("snippet") or "")),
            item[0],
        )
    )
    return [source for _, source in indexed]


def _format_sources_for_prompt(sources: list[dict[str, Any]]) -> str:
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


def _llm_config() -> dict[str, str]:
    """Prefer Cloud light PROVIDER_LLM_*; fall back to RESEARCH_LLM_*."""
    base = (
        os.getenv("PROVIDER_LLM_BASE_URL")
        or os.getenv("RESEARCH_LLM_BASE_URL")
        or ""
    ).strip().rstrip("/")
    key = (
        os.getenv("PROVIDER_LLM_API_KEY")
        or os.getenv("RESEARCH_LLM_API_KEY")
        or ""
    ).strip()
    model = (
        os.getenv("PROVIDER_LLM_MODEL")
        or os.getenv("RESEARCH_LLM_MODEL")
        or "gpt-4o-mini"
    ).strip()
    if not base:
        raise ValueError("PROVIDER_LLM_BASE_URL (or RESEARCH_LLM_BASE_URL) is not configured")
    return {"apiUrl": base, "apiKey": key, "model": model}


def _llm_chat_url(cfg: dict[str, str]) -> str:
    base = cfg["apiUrl"]
    if base.endswith("/chat/completions"):
        return base
    if base.endswith("/v1"):
        return base + "/chat/completions"
    return base.rstrip("/") + "/v1/chat/completions"


async def _search_duckduckgo(_client: httpx.AsyncClient, query: str) -> list[dict[str, str]]:
    results: list[dict[str, Any]] = []

    def _run() -> list[dict[str, Any]]:
        try:
            from ddgs import DDGS
        except ImportError as exc:
            raise ValueError("ddgs package is not installed") from exc
        with DDGS() as ddgs:
            for item in ddgs.text(query, max_results=SEARCH_RESULTS_PER_QUERY):
                results.append(item)
        return results

    items = await asyncio.to_thread(_run)
    parsed = []
    for item in items:
        parsed.append(
            {
                "title": item.get("title") or "",
                "url": item.get("href") or item.get("url") or "",
                "snippet": item.get("body") or item.get("snippet") or "",
                "source": "duckduckgo",
            }
        )
    return parsed


async def _search_brave(client: httpx.AsyncClient, query: str) -> list[dict[str, str]]:
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
    return [
        {
            "title": item.get("title") or "",
            "url": item.get("url") or "",
            "snippet": item.get("description") or "",
            "source": "brave",
        }
        for item in web[:SEARCH_RESULTS_PER_QUERY]
    ]


async def _search_searxng(client: httpx.AsyncClient, query: str) -> list[dict[str, str]]:
    if not SEARXNG_BASE_URL:
        raise ValueError("SEARXNG_BASE_URL is required for searxng search backend")
    resp = await client.get(
        f"{SEARXNG_BASE_URL}/search",
        params={"q": query, "format": "json", "categories": "general"},
    )
    resp.raise_for_status()
    data = resp.json()
    results = data.get("results") or []
    return [
        {
            "title": item.get("title") or "",
            "url": item.get("url") or "",
            "snippet": item.get("content") or "",
            "source": "searxng",
        }
        for item in results[:SEARCH_RESULTS_PER_QUERY]
    ]


async def _search_serper(client: httpx.AsyncClient, query: str) -> list[dict[str, str]]:
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
    return [
        {
            "title": item.get("title") or "",
            "url": item.get("link") or "",
            "snippet": item.get("snippet") or "",
            "source": "serper",
        }
        for item in organic[:SEARCH_RESULTS_PER_QUERY]
    ]


async def search_web(client: httpx.AsyncClient, query: str) -> list[dict[str, str]]:
    backend = SEARCH_BACKEND
    if backend == "brave":
        return await _search_brave(client, query)
    if backend == "searxng":
        return await _search_searxng(client, query)
    if backend == "serper":
        return await _search_serper(client, query)
    return await _search_duckduckgo(client, query)


async def _run_search_queries(
    client: httpx.AsyncClient,
    source_store: dict[str, Any],
    queries: list[str],
) -> None:
    if not queries:
        return
    concurrency = 1 if SEARCH_BACKEND == "duckduckgo" else max(1, SEARCH_QUERY_CONCURRENCY)

    async def run_one(query: str) -> None:
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

    if concurrency <= 1:
        for query in queries:
            await run_one(query)
        return

    semaphore = asyncio.Semaphore(concurrency)

    async def guarded(query: str) -> None:
        async with semaphore:
            await run_one(query)

    await asyncio.gather(*(guarded(q) for q in queries))


def _teacher_contact_snapshot(teacher: dict[str, Any]) -> dict[str, Any]:
    return {
        "email": _normalize_space(teacher.get("email")),
        "displayName": _normalize_space(teacher.get("displayName")),
        "contactEmail": _normalize_space(teacher.get("contactEmail")),
        "contactPhone": _normalize_space(teacher.get("contactPhone")),
        "contactLink": _normalize_space(teacher.get("contactLink")),
        "youtubeLinks": [
            _normalize_space(u)
            for u in (teacher.get("youtubeLinks") or [])
            if _normalize_space(u)
        ],
        "country": _normalize_space(teacher.get("country")),
        "region": _normalize_space(teacher.get("region")),
        "blurb": _normalize_space(teacher.get("blurb"))[:280],
    }


def build_identity_queries(teacher: dict[str, Any]) -> list[str]:
    snap = _teacher_contact_snapshot(teacher)
    name = snap["displayName"]
    email = snap["email"]
    contact_email = snap["contactEmail"]
    phone = snap["contactPhone"]
    link = snap["contactLink"]
    country = snap["country"]
    region = snap["region"]
    location = " ".join(p for p in (region, country) if p).strip()

    queries: list[str] = []
    if name:
        queries.append(f'"{name}" yoga teacher')
        queries.append(f'"{name}" yoga instructor')
        if location:
            queries.append(f'"{name}" yoga {location}')
            queries.append(f'"{name}" {location}')
        queries.append(f'"{name}" site:linkedin.com')
        queries.append(f'"{name}" site:instagram.com')
        queries.append(f'"{name}" site:facebook.com')
        for site in FORUM_SITES[:4]:
            queries.append(f'"{name}" site:{site}')
        queries.append(f'"{name}" forum OR discussion OR review yoga')

    if email:
        queries.append(f'"{email}"')
        if name:
            queries.append(f'"{name}" "{email}"')
    if contact_email and contact_email.lower() != email.lower():
        queries.append(f'"{contact_email}"')
        if name:
            queries.append(f'"{name}" "{contact_email}"')

    if phone:
        digits = re.sub(r"\D+", "", phone)
        queries.append(f'"{phone}"')
        if digits and len(digits) >= 7:
            queries.append(digits)
        if name:
            queries.append(f'"{name}" "{phone}"')

    if link:
        queries.append(f'"{link}"')
        try:
            host = (
                urlparse(link if "://" in link else f"https://{link}").hostname or ""
            ).lower()
            host = host.removeprefix("www.")
            if host and name:
                queries.append(f'"{name}" site:{host}')
        except Exception:
            pass

    for yt in snap["youtubeLinks"][:3]:
        queries.append(f'"{yt}"')
        if name:
            queries.append(f'"{name}" youtube yoga')

    seen: set[str] = set()
    out: list[str] = []
    for q in queries:
        key = q.lower().strip()
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(q)
    return out


def build_name_only_health_queries(teacher: dict[str, Any]) -> list[str]:
    name = _normalize_space(teacher.get("displayName"))
    if not name:
        return []
    terms = HEALTH_EXERCISE_TERMS[:8]
    queries = [f'"{name}" {term}' for term in terms]
    queries.append(f'"{name}" (yoga OR pilates OR fitness OR wellness OR gym)')
    return queries


async def _fetch_page_text(client: httpx.AsyncClient, url: str) -> str:
    url = (url or "").strip()
    if not url.lower().startswith(("http://", "https://")):
        return ""
    try:
        resp = await client.get(
            url,
            timeout=PAGE_FETCH_TIMEOUT_SECONDS,
            headers={
                "User-Agent": BROWSER_USER_AGENT,
                "Accept": "text/html,application/xhtml+xml",
            },
        )
        if resp.status_code >= 400:
            return ""
        ctype = (resp.headers.get("content-type") or "").lower()
        if "html" not in ctype and "text/" not in ctype and ctype:
            return ""
        text = _html_to_text(resp.text or "")
        if len(text) > MAX_PAGE_CHARS:
            return text[: MAX_PAGE_CHARS - 3].rstrip() + "..."
        return text
    except Exception:
        return ""


def _urls_to_scrape(teacher: dict[str, Any], sources: list[dict[str, Any]]) -> list[str]:
    urls: list[str] = []
    link = _normalize_space(teacher.get("contactLink"))
    if link:
        if not link.lower().startswith(("http://", "https://")):
            link = "https://" + link.lstrip("/")
        urls.append(link)

    for source in sources:
        url = _normalize_space(source.get("url"))
        if not url or url in urls:
            continue
        try:
            host = (urlparse(url).hostname or "").lower()
        except Exception:
            continue
        if any(skip in host for skip in ("google.", "bing.com", "duckduckgo.com", "yahoo.com")):
            continue
        urls.append(url)
        if len(urls) >= MAX_PAGE_FETCHES:
            break
    return urls[:MAX_PAGE_FETCHES]


async def _scrape_useful_pages(
    client: httpx.AsyncClient,
    teacher: dict[str, Any],
    source_store: dict[str, Any],
) -> None:
    ranked = rank_sources_for_prompt(list(source_store.values()))
    urls = _urls_to_scrape(teacher, ranked)
    for url in urls:
        text = await _fetch_page_text(client, url)
        if not text or len(text) < 80:
            continue
        title = text[:80]
        key = _source_key(url)
        existing = source_store.get(key)
        if existing:
            existing["snippet"] = _trim_snippet(text)
            existing["source"] = (existing.get("source") or "") + "+scrape"
        else:
            _add_source(source_store, title, url, text, "scrape")


def _build_teacher_report_prompt(
    teacher: dict[str, Any],
    identity_sources: list[dict[str, Any]],
    name_only_sources: list[dict[str, Any]],
) -> str:
    snap = _teacher_contact_snapshot(teacher)
    contact_lines = [
        f"Login email: {snap['email']}",
        f"Display name: {snap['displayName'] or '(none)'}",
        f"Contact email: {snap['contactEmail'] or '(none)'}",
        f"Phone: {snap['contactPhone'] or '(none)'}",
        f"Website: {snap['contactLink'] or '(none)'}",
        f"Location: {', '.join(p for p in (snap['region'], snap['country']) if p) or '(none)'}",
        f"YouTube: {', '.join(snap['youtubeLinks']) or '(none)'}",
        f"Profile blurb: {snap['blurb'] or '(none)'}",
    ]
    identity_block = _format_sources_for_prompt(identity_sources[:MAX_REPORT_SOURCES])
    name_only_block = _format_sources_for_prompt(name_only_sources[:MAX_REPORT_SOURCES])
    return (
        "You are writing an admin-only background report about a person who applied to be "
        "listed as a yoga teacher in YogApp. Use only the research notes below. Do not invent "
        "facts. Prefer specific, checkable details (roles, studios, certifications, locations, "
        "social profiles, forum posts, reviews).\n\n"
        "APPLICANT CONTACT DETAILS:\n"
        + "\n".join(contact_lines)
        + "\n\n"
        "STRUCTURE the report in markdown with these sections when supported by evidence:\n"
        "1. ## Summary\n"
        "2. ## Identity match confidence (high / medium / low — explain briefly)\n"
        "3. ## Online presence (websites, social, directories)\n"
        "4. ## Teaching / yoga / wellness activity\n"
        "5. ## Discussion forums and other mentions\n"
        "6. ## Contact and location corroboration\n"
        "7. ## Concerns or inconsistencies (only if evidence supports)\n"
        "8. ## References (markdown bullets with links)\n"
        "9. ## Could also be\n"
        "   Put ONLY websites/profiles that match mainly on the person's name and relate to "
        "health, exercise, yoga, fitness, wellness, or similar — where identity is uncertain "
        "or not corroborated by email/phone/website. If none, write a single sentence saying so.\n"
        "10. ## Suggested reject reason\n"
        "   ALWAYS include this section. One short sentence (max ~220 characters) written for "
        "the applicant if an admin rejects the listing. Neutral and factual. Do not invent "
        "misconduct. If identity or teaching activity is weakly verified, say verification "
        "was insufficient from the details provided.\n\n"
        "STYLE: Thorough but factual. Admin audience. Cite sources with markdown links. "
        "Never claim certainty without corroborating contact details. "
        "Do not discuss what the notes omit.\n\n"
        f"STRONG / CONTACT-CORROBORATED NOTES:\n{identity_block or '(none)'}\n\n"
        f"NAME-ONLY HEALTH/EXERCISE CANDIDATES (prefer for Could also be):\n"
        f"{name_only_block or '(none)'}"
    )


async def _summarize_teacher_report(
    client: httpx.AsyncClient,
    teacher: dict[str, Any],
    identity_sources: list[dict[str, Any]],
    name_only_sources: list[dict[str, Any]],
) -> tuple[str, str]:
    cfg = _llm_config()
    prompt = _build_teacher_report_prompt(teacher, identity_sources, name_only_sources)
    headers = {"Content-Type": "application/json"}
    if cfg["apiKey"]:
        headers["Authorization"] = f"Bearer {cfg['apiKey']}"
    resp = await client.post(
        _llm_chat_url(cfg),
        headers=headers,
        json={
            "model": cfg["model"],
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You write careful, evidence-based admin vetting reports about yoga "
                        "teacher applicants from provided research notes only. End with a "
                        "## Could also be section for uncertain name-only health/exercise matches, "
                        "then ## Suggested reject reason with one applicant-facing sentence."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.3,
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
        raise ValueError("LLM returned empty teacher lookup report")
    if "## Could also be" not in text and "## Could Also Be" not in text:
        text = (
            text.rstrip()
            + "\n\n## Could also be\n\n"
            "No uncertain name-only health or exercise matches were identified.\n"
        )
    return text, cfg["model"]


_DEFAULT_REJECT_REASON = (
    "We could not verify your teacher listing from the details provided."
)

_REJECT_REASON_SECTION_RE = re.compile(
    r"(?is)\n*##\s+Suggested reject reason\s*\n+(.*?)(?=\n##\s+|\Z)"
)


def _extract_reject_reason(report: str) -> tuple[str, str]:
    """Split out Suggested reject reason; return (report_for_display, reject_reason)."""
    text = (report or "").strip()
    if not text:
        return "", _DEFAULT_REJECT_REASON
    match = _REJECT_REASON_SECTION_RE.search("\n" + text)
    if not match:
        return text, _DEFAULT_REJECT_REASON
    body = _normalize_space(match.group(1))
    # Take first sentence-ish paragraph; strip bullets/quotes.
    body = re.sub(r"^[-*]\s+", "", body)
    body = body.strip(" \"'`")
    if not body:
        body = _DEFAULT_REJECT_REASON
    if len(body) > 500:
        body = body[:497].rstrip() + "…"
    cleaned = (_REJECT_REASON_SECTION_RE.sub("\n", "\n" + text)).strip() + "\n"
    return cleaned, body


def _fallback_report(
    teacher: dict[str, Any],
    identity_sources: list[dict[str, Any]],
    name_only_sources: list[dict[str, Any]],
) -> str:
    snap = _teacher_contact_snapshot(teacher)
    lines = [
        f"# Lookup report: {snap['displayName'] or snap['email']}",
        "",
        "## Summary",
        "",
        "Automated search completed. LLM synthesis was unavailable; raw sources are listed below.",
        "",
        "## Contact snapshot",
        "",
        f"- Login email: {snap['email']}",
        f"- Display name: {snap['displayName'] or '—'}",
        f"- Contact email: {snap['contactEmail'] or '—'}",
        f"- Phone: {snap['contactPhone'] or '—'}",
        f"- Website: {snap['contactLink'] or '—'}",
        f"- Location: {', '.join(p for p in (snap['region'], snap['country']) if p) or '—'}",
        "",
        "## References",
        "",
    ]
    for src in identity_sources[:25]:
        title = _normalize_space(src.get("title") or src.get("url"))
        url = _normalize_space(src.get("url"))
        snippet = _normalize_space(src.get("snippet"))[:240]
        if url:
            lines.append(f"- [{title}]({url})" + (f" — {snippet}" if snippet else ""))
    lines.extend(["", "## Could also be", ""])
    if not name_only_sources:
        lines.append("No uncertain name-only health or exercise matches were identified.")
    else:
        for src in name_only_sources[:20]:
            title = _normalize_space(src.get("title") or src.get("url"))
            url = _normalize_space(src.get("url"))
            snippet = _normalize_space(src.get("snippet"))[:240]
            if url:
                lines.append(f"- [{title}]({url})" + (f" — {snippet}" if snippet else ""))
    lines.extend(
        [
            "",
            "## Suggested reject reason",
            "",
            _DEFAULT_REJECT_REASON,
            "",
        ]
    )
    return "\n".join(lines).rstrip() + "\n"


async def research_teacher_lookup(teacher: dict[str, Any]) -> dict[str, Any]:
    if not teacher or not _normalize_space(teacher.get("email")):
        raise ValueError("Teacher email is required")

    started_at = time.monotonic()
    identity_store: dict[str, Any] = {}
    name_only_store: dict[str, Any] = {}
    identity_queries = build_identity_queries(teacher)
    name_only_queries = build_name_only_health_queries(teacher)

    timeout = httpx.Timeout(SEARCH_TIMEOUT_SECONDS)
    async with httpx.AsyncClient(
        timeout=timeout,
        headers={"User-Agent": BROWSER_USER_AGENT},
        follow_redirects=True,
    ) as client:
        await _run_search_queries(client, identity_store, identity_queries)
        await _scrape_useful_pages(client, teacher, identity_store)

        known_urls = {
            _source_key(_normalize_space(s.get("url")))
            for s in identity_store.values()
        }
        await _run_search_queries(client, name_only_store, name_only_queries)
        for key in list(name_only_store.keys()):
            url = _source_key(_normalize_space(name_only_store[key].get("url")))
            if url in known_urls:
                del name_only_store[key]

        identity_sources = rank_sources_for_prompt(list(identity_store.values()))[
            :MAX_REPORT_SOURCES
        ]
        name_only_sources = rank_sources_for_prompt(list(name_only_store.values()))[
            :MAX_REPORT_SOURCES
        ]

        try:
            report, model = await _summarize_teacher_report(
                client, teacher, identity_sources, name_only_sources
            )
        except Exception:
            report = _fallback_report(teacher, identity_sources, name_only_sources)
            model = ""

    report, reject_reason = _extract_reject_reason(report)

    total_ms = int((time.monotonic() - started_at) * 1000)
    all_sources = identity_sources + [
        s for s in name_only_sources if s not in identity_sources
    ]
    return {
        "reportMarkdown": report,
        "rejectReason": reject_reason,
        "sources": all_sources,
        "contactSnapshot": _teacher_contact_snapshot(teacher),
        "searchBackend": SEARCH_BACKEND,
        "model": model,
        "queryCount": len(identity_queries) + len(name_only_queries),
        "timing": {
            "totalMs": total_ms,
            "wordCount": len(re.findall(r"\b\w+\b", report)),
            "identitySourceCount": len(identity_sources),
            "nameOnlySourceCount": len(name_only_sources),
        },
    }
