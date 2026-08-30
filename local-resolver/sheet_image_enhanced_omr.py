"""Enhanced sheet OMR: upscale + per-staff homr stitch with full-crop fallback.

Used by /transcribe-sheet-image and by eurosession OMR+ (docker worker).
"""

from __future__ import annotations

import os
import re
import tempfile
from collections import Counter
from typing import Any

from sheet_image_abc_repair import polish_omr_abc
from sheet_image_melody import extract_main_melody_from_musicxml
from sheet_image_omr import ensure_homr_available, transcribe_image_to_musicxml
from sheet_image_staff_detect import detect_staff_regions, write_staff_crop
from sheet_image_structure import (
    KIND_END_REPEAT,
    KIND_START_REPEAT,
    KIND_VOLTA_START,
    annotate_abc_with_structure,
    apply_form_heuristics,
    apply_structure_pipeline_to_abc,
    collapse_uniform_eight_bar_repeats,
    count_abc_bars,
    detect_structure_on_staff_crop,
    infer_voltas_for_long_systems,
)

try:
    import cv2
except ImportError:  # pragma: no cover
    cv2 = None

# 2 systems covers typical 16-bar bourrées (2×8); structure needs per-staff path.
MIN_SYSTEMS_FOR_PER_STAFF = 2
UPSCALE_HEIGHT_THRESHOLD = 1200
UPSCALE_STAFF_HEIGHT_THRESHOLD = 80
UPSCALE_FACTOR = 3
MIN_SYSTEM_BODY_NOTES = 3

_HEADER_PREFIXES = ("X:", "T:", "M:", "L:", "K:", "Q:", "R:", "C:", "Z:", "N:", "%%", "%")
_DECIMAL_DURATION_RE = re.compile(r"[A-Ga-g](?:,*)(?:\'*)\d+\.\d+")
_NOTE_LETTER_RE = re.compile(r"[A-Ga-g]")


def merge_close_bands(bands: list[dict[str, Any]], gap: float = 40.0) -> list[dict[str, Any]]:
    if not bands:
        return []
    ordered = sorted(bands, key=lambda b: float(b.get("top") or 0))
    merged = [dict(ordered[0])]
    for band in ordered[1:]:
        prev = merged[-1]
        if float(band.get("top") or 0) - float(prev.get("bottom") or 0) <= gap:
            prev["bottom"] = max(float(prev.get("bottom") or 0), float(band.get("bottom") or 0))
            prev["lineCount"] = float(prev.get("lineCount") or 0) + float(band.get("lineCount") or 0)
        else:
            merged.append(dict(band))
    return merged


def strip_abc_headers(abc: str) -> list[str]:
    music: list[str] = []
    for line in (abc or "").splitlines():
        if line.startswith(_HEADER_PREFIXES):
            continue
        if line.strip():
            music.append(line.rstrip())
    return music


def _body_note_count(text: str) -> int:
    return len(_NOTE_LETTER_RE.findall(re.sub(r'"[^"\n]*"', "", text or "")))


def _is_rest_only_line(line: str) -> bool:
    """True when a music line has no real notes (only rests / barlines)."""
    cleaned = re.sub(r'"[^"\n]*"', "", line or "")
    if _NOTE_LETTER_RE.search(cleaned):
        return False
    return bool(re.search(r"[zZ|:\]]", cleaned))


def _system_body_usable(lines: list[str]) -> bool:
    joined = "\n".join(lines)
    if _DECIMAL_DURATION_RE.search(joined):
        return False
    if _body_note_count(joined) < MIN_SYSTEM_BODY_NOTES:
        return False
    if all(_is_rest_only_line(ln) for ln in lines):
        return False
    return True


def _abc_has_repeat_structure(abc: str) -> bool:
    return bool(abc and ("|:" in abc or ":|" in abc or re.search(r"\|\d", abc)))


def _prefer_per_staff_stitch(stitched: dict[str, Any], fallback: dict[str, Any] | None) -> bool:
    """Keep per-staff ABC when it carries repeat structure full-crop lacks."""
    if not fallback:
        return True
    stitch_abc = str(stitched.get("abc") or "")
    fb_abc = str(fallback.get("abc") or "")
    if not stitch_abc.strip():
        return False
    stitch_notes = _body_note_count(stitch_abc)
    fb_notes = _body_note_count(fb_abc)
    # Never keep a fragment just because it has |: … :|
    if fb_notes > stitch_notes * 1.2:
        return False
    stitch_struct = _abc_has_repeat_structure(stitch_abc)
    fb_struct = _abc_has_repeat_structure(fb_abc)
    if stitch_struct and not fb_struct and stitch_notes >= max(12, int(fb_notes * 0.65)):
        return True
    if stitch_struct and fb_notes <= stitch_notes * 1.1:
        return True
    if fb_notes > stitch_notes * 1.25:
        return False
    return stitch_notes >= fb_notes * 0.85


def _per_staff_sparse(band_count: int, ok_systems: int) -> bool:
    """True when too few systems succeeded to trust the stitch."""
    if band_count == 2:
        return ok_systems < 2
    if band_count <= 1:
        return ok_systems < 1
    if ok_systems < 2:
        return True
    return band_count >= 3 and ok_systems < max(2, band_count // 2)


def _strip_mid_final_barline(line: str) -> str:
    """Strip bare |] / || mid-tune; never strip :|, |:, |1, |2."""
    s = (line or "").rstrip()
    # Preserve repeat / volta closers that structure detection added.
    if re.search(r":\|\s*$", s):
        return s
    if re.search(r"\|:\s*$", s):
        return s
    if re.search(r"\|\d+\s*$", s):
        return s
    s = re.sub(r"\|\]\s*$", "|", s)
    s = re.sub(r"\|\|\s*$", "|", s)
    return s


def _choose_meter(meters: list[str], band_count: int) -> str:
    """Majority meter; prefer a repeated non-4/4 when HOMR spuriously votes 4/4.

    Also prefer compound/odd meters (3/8, 6/8, 9/8, 12/8, 2/2, 3/4) when they
    appear at least once on multi-system pages dominated by a bogus 2/4/4/4.
    """
    cleaned = [m for m in meters if m]
    if not cleaned:
        return "2/4"
    meter_counts = Counter(cleaned)
    out_meter = meter_counts.most_common(1)[0][0]
    non44 = Counter(m for m in cleaned if m != "4/4")
    if out_meter == "4/4" and non44:
        alt, alt_n = non44.most_common(1)[0]
        # Prefer alternate when it appears at least twice, or on multi-system pages.
        if alt_n >= 2 or (band_count >= 2 and alt_n >= 1):
            return alt
    if out_meter == "4/4" and band_count >= 4:
        return "2/4"
    # Multi-system: a single clear odd/compound vote beats repeated 2/4 noise.
    interesting = {"3/8", "6/8", "9/8", "12/8", "5/8", "7/8", "2/2", "3/4", "5/4"}
    odd = Counter(m for m in cleaned if m in interesting)
    if band_count >= 2 and odd and out_meter in {"2/4", "4/4"}:
        alt, alt_n = odd.most_common(1)[0]
        if alt_n >= 1 and (alt_n >= meter_counts.get(out_meter, 0) or band_count >= 2):
            return alt
    return out_meter


def _choose_key(keys: list[str], band_count: int) -> str:
    """Majority key vote; prefer minor when multi-system pages mix major/minor."""
    key_counts = Counter(k for k in keys if k)
    if not key_counts:
        return "C"
    out_key = key_counts.most_common(1)[0][0]

    minor_norm: Counter[str] = Counter()
    for k in keys:
        if not k:
            continue
        compact = k.replace(" ", "")
        kl = compact.lower()
        root_m = re.match(r"^([A-Ga-g][#b]?)", compact)
        if not root_m:
            continue
        root = root_m.group(1).upper()
        if kl.endswith("minor") or re.fullmatch(r"[a-g][#b]?m", kl) or (
            re.fullmatch(r"[A-G][#b]?m", compact) and not compact.endswith("maj")
        ):
            minor_norm[root + "m"] += 1

    is_majorish = bool(re.fullmatch(r"[A-G][#b]?", out_key or ""))
    # Multi-system pages (incl. 2×8 bourrées): HOMR often emits relative major.
    # Prefer any clear minor vote when enough systems are present.
    if band_count >= 2 and is_majorish and minor_norm:
        return minor_norm.most_common(1)[0][0]
    if minor_norm and minor_norm.most_common(1)[0][1] > key_counts.get(out_key, 0):
        return minor_norm.most_common(1)[0][0]
    return out_key


def _normalize_key_token(key: str) -> str:
    """Compact HOMR key strings to ABC-ish tokens (Am, G, F#m)."""
    compact = (key or "").replace(" ", "").strip()
    if not compact:
        return ""
    kl = compact.lower()
    root_m = re.match(r"^([A-Ga-g][#b]?)", compact)
    if not root_m:
        return compact
    root = root_m.group(1).upper()
    if kl.endswith("minor") or re.search(r"[a-g][#b]?m$", kl) or (
        re.fullmatch(r"[A-G][#b]?m", compact) and not compact.lower().endswith("maj")
    ):
        return root + "m"
    if kl.endswith("major") or kl.endswith("maj"):
        return root
    if re.fullmatch(r"[A-G][#b]?", compact):
        return root
    return compact


def _keys_disagree_strongly(a: str, b: str) -> bool:
    """True when adjacent systems likely need a mid-tune K: (not relative-major noise)."""
    na, nb = _normalize_key_token(a), _normalize_key_token(b)
    if not na or not nb or na == nb:
        return False
    # Relative major/minor pairs (C↔Am, G↔Em, …) are HOMR noise — do not emit.
    rel = {
        "C": "Am",
        "G": "Em",
        "D": "Bm",
        "A": "F#m",
        "E": "C#m",
        "F": "Dm",
        "Bb": "Gm",
        "Eb": "Cm",
    }
    if rel.get(na) == nb or rel.get(nb) == na:
        return False
    return True


def _system_key_meter_divergence(keys: list[str], meters: list[str]) -> dict[str, Any]:
    """Mid-tune diagnostics when adjacent systems disagree on key/meter."""
    changes: list[dict[str, Any]] = []
    for i in range(1, max(len(keys), len(meters))):
        prev_k = keys[i - 1] if i - 1 < len(keys) else ""
        cur_k = keys[i] if i < len(keys) else ""
        prev_m = meters[i - 1] if i - 1 < len(meters) else ""
        cur_m = meters[i] if i < len(meters) else ""
        if prev_k and cur_k and prev_k != cur_k:
            changes.append({"systemIndex": i, "kind": "key", "from": prev_k, "to": cur_k})
        if prev_m and cur_m and prev_m != cur_m:
            changes.append({"systemIndex": i, "kind": "meter", "from": prev_m, "to": cur_m})
    return {
        "systemKeys": list(keys),
        "systemMeters": list(meters),
        "changes": changes,
        "hasMidTuneChange": bool(changes),
    }


def _maybe_upscale(
    image_path: str,
    work_dir: str | None,
    *,
    upscale_h: int = UPSCALE_HEIGHT_THRESHOLD,
    upscale_staff: int = UPSCALE_STAFF_HEIGHT_THRESHOLD,
    factor: int = UPSCALE_FACTOR,
) -> tuple[str, Any, list[dict[str, Any]], bool]:
    """Return (path, bgr_image, merged_bands, upscaled)."""
    if cv2 is None:
        raise RuntimeError("opencv is required for enhanced OMR")
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Could not read image: {image_path}")
    height, width = img.shape[:2]
    info = detect_staff_regions(image_path)
    bands = merge_close_bands(list(info.get("staffRegions") or []), gap=max(30, height // 40))
    avg_staff_h = 0.0
    if bands:
        avg_staff_h = sum(float(b["bottom"]) - float(b["top"]) for b in bands) / len(bands)

    upscaled = False
    work_path = image_path
    if height < upscale_h or (avg_staff_h and avg_staff_h < upscale_staff):
        img = cv2.resize(img, (width * factor, height * factor), interpolation=cv2.INTER_CUBIC)
        height, width = img.shape[:2]
        upscaled = True
        if work_dir:
            work_path = os.path.join(work_dir, "enhanced-upscaled.png")
            cv2.imwrite(work_path, img)
        else:
            fd, work_path = tempfile.mkstemp(suffix=".png", prefix="enh-up-")
            os.close(fd)
            cv2.imwrite(work_path, img)
        info = detect_staff_regions(work_path)
        bands = merge_close_bands(list(info.get("staffRegions") or []), gap=max(30, height // 40))
    return work_path, img, bands, upscaled


def _load_image_bands(image_path: str) -> tuple[Any, list[dict[str, Any]]]:
    """Load BGR image and merged staff bands at native resolution."""
    if cv2 is None:
        raise RuntimeError("opencv is required for enhanced OMR")
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Could not read image: {image_path}")
    height = img.shape[0]
    info = detect_staff_regions(image_path)
    bands = merge_close_bands(list(info.get("staffRegions") or []), gap=max(30, height // 40))
    return img, bands


def _ordered_pad_attempts(band: dict[str, Any]) -> list[tuple[int, int]]:
    """Vertical padding trials for system crops — short bands need more context."""
    band_h = float(band.get("bottom") or 0) - float(band.get("top") or 0)
    if band_h < 70:
        return [(36, 24), (48, 32), (28, 20), (18, 12), (12, 8)]
    if band_h < 100:
        return [(28, 20), (36, 24), (18, 12), (48, 32), (12, 8)]
    return [(18, 12), (28, 20), (36, 24), (48, 32), (12, 8)]


def _transcribe_system_band(
    img: Any,
    band: dict[str, Any],
    *,
    height: int,
    width: int,
    crop_path: str,
) -> tuple[str, dict[str, Any], list[str], list[Any], int, str, str | None]:
    """Run HOMR on a staff band, retrying with larger crops when homr fails."""
    last_error: str | None = None
    for pad_top, pad_bot in _ordered_pad_attempts(band):
        top = max(0, int(band["top"]) - pad_top)
        bot = min(height, int(band["bottom"]) + pad_bot)
        crop = img[top:bot, 0:width]
        cv2.imwrite(crop_path, crop)
        try:
            musicxml = transcribe_image_to_musicxml(crop_path)
            melody = extract_main_melody_from_musicxml(musicxml)
            abc = str(melody.get("abc") or "").strip()
            lines = strip_abc_headers(abc)
            if not abc or not _system_body_usable(lines):
                last_error = "rest-only-or-weak"
                continue
            bar_count = count_abc_bars(abc) or max(1, len(re.findall(r"\|+", "\n".join(lines))))
            structure_events: list[Any] = []
            try:
                structure_events = detect_structure_on_staff_crop(crop_path, bar_count)
            except Exception:
                structure_events = []
            return abc, melody, lines, structure_events, bar_count, musicxml, None
        except Exception as exc:
            last_error = str(exc)[:200]
    return "", {}, [], [], 0, "", last_error


def _per_staff_stitch(
    img: Any,
    bands: list[dict[str, Any]],
    work_dir: str | None,
    title: str,
    upscaled: bool,
) -> dict[str, Any] | None:
    if cv2 is None or not bands:
        return None
    height, width = img.shape[:2]
    results: list[dict[str, Any]] = []
    kept_raw: list[dict[str, Any]] = []
    meters: list[str] = []
    keys: list[str] = []
    musicxml_parts: list[str] = []

    tmp_ctx = tempfile.TemporaryDirectory(prefix="enh-sys-") if not work_dir else None
    sys_dir = work_dir if work_dir else tmp_ctx.name  # type: ignore[union-attr]
    if work_dir:
        os.makedirs(work_dir, exist_ok=True)
    try:
        for i, band in enumerate(bands):
            crop_path = os.path.join(sys_dir, f"enhanced-system-{i + 1:02d}.png")
            abc, melody, lines, structure_events, bar_count, musicxml, err = _transcribe_system_band(
                img,
                band,
                height=height,
                width=width,
                crop_path=crop_path,
            )
            usable = bool(abc)
            if usable:
                if melody.get("meter"):
                    meters.append(str(melody.get("meter") or ""))
                if melody.get("key"):
                    keys.append(str(melody.get("key") or ""))
                kept_raw.append(
                    {
                        "abc": abc,
                        "lines": lines,
                        "barCount": bar_count,
                        "events": structure_events,
                        "cropPath": crop_path,
                    }
                )
            results.append(
                {
                    "index": i + 1,
                    "ok": usable,
                    "abcLen": len(abc),
                    "noteCount": _body_note_count("\n".join(lines)) if lines else 0,
                    "barCount": bar_count if usable else None,
                    "structureEvents": [e.to_dict() for e in structure_events],
                    "skipped": err if not usable else None,
                    **({"error": err} if err and not usable and err != "rest-only-or-weak" else {}),
                }
            )
            if usable and musicxml:
                musicxml_parts.append(musicxml)

        if not kept_raw:
            return {
                "mode": "full-crop-fallback",
                "reason": "per-staff-empty",
                "bandCount": len(bands),
                "upscaled": upscaled,
                "systems": results,
                "okSystems": 0,
                "abc": "",
            }

        bar_counts = [int(k["barCount"] or 0) for k in kept_raw]
        event_lists = [list(k["events"]) for k in kept_raw]
        volta_hint = any(
            e.kind == KIND_VOLTA_START for evs in event_lists for e in evs
        )
        # Also treat OCR digit hints on last system as volta hint for heuristic.
        if not volta_hint and kept_raw:
            last_ev = event_lists[-1]
            volta_hint = any(e.kind == KIND_VOLTA_START for e in last_ev)
        heuristic_applied = False
        any_cv_repeat = any(
            e.kind in {KIND_START_REPEAT, KIND_END_REPEAT} and e.source == "cv"
            for evs in event_lists
            for e in evs
        )
        if not any_cv_repeat:
            new_lists = apply_form_heuristics(bar_counts, event_lists, volta_hint=volta_hint)
            if any(new_lists[i] != event_lists[i] for i in range(len(event_lists))):
                event_lists = new_lists
                heuristic_applied = True

        event_lists = collapse_uniform_eight_bar_repeats(bar_counts, event_lists)

        chosen_meter = _choose_meter(meters, len(bands))
        # 10-bar systems with outer repeats but no OCR voltas → 1st/2nd endings.
        volta_lists = infer_voltas_for_long_systems(bar_counts, event_lists, meter=chosen_meter)
        if any(volta_lists[i] != event_lists[i] for i in range(len(event_lists))):
            event_lists = volta_lists
            heuristic_applied = True

        kept_systems: list[list[str]] = []
        all_structure: list[dict[str, Any]] = []
        structure_source = "none"
        ok_result_indices = [j for j, r in enumerate(results) if r.get("ok")]
        for i, raw in enumerate(kept_raw):
            events = event_lists[i]
            annotated = annotate_abc_with_structure(str(raw["abc"]), events)
            lines = strip_abc_headers(annotated)
            kept_systems.append(lines)
            for e in events:
                all_structure.append({**e.to_dict(), "systemIndex": i})
                if e.source == "cv":
                    structure_source = "cv"
                elif e.source == "alt" and structure_source != "cv":
                    structure_source = "alt"
                elif e.source == "heuristic" and structure_source == "none":
                    structure_source = "heuristic"
            if i < len(ok_result_indices):
                results[ok_result_indices[i]]["structureEvents"] = [e.to_dict() for e in events]

        if heuristic_applied and structure_source == "none":
            structure_source = "heuristic"

        out_meter = chosen_meter
        out_key = _choose_key(keys, len(bands))
        km_diag = _system_key_meter_divergence(keys, meters)

        # Strip mid-tune |] and join systems; emit per-system K:/M: on strong flips.
        body_lines: list[str] = []
        prev_emitted_key = out_key
        prev_emitted_meter = out_meter
        for si, lines in enumerate(kept_systems):
            sys_key = keys[si] if si < len(keys) else ""
            sys_meter = meters[si] if si < len(meters) else ""
            if (
                si > 0
                and sys_meter
                and prev_emitted_meter
                and sys_meter != prev_emitted_meter
            ):
                body_lines.append(f"M:{sys_meter}")
                prev_emitted_meter = sys_meter
                km_diag.setdefault("emittedMidTuneMeters", []).append(
                    {"systemIndex": si, "meter": sys_meter}
                )
            if (
                si > 0
                and sys_key
                and prev_emitted_key
                and _normalize_key_token(sys_key) != _normalize_key_token(prev_emitted_key)
                and _keys_disagree_strongly(prev_emitted_key, sys_key)
            ):
                body_lines.append(f"K:{_normalize_key_token(sys_key)}")
                prev_emitted_key = sys_key
                km_diag.setdefault("emittedMidTuneKeys", []).append(
                    {"systemIndex": si, "key": _normalize_key_token(sys_key)}
                )
            is_last = si == len(kept_systems) - 1
            for li, line in enumerate(lines):
                out_line = line if (is_last and li == len(lines) - 1) else _strip_mid_final_barline(line)
                if out_line.strip() and not _is_rest_only_line(out_line):
                    body_lines.append(out_line)

        if not body_lines:
            return {
                "mode": "full-crop-fallback",
                "reason": "per-staff-empty",
                "bandCount": len(bands),
                "upscaled": upscaled,
                "systems": results,
                "okSystems": 0,
                "abc": "",
            }

        warnings: list[str] = []
        if km_diag.get("hasMidTuneChange"):
            warnings.append("mid_tune_key_or_meter_change")
        if km_diag.get("emittedMidTuneKeys"):
            warnings.append("emitted_mid_tune_key")
        if km_diag.get("emittedMidTuneMeters"):
            warnings.append("emitted_mid_tune_meter")
        stitched = "\n".join(
            [
                f"M:{out_meter}",
                "L:1/4",
                f"K:{out_key}",
            ]
            + body_lines
        )
        ok_systems = sum(1 for r in results if r.get("ok"))
        kind_counts: dict[str, int] = {}
        for e in all_structure:
            kind_counts[e["kind"]] = kind_counts.get(e["kind"], 0) + 1
        return {
            "abc": stitched,
            "musicXml": "\n".join(musicxml_parts) if musicxml_parts else "",
            "key": out_key,
            "meter": out_meter,
            "warnings": warnings,
            "partName": "enhanced-per-staff",
            "confidence": 0.8 if ok_systems >= max(2, len(bands) // 2) else 0.65,
            "source": "homr",
            "staffCropUsed": True,
            "structureEvents": all_structure,
            "structureSource": structure_source,
            "structureKindCounts": kind_counts,
            "keyMeterDiagnostics": km_diag,
            "enhancedOmr": {
                "mode": "per-staff",
                "upscaled": upscaled,
                "bandCount": len(bands),
                "okSystems": ok_systems,
                "systems": results,
                "title": title or "",
                "structureSource": structure_source,
                "structureEvents": all_structure,
                "structureKindCounts": kind_counts,
                "heuristicApplied": heuristic_applied,
                "keyMeterDiagnostics": km_diag,
            },
            "mode": "per-staff",
            "upscaled": upscaled,
            "bandCount": len(bands),
            "okSystems": ok_systems,
            "systems": results,
        }
    finally:
        if tmp_ctx is not None:
            tmp_ctx.cleanup()


def _full_crop_melody(
    image_path: str,
    work_dir: str | None,
    *,
    upscaled: bool,
    reason: str,
    title: str = "",
    omr_path_override: str | None = None,
    per_staff_structure: list[dict[str, Any]] | None = None,
) -> dict[str, Any] | None:
    if not ensure_homr_available():
        return None
    omr_path = omr_path_override or image_path
    staff_crop_used = omr_path != image_path
    if not staff_crop_used and work_dir:
        staff_info = detect_staff_regions(image_path)
        crop_path = write_staff_crop(image_path, work_dir, staff_info=staff_info)
        if crop_path:
            omr_path = crop_path
            staff_crop_used = True
    musicxml = transcribe_image_to_musicxml(omr_path)
    melody = extract_main_melody_from_musicxml(musicxml)
    abc = str(melody.get("abc") or "").strip()
    meter = str(melody.get("meter") or "")
    if abc:
        structured_abc, structure_events, structure_source = apply_structure_pipeline_to_abc(
            abc,
            omr_path,
            meter=meter,
            per_staff_event_dicts=per_staff_structure,
            single_system=True,
        )
        abc = structured_abc
        melody["abc"] = abc
        melody["structureEvents"] = structure_events
        melody["structureSource"] = structure_source
    abc, repair_warnings = polish_omr_abc(abc, title=title)
    melody["abc"] = abc
    melody["source"] = "homr"
    melody["staffCropUsed"] = staff_crop_used
    melody["mode"] = "full-crop" if reason == "too-few-systems" else f"full-crop-after-{reason}"
    melody["upscaled"] = upscaled
    warnings = list(melody.get("warnings") or [])
    warnings.extend(repair_warnings)
    melody["warnings"] = list(dict.fromkeys(warnings))
    melody["enhancedOmr"] = {
        "mode": melody["mode"],
        "upscaled": upscaled,
        "bandCount": None,
        "okSystems": None,
        "reason": reason,
        "structureEvents": melody.get("structureEvents") or [],
        "structureSource": melody.get("structureSource") or "none",
    }
    return melody


def _stitch_structure_events(stitched: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not stitched:
        return []
    events = stitched.get("structureEvents")
    if isinstance(events, list) and events:
        return [e for e in events if isinstance(e, dict)]
    enh = stitched.get("enhancedOmr")
    if isinstance(enh, dict) and isinstance(enh.get("structureEvents"), list):
        return [e for e in enh["structureEvents"] if isinstance(e, dict)]
    return []


def _merge_fallback_structure(
    fallback: dict[str, Any],
    stitched: dict[str, Any] | None,
    *,
    image_path: str,
    title: str,
) -> dict[str, Any]:
    """Re-apply structure using per-staff events when full-crop lacks repeat marks."""
    if not fallback or not stitched:
        return fallback
    fb_abc = str(fallback.get("abc") or "")
    if _abc_has_repeat_structure(fb_abc):
        return fallback
    stitch_events = _stitch_structure_events(stitched)
    if not stitch_events:
        return fallback
    meter = str(fallback.get("meter") or stitched.get("meter") or "")
    structured, events, source = apply_structure_pipeline_to_abc(
        fb_abc,
        image_path,
        meter=meter,
        per_staff_event_dicts=stitch_events,
        single_system=True,
    )
    if not _abc_has_repeat_structure(structured):
        return fallback
    polished, warnings = polish_omr_abc(structured, title=title)
    merged = dict(fallback)
    merged["abc"] = polished
    merged["structureEvents"] = events
    merged["structureSource"] = source
    merged["warnings"] = list(dict.fromkeys(list(merged.get("warnings") or []) + warnings))
    enh = dict(merged.get("enhancedOmr") or {})
    enh["structureEvents"] = events
    enh["structureSource"] = source
    enh["mergedPerStaffStructure"] = True
    merged["enhancedOmr"] = enh
    return merged


def extract_enhanced_melody(
    image_path: str,
    *,
    work_dir: str | None = None,
    title: str = "",
    min_systems: int = MIN_SYSTEMS_FOR_PER_STAFF,
    upscale_h: int = UPSCALE_HEIGHT_THRESHOLD,
    upscale_staff: int = UPSCALE_STAFF_HEIGHT_THRESHOLD,
    factor: int = UPSCALE_FACTOR,
) -> dict[str, Any] | None:
    """Run enhanced OMR and return a melody dict compatible with _extract_melody.

    Per-staff HOMR runs on **native** crops first — upscaling small bourrée pages
    before per-staff stitch often breaks homr on system crops. Upscaled full-crop
    is kept as fallback when native per-staff is empty or clearly weaker.
    """
    if not ensure_homr_available():
        return None
    if cv2 is None:
        return _full_crop_melody(image_path, work_dir, upscaled=False, reason="opencv-unavailable", title=title)

    cleanup_upscale: str | None = None
    try:
        img_native, bands_native = _load_image_bands(image_path)

        native_stitch: dict[str, Any] | None = None
        if len(bands_native) >= min_systems:
            native_stitch = _per_staff_stitch(
                img_native, bands_native, work_dir, title, upscaled=False
            )

        work_path, _img_up, _bands_up, upscaled = _maybe_upscale(
            image_path,
            work_dir,
            upscale_h=upscale_h,
            upscale_staff=upscale_staff,
            factor=factor,
        )
        if upscaled and not work_dir:
            cleanup_upscale = work_path

        def _full_crop(reason: str) -> dict[str, Any] | None:
            crop_path = work_path if upscaled else image_path
            stitch_events = _stitch_structure_events(native_stitch)
            result = _full_crop_melody(
                crop_path,
                work_dir,
                upscaled=upscaled,
                reason=reason,
                title=title,
                per_staff_structure=stitch_events or None,
            )
            if result and native_stitch:
                result = _merge_fallback_structure(
                    result,
                    native_stitch,
                    image_path=crop_path,
                    title=title,
                )
            return result

        if len(bands_native) < min_systems:
            return _full_crop("too-few-systems")

        if native_stitch and str(native_stitch.get("abc") or "").strip():
            ok_systems = int(native_stitch.get("okSystems") or 0)
            band_count = int(native_stitch.get("bandCount") or len(bands_native))
            stitch_notes = _body_note_count(str(native_stitch.get("abc") or ""))
            sparse = _per_staff_sparse(band_count, ok_systems)
            fallback = _full_crop("weak-per-staff-compare")
            accept_native = not sparse and stitch_notes >= 8
            if accept_native and fallback and not _prefer_per_staff_stitch(native_stitch, fallback):
                return fallback
            if accept_native:
                enh = native_stitch.setdefault("enhancedOmr", {})
                if isinstance(enh, dict):
                    enh["nativeResolution"] = True
                polished, warnings = polish_omr_abc(str(native_stitch.get("abc") or ""), title=title)
                native_stitch["abc"] = polished
                native_stitch["warnings"] = list(
                    dict.fromkeys(list(native_stitch.get("warnings") or []) + warnings)
                )
                return native_stitch
            if fallback:
                fb_notes = _body_note_count(str(fallback.get("abc") or ""))
                if sparse or stitch_notes < 8 or fb_notes > stitch_notes:
                    return fallback

        reason = str((native_stitch or {}).get("reason") or "per-staff-empty")
        return _full_crop(reason)
    finally:
        if cleanup_upscale and os.path.isfile(cleanup_upscale):
            try:
                os.unlink(cleanup_upscale)
            except OSError:
                pass
