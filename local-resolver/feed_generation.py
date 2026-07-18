"""Grounded feed article / quiz generation for the Knowledge Feed."""

from __future__ import annotations

import json
import re
from typing import Any

import httpx


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").lower()).strip()


# Present-tense “just dropped” framing the model invents for old repertoire.
_NEW_RELEASE_RE = re.compile(
    r"\b("
    r"releases?\s+(a\s+)?new(\s+song|\s+single|\s+track|\s+album)?"
    r"|new\s+(song|single|track|album|release)\b"
    r"|just\s+(released|dropped|out)"
    r"|out\s+now\b"
    r"|brand[- ]?new\b"
    r"|latest\s+(single|release|track)"
    r"|drops?\s+new\b"
    r")\b",
    re.I,
)


def looks_like_new_release_claim(text: str) -> bool:
    """True when copy claims a contemporary new release."""
    return bool(_NEW_RELEASE_RE.search(text or ""))


def corpus_supports_new_release(corpus: str) -> bool:
    """Allow new-release wording only if notes already say something similar."""
    c = _normalize(corpus)
    if not c:
        return False
    return bool(
        re.search(
            r"\b(new (song|single|track|album|release)|just released|out now|released (this|last) (week|month|year)|premiered)\b",
            c,
        )
    )


def reject_ungrounded_new_release(headline: str, body: str, corpus: str) -> bool:
    """Drop items that invent a new-release story not present in the notes."""
    blob = f"{headline or ''}\n{body or ''}"
    if not looks_like_new_release_claim(blob):
        return False
    return not corpus_supports_new_release(corpus)


_NAME_LINE_RE = re.compile(
    r"^[A-Z][A-Za-z.'\-]+(?:\s+[A-Z][A-Za-z.'\-]+){0,4}$"
)
_CONTEXT_VERB_RE = re.compile(
    r"\b(wrote|written|recorded|popular(?:ized)?|known|composed|arrange|version|"
    r"origin|history|folk|album|single|performed|credited|inspired|collected)\b",
    re.I,
)


def _looks_like_name_line(line: str) -> bool:
    s = (line or "").strip().strip(",;·|/ ")
    if not s or len(s) > 60:
        return False
    if _CONTEXT_VERB_RE.search(s):
        return False
    return bool(_NAME_LINE_RE.match(s))


def is_thin_name_list_body(text: str) -> bool:
    """
    True for bodies that are little more than a list of artist/person names
    with no historical/contextual prose.
    """
    t = (text or "").strip()
    if len(t) < 80:
        return True
    lines = [ln.strip() for ln in re.split(r"[\n/;|]+", t) if ln.strip()]
    if len(lines) >= 2:
        name_like = sum(1 for ln in lines if _looks_like_name_line(ln))
        if name_like >= max(2, int(0.6 * len(lines))) and not _CONTEXT_VERB_RE.search(t):
            return True
    # Comma/newline-ish name soup without sentence punctuation or context verbs
    sentence_ends = len(re.findall(r"[.!?]", t))
    if sentence_ends < 2 and not _CONTEXT_VERB_RE.search(t):
        words = re.findall(r"[A-Za-z']+", t)
        if words:
            caps = sum(1 for w in words if w[:1].isupper())
            if caps / len(words) >= 0.65:
                return True
    return False


def is_usable_article_body(headline: str, body: str) -> bool:
    if not (headline or "").strip() or not (body or "").strip():
        return False
    if is_thin_name_list_body(body):
        return False
    # Generic “Notes on X” with almost no substance beyond the title
    if re.match(r"^Notes on\b", headline or "", re.I) and len((body or "").strip()) < 120:
        return False
    return True


def fact_corpus(facts: list[dict] | None, background_info: str = "") -> str:
    parts: list[str] = []
    for fact in facts or []:
        if not isinstance(fact, dict):
            continue
        bit = str(fact.get("objectText") or fact.get("rawSnippet") or "").strip()
        if bit:
            parts.append(bit)
        year = fact.get("objectYear")
        if year:
            parts.append(str(year))
    bg = (background_info or "").strip()
    if bg:
        parts.append(bg)
    return "\n".join(parts)


def answer_grounded(answer: str, corpus: str, allowed: list[str] | None = None) -> bool:
    a = _normalize(answer)
    if not a:
        return False
    c = _normalize(corpus)
    if a and a in c:
        return True
    for item in allowed or []:
        if _normalize(item) == a and a in c:
            return True
    # allow short answers that appear as whole words in corpus
    if len(a) >= 3 and re.search(r"\b" + re.escape(a) + r"\b", c):
        return True
    return False


async def _chat_json(system: str, user: str) -> Any:
    from llm_runtime import (
        enrich_chat_completion_payload,
        get_active_llm_config,
        llm_auth_headers,
        llm_chat_url,
        llm_model,
    )

    cfg = get_active_llm_config()
    model = llm_model(cfg)
    headers = llm_auth_headers(cfg)
    if not model:
        async with httpx.AsyncClient(timeout=30.0) as client:
            models = await client.get(f"{cfg['apiUrl'].rstrip('/')}/models", headers=headers)
            models.raise_for_status()
            data = models.json()
            items = data.get("data") if isinstance(data, dict) else []
            if items:
                model = str(items[0].get("id") or "")
    if not model:
        raise ValueError("No LLM model available")
    payload = enrich_chat_completion_payload({
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0.3,
    }, cfg)
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(llm_chat_url(cfg), headers=headers, json=payload)
        resp.raise_for_status()
        body = resp.json()
    content = (
        body.get("choices", [{}])[0]
        .get("message", {})
        .get("content", "")
    )
    text = str(content or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return json.loads(text)


async def generate_feed_articles(
    title: str,
    artist: str,
    facts: list[dict] | None = None,
    background_info: str = "",
) -> dict:
    corpus = fact_corpus(facts, background_info)
    if len(corpus) < 40:
        return {"items": []}
    system = (
        "You write short grounded background blurbs about songs and artists for a musician's learning feed. "
        "Return JSON {\"items\":[{\"headline\",\"teaser\",\"body\",\"sourceUrl\"}]}. "
        "Use ONLY facts from the provided notes. No invented years, albums, or events. "
        "Do NOT frame historical songs as brand-new releases, singles, or 'just dropped' news. "
        "Prefer past-tense history, origin, and context (who wrote it, when it was known, notable versions). "
        "Headlines should read like encyclopedia/magazine background, not press releases."
    )
    user = (
        f"Song: {title}\nArtist: {artist}\nNotes:\n{corpus[:4000]}\n"
        "Write 1-3 short background items (body 80-180 words) about the song/artist history. "
        "Do not invent a contemporary release announcement."
    )
    try:
        data = await _chat_json(system, user)
    except Exception:
        # Fallback: stitch prose from corpus — skip thin name-only lists
        sentences = [
            s.strip()
            for s in re.split(r"(?<=[.!?])\s+", corpus)
            if s.strip() and _CONTEXT_VERB_RE.search(s)
        ]
        body = " ".join(sentences[:4]).strip()
        headline = f"Background: {title}"
        if not is_usable_article_body(headline, body):
            return {"items": []}
        return {
            "items": [
                {
                    "headline": headline,
                    "teaser": body[:140],
                    "body": body[:600],
                    "sourceUrl": "",
                }
            ]
        }
    items = data.get("items") if isinstance(data, dict) else []
    cleaned = []
    for item in items or []:
        if not isinstance(item, dict):
            continue
        body = str(item.get("body") or "").strip()
        headline = str(item.get("headline") or "").strip()
        if not is_usable_article_body(headline, body):
            continue
        if reject_ungrounded_new_release(headline, body, corpus):
            continue
        # soft grounding: at least one 4+ char token from body in corpus
        tokens = [t for t in re.findall(r"[A-Za-z0-9♯♭]{4,}", body) if t.lower() not in {"this", "that", "with", "from"}]
        if tokens and not any(_normalize(t) in _normalize(corpus) for t in tokens[:8]):
            continue
        cleaned.append(
            {
                "headline": headline,
                "teaser": str(item.get("teaser") or body)[:160],
                "body": body,
                "sourceUrl": str(item.get("sourceUrl") or ""),
            }
        )
    return {"items": cleaned[:3]}


async def generate_feed_quizzes(
    title: str,
    artist: str,
    facts: list[dict] | None = None,
    background_info: str = "",
) -> dict:
    corpus = fact_corpus(facts, background_info)
    if len(corpus) < 40:
        return {"items": []}
    system = (
        "Create multiple-choice quizzes grounded ONLY in provided notes. "
        "Return JSON {\"items\":[{\"prompt\",\"choices\":[{\"id\",\"text\",\"correct\"}],"
        "\"explain\",\"difficulty\",\"sourceUrl\",\"allowedAnswers\"}]}. "
        "Exactly one correct choice. Correct text must appear in the notes."
    )
    user = f"Song: {title}\nArtist: {artist}\nNotes:\n{corpus[:4000]}\nWrite 2-4 quizzes."
    try:
        data = await _chat_json(system, user)
    except Exception:
        return {"items": _heuristic_quizzes(title, artist, facts or [])}
    items = data.get("items") if isinstance(data, dict) else []
    cleaned = []
    for item in items or []:
        if not isinstance(item, dict):
            continue
        choices = item.get("choices") if isinstance(item.get("choices"), list) else []
        correct = [c for c in choices if isinstance(c, dict) and c.get("correct")]
        if len(correct) != 1:
            continue
        ans = str(correct[0].get("text") or "")
        allowed = item.get("allowedAnswers") if isinstance(item.get("allowedAnswers"), list) else []
        if not answer_grounded(ans, corpus, [str(a) for a in allowed]):
            continue
        cleaned.append(
            {
                "prompt": str(item.get("prompt") or "").strip(),
                "choices": choices,
                "explain": str(item.get("explain") or "Based on the source notes.")[:400],
                "difficulty": int(item.get("difficulty") or 2),
                "sourceUrl": str(item.get("sourceUrl") or ""),
            }
        )
    if not cleaned:
        cleaned = _heuristic_quizzes(title, artist, facts or [])
    return {"items": cleaned[:4]}


def _heuristic_quizzes(title: str, artist: str, facts: list[dict]) -> list[dict]:
    out: list[dict] = []
    for fact in facts:
        if not isinstance(fact, dict):
            continue
        if fact.get("predicate") == "written_by" and fact.get("objectText"):
            ans = str(fact["objectText"])
            out.append(
                {
                    "prompt": f"Who is credited on “{title}”?",
                    "choices": [
                        {"id": "a", "text": ans, "correct": True},
                        {"id": "b", "text": "Unknown Traditional"},
                        {"id": "c", "text": "Anonymous Quartet"},
                        {"id": "d", "text": "Studio Collective"},
                    ],
                    "explain": f"Source notes credit {ans}.",
                    "difficulty": 1,
                    "sourceUrl": str(fact.get("sourceUrl") or ""),
                }
            )
            break
        if fact.get("predicate") == "also_known_as" and fact.get("objectText"):
            ans = str(fact["objectText"])
            out.append(
                {
                    "prompt": f"Which is an alternate title related to “{title}”?",
                    "choices": [
                        {"id": "a", "text": ans, "correct": True},
                        {"id": "b", "text": "Green Groves"},
                        {"id": "c", "text": "Midnight Reel"},
                        {"id": "d", "text": "Harbor Waltz"},
                    ],
                    "explain": f"Notes list {ans} as a related/alternate title.",
                    "difficulty": 1,
                    "sourceUrl": "",
                }
            )
            break
    if artist and not out:
        out.append(
            {
                "prompt": f"Which artist is associated with “{title}” in your library notes?",
                "choices": [
                    {"id": "a", "text": artist, "correct": True},
                    {"id": "b", "text": "Unknown Ensemble"},
                    {"id": "c", "text": "Field Recording Club"},
                    {"id": "d", "text": "Session All-Stars"},
                ],
                "explain": f"Your tune lists {artist}.",
                "difficulty": 1,
                "sourceUrl": "",
            }
        )
    return out
