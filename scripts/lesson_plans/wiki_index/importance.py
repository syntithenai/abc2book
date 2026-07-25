"""Pedagogical importance scoring for wiki articles."""

from __future__ import annotations

import re

# High-value article shapes for a broad music student.
CONCEPT_TITLE_RE = re.compile(
    r"\b(scale|chord|interval|harmony|mode|tempo|notation|theory|tuning|rhythm|"
    r"cadence|counterpoint|form|texture|symphony|concerto|sonata|fugue|"
    r"maqam|makam|ornament|articulation|dynamics|meter|triad|seventh)\b",
    re.I,
)
GENRE_TITLE_RE = re.compile(
    r"\b(music|genre|style|rock|jazz|blues|folk|classical|metal|punk|"
    r"country|soul|funk|reggae|disco|techno|house|swing|celtic|irish|"
    r"baroque|romantic|medieval|renaissance)\b",
    re.I,
)
INSTRUMENT_TITLE_RE = re.compile(
    r"\b(violin|fiddle|guitar|piano|flute|whistle|pipe|harp|drum|bodhrán|"
    r"organ|cello|bass|trumpet|trombone|saxophone|clarinet|oboe|banjo|"
    r"mandolin|accordion|concertina|bagpipe|uilleann|instrument)\b",
    re.I,
)
DANCE_TITLE_RE = re.compile(
    r"\b(dance|ballet|jig|reel|hornpipe|waltz|polka|stepdance|ceili)\b",
    re.I,
)
REGIONAL_TITLE_RE = re.compile(
    r"^(Music of |Folk music of |Traditional music of |Dance of |"
    r"History of music in )",
    re.I,
)
PERIOD_TITLE_RE = re.compile(
    r"\b(medieval|renaissance|baroque|classical era|romantic|twentieth century|"
    r"ancient|period|era)\b",
    re.I,
)

# Deprioritize or exclude from lesson retrieval.
PEOPLE_TITLE_RE = re.compile(
    r"\((musician|composer|singer|conductor|rapper|producer|songwriter|"
    r"guitarist|violinist|pianist|drummer|bassist|DJ)\)",
    re.I,
)
WORK_TITLE_RE = re.compile(
    r"\((album|song|single|film|video|ballet|opera|EP|mixtape|soundtrack)\)",
    re.I,
)
AWARD_TITLE_RE = re.compile(r"\b(Award|Awards|Grammy|Billboard|Eurovision|Hall of Fame)\b", re.I)
PEOPLE_LIST_RE = re.compile(
    r"^List of .*(musicians|singers|composers|artists|rappers|bands|people|"
    r"guitarists|drummers|producers|award)",
    re.I,
)
USEFUL_LIST_RE = re.compile(
    r"^List of .*(genres|instruments|theor|chord|scale|dance|symphon|period|"
    r"music festivals|terminology)",
    re.I,
)
YEAR_CHRONICLE_RE = re.compile(r"^\d{4} in .+ music$|^Irish folk music \(\d{4}", re.I)
RECORD_LABEL_RE = re.compile(r"\(record label\)|\bRecords$", re.I)
INSTITUTION_NOISE_RE = re.compile(
    r"\b(Rights Organisation|Recorded Music Association|Television Awards|"
    r"Music Hall of Fame|concert tour|Opera Company|Record label)\b",
    re.I,
)


def score_article(title: str, topic_folder: str, categories: list[str] | None = None) -> float:
    """
    Return 0.0–1.0 pedagogical importance. Articles below ~0.25 are indexed but
    excluded from default lesson retrieval.
    """
    cats = " ".join(categories or [])
    text = f"{title} {cats}".lower()

    if PEOPLE_LIST_RE.match(title) or YEAR_CHRONICLE_RE.match(title):
        return 0.05
    if RECORD_LABEL_RE.search(title) or INSTITUTION_NOISE_RE.search(title):
        return 0.08
    if WORK_TITLE_RE.search(title) or AWARD_TITLE_RE.search(title):
        return 0.1
    if PEOPLE_TITLE_RE.search(title):
        return 0.12

    score = 0.35

    if REGIONAL_TITLE_RE.match(title):
        score = 0.92
    elif title in {
        "Music of Ireland",
        "Irish traditional music",
        "Scottish folk music",
        "Celtic music",
    }:
        score = 0.9
    elif CONCEPT_TITLE_RE.search(title) and topic_folder == "theory":
        score = 0.88
    elif INSTRUMENT_TITLE_RE.search(title) and topic_folder == "instruments":
        score = 0.85
    elif GENRE_TITLE_RE.search(title) and topic_folder in ("history", "theory"):
        score = 0.8
    elif DANCE_TITLE_RE.search(title) and topic_folder == "dance":
        score = 0.82
    elif PERIOD_TITLE_RE.search(title):
        score = 0.75
    elif USEFUL_LIST_RE.match(title):
        score = 0.7
    elif topic_folder == "theory" and CONCEPT_TITLE_RE.search(title):
        score = 0.78
    elif topic_folder == "instruments":
        score = 0.55
    elif topic_folder == "dance":
        score = 0.5
    elif topic_folder == "history" and GENRE_TITLE_RE.search(title):
        score = 0.65

    # Penalize likely person names (two capitalized words, no concept keywords).
    if re.match(r"^[A-Z][a-z]+ [A-Z][a-z]+$", title) and not GENRE_TITLE_RE.search(title):
        if not INSTRUMENT_TITLE_RE.search(title) and not CONCEPT_TITLE_RE.search(title):
            score = min(score, 0.15)

    if title.startswith("List of") and not USEFUL_LIST_RE.match(title):
        score = min(score, 0.2)

    return round(min(1.0, max(0.0, score)), 3)
