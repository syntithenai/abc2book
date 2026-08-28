#!/usr/bin/env python3
"""Re-run OMR + chord OCR for incomplete EuroSession tunes; inject OMR+ candidates.

OMR+ = fresh local homr melody + quote-chords from staff-top OCR.
Never auto-selects OMR+; leaves the user's current selection alone.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "local-resolver"))

from extract_chords_to_abc import (  # noqa: E402
    align_chords_to_abc,
    candidate_id,
    chord_count,
    filter_chord_boxes,
)
from enhanced_omr import enhanced_omr  # noqa: E402
from omr_and_lookup import (  # noqa: E402
    abc_quality_warnings,
    ensure_x_header,
    looks_weak_abc,
)
from repair_abc import normalize_transpose_in_abc, repair_omr_abc  # noqa: E402
from sheet_image_enhanced_omr import merge_close_bands  # noqa: E402
from sheet_image_staff_detect import detect_staff_regions  # noqa: E402
from split_by_titles import find_tesseract, tesseract_ocr_boxes  # noqa: E402

OMR_PLUS_SOURCE = "omr+"


def load_title_seed_map(join_path: Path) -> dict[str, dict]:
    """import_title → {seedKey, seedMeter, …} from MSCZ/MXL join (offline)."""
    if not join_path.is_file():
        return {}
    rows = json.loads(join_path.read_text(encoding="utf-8"))
    out: dict[str, dict] = {}
    for row in rows if isinstance(rows, list) else []:
        title = str(row.get("import_title") or "").strip()
        match = row.get("match") or {}
        if not title or not match:
            continue
        seed: dict = {}
        if match.get("seedKey"):
            seed["key"] = str(match["seedKey"])
        if match.get("seedMeter"):
            seed["meter"] = str(match["seedMeter"])
        elif match.get("mxlMeter"):
            seed["meter"] = str(match["mxlMeter"])
        if seed:
            out[title] = seed
    return out


def load_incomplete_crops(import_path: Path) -> dict[str, dict]:
    """Map crop basename → import tune row for incomplete entries."""
    data = json.loads(import_path.read_text(encoding="utf-8"))
    out: dict[str, dict] = {}
    for tune in data.get("tunes") or []:
        if tune.get("complete"):
            continue
        crop = Path(str(tune.get("crop") or "")).name
        if crop:
            out[crop] = tune
    return out


def load_crops_by_keys(import_path: Path, keys: set[str]) -> dict[str, dict]:
    """Map crop basename → import row for explicit keys (complete or not)."""
    data = json.loads(import_path.read_text(encoding="utf-8"))
    out: dict[str, dict] = {}
    for tune in data.get("tunes") or []:
        if str(tune.get("key") or "") not in keys:
            continue
        crop = Path(str(tune.get("crop") or "")).name
        if crop:
            out[crop] = tune
    return out


def resolve_crop(entry: dict, work: Path) -> Path | None:
    crop_rel = entry.get("cropPath") or ""
    crop = Path(crop_rel) if crop_rel else None
    if crop and not crop.is_absolute():
        crop = work / crop
    if crop and crop.is_file():
        return crop
    page = int(entry.get("page") or 0)
    ti = int(entry.get("tuneIndex") or 0)
    matches = list((work / "tunes").glob(f"p{page:02d}_{ti:02d}_*.jpg"))
    if matches:
        return matches[0]
    # basename fallback
    name = Path(str(crop_rel)).name
    if name:
        alt = work / "tunes" / name
        if alt.is_file():
            return alt
    return None


def chord_overlay(
    melody_abc: str,
    crop: Path,
    tesseract_bin: str,
    lang: str,
    *,
    system_count_hint: int | None = None,
    system_bar_counts: list[int] | None = None,
) -> tuple[str, dict]:
    """Return (abc_with_chords_or_melody, status). Always returns usable ABC."""
    status: dict = {"reason": "melody-only"}
    try:
        staff_info = detect_staff_regions(str(crop))
    except Exception as exc:
        status["reason"] = f"staff-detect-failed:{exc}"
        return melody_abc, status

    raw_bands = list(staff_info.get("staffRegions") or [])
    # Merge fragmentary bands so chord zones match real systems / enhanced OMR.
    image_height = 0.0
    if raw_bands:
        image_height = max(float(b.get("bottom") or 0) for b in raw_bands) + 40
    gap = max(30.0, image_height / 40.0) if image_height else 40.0
    bands = merge_close_bands(raw_bands, gap=gap)

    # Upscale small crops for chord OCR (MXL pages often have tiny chord glyphs).
    ocr_crop = crop
    scale = 1.0
    ocr_img = None
    try:
        import cv2  # type: ignore

        img = cv2.imread(str(crop))
        if img is not None:
            h, w = img.shape[:2]
            if h < 1400 or (bands and (float(bands[0].get("bottom") or 0) - float(bands[0].get("top") or 0)) < 90):
                scale = 2.0
                img2 = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_CUBIC)
                tmp = crop.with_name(crop.stem + ".chord-ocr.png")
                cv2.imwrite(str(tmp), img2)
                ocr_crop = tmp
                ocr_img = img2
                bands = [
                    {
                        **b,
                        "top": float(b.get("top") or 0) * scale,
                        "bottom": float(b.get("bottom") or 0) * scale,
                        "left": float(b.get("left") or 0) * scale,
                        "right": float(b.get("right") or 0) * scale,
                    }
                    for b in bands
                ]
                image_height *= scale
            else:
                ocr_img = img
    except Exception:
        scale = 1.0
        ocr_crop = crop

    boxes = list(tesseract_ocr_boxes(ocr_crop, tesseract_bin, lang))
    # Second full-page pass (sparse text) + per-band chord-strip OCR for recall.
    boxes.extend(_chord_strip_ocr_boxes(ocr_img, bands, tesseract_bin, lang))
    for b in boxes:
        image_height = max(image_height, float(b.get("y") or 0) + float(b.get("height") or 0))
    chord_boxes = filter_chord_boxes(
        boxes, bands, image_height or 1000.0, lone_root_min_conf=0.55
    )
    chord_boxes = _dedupe_chord_boxes(chord_boxes)
    if bands:
        staff_left = min(float(b.get("left") or 0) for b in bands)
        staff_right = max(float(b.get("right") or 0) for b in bands)
    else:
        staff_left = 0.0
        staff_right = max(
            (float(b.get("x") or 0) + float(b.get("width") or 0) for b in boxes),
            default=1000.0,
        )

    hint = system_count_hint
    if hint is None and bands:
        hint = len(bands)

    # Looser gate than omr-chords — OMR+ should still surface when a few chords land.
    chorded, status = align_chords_to_abc(
        melody_abc,
        chord_boxes,
        staff_left,
        staff_right,
        min_placed=1,
        min_mapped=0.25,
        min_chord_boxes=1,
        system_count_hint=hint,
        system_bar_counts=system_bar_counts,
        clef_pad_frac=0.14,
    )
    status["chordOcrScale"] = scale
    status["ocrChordBoxes"] = len(chord_boxes)
    if ocr_crop != crop and ocr_crop.is_file():
        try:
            ocr_crop.unlink()
        except OSError:
            pass
    if chorded:
        return chorded, status
    return melody_abc, status


def _dedupe_chord_boxes(boxes: list[dict]) -> list[dict]:
    """Keep highest-confidence box per near-duplicate (x,y,chord)."""
    kept: list[dict] = []
    for c in sorted(boxes, key=lambda x: -float(x.get("confidence") or 0)):
        cx = float(c.get("cx") or 0)
        cy = float(c.get("y") or 0) + float(c.get("height") or 0) / 2.0
        chord = str(c.get("chord") or "")
        if any(
            abs(cx - float(d.get("cx") or 0)) < 28
            and abs(cy - (float(d.get("y") or 0) + float(d.get("height") or 0) / 2.0)) < 36
            and str(d.get("chord") or "") == chord
            for d in kept
        ):
            continue
        kept.append(c)
    return kept


def _chord_strip_ocr_boxes(
    ocr_img,
    bands: list[dict],
    tesseract_bin: str,
    lang: str,
) -> list[dict]:
    """OCR the chord row above each staff for glyphs missed by full-page PSM 6."""
    if ocr_img is None or not bands:
        return []
    try:
        import cv2  # type: ignore
        import tempfile
        import os
    except Exception:
        return []

    out: list[dict] = []
    h = int(ocr_img.shape[0])
    for i, band in enumerate(bands):
        top = float(band.get("top") or 0)
        bot = float(band.get("bottom") or top)
        staff_h = max(12.0, bot - top)
        prev_bottom = float(bands[i - 1].get("bottom") or 0) if i > 0 else 0.0
        zone_top = int(max(0, (prev_bottom + 2) if i > 0 else top - staff_h * 1.35))
        zone_bot = int(min(h, top + max(14.0, staff_h * 0.42)))
        if zone_bot <= zone_top + 4:
            continue
        strip = ocr_img[zone_top:zone_bot, :]
        try:
            strip = cv2.convertScaleAbs(strip, alpha=1.45, beta=18)
        except Exception:
            pass
        fd, path = tempfile.mkstemp(suffix=".png", prefix="chord-strip-")
        os.close(fd)
        try:
            cv2.imwrite(path, strip)
            for box in tesseract_ocr_boxes(Path(path), tesseract_bin, lang):
                next_b = dict(box)
                next_b["y"] = float(box.get("y") or 0) + zone_top
                next_b["staffIndex"] = i
                out.append(next_b)
        except Exception:
            pass
        finally:
            try:
                os.unlink(path)
            except OSError:
                pass
    return out


def inject_omr_plus(
    entry: dict,
    abc: str,
    title: str,
    index: int,
    chord_status: dict,
    *,
    enhanced_meta: dict | None = None,
) -> dict:
    abc = ensure_x_header(abc.strip(), index, title)
    abc = normalize_transpose_in_abc(abc)
    n_chords = chord_count(abc)
    mode = str((enhanced_meta or {}).get("mode") or "")
    row = {
        "id": candidate_id(OMR_PLUS_SOURCE, abc),
        "source": OMR_PLUS_SOURCE,
        "matchedTitle": title + (f" [{mode}]" if mode else ""),
        "url": "",
        "score": round(0.55 + 0.01 * min(20, n_chords), 3),
        "chords": n_chords,
        "hasChords": n_chords > 0,
        "abc": abc,
        "label": "OMR+",
        "chordOcrStatus": chord_status,
        "enhancedOmr": {
            "mode": mode,
            "upscaled": bool((enhanced_meta or {}).get("upscaled")),
            "bandCount": (enhanced_meta or {}).get("bandCount"),
            "okSystems": (enhanced_meta or {}).get("okSystems"),
            "warnings": (enhanced_meta or {}).get("warnings") or [],
            "structureSource": (enhanced_meta or {}).get("structureSource"),
            "structureKindCounts": (enhanced_meta or {}).get("structureKindCounts") or {},
            "structureEvents": (enhanced_meta or {}).get("structureEvents") or [],
        },
    }
    cands = [
        c
        for c in (entry.get("candidates") or [])
        if str(c.get("source") or "").lower() != OMR_PLUS_SOURCE
    ]
    other = [c for c in cands if not str(c.get("source") or "").lower().startswith("omr")]
    omr_plain = [c for c in cands if str(c.get("source") or "").lower() == "omr"]
    omr_rest = [
        c
        for c in cands
        if str(c.get("source") or "").lower().startswith("omr")
        and str(c.get("source") or "").lower() != "omr"
    ]
    # Archive/session first; classic omr; other omr-*; OMR+ last. Never replace legacy omr.
    entry["candidates"] = other + omr_plain + omr_rest + [row]
    entry["omrPlusAbc"] = abc
    entry["omrPlusStatus"] = {
        "ok": True,
        "chords": n_chords,
        "chordOcr": chord_status,
        "enhancedOmr": row["enhancedOmr"],
    }
    return row


def main() -> int:
    parser = argparse.ArgumentParser(description="Re-run OMR+ (notation+chords) for incomplete tunes")
    parser.add_argument(
        "--import-json",
        required=True,
        help="eurosession-import.json with complete flags",
    )
    parser.add_argument("--work", default="/home/stever/Downloads/eurosession-work")
    parser.add_argument("--resolver", default="http://127.0.0.1:8787")
    parser.add_argument("--lang", default="eng+fra")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--skip-omr", action="store_true", help="Reuse existing omrAbc; only refresh chords")
    parser.add_argument("--keys", default="", help="Comma-separated import keys (e.g. p08_t02) to limit run")
    parser.add_argument(
        "--join-json",
        default="/home/stever/Downloads/eurosession-work/mxl_title_join.json",
        help="MSCZ/MXL title join for offline K:/M: seeds (empty to disable)",
    )
    args = parser.parse_args()

    work = Path(args.work)
    import_path = Path(args.import_json)
    seed_map = load_title_seed_map(Path(args.join_json)) if args.join_json else {}
    if seed_map:
        print(f"title K/M seeds loaded: {len(seed_map)}", flush=True)
    if args.keys.strip():
        want = {k.strip() for k in args.keys.split(",") if k.strip()}
        incomplete = load_crops_by_keys(import_path, want)
    else:
        incomplete = load_incomplete_crops(import_path)
    print(f"incomplete crops from import: {len(incomplete)}", flush=True)

    manifest_path = work / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    tunes = list(manifest.get("tunes") or [])

    # Sync complete flags onto manifest for review HTML consumers.
    complete_by_crop = {
        Path(str(t.get("crop") or "")).name: bool(t.get("complete"))
        for t in (json.loads(import_path.read_text(encoding="utf-8")).get("tunes") or [])
    }
    for entry in tunes:
        name = Path(str(entry.get("cropPath") or "")).name
        if name in complete_by_crop:
            entry["complete"] = complete_by_crop[name]

    targets = []
    for i, entry in enumerate(tunes, start=1):
        name = Path(str(entry.get("cropPath") or "")).name
        if name not in incomplete:
            continue
        targets.append((i, entry, incomplete[name]))
    if args.limit > 0:
        targets = targets[: args.limit]
    print(f"will process: {len(targets)}", flush=True)

    tesseract_bin = find_tesseract()
    ok = 0
    failed = 0
    results_log = []

    for n, (index, entry, imp_row) in enumerate(targets, start=1):
        title = str(entry.get("title") or imp_row.get("title") or f"Tune {index}")
        crop = resolve_crop(entry, work)
        print(f"[{n}/{len(targets)}] {title}", flush=True)
        if not crop or not crop.is_file():
            print("  FAIL missing crop", flush=True)
            failed += 1
            entry["omrPlusStatus"] = {"ok": False, "reason": "missing-crop"}
            results_log.append({"title": title, "ok": False, "reason": "missing-crop"})
            _write_progress(manifest_path, tunes, ok, failed, results_log)
            continue

        t0 = time.time()
        omr_abc = ""
        enhanced_meta: dict = {}
        if args.skip_omr and entry.get("omrPlusAbc") and not looks_weak_abc(str(entry.get("omrPlusAbc") or "")):
            omr_abc = str(entry["omrPlusAbc"])
            print(f"  reuse omrPlusAbc ({len(omr_abc)} chars)", flush=True)
            enhanced_meta = {"mode": "reuse"}
        else:
            print("  enhanced OMR...", flush=True)
            enh = enhanced_omr(crop, title=title, resolver=args.resolver)
            omr_abc = str(enh.get("abc") or "").strip()
            enhanced_meta = enh
            print(
                f"  enhanced mode={enh.get('mode')} upscaled={enh.get('upscaled')} "
                f"bands={enh.get('bandCount')} okSystems={enh.get('okSystems')} "
                f"in {time.time() - t0:.1f}s ({len(omr_abc)} chars)",
                flush=True,
            )
            if omr_abc:
                seed = seed_map.get(title) or {}
                omr_abc = repair_omr_abc(
                    omr_abc,
                    title,
                    meter_hint=seed.get("meter"),
                    key_override=seed.get("key"),
                )

        if not omr_abc or looks_weak_abc(omr_abc):
            print("  FAIL weak/empty enhanced OMR", flush=True)
            failed += 1
            entry["omrPlusStatus"] = {
                "ok": False,
                "reason": "weak-omr",
                "enhancedOmr": {
                    "mode": enhanced_meta.get("mode"),
                    "warnings": enhanced_meta.get("warnings"),
                    "error": enhanced_meta.get("error"),
                },
            }
            results_log.append(
                {
                    "title": title,
                    "key": imp_row.get("key"),
                    "ok": False,
                    "reason": "weak-omr",
                    "mode": enhanced_meta.get("mode"),
                }
            )
            _write_progress(manifest_path, tunes, ok, failed, results_log)
            continue

        print("  chords...", flush=True)
        hint = enhanced_meta.get("bandCount") or enhanced_meta.get("okSystems")
        try:
            hint_i = int(hint) if hint is not None else None
        except (TypeError, ValueError):
            hint_i = None
        sys_bar_counts: list[int] | None = None
        systems_meta = enhanced_meta.get("systems") or []
        if isinstance(systems_meta, list) and systems_meta:
            counts = []
            for s in systems_meta:
                if not isinstance(s, dict) or not s.get("ok"):
                    continue
                bc = s.get("barCount")
                try:
                    counts.append(int(bc))
                except (TypeError, ValueError):
                    pass
            if counts:
                sys_bar_counts = counts
        chorded, chord_status = chord_overlay(
            omr_abc,
            crop,
            tesseract_bin,
            args.lang,
            system_count_hint=hint_i,
            system_bar_counts=sys_bar_counts,
        )
        # Only drop chords when overlay mangled the tune; keep melody-only then.
        chord_warnings = abc_quality_warnings(chorded)
        if "mangled_quote_chords" in chord_warnings or (
            looks_weak_abc(chorded) and chord_count(chorded) == 0
        ):
            print(
                f"  chord overlay mangled/empty ({chord_status.get('reason')}); using melody-only",
                flush=True,
            )
            chorded = omr_abc
            chord_status = {**chord_status, "reason": "reverted-melody-only"}
        elif looks_weak_abc(chorded) and not looks_weak_abc(omr_abc):
            # Overlay introduced weakness (e.g. decimals) — prefer clean melody.
            print(
                f"  chord overlay weakened ABC ({chord_warnings}); using melody-only",
                flush=True,
            )
            chorded = omr_abc
            chord_status = {**chord_status, "reason": "reverted-melody-only", "warnings": chord_warnings}
        row = inject_omr_plus(
            entry,
            chorded,
            title,
            index,
            chord_status,
            enhanced_meta=enhanced_meta,
        )
        ok += 1
        print(
            f"  OMR+ id={row['id']} chords={row['chords']} mode={enhanced_meta.get('mode')} "
            f"chordReason={chord_status.get('reason')} ({time.time() - t0:.1f}s)",
            flush=True,
        )
        results_log.append(
            {
                "title": title,
                "key": imp_row.get("key"),
                "ok": True,
                "chords": row["chords"],
                "id": row["id"],
                "mode": enhanced_meta.get("mode"),
                "upscaled": bool(enhanced_meta.get("upscaled")),
                "chordReason": chord_status.get("reason"),
            }
        )
        # Persist after each tune so an interrupt does not lose the batch.
        _write_progress(manifest_path, tunes, ok, failed, results_log)

    mode_counts = _write_progress(manifest_path, tunes, ok, failed, results_log)
    log_path = work / "omr_plus_results.json"
    log_path.write_text(json.dumps(results_log, indent=2), encoding="utf-8")
    print(f"done: OMR+ ok={ok} failed={failed} modes={mode_counts} → {manifest_path}", flush=True)
    print(f"log: {log_path}", flush=True)
    return 0 if failed == 0 or ok > 0 else 1


def _write_progress(
    manifest_path: Path,
    tunes: list,
    ok: int,
    failed: int,
    results_log: list,
) -> dict[str, int]:
    mode_counts: dict[str, int] = {}
    for row in results_log:
        if row.get("ok"):
            mode = str(row.get("mode") or "unknown")
            mode_counts[mode] = mode_counts.get(mode, 0) + 1
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.is_file() else {}
    # Prefer in-memory tunes (already mutated) over re-read for the tunes array.
    manifest["tunes"] = tunes
    manifest["omrPlusCount"] = ok
    manifest["omrPlusFailed"] = failed
    manifest["omrPlusModes"] = mode_counts
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    (manifest_path.parent / "omr_plus_results.json").write_text(
        json.dumps(results_log, indent=2), encoding="utf-8"
    )
    return mode_counts


if __name__ == "__main__":
    raise SystemExit(main())
