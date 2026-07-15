"""Grounded feed article / quiz generation for the Knowledge Feed."""

from __future__ import annotations

import json
import os
import re
from typing import Any

import httpx

LLM_BASE = os.getenv("RESEARCH_LLM_BASE_URL", "http://host.docker.internal:12340/v1").rstrip("/")
LLM_MODEL = os.getenv("RESEARCH_LLM_MODEL", "")


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").lower()).strip()


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
    model = LLM_MODEL
    if not model:
        async with httpx.AsyncClient(timeout=30.0) as client:
            models = await client.get(f"{LLM_BASE}/models")
            models.raise_for_status()
            data = models.json()
            items = data.get("data") if isinstance(data, dict) else []
            if items:
                model = str(items[0].get("id") or "")
    if not model:
        raise ValueError("No LLM model available")
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0.3,
    }
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(f"{LLM_BASE}/chat/completions", json=payload)
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
        "You write short grounded music news blurbs. "
        "Return JSON {\"items\":[{\"headline\",\"teaser\",\"body\",\"sourceUrl\"}]}. "
        "Use ONLY facts from the provided notes. No invented years or albums."
    )
    user = (
        f"Song: {title}\nArtist: {artist}\nNotes:\n{corpus[:4000]}\n"
        "Write 1-3 short news items (body 80-180 words)."
    )
    try:
        data = await _chat_json(system, user)
    except Exception:
        # Fallback: stitch a local news blurb from corpus
        sentences = re.split(r"(?<=[.!?])\s+", corpus)
        body = " ".join(sentences[:3]).strip()
        if len(body) < 40:
            return {"items": []}
        return {
            "items": [
                {
                    "headline": f"Notes on {title}",
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
        if not body or not headline:
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
