"""YogApp community API: teachers, blogs, routines under /yoga/*."""

from __future__ import annotations

import asyncio
import base64
import io
import json
import logging
import re
import time
from typing import Any, Awaitable, Callable, Optional

from fastapi import Body, File, Header, HTTPException, Query, Request, UploadFile
from fastapi.responses import JSONResponse

from allowlists import email_allowed
from blog_content_assessment import assess_blog_content
from yoga_community_store import (
    EXAMPLE_TEACHER_BLURBS,
    FEEDBACK_STATUSES,
    MAX_BLURB_LEN,
    MAX_CLASS_IMAGE_CHARS,
    MAX_EVIDENCE_DATA_URL_CHARS,
    MAX_EVIDENCE_NAME_LEN,
    MAX_EVIDENCE_URL_LEN,
    MAX_FEEDBACK_COMMENT_LEN,
    MAX_FEEDBACK_DEBUG_CHARS,
    MAX_FEEDBACK_SCREENSHOT_CHARS,
    MAX_PHOTO_DATA_URL_CHARS,
    MAX_TEACHER_EVIDENCE,
    MIN_TEACHER_PHOTO_EDGE,
    TEACHER_PHOTO_MAX_EDGE,
    add_teacher_evidence,
    blog_is_disabled,
    clear_all_class_cancellations,
    clear_blog_flag,
    clear_class_cancellation,
    create_feedback,
    create_recurring_classes,
    delete_blog,
    delete_class,
    delete_class_series_from,
    delete_feedback,
    delete_teacher,
    enrich_class_for_viewer,
    ensure_db,
    flag_blog,
    get_blog,
    get_class,
    get_feedback,
    get_routine,
    get_teacher,
    get_teacher_admin_lookup,
    increment_blog_views,
    is_blog_liked,
    is_subscribed,
    like_blog,
    list_all_teachers,
    list_blogs,
    list_class_cancellations,
    list_classes_for_teacher,
    list_feedback,
    list_registrants,
    list_routines,
    list_subscriptions,
    list_teachers,
    list_top_teachers,
    list_upcoming_classes,
    mark_teacher_submitted,
    teacher_directory_counts,
    publish_blog,
    publish_routine,
    register_for_class,
    remove_teacher_evidence,
    seed_community_content,
    set_blog_admin_reviewed,
    set_blog_assessment,
    set_blog_disabled,
    set_feedback_status,
    set_teacher_admin_lookup,
    set_teacher_banned,
    set_teacher_disabled,
    set_teacher_photo,
    set_teacher_rejected,
    set_teacher_unlisted,
    subscribe_to_teacher,
    teacher_has_website,
    teacher_is_banned,
    teacher_is_disabled,
    teacher_is_publicly_listed,
    teacher_listing_complete,
    unlike_blog,
    unregister_from_class,
    unsubscribe_from_teacher,
    upsert_blog,
    upsert_class,
    upsert_routine,
    upsert_teacher,
)

AuthUserFn = Callable[[str | None], Awaitable[dict[str, Any]]]
OptionalAuthFn = Callable[[str | None], Awaitable[Optional[dict[str, Any]]]]
CorsFn = Callable[[str | None], dict[str, str]]
AdminListFn = Callable[[], set[str]]

_DATA_URL_RE = re.compile(r"^data:image/(jpeg|jpg|png|webp|gif);base64,", re.I)
_log = logging.getLogger("yoga_community")
_lookup_tasks: dict[str, asyncio.Task] = {}


def _evidence_public(
    items: list[dict[str, Any]] | None,
    *,
    include_data_url: bool,
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for item in items or []:
        if not isinstance(item, dict):
            continue
        row: dict[str, Any] = {
            "id": item.get("id") or "",
            "name": item.get("name") or "",
            "contentType": item.get("contentType") or "",
            "url": item.get("url") or "",
            "uploadedAt": item.get("uploadedAt"),
        }
        data_url = str(item.get("dataUrl") or "")
        if include_data_url and data_url:
            row["dataUrl"] = data_url
        elif data_url:
            row["hasFile"] = True
            ctype = str(item.get("contentType") or "")
            if ctype.startswith("image/"):
                # Tiny preview for admin lists without shipping full payload twice:
                # owner/admin detail paths pass include_data_url=True.
                pass
        out.append(row)
    return out


def _public_teacher(
    t: dict[str, Any],
    *,
    include_evidence_files: bool = False,
) -> dict[str, Any]:
    photo = t.get("photoDataUrl") or t.get("photoUrl") or ""
    out = {
        "email": t.get("email") or "",
        "displayName": t.get("displayName") or "",
        "blurb": t.get("blurb") or "",
        "photoUrl": photo if not str(photo).startswith("data:") else "",
        "photoDataUrl": photo if str(photo).startswith("data:") else "",
        "contactEmail": t.get("contactEmail") or "",
        "contactPhone": t.get("contactPhone") or "",
        "contactLink": t.get("contactLink") or "",
        "youtubeLinks": list(t.get("youtubeLinks") or []),
        "country": t.get("country") or "",
        "region": t.get("region") or "",
        "disabled": bool(t.get("disabled")) or bool(t.get("banned")),
        "unlisted": bool(t.get("unlisted")),
        "banned": bool(t.get("banned")),
        "banReason": t.get("banReason") or "",
        "bannedAt": t.get("bannedAt"),
        "rejectReason": t.get("rejectReason") or "",
        "rejectedAt": t.get("rejectedAt"),
        "submittedAt": t.get("submittedAt"),
        "approvedAt": t.get("approvedAt"),
        "evidence": _evidence_public(
            list(t.get("evidence") or []),
            include_data_url=include_evidence_files,
        ),
        "registeredAt": t.get("registeredAt"),
        "updatedAt": t.get("updatedAt"),
    }
    if "score" in t:
        out["score"] = int(t.get("score") or 0)
    if "likeCount" in t:
        out["likeCount"] = int(t.get("likeCount") or 0)
    if "subscriberCount" in t:
        out["subscriberCount"] = int(t.get("subscriberCount") or 0)
    return out


def _teacher_has_ready_lookup(t: dict[str, Any]) -> bool:
    lookup = t.get("adminLookup")
    if not isinstance(lookup, dict):
        return False
    report = str(lookup.get("reportMarkdown") or "").strip()
    if not report:
        return False
    status = str(lookup.get("status") or "ready").strip().lower()
    return status in ("", "ready")


def _admin_teacher(t: dict[str, Any]) -> dict[str, Any]:
    """Admin list payload: public fields plus whether a saved lookup report exists."""
    out = _public_teacher(t, include_evidence_files=True)
    if _teacher_has_ready_lookup(t):
        out["hasLookup"] = True
    return out


def _blog_summary(b: dict[str, Any], *, include_body: bool = False) -> dict[str, Any]:
    out = {
        "id": b.get("id") or "",
        "authorEmail": b.get("authorEmail") or "",
        "title": b.get("title") or "",
        "summary": b.get("summary") or "",
        "image": b.get("image") or "",
        "status": b.get("status") or "draft",
        "disabled": bool(b.get("disabled")),
        "flagged": bool(b.get("flagged")),
        "flagReason": (b.get("flagReason") or "").strip(),
        "flaggedAt": b.get("flaggedAt"),
        "assessmentOk": bool(b.get("assessmentOk", True)),
        "assessmentReason": (b.get("assessmentReason") or "").strip(),
        "assessedAt": b.get("assessedAt"),
        "viewCount": int(b.get("viewCount") or 0),
        "likeCount": int(b.get("likeCount") or 0),
        "createdAt": b.get("createdAt"),
        "updatedAt": b.get("updatedAt"),
        "publishedAt": b.get("publishedAt"),
        "adminReviewedAt": b.get("adminReviewedAt"),
    }
    if "liked" in b:
        out["liked"] = bool(b.get("liked"))
    if include_body:
        out["body"] = list(b.get("body") or [])
    return out


def _routine_public(r: dict[str, Any], *, include_payload: bool = True) -> dict[str, Any]:
    out = {
        "id": r.get("id") or "",
        "authorEmail": r.get("authorEmail") or "",
        "name": r.get("name") or "",
        "description": r.get("description") or "",
        "status": r.get("status") or "draft",
        "createdAt": r.get("createdAt"),
        "updatedAt": r.get("updatedAt"),
        "publishedAt": r.get("publishedAt"),
    }
    if include_payload:
        out["payload"] = dict(r.get("payload") or {})
    return out


def _class_public(c: dict[str, Any]) -> dict[str, Any]:
    image = c.get("image") or ""
    out = {
        "id": c.get("id") or "",
        "teacherEmail": c.get("teacherEmail") or "",
        "teacherDisplayName": c.get("teacherDisplayName") or "",
        "title": c.get("title") or "",
        "description": c.get("description") or "",
        "location": c.get("location") or "",
        "startsAt": c.get("startsAt") or "",
        "maxRegistrants": int(c.get("maxRegistrants") or 1),
        "image": image,
        "registrantCount": int(c.get("registrantCount") or 0),
        "spotsLeft": int(c.get("spotsLeft") if c.get("spotsLeft") is not None else max(
            0, int(c.get("maxRegistrants") or 1) - int(c.get("registrantCount") or 0)
        )),
        "isFull": bool(c.get("isFull")),
        "isRegistered": bool(c.get("isRegistered")),
        "createdAt": c.get("createdAt"),
        "updatedAt": c.get("updatedAt"),
    }
    series_id = (c.get("seriesId") or "").strip()
    if series_id:
        out["seriesId"] = series_id
    return out


def _cancellation_public(c: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": c.get("id") or "",
        "classId": c.get("classId") or "",
        "teacherEmail": c.get("teacherEmail") or "",
        "teacherDisplayName": c.get("teacherDisplayName") or "",
        "title": c.get("title") or "",
        "location": c.get("location") or "",
        "startsAt": c.get("startsAt") or "",
        "cancelledAt": c.get("cancelledAt"),
    }


def _email_from_verified(verified: dict[str, Any] | None) -> str:
    if not verified:
        return ""
    return str(verified.get("email") or "").strip().lower()


def _image_to_data_url(raw: bytes, content_type: str | None) -> str:
    if not raw:
        raise HTTPException(status_code=400, detail="Empty image")
    if len(raw) > 2_500_000:
        raise HTTPException(status_code=400, detail="Image too large (max ~2.5MB)")
    ctype = (content_type or "image/jpeg").split(";")[0].strip().lower()
    if ctype not in ("image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"):
        raise HTTPException(status_code=400, detail="Unsupported image type")
    try:
        from PIL import Image

        img = Image.open(io.BytesIO(raw))
        width, height = img.size
        short_edge = min(width, height)
        if short_edge < MIN_TEACHER_PHOTO_EDGE:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Profile image too small ({width}×{height}). "
                    f"Use at least {MIN_TEACHER_PHOTO_EDGE}×{MIN_TEACHER_PHOTO_EDGE} pixels."
                ),
            )
        img = img.convert("RGB")
        img.thumbnail((TEACHER_PHOTO_MAX_EDGE, TEACHER_PHOTO_MAX_EDGE))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85, optimize=True)
        raw = buf.getvalue()
        ctype = "image/jpeg"
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Could not read image ({exc})",
        ) from exc
    b64 = base64.b64encode(raw).decode("ascii")
    data_url = f"data:{ctype};base64,{b64}"
    if len(data_url) > MAX_PHOTO_DATA_URL_CHARS:
        raise HTTPException(status_code=400, detail="Image too large after encoding")
    return data_url


def _evidence_file_to_data_url(raw: bytes, content_type: str | None) -> str:
    """Encode evidence images without the profile-photo minimum size requirement."""
    if not raw:
        raise HTTPException(status_code=400, detail="Empty image")
    if len(raw) > 1_800_000:
        raise HTTPException(status_code=400, detail="File too large (max ~1.8MB)")
    ctype = (content_type or "image/jpeg").split(";")[0].strip().lower()
    if ctype not in ("image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"):
        raise HTTPException(status_code=400, detail="Unsupported image type")
    try:
        from PIL import Image

        img = Image.open(io.BytesIO(raw))
        img = img.convert("RGB")
        img.thumbnail((1280, 1280))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=82, optimize=True)
        raw = buf.getvalue()
        ctype = "image/jpeg"
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Could not read image ({exc})",
        ) from exc
    b64 = base64.b64encode(raw).decode("ascii")
    data_url = f"data:{ctype};base64,{b64}"
    if len(data_url) > MAX_EVIDENCE_DATA_URL_CHARS:
        raise HTTPException(status_code=400, detail="Image too large after encoding")
    return data_url


def _ensure_self_service_stays_pending(
    email: str,
    *,
    before: dict[str, Any] | None,
) -> dict[str, Any] | None:
    """New or incomplete self-service profiles stay disabled until admin approval."""
    if teacher_is_publicly_listed(before):
        return get_teacher(email)
    try:
        return set_teacher_disabled(email, True)
    except KeyError:
        return get_teacher(email)


def register_yoga_community_routes(
    app,
    *,
    require_google_user: AuthUserFn,
    optional_google_user: OptionalAuthFn | None = None,
    cors_headers: CorsFn,
    get_admin_allowlist: AdminListFn | None = None,
) -> None:
    # Defer sqlite/Firestore init to first request so import stays side-effect free
    # (Cloud Run uses Firestore; local/tests open sqlite lazily).

    async def _require_user(authorization: str | None) -> dict[str, Any]:
        verified = await require_google_user(authorization)
        email = _email_from_verified(verified)
        if not email:
            raise HTTPException(status_code=401, detail="Missing email on token")
        return verified

    async def _optional_user(authorization: str | None) -> dict[str, Any] | None:
        if optional_google_user:
            try:
                return await optional_google_user(authorization)
            except HTTPException:
                return None
        if not authorization:
            return None
        try:
            return await require_google_user(authorization)
        except HTTPException:
            return None

    def _require_teacher(email: str) -> dict[str, Any]:
        teacher = get_teacher(email)
        if not teacher or not (teacher.get("blurb") or "").strip():
            raise HTTPException(status_code=403, detail="Register as a teacher first")
        if not (teacher.get("photoDataUrl") or teacher.get("photoUrl")):
            raise HTTPException(status_code=403, detail="Teacher profile image required")
        return teacher

    def _require_approved_teacher(email: str) -> dict[str, Any]:
        teacher = _require_teacher(email)
        if not teacher_is_publicly_listed(teacher):
            raise HTTPException(
                status_code=403,
                detail="Approved teacher listing required to manage classes",
            )
        return teacher

    def _require_class_teacher(email: str) -> dict[str, Any]:
        """Approved listed teacher with a contact phone (required to create events)."""
        teacher = _require_approved_teacher(email)
        if not (teacher.get("contactPhone") or "").strip():
            raise HTTPException(
                status_code=403,
                detail="Contact phone is required to create classes",
            )
        return teacher

    def _require_admin(email: str) -> None:
        allowlist = get_admin_allowlist() if get_admin_allowlist else set()
        # Empty allowlist = no admins (matches /health adminAccess + email_allowed).
        if not email_allowed(allowlist, email):
            raise HTTPException(status_code=403, detail="Admin access required")

    @app.get("/yoga/example-blurbs")
    async def yoga_example_blurbs(request: Request):
        return JSONResponse(
            {"blurbs": EXAMPLE_TEACHER_BLURBS},
            headers=cors_headers(request.headers.get("origin")),
        )

    @app.get("/yoga/teachers")
    async def yoga_teachers_list(request: Request):
        teachers_raw = list_teachers()
        needs_seed = not teachers_raw or any(
            (t.get("email") or "").endswith("@synthesized.yoga")
            and (
                not (t.get("country") or "").strip()
                or not (t.get("region") or "").strip()
            )
            for t in teachers_raw
        )
        if needs_seed:
            seed_community_content(force=False)
            teachers_raw = list_teachers()
        activity = teacher_directory_counts()
        teachers = []
        for t in teachers_raw:
            pub = _public_teacher(t)
            counts = activity.get((t.get("email") or "").strip().lower()) or {}
            class_count = int(counts.get("classCount") or 0)
            blog_count = int(counts.get("blogCount") or 0)
            if class_count:
                pub["classCount"] = class_count
            if blog_count:
                pub["blogCount"] = blog_count
            teachers.append(pub)
        return JSONResponse(
            {"teachers": teachers},
            headers=cors_headers(request.headers.get("origin")),
        )

    @app.get("/yoga/teachers/top")
    async def yoga_teachers_top(
        request: Request,
        limit: int = Query(default=10, ge=1, le=50),
        country: str | None = Query(default=None),
        region: str | None = Query(default=None),
    ):
        top = list_top_teachers(limit=limit, country=country, region=region)
        return JSONResponse(
            {"teachers": [_public_teacher(t) for t in top]},
            headers=cors_headers(request.headers.get("origin")),
        )

    @app.get("/yoga/teachers/me")
    async def yoga_teachers_me(
        request: Request,
        authorization: str | None = Header(default=None),
    ):
        verified = await _require_user(authorization)
        email = _email_from_verified(verified)
        teacher = get_teacher(email)
        return JSONResponse(
            {
                "teacher": (
                    _public_teacher(teacher, include_evidence_files=True)
                    if teacher
                    else None
                )
            },
            headers=cors_headers(request.headers.get("origin")),
        )

    @app.put("/yoga/teachers/me")
    async def yoga_teachers_me_put(
        request: Request,
        body: dict = Body(default_factory=dict),
        authorization: str | None = Header(default=None),
    ):
        if "disabled" in body:
            raise HTTPException(
                status_code=403,
                detail="Use PATCH /yoga/teachers/me/disabled to change listing status",
            )
        if "unlisted" in body:
            raise HTTPException(
                status_code=403,
                detail="Use PATCH /yoga/teachers/me/unlisted to change directory visibility",
            )
        verified = await _require_user(authorization)
        email = _email_from_verified(verified)
        existing = get_teacher(email)
        if existing and teacher_is_banned(existing):
            raise HTTPException(
                status_code=403,
                detail="Your teacher listing has been banned",
            )
        display_name = str(body.get("displayName") or verified.get("name") or email).strip()
        blurb = str(body.get("blurb") or "").strip()
        if not blurb:
            raise HTTPException(status_code=400, detail="Blurb is required")
        if len(blurb) > MAX_BLURB_LEN:
            raise HTTPException(status_code=400, detail=f"Blurb max {MAX_BLURB_LEN} characters")
        photo_data_url = body.get("photoDataUrl")
        photo_url = body.get("photoUrl")
        if photo_data_url is not None:
            photo_data_url = str(photo_data_url).strip()
            if photo_data_url and not _DATA_URL_RE.match(photo_data_url):
                raise HTTPException(status_code=400, detail="photoDataUrl must be an image data URL")
            if len(photo_data_url) > MAX_PHOTO_DATA_URL_CHARS:
                raise HTTPException(status_code=400, detail="photoDataUrl too large")
        if photo_url is not None:
            photo_url = str(photo_url).strip()
        contact_email = body.get("contactEmail")
        contact_phone = body.get("contactPhone")
        contact_link = body.get("contactLink")
        youtube_links = body.get("youtubeLinks")
        country = body.get("country")
        region = body.get("region")
        if contact_email is not None:
            contact_email = str(contact_email).strip()
        if contact_phone is not None:
            contact_phone = str(contact_phone).strip()
        if contact_link is not None:
            contact_link = str(contact_link).strip()
        if youtube_links is not None and not isinstance(youtube_links, list):
            raise HTTPException(status_code=400, detail="youtubeLinks must be a list")
        if country is not None:
            country = str(country).strip().upper()
        if region is not None:
            region = str(region).strip()

        has_photo = bool(
            (photo_data_url if photo_data_url is not None else (existing or {}).get("photoDataUrl"))
            or (photo_url if photo_url is not None else (existing or {}).get("photoUrl"))
        )
        if not has_photo:
            raise HTTPException(status_code=400, detail="Profile image is required")

        # Website required for Publish / public listing; drafts may omit it.
        teacher = upsert_teacher(
            email,
            display_name=display_name,
            blurb=blurb,
            photo_data_url=photo_data_url,
            photo_url=photo_url,
            contact_email=contact_email,
            contact_phone=contact_phone,
            contact_link=contact_link,
            youtube_links=list(youtube_links) if youtube_links is not None else None,
            country=country,
            region=region,
        )
        teacher = _ensure_self_service_stays_pending(email, before=existing) or teacher
        return JSONResponse(
            {"teacher": _public_teacher(teacher, include_evidence_files=True)},
            headers=cors_headers(request.headers.get("origin")),
        )

    @app.post("/yoga/teachers/me/publish")
    async def yoga_teachers_me_publish(
        request: Request,
        authorization: str | None = Header(default=None),
    ):
        """Submit (or resubmit) the teacher listing for admin approval."""
        verified = await _require_user(authorization)
        email = _email_from_verified(verified)
        existing = get_teacher(email)
        if not existing:
            raise HTTPException(status_code=404, detail="Teacher not found")
        if teacher_is_banned(existing):
            raise HTTPException(
                status_code=403,
                detail="Your teacher listing has been banned",
            )
        if not teacher_listing_complete(existing):
            raise HTTPException(
                status_code=400,
                detail="Photo, blurb, and website are required before publishing",
            )
        if teacher_is_publicly_listed(existing):
            return JSONResponse(
                {"teacher": _public_teacher(existing, include_evidence_files=True)},
                headers=cors_headers(request.headers.get("origin")),
            )
        try:
            teacher = mark_teacher_submitted(email)
        except KeyError:
            raise HTTPException(status_code=404, detail="Teacher not found")
        except ValueError as exc:
            code = str(exc)
            if code == "teacher_banned":
                raise HTTPException(
                    status_code=403,
                    detail="Your teacher listing has been banned",
                )
            if code == "listing_incomplete":
                raise HTTPException(
                    status_code=400,
                    detail="Photo, blurb, and website are required before publishing",
                )
            raise
        return JSONResponse(
            {"teacher": _public_teacher(teacher, include_evidence_files=True)},
            headers=cors_headers(request.headers.get("origin")),
        )

    @app.patch("/yoga/teachers/me/disabled")
    async def yoga_teachers_me_disabled(
        request: Request,
        body: dict = Body(default_factory=dict),
        authorization: str | None = Header(default=None),
    ):
        """Self-disable listing, or self-enable if previously approved."""
        verified = await _require_user(authorization)
        email = _email_from_verified(verified)
        existing = get_teacher(email)
        if not existing:
            raise HTTPException(status_code=404, detail="Teacher not found")
        if teacher_is_banned(existing):
            raise HTTPException(
                status_code=403,
                detail="Your teacher listing has been banned",
            )
        if "disabled" not in body:
            raise HTTPException(status_code=400, detail="disabled boolean required")
        want_disabled = bool(body.get("disabled"))
        if not want_disabled:
            if not existing.get("approvedAt"):
                raise HTTPException(
                    status_code=403,
                    detail="Only previously approved teachers can re-enable their listing",
                )
            if str(existing.get("rejectReason") or "").strip():
                raise HTTPException(
                    status_code=403,
                    detail="Resubmit your application for review before enabling",
                )
            if not teacher_listing_complete(existing):
                raise HTTPException(
                    status_code=400,
                    detail="Photo, blurb, and website are required to enable listing",
                )
        try:
            teacher = set_teacher_disabled(email, want_disabled)
        except KeyError:
            raise HTTPException(status_code=404, detail="Teacher not found")
        except ValueError as exc:
            if str(exc) == "teacher_banned":
                raise HTTPException(
                    status_code=403,
                    detail="Your teacher listing has been banned",
                )
            raise
        return JSONResponse(
            {"teacher": _public_teacher(teacher, include_evidence_files=True)},
            headers=cors_headers(request.headers.get("origin")),
        )

    @app.patch("/yoga/teachers/me/unlisted")
    async def yoga_teachers_me_unlisted(
        request: Request,
        body: dict = Body(default_factory=dict),
        authorization: str | None = Header(default=None),
    ):
        """Hide from Teachers directory while keeping the profile page reachable."""
        verified = await _require_user(authorization)
        email = _email_from_verified(verified)
        existing = get_teacher(email)
        if not existing:
            raise HTTPException(status_code=404, detail="Teacher not found")
        if teacher_is_banned(existing):
            raise HTTPException(
                status_code=403,
                detail="Your teacher listing has been banned",
            )
        if "unlisted" not in body:
            raise HTTPException(status_code=400, detail="unlisted boolean required")
        want_unlisted = bool(body.get("unlisted"))
        try:
            teacher = set_teacher_unlisted(email, want_unlisted)
        except KeyError:
            raise HTTPException(status_code=404, detail="Teacher not found")
        except ValueError as exc:
            if str(exc) == "teacher_banned":
                raise HTTPException(
                    status_code=403,
                    detail="Your teacher listing has been banned",
                )
            if str(exc) == "teacher_not_listed":
                raise HTTPException(
                    status_code=400,
                    detail="Only approved, listed teachers can change unlisted status",
                )
            raise
        return JSONResponse(
            {"teacher": _public_teacher(teacher, include_evidence_files=True)},
            headers=cors_headers(request.headers.get("origin")),
        )

    @app.post("/yoga/teachers/me/evidence")
    async def yoga_teachers_me_evidence(
        request: Request,
        authorization: str | None = Header(default=None),
    ):
        """Attach evidence file (image/PDF multipart) or JSON link { name, url }."""
        verified = await _require_user(authorization)
        email = _email_from_verified(verified)
        existing = get_teacher(email)
        if not existing:
            upsert_teacher(
                email,
                display_name=str(verified.get("name") or email),
                blurb="",
            )
            existing = get_teacher(email)
            _ensure_self_service_stays_pending(email, before=None)
        if existing and teacher_is_banned(existing):
            raise HTTPException(
                status_code=403,
                detail="Your teacher listing has been banned",
            )
        if existing and existing.get("approvedAt"):
            raise HTTPException(
                status_code=400,
                detail="Evidence is only accepted before listing approval",
            )

        content_type = ""
        name = ""
        data_url = ""
        url = ""

        ctype_header = (request.headers.get("content-type") or "").lower()
        if "application/json" in ctype_header:
            body = await request.json()
            if not isinstance(body, dict):
                raise HTTPException(status_code=400, detail="Invalid JSON body")
            name = str(body.get("name") or "").strip()[:MAX_EVIDENCE_NAME_LEN]
            url = str(body.get("url") or "").strip()[:MAX_EVIDENCE_URL_LEN]
            if not url:
                raise HTTPException(status_code=400, detail="url is required")
            content_type = "text/uri-list"
        elif "multipart/form-data" in ctype_header:
            form = await request.form()
            upload = form.get("file")
            if upload is None or not hasattr(upload, "read"):
                raise HTTPException(status_code=400, detail="file is required")
            raw = await upload.read()  # type: ignore[union-attr]
            if not raw:
                raise HTTPException(status_code=400, detail="Empty file")
            if len(raw) > 1_800_000:
                raise HTTPException(status_code=400, detail="File too large (max ~1.8MB)")
            filename = str(getattr(upload, "filename", None) or "evidence")
            file_ctype = str(getattr(upload, "content_type", None) or "application/octet-stream")
            content_type = file_ctype.split(";")[0].strip().lower()
            name = filename.strip()[:MAX_EVIDENCE_NAME_LEN]
            if content_type.startswith("image/"):
                data_url = _evidence_file_to_data_url(raw, content_type)
            elif content_type == "application/pdf" or filename.lower().endswith(".pdf"):
                content_type = "application/pdf"
                b64 = base64.b64encode(raw).decode("ascii")
                data_url = f"data:application/pdf;base64,{b64}"
                if len(data_url) > MAX_EVIDENCE_DATA_URL_CHARS:
                    raise HTTPException(
                        status_code=400, detail="PDF too large after encoding"
                    )
            else:
                raise HTTPException(
                    status_code=400,
                    detail="Evidence must be an image or PDF",
                )
        else:
            raise HTTPException(
                status_code=400,
                detail="Send multipart file or JSON { name, url }",
            )

        try:
            teacher = add_teacher_evidence(
                email,
                name=name,
                content_type=content_type,
                data_url=data_url,
                url=url,
            )
        except KeyError:
            raise HTTPException(status_code=404, detail="Teacher not found")
        except ValueError as exc:
            code = str(exc)
            if code == "teacher_banned":
                raise HTTPException(
                    status_code=403,
                    detail="Your teacher listing has been banned",
                )
            if code == "evidence_limit":
                raise HTTPException(
                    status_code=400,
                    detail=f"At most {MAX_TEACHER_EVIDENCE} evidence items allowed",
                )
            if code == "invalid_evidence":
                raise HTTPException(status_code=400, detail="Invalid evidence")
            raise
        return JSONResponse(
            {"teacher": _public_teacher(teacher, include_evidence_files=True)},
            headers=cors_headers(request.headers.get("origin")),
        )

    @app.delete("/yoga/teachers/me/evidence/{evidence_id}")
    async def yoga_teachers_me_evidence_delete(
        evidence_id: str,
        request: Request,
        authorization: str | None = Header(default=None),
    ):
        verified = await _require_user(authorization)
        email = _email_from_verified(verified)
        existing = get_teacher(email)
        if not existing:
            raise HTTPException(status_code=404, detail="Teacher not found")
        if teacher_is_banned(existing):
            raise HTTPException(
                status_code=403,
                detail="Your teacher listing has been banned",
            )
        try:
            teacher = remove_teacher_evidence(email, evidence_id)
        except KeyError as exc:
            key = str(exc).strip("'")
            if key == "evidence_not_found":
                raise HTTPException(status_code=404, detail="Evidence not found")
            raise HTTPException(status_code=404, detail="Teacher not found")
        except ValueError as exc:
            if str(exc) == "teacher_banned":
                raise HTTPException(
                    status_code=403,
                    detail="Your teacher listing has been banned",
                )
            raise
        return JSONResponse(
            {"teacher": _public_teacher(teacher, include_evidence_files=True)},
            headers=cors_headers(request.headers.get("origin")),
        )

    @app.post("/yoga/teachers/me/resubmit")
    async def yoga_teachers_me_resubmit(
        request: Request,
        authorization: str | None = Header(default=None),
    ):
        """Clear rejection so the listing reappears in the admin approval inbox."""
        verified = await _require_user(authorization)
        email = _email_from_verified(verified)
        existing = get_teacher(email)
        if not existing:
            raise HTTPException(status_code=404, detail="Teacher not found")
        if teacher_is_banned(existing):
            raise HTTPException(
                status_code=403,
                detail="Your teacher listing has been banned",
            )
        if not str(existing.get("rejectReason") or "").strip():
            raise HTTPException(
                status_code=400,
                detail="Listing is not currently rejected",
            )
        if not teacher_listing_complete(existing):
            raise HTTPException(
                status_code=400,
                detail="Photo, blurb, and website are required before resubmitting",
            )
        try:
            teacher = mark_teacher_submitted(email)
        except KeyError:
            raise HTTPException(status_code=404, detail="Teacher not found")
        except ValueError as exc:
            if str(exc) == "teacher_banned":
                raise HTTPException(
                    status_code=403,
                    detail="Your teacher listing has been banned",
                )
            if str(exc) == "listing_incomplete":
                raise HTTPException(
                    status_code=400,
                    detail="Photo, blurb, and website are required before resubmitting",
                )
            raise
        return JSONResponse(
            {"teacher": _public_teacher(teacher, include_evidence_files=True)},
            headers=cors_headers(request.headers.get("origin")),
        )

    @app.post("/yoga/teachers/me/photo")
    async def yoga_teachers_me_photo(
        request: Request,
        authorization: str | None = Header(default=None),
        file: UploadFile = File(...),
    ):
        verified = await _require_user(authorization)
        email = _email_from_verified(verified)
        existing = get_teacher(email)
        if existing and teacher_is_banned(existing):
            raise HTTPException(
                status_code=403,
                detail="Your teacher listing has been banned",
            )
        raw = await file.read()
        data_url = _image_to_data_url(raw, file.content_type)
        if not existing:
            # Create stub teacher with empty blurb — PUT must complete registration
            upsert_teacher(
                email,
                display_name=str(verified.get("name") or email),
                blurb="",
                photo_data_url=data_url,
                photo_url="",
            )
            teacher = _ensure_self_service_stays_pending(email, before=None)
        else:
            teacher = set_teacher_photo(email, data_url)
            if not teacher_is_publicly_listed(existing):
                teacher = _ensure_self_service_stays_pending(email, before=existing)
        return JSONResponse(
            {
                "teacher": (
                    _public_teacher(teacher, include_evidence_files=True)
                    if teacher
                    else None
                )
            },
            headers=cors_headers(request.headers.get("origin")),
        )

    @app.get("/yoga/teachers/{email}")
    async def yoga_teacher_detail(email: str, request: Request):
        email_norm = (email or "").strip().lower()
        teacher = get_teacher(email_norm)
        if (
            not teacher
            or teacher_is_disabled(teacher)
            or not (teacher.get("blurb") or "").strip()
            or not (teacher.get("photoDataUrl") or teacher.get("photoUrl"))
            or not teacher_has_website(teacher)
        ):
            raise HTTPException(status_code=404, detail="Teacher not found")
        blogs = list_blogs(
            published_only=True,
            author_email=email_norm,
            hide_disabled_teachers=True,
        )
        routines = list_routines(
            published_only=True,
            author_email=email_norm,
            hide_disabled_teachers=True,
        )
        return JSONResponse(
            {
                "teacher": _public_teacher(teacher),
                "blogs": [_blog_summary(b, include_body=False) for b in blogs],
                "routines": [_routine_public(r, include_payload=False) for r in routines],
            },
            headers=cors_headers(request.headers.get("origin")),
        )

    @app.get("/yoga/blogs")
    async def yoga_blogs_list(
        request: Request,
        sample: int | None = Query(default=None),
        mine: bool = Query(default=False),
        author: str | None = Query(default=None),
        authorization: str | None = Header(default=None),
    ):
        origin = request.headers.get("origin")
        if mine:
            verified = await _require_user(authorization)
            email = _email_from_verified(verified)
            _require_teacher(email)
            blogs = list_blogs(
                published_only=False,
                author_email=email,
                include_disabled=True,
            )
            return JSONResponse(
                {"blogs": [_blog_summary(b, include_body=False) for b in blogs]},
                headers=cors_headers(origin),
            )
        author_email = (author or "").strip().lower() or None
        blogs = list_blogs(
            published_only=True,
            sample=sample,
            author_email=author_email,
            hide_disabled_teachers=True,
        )
        if not blogs and sample is None and not author_email:
            seed_community_content(force=False)
            blogs = list_blogs(
                published_only=True,
                sample=sample,
                author_email=author_email,
                hide_disabled_teachers=True,
            )
        return JSONResponse(
            {"blogs": [_blog_summary(b, include_body=False) for b in blogs]},
            headers=cors_headers(origin),
        )

    @app.get("/yoga/blogs/{blog_id}")
    async def yoga_blog_get(
        blog_id: str,
        request: Request,
        authorization: str | None = Header(default=None),
    ):
        blog = get_blog(blog_id)
        if not blog:
            raise HTTPException(status_code=404, detail="Blog not found")
        if blog_is_disabled(blog):
            verified = await _optional_user(authorization)
            email = _email_from_verified(verified)
            if email != blog.get("authorEmail"):
                try:
                    _require_admin(email)
                except HTTPException:
                    raise HTTPException(status_code=404, detail="Blog not found")
        author = get_teacher(blog.get("authorEmail") or "")
        if teacher_is_disabled(author):
            verified = await _optional_user(authorization)
            email = _email_from_verified(verified)
            if email != blog.get("authorEmail"):
                try:
                    _require_admin(email)
                except HTTPException:
                    raise HTTPException(status_code=404, detail="Blog not found")
        if blog.get("status") != "published":
            verified = await _optional_user(authorization)
            email = _email_from_verified(verified)
            if email != blog.get("authorEmail"):
                try:
                    _require_admin(email)
                except HTTPException:
                    raise HTTPException(status_code=404, detail="Blog not found")
        summary = _blog_summary(blog, include_body=True)
        verified = await _optional_user(authorization)
        viewer = _email_from_verified(verified)
        if viewer:
            summary["liked"] = is_blog_liked(blog_id, viewer)
        return JSONResponse(
            {"blog": summary},
            headers=cors_headers(request.headers.get("origin")),
        )

    @app.post("/yoga/blogs")
    async def yoga_blog_create(
        request: Request,
        body: dict = Body(default_factory=dict),
        authorization: str | None = Header(default=None),
    ):
        verified = await _require_user(authorization)
        email = _email_from_verified(verified)
        _require_teacher(email)
        if "disabled" in body:
            raise HTTPException(
                status_code=403,
                detail="Only admins can change disabled status",
            )
        title = str(body.get("title") or "").strip()
        if not title:
            raise HTTPException(status_code=400, detail="Title is required")
        summary = str(body.get("summary") or "")
        blog_body = body.get("body") or []
        image = str(body.get("image") or "")
        blog = upsert_blog(
            blog_id=str(body.get("id") or "").strip() or None,
            author_email=email,
            title=title,
            summary=summary,
            body=blog_body,
            image=image,
            status="draft",
        )
        # Content review runs only on publish, not on draft create/update.
        return JSONResponse(
            {"blog": _blog_summary(blog, include_body=True)},
            headers=cors_headers(request.headers.get("origin")),
        )

    @app.put("/yoga/blogs/{blog_id}")
    async def yoga_blog_update(
        blog_id: str,
        request: Request,
        body: dict = Body(default_factory=dict),
        authorization: str | None = Header(default=None),
    ):
        verified = await _require_user(authorization)
        email = _email_from_verified(verified)
        _require_teacher(email)
        if "disabled" in body:
            raise HTTPException(
                status_code=403,
                detail="Only admins can change disabled status",
            )
        existing = get_blog(blog_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Blog not found")
        if existing.get("authorEmail") != email:
            raise HTTPException(status_code=403, detail="Not your blog")
        if (existing.get("status") or "") == "published":
            raise HTTPException(
                status_code=400,
                detail="Published posts cannot be edited",
            )
        title = str(
            body.get("title") if body.get("title") is not None else existing.get("title") or ""
        )
        summary = str(
            body.get("summary") if body.get("summary") is not None else existing.get("summary") or ""
        )
        blog_body = (
            body.get("body") if body.get("body") is not None else existing.get("body") or []
        )
        image = str(
            body.get("image") if body.get("image") is not None else existing.get("image") or ""
        )
        blog = upsert_blog(
            blog_id=blog_id,
            author_email=email,
            title=title,
            summary=summary,
            body=blog_body,
            image=image,
            status=existing.get("status") or "draft",
        )
        # Content review runs only on publish, not on draft create/update.
        return JSONResponse(
            {"blog": _blog_summary(blog, include_body=True)},
            headers=cors_headers(request.headers.get("origin")),
        )

    @app.post("/yoga/blogs/{blog_id}/publish")
    async def yoga_blog_publish(
        blog_id: str,
        request: Request,
        authorization: str | None = Header(default=None),
    ):
        verified = await _require_user(authorization)
        email = _email_from_verified(verified)
        _require_teacher(email)
        existing = get_blog(blog_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Blog not found")
        if existing.get("authorEmail") != email:
            raise HTTPException(status_code=403, detail="Not your blog")
        # Re-assess at publish time so the gate uses current content.
        assessment = await assess_blog_content(
            title=str(existing.get("title") or ""),
            summary=str(existing.get("summary") or ""),
            body=existing.get("body") or [],
        )
        if not assessment.get("ok"):
            reason = str(assessment.get("reason") or "").strip() or (
                "This post did not pass our content review for a child-safe, respectful community."
            )
            set_blog_assessment(
                blog_id,
                ok=False,
                reason=reason,
                demote_if_published=True,
            )
            raise HTTPException(status_code=422, detail=reason)
        set_blog_assessment(
            blog_id,
            ok=True,
            reason="",
            demote_if_published=False,
        )
        try:
            blog = publish_blog(blog_id, email)
        except KeyError:
            raise HTTPException(status_code=404, detail="Blog not found")
        except PermissionError:
            raise HTTPException(status_code=403, detail="Not your blog")
        except ValueError as exc:
            if str(exc) == "assessment_failed":
                blog = get_blog(blog_id) or existing
                reason = (blog.get("assessmentReason") or "").strip() or (
                    "This post did not pass our content review for a child-safe, respectful community."
                )
                raise HTTPException(status_code=422, detail=reason)
            raise
        return JSONResponse(
            {"blog": _blog_summary(blog, include_body=True)},
            headers=cors_headers(request.headers.get("origin")),
        )

    @app.post("/yoga/blogs/{blog_id}/view")
    async def yoga_blog_view(
        blog_id: str,
        request: Request,
        authorization: str | None = Header(default=None),
    ):
        # Auth optional; always allow increment for published
        await _optional_user(authorization)
        try:
            count = increment_blog_views(blog_id)
        except KeyError:
            raise HTTPException(status_code=404, detail="Blog not found")
        return JSONResponse(
            {"viewCount": count},
            headers=cors_headers(request.headers.get("origin")),
        )

    @app.post("/yoga/blogs/{blog_id}/like")
    async def yoga_blog_like(
        blog_id: str,
        request: Request,
        authorization: str | None = Header(default=None),
    ):
        verified = await _require_user(authorization)
        email = _email_from_verified(verified)
        try:
            result = like_blog(blog_id, email)
        except KeyError:
            raise HTTPException(status_code=404, detail="Blog not found")
        except PermissionError:
            raise HTTPException(status_code=400, detail="Only published posts can be liked")
        except ValueError as exc:
            if str(exc) == "cannot_like_own":
                raise HTTPException(status_code=400, detail="Cannot like your own post")
            raise HTTPException(status_code=400, detail=str(exc))
        return JSONResponse(
            result,
            headers=cors_headers(request.headers.get("origin")),
        )

    @app.delete("/yoga/blogs/{blog_id}/like")
    async def yoga_blog_unlike(
        blog_id: str,
        request: Request,
        authorization: str | None = Header(default=None),
    ):
        verified = await _require_user(authorization)
        email = _email_from_verified(verified)
        try:
            result = unlike_blog(blog_id, email)
        except KeyError:
            raise HTTPException(status_code=404, detail="Blog not found")
        return JSONResponse(
            result,
            headers=cors_headers(request.headers.get("origin")),
        )

    @app.post("/yoga/blogs/{blog_id}/flag")
    async def yoga_blog_flag(
        blog_id: str,
        request: Request,
        body: dict = Body(default_factory=dict),
        authorization: str | None = Header(default=None),
    ):
        # Any visitor may flag; auth optional.
        await _optional_user(authorization)
        reason = str(body.get("reason") or "").strip()
        try:
            blog = flag_blog(blog_id, reason)
        except KeyError:
            raise HTTPException(status_code=404, detail="Blog not found")
        except PermissionError:
            raise HTTPException(status_code=400, detail="Only published posts can be flagged")
        return JSONResponse(
            {"blog": _blog_summary(blog, include_body=False)},
            headers=cors_headers(request.headers.get("origin")),
        )

    @app.get("/yoga/routines")
    async def yoga_routines_list(
        request: Request,
        mine: bool = Query(default=False),
        authorization: str | None = Header(default=None),
    ):
        if mine:
            verified = await _require_user(authorization)
            email = _email_from_verified(verified)
            _require_teacher(email)
            routines = list_routines(published_only=False, author_email=email)
        else:
            routines = list_routines(
                published_only=True,
                hide_disabled_teachers=True,
            )
        return JSONResponse(
            {"routines": [_routine_public(r) for r in routines]},
            headers=cors_headers(request.headers.get("origin")),
        )

    @app.get("/yoga/routines/{routine_id}")
    async def yoga_routine_get(
        routine_id: str,
        request: Request,
        authorization: str | None = Header(default=None),
    ):
        routine = get_routine(routine_id)
        if not routine:
            raise HTTPException(status_code=404, detail="Routine not found")
        if routine.get("status") != "published":
            verified = await _optional_user(authorization)
            email = _email_from_verified(verified)
            if email != routine.get("authorEmail"):
                raise HTTPException(status_code=404, detail="Routine not found")
        elif teacher_is_disabled(get_teacher(routine.get("authorEmail") or "")):
            verified = await _optional_user(authorization)
            email = _email_from_verified(verified)
            if email != routine.get("authorEmail"):
                raise HTTPException(status_code=404, detail="Routine not found")
        return JSONResponse(
            {"routine": _routine_public(routine)},
            headers=cors_headers(request.headers.get("origin")),
        )

    @app.post("/yoga/routines")
    async def yoga_routine_create(
        request: Request,
        body: dict = Body(default_factory=dict),
        authorization: str | None = Header(default=None),
    ):
        verified = await _require_user(authorization)
        email = _email_from_verified(verified)
        _require_teacher(email)
        name = str(body.get("name") or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Name is required")
        payload = body.get("payload")
        if not isinstance(payload, dict):
            raise HTTPException(status_code=400, detail="payload object required")
        status = str(body.get("status") or "draft").strip().lower()
        if status not in ("draft", "published"):
            status = "draft"
        routine = upsert_routine(
            routine_id=str(body.get("id") or "").strip() or None,
            author_email=email,
            name=name,
            description=str(body.get("description") or ""),
            payload=payload,
            status=status,
        )
        return JSONResponse(
            {"routine": _routine_public(routine)},
            headers=cors_headers(request.headers.get("origin")),
        )

    @app.put("/yoga/routines/{routine_id}")
    async def yoga_routine_update(
        routine_id: str,
        request: Request,
        body: dict = Body(default_factory=dict),
        authorization: str | None = Header(default=None),
    ):
        verified = await _require_user(authorization)
        email = _email_from_verified(verified)
        _require_teacher(email)
        existing = get_routine(routine_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Routine not found")
        if existing.get("authorEmail") != email:
            raise HTTPException(status_code=403, detail="Not your routine")
        payload = body.get("payload")
        if payload is not None and not isinstance(payload, dict):
            raise HTTPException(status_code=400, detail="payload must be an object")
        routine = upsert_routine(
            routine_id=routine_id,
            author_email=email,
            name=str(body.get("name") if body.get("name") is not None else existing.get("name") or ""),
            description=str(
                body.get("description")
                if body.get("description") is not None
                else existing.get("description") or ""
            ),
            payload=payload if payload is not None else dict(existing.get("payload") or {}),
            status=existing.get("status") or "draft",
        )
        return JSONResponse(
            {"routine": _routine_public(routine)},
            headers=cors_headers(request.headers.get("origin")),
        )

    @app.post("/yoga/routines/{routine_id}/publish")
    async def yoga_routine_publish(
        routine_id: str,
        request: Request,
        authorization: str | None = Header(default=None),
    ):
        verified = await _require_user(authorization)
        email = _email_from_verified(verified)
        _require_teacher(email)
        try:
            routine = publish_routine(routine_id, email)
        except KeyError:
            raise HTTPException(status_code=404, detail="Routine not found")
        except PermissionError:
            raise HTTPException(status_code=403, detail="Not your routine")
        return JSONResponse(
            {"routine": _routine_public(routine)},
            headers=cors_headers(request.headers.get("origin")),
        )

    @app.get("/yoga/admin/teachers")
    async def yoga_admin_teachers(
        request: Request,
        authorization: str | None = Header(default=None),
    ):
        verified = await _require_user(authorization)
        _require_admin(_email_from_verified(verified))
        teachers = [_admin_teacher(t) for t in list_all_teachers()]
        return JSONResponse(
            {"teachers": teachers},
            headers=cors_headers(request.headers.get("origin")),
        )

    @app.put("/yoga/admin/teachers/{email}")
    @app.patch("/yoga/admin/teachers/{email}")
    async def yoga_admin_teacher_patch(
        email: str,
        request: Request,
        body: dict = Body(default_factory=dict),
        authorization: str | None = Header(default=None),
    ):
        verified = await _require_user(authorization)
        _require_admin(_email_from_verified(verified))
        email_norm = (email or "").strip().lower()
        existing = get_teacher(email_norm)
        if not existing:
            raise HTTPException(status_code=404, detail="Teacher not found")

        profile_keys = (
            "displayName",
            "blurb",
            "photoDataUrl",
            "photoUrl",
            "contactEmail",
            "contactPhone",
            "contactLink",
            "youtubeLinks",
            "country",
            "region",
        )
        has_profile = any(k in body for k in profile_keys)
        has_disabled = "disabled" in body
        if not has_profile and not has_disabled:
            raise HTTPException(status_code=400, detail="No fields to update")

        teacher = existing
        if has_profile:
            display_name = body.get("displayName")
            blurb = body.get("blurb")
            photo_data_url = body.get("photoDataUrl")
            photo_url = body.get("photoUrl")
            contact_email = body.get("contactEmail")
            contact_phone = body.get("contactPhone")
            contact_link = body.get("contactLink")
            youtube_links = body.get("youtubeLinks")
            country = body.get("country")
            region = body.get("region")

            if display_name is not None:
                display_name = str(display_name).strip()
            if blurb is not None:
                blurb = str(blurb).strip()
                if not blurb:
                    raise HTTPException(status_code=400, detail="Blurb is required")
                if len(blurb) > MAX_BLURB_LEN:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Blurb max {MAX_BLURB_LEN} characters",
                    )
            if photo_data_url is not None:
                photo_data_url = str(photo_data_url).strip()
                if photo_data_url and not _DATA_URL_RE.match(photo_data_url):
                    raise HTTPException(
                        status_code=400,
                        detail="photoDataUrl must be an image data URL",
                    )
                if len(photo_data_url) > MAX_PHOTO_DATA_URL_CHARS:
                    raise HTTPException(status_code=400, detail="photoDataUrl too large")
            if photo_url is not None:
                photo_url = str(photo_url).strip()
            if contact_email is not None:
                contact_email = str(contact_email).strip()
            if contact_phone is not None:
                contact_phone = str(contact_phone).strip()
            if contact_link is not None:
                contact_link = str(contact_link).strip()
            if youtube_links is not None and not isinstance(youtube_links, list):
                raise HTTPException(status_code=400, detail="youtubeLinks must be a list")
            if country is not None:
                country = str(country).strip().upper()
            if region is not None:
                region = str(region).strip()

            has_photo = bool(
                (
                    photo_data_url
                    if photo_data_url is not None
                    else existing.get("photoDataUrl")
                )
                or (photo_url if photo_url is not None else existing.get("photoUrl"))
            )
            if not has_photo:
                raise HTTPException(status_code=400, detail="Profile image is required")

            teacher = upsert_teacher(
                email_norm,
                display_name=display_name,
                blurb=blurb,
                photo_data_url=photo_data_url,
                photo_url=photo_url,
                contact_email=contact_email,
                contact_phone=contact_phone,
                contact_link=contact_link,
                youtube_links=list(youtube_links) if youtube_links is not None else None,
                country=country,
                region=region,
            )

        if has_disabled:
            want_disabled = bool(body.get("disabled"))
            if not want_disabled:
                latest = get_teacher(email_norm) or teacher
                if not teacher_has_website(latest):
                    raise HTTPException(
                        status_code=400,
                        detail="Website is required before approving a teacher",
                    )
            try:
                teacher = set_teacher_disabled(email_norm, want_disabled)
            except KeyError:
                raise HTTPException(status_code=404, detail="Teacher not found")
            except ValueError as exc:
                if str(exc) == "teacher_banned":
                    raise HTTPException(
                        status_code=400,
                        detail="Unban the teacher before approving",
                    )
                raise

        return JSONResponse(
            {"teacher": _public_teacher(teacher)},
            headers=cors_headers(request.headers.get("origin")),
        )

    @app.delete("/yoga/admin/teachers/{email}")
    async def yoga_admin_teacher_delete(
        email: str,
        request: Request,
        authorization: str | None = Header(default=None),
    ):
        verified = await _require_user(authorization)
        _require_admin(_email_from_verified(verified))
        email_norm = (email or "").strip().lower()
        try:
            delete_teacher(email_norm)
        except KeyError:
            raise HTTPException(status_code=404, detail="Teacher not found")
        return JSONResponse(
            {"ok": True, "email": email_norm},
            headers=cors_headers(request.headers.get("origin")),
        )

    @app.get("/yoga/admin/teachers/{email}/lookup")
    async def yoga_admin_teacher_lookup_get(
        email: str,
        request: Request,
        authorization: str | None = Header(default=None),
    ):
        verified = await _require_user(authorization)
        _require_admin(_email_from_verified(verified))
        email_norm = (email or "").strip().lower()
        try:
            lookup = get_teacher_admin_lookup(email_norm)
        except KeyError:
            raise HTTPException(status_code=404, detail="Teacher not found")
        # Reflect in-process task even if store write lagged.
        task = _lookup_tasks.get(email_norm)
        if task and not task.done():
            if not lookup:
                lookup = {"status": "running", "reportMarkdown": ""}
            elif str(lookup.get("status") or "") != "running":
                lookup = {**lookup, "status": "running"}
        return JSONResponse(
            {"lookup": lookup, "email": email_norm},
            headers=cors_headers(request.headers.get("origin")),
        )

    async def _run_teacher_lookup_job(email_norm: str, admin_email: str) -> None:
        try:
            teacher = get_teacher(email_norm)
            if not teacher:
                set_teacher_admin_lookup(
                    email_norm,
                    {
                        "status": "error",
                        "error": "Teacher not found",
                        "generatedBy": admin_email,
                    },
                )
                return
            from teacher_lookup_research import research_teacher_lookup

            result = await research_teacher_lookup(teacher)
            set_teacher_admin_lookup(
                email_norm,
                {
                    **result,
                    "status": "ready",
                    "generatedAt": time.time(),
                    "generatedBy": admin_email,
                },
            )
        except Exception as exc:
            _log.exception("Teacher lookup failed for %s", email_norm)
            try:
                set_teacher_admin_lookup(
                    email_norm,
                    {
                        "status": "error",
                        "error": str(exc)[:800],
                        "generatedBy": admin_email,
                        "startedAt": time.time(),
                    },
                )
            except Exception:
                _log.exception("Could not persist lookup error for %s", email_norm)
        finally:
            task = _lookup_tasks.get(email_norm)
            if task is asyncio.current_task():
                _lookup_tasks.pop(email_norm, None)

    @app.post("/yoga/admin/teachers/{email}/lookup")
    async def yoga_admin_teacher_lookup_generate(
        email: str,
        request: Request,
        body: dict = Body(default_factory=dict),
        authorization: str | None = Header(default=None),
    ):
        verified = await _require_user(authorization)
        admin_email = _email_from_verified(verified)
        _require_admin(admin_email)
        email_norm = (email or "").strip().lower()
        teacher = get_teacher(email_norm)
        if not teacher:
            raise HTTPException(status_code=404, detail="Teacher not found")

        force = bool(body.get("force") or body.get("regenerate"))
        try:
            existing = get_teacher_admin_lookup(email_norm)
        except KeyError:
            existing = None

        existing_status = str((existing or {}).get("status") or "").lower()
        has_report = bool(str((existing or {}).get("reportMarkdown") or "").strip())
        task = _lookup_tasks.get(email_norm)
        task_running = bool(task and not task.done())

        if existing and not force:
            if existing_status == "running" or task_running:
                return JSONResponse(
                    {
                        "lookup": {**(existing or {}), "status": "running"},
                        "email": email_norm,
                        "cached": False,
                        "started": False,
                    },
                    headers=cors_headers(request.headers.get("origin")),
                )
            if has_report and existing_status != "error":
                return JSONResponse(
                    {
                        "lookup": {**existing, "status": existing.get("status") or "ready"},
                        "email": email_norm,
                        "cached": True,
                        "started": False,
                    },
                    headers=cors_headers(request.headers.get("origin")),
                )

        if task_running and force:
            # Let the in-flight job finish; client can poll. Avoid stacked research.
            return JSONResponse(
                {
                    "lookup": {**(existing or {}), "status": "running"},
                    "email": email_norm,
                    "cached": False,
                    "started": False,
                },
                headers=cors_headers(request.headers.get("origin")),
            )

        started_at = time.time()
        running_payload = set_teacher_admin_lookup(
            email_norm,
            {
                "status": "running",
                "startedAt": started_at,
                "generatedBy": admin_email,
                "reportMarkdown": str((existing or {}).get("reportMarkdown") or ""),
                "sources": list((existing or {}).get("sources") or []),
                "contactSnapshot": dict((existing or {}).get("contactSnapshot") or {}),
                "generatedAt": (existing or {}).get("generatedAt"),
            },
        )

        job = asyncio.create_task(_run_teacher_lookup_job(email_norm, admin_email))
        _lookup_tasks[email_norm] = job

        return JSONResponse(
            {
                "lookup": running_payload,
                "email": email_norm,
                "cached": False,
                "started": True,
            },
            status_code=202,
            headers=cors_headers(request.headers.get("origin")),
        )

    @app.put("/yoga/admin/teachers/{email}/reject")
    @app.patch("/yoga/admin/teachers/{email}/reject")
    async def yoga_admin_teacher_reject(
        email: str,
        request: Request,
        body: dict = Body(default_factory=dict),
        authorization: str | None = Header(default=None),
    ):
        verified = await _require_user(authorization)
        _require_admin(_email_from_verified(verified))
        email_norm = (email or "").strip().lower()
        reason = str(body.get("rejectReason") or body.get("reason") or "").strip()
        if not reason:
            raise HTTPException(status_code=400, detail="rejectReason is required")
        try:
            teacher = set_teacher_rejected(email_norm, reason)
        except KeyError:
            raise HTTPException(status_code=404, detail="Teacher not found")
        except ValueError as exc:
            if str(exc) == "teacher_banned":
                raise HTTPException(
                    status_code=400,
                    detail="Unban the teacher before rejecting the application",
                )
            if str(exc) == "reject_reason_required":
                raise HTTPException(status_code=400, detail="rejectReason is required")
            raise
        return JSONResponse(
            {"teacher": _public_teacher(teacher)},
            headers=cors_headers(request.headers.get("origin")),
        )

    @app.put("/yoga/admin/teachers/{email}/ban")
    @app.patch("/yoga/admin/teachers/{email}/ban")
    async def yoga_admin_teacher_ban(
        email: str,
        request: Request,
        body: dict = Body(default_factory=dict),
        authorization: str | None = Header(default=None),
    ):
        verified = await _require_user(authorization)
        _require_admin(_email_from_verified(verified))
        email_norm = (email or "").strip().lower()
        if "banned" not in body:
            raise HTTPException(status_code=400, detail="banned boolean required")
        want_banned = bool(body.get("banned"))
        ban_reason = str(body.get("banReason") or body.get("reason") or "").strip()
        if want_banned and not ban_reason:
            raise HTTPException(status_code=400, detail="banReason is required")
        try:
            teacher = set_teacher_banned(
                email_norm,
                want_banned,
                ban_reason=ban_reason,
            )
        except KeyError:
            raise HTTPException(status_code=404, detail="Teacher not found")
        return JSONResponse(
            {"teacher": _public_teacher(teacher)},
            headers=cors_headers(request.headers.get("origin")),
        )

    @app.get("/yoga/admin/blogs")
    async def yoga_admin_blogs(
        request: Request,
        authorization: str | None = Header(default=None),
    ):
        verified = await _require_user(authorization)
        _require_admin(_email_from_verified(verified))
        blogs = [
            _blog_summary(b, include_body=False)
            for b in list_blogs(published_only=False, include_disabled=True)
        ]
        return JSONResponse(
            {"blogs": blogs},
            headers=cors_headers(request.headers.get("origin")),
        )

    @app.put("/yoga/admin/blogs/{blog_id}")
    @app.patch("/yoga/admin/blogs/{blog_id}")
    async def yoga_admin_blog_patch(
        blog_id: str,
        request: Request,
        body: dict = Body(default_factory=dict),
        authorization: str | None = Header(default=None),
    ):
        verified = await _require_user(authorization)
        _require_admin(_email_from_verified(verified))
        if (
            "disabled" not in body
            and "clearFlag" not in body
            and "flagged" not in body
            and "adminReviewed" not in body
        ):
            raise HTTPException(
                status_code=400,
                detail="disabled boolean, clearFlag, or adminReviewed required",
            )
        blog = None
        try:
            if "disabled" in body:
                blog = set_blog_disabled(blog_id, bool(body.get("disabled")))
            if body.get("clearFlag") is True or body.get("flagged") is False:
                blog = clear_blog_flag(blog_id)
            if body.get("adminReviewed") is True:
                blog = set_blog_admin_reviewed(blog_id)
        except KeyError:
            raise HTTPException(status_code=404, detail="Blog not found")
        if blog is None:
            raise HTTPException(status_code=400, detail="No changes")
        return JSONResponse(
            {"blog": _blog_summary(blog, include_body=False)},
            headers=cors_headers(request.headers.get("origin")),
        )

    @app.delete("/yoga/admin/blogs/{blog_id}")
    async def yoga_admin_blog_delete(
        blog_id: str,
        request: Request,
        authorization: str | None = Header(default=None),
    ):
        verified = await _require_user(authorization)
        _require_admin(_email_from_verified(verified))
        try:
            delete_blog(blog_id)
        except KeyError:
            raise HTTPException(status_code=404, detail="Blog not found")
        return JSONResponse(
            {"ok": True, "id": blog_id},
            headers=cors_headers(request.headers.get("origin")),
        )

    # --- Bug / error feedback ---

    def _feedback_public(
        item: dict[str, Any],
        *,
        include_screenshot: bool,
    ) -> dict[str, Any]:
        out: dict[str, Any] = {
            "id": item.get("id") or "",
            "authorEmail": item.get("authorEmail") or "",
            "authorName": item.get("authorName") or "",
            "comment": item.get("comment") or "",
            "debugJson": item.get("debugJson") or "",
            "userAgent": item.get("userAgent") or "",
            "route": item.get("route") or "",
            "status": (
                str(item.get("status") or "open").strip().lower()
                if str(item.get("status") or "open").strip().lower() in FEEDBACK_STATUSES
                else "open"
            ),
            "createdAt": item.get("createdAt"),
        }
        screenshot = str(item.get("screenshotDataUrl") or "")
        if include_screenshot and screenshot:
            out["screenshotDataUrl"] = screenshot
        elif screenshot or item.get("hasScreenshot"):
            out["hasScreenshot"] = True
        return out

    @app.post("/yoga/feedback")
    async def yoga_feedback_create(
        request: Request,
        body: dict = Body(default_factory=dict),
        authorization: str | None = Header(default=None),
    ):
        verified = await _require_user(authorization)
        email = _email_from_verified(verified)
        name = str(
            verified.get("name")
            or verified.get("given_name")
            or body.get("authorName")
            or ""
        ).strip()
        comment = str(body.get("comment") or "").strip()
        if not comment:
            raise HTTPException(status_code=400, detail="comment required")
        if len(comment) > MAX_FEEDBACK_COMMENT_LEN:
            raise HTTPException(
                status_code=400,
                detail=f"comment too long (max {MAX_FEEDBACK_COMMENT_LEN})",
            )
        screenshot = str(body.get("screenshotDataUrl") or "").strip()
        if screenshot and len(screenshot) > MAX_FEEDBACK_SCREENSHOT_CHARS:
            raise HTTPException(status_code=400, detail="screenshot too large")
        debug_raw = body.get("debug")
        if debug_raw is None:
            debug_raw = body.get("debugJson")
        if isinstance(debug_raw, dict) or isinstance(debug_raw, list):
            debug_json = json.dumps(debug_raw, ensure_ascii=False)
        else:
            debug_json = str(debug_raw or "")
        if len(debug_json) > MAX_FEEDBACK_DEBUG_CHARS:
            debug_json = debug_json[:MAX_FEEDBACK_DEBUG_CHARS]
        route = str(body.get("route") or "").strip()
        user_agent = str(
            body.get("userAgent") or request.headers.get("user-agent") or ""
        ).strip()
        try:
            item = create_feedback(
                author_email=email,
                author_name=name,
                comment=comment,
                screenshot_data_url=screenshot,
                debug_json=debug_json,
                user_agent=user_agent,
                route=route,
            )
        except ValueError as e:
            code = str(e)
            if code == "comment_required":
                raise HTTPException(status_code=400, detail="comment required")
            if code == "comment_too_long":
                raise HTTPException(status_code=400, detail="comment too long")
            if code == "screenshot_too_large":
                raise HTTPException(status_code=400, detail="screenshot too large")
            if code == "screenshot_invalid":
                raise HTTPException(status_code=400, detail="screenshot invalid")
            raise HTTPException(status_code=400, detail=code)
        return JSONResponse(
            {"feedback": _feedback_public(item, include_screenshot=False)},
            headers=cors_headers(request.headers.get("origin")),
        )

    @app.get("/yoga/admin/feedback")
    async def yoga_admin_feedback_list(
        request: Request,
        authorization: str | None = Header(default=None),
    ):
        verified = await _require_user(authorization)
        _require_admin(_email_from_verified(verified))
        items = [
            _feedback_public(f, include_screenshot=False)
            for f in list_feedback(include_screenshot=False)
        ]
        return JSONResponse(
            {"feedback": items},
            headers=cors_headers(request.headers.get("origin")),
        )

    @app.get("/yoga/admin/feedback/{feedback_id}")
    async def yoga_admin_feedback_get(
        feedback_id: str,
        request: Request,
        authorization: str | None = Header(default=None),
    ):
        verified = await _require_user(authorization)
        _require_admin(_email_from_verified(verified))
        item = get_feedback(feedback_id)
        if not item:
            raise HTTPException(status_code=404, detail="Feedback not found")
        return JSONResponse(
            {"feedback": _feedback_public(item, include_screenshot=True)},
            headers=cors_headers(request.headers.get("origin")),
        )

    @app.put("/yoga/admin/feedback/{feedback_id}")
    @app.patch("/yoga/admin/feedback/{feedback_id}")
    async def yoga_admin_feedback_patch(
        feedback_id: str,
        request: Request,
        body: dict = Body(default_factory=dict),
        authorization: str | None = Header(default=None),
    ):
        verified = await _require_user(authorization)
        _require_admin(_email_from_verified(verified))
        if "status" not in body:
            raise HTTPException(status_code=400, detail="status required")
        status = str(body.get("status") or "").strip().lower()
        if status not in FEEDBACK_STATUSES:
            raise HTTPException(
                status_code=400,
                detail="status must be open, in_progress, or fixed",
            )
        try:
            item = set_feedback_status(feedback_id, status)
        except KeyError:
            raise HTTPException(status_code=404, detail="Feedback not found")
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail="status must be open, in_progress, or fixed",
            )
        return JSONResponse(
            {"feedback": _feedback_public(item, include_screenshot=False)},
            headers=cors_headers(request.headers.get("origin")),
        )

    @app.delete("/yoga/admin/feedback/{feedback_id}")
    async def yoga_admin_feedback_delete(
        feedback_id: str,
        request: Request,
        authorization: str | None = Header(default=None),
    ):
        verified = await _require_user(authorization)
        _require_admin(_email_from_verified(verified))
        try:
            delete_feedback(feedback_id)
        except KeyError:
            raise HTTPException(status_code=404, detail="Feedback not found")
        return JSONResponse(
            {"ok": True, "id": feedback_id},
            headers=cors_headers(request.headers.get("origin")),
        )

    @app.post("/yoga/seed")
    async def yoga_seed(
        request: Request,
        body: dict = Body(default_factory=dict),
        authorization: str | None = Header(default=None),
    ):
        verified = await _require_user(authorization)
        email = _email_from_verified(verified)
        _require_admin(email)
        force = bool(body.get("force"))
        result = seed_community_content(force=force)
        return JSONResponse(result, headers=cors_headers(request.headers.get("origin")))

    # --- Teacher subscriptions ---

    @app.get("/yoga/teachers/me/subscriptions")
    async def yoga_my_subscriptions(
        request: Request,
        authorization: str | None = Header(default=None),
    ):
        verified = await _require_user(authorization)
        email = _email_from_verified(verified)
        subs = list_subscriptions(email)
        teacher_emails = [s.get("teacherEmail") or "" for s in subs]
        upcoming = list_upcoming_classes(teacher_emails=teacher_emails) if teacher_emails else []
        return JSONResponse(
            {
                "subscriptions": subs,
                "upcomingCount": len(upcoming),
            },
            headers=cors_headers(request.headers.get("origin")),
        )

    @app.post("/yoga/teachers/{email}/subscribe")
    async def yoga_teacher_subscribe(
        email: str,
        request: Request,
        authorization: str | None = Header(default=None),
    ):
        verified = await _require_user(authorization)
        subscriber = _email_from_verified(verified)
        teacher_email = (email or "").strip().lower()
        try:
            sub = subscribe_to_teacher(subscriber, teacher_email)
        except KeyError:
            raise HTTPException(status_code=404, detail="Teacher not found")
        except ValueError as exc:
            if str(exc) == "cannot_subscribe_self":
                raise HTTPException(status_code=400, detail="Cannot subscribe to yourself")
            raise
        return JSONResponse(
            {"subscription": sub, "subscribed": True},
            headers=cors_headers(request.headers.get("origin")),
        )

    @app.delete("/yoga/teachers/{email}/subscribe")
    async def yoga_teacher_unsubscribe(
        email: str,
        request: Request,
        authorization: str | None = Header(default=None),
    ):
        verified = await _require_user(authorization)
        subscriber = _email_from_verified(verified)
        teacher_email = (email or "").strip().lower()
        unsubscribe_from_teacher(subscriber, teacher_email)
        return JSONResponse(
            {"subscribed": False, "teacherEmail": teacher_email},
            headers=cors_headers(request.headers.get("origin")),
        )

    @app.get("/yoga/teachers/{email}/subscribed")
    async def yoga_teacher_subscribed_status(
        email: str,
        request: Request,
        authorization: str | None = Header(default=None),
    ):
        verified = await _require_user(authorization)
        subscriber = _email_from_verified(verified)
        teacher_email = (email or "").strip().lower()
        return JSONResponse(
            {
                "subscribed": is_subscribed(subscriber, teacher_email),
                "teacherEmail": teacher_email,
            },
            headers=cors_headers(request.headers.get("origin")),
        )

    # --- Classes ---

    @app.get("/yoga/classes/upcoming")
    async def yoga_classes_upcoming(
        request: Request,
        from_: str | None = Query(default=None, alias="from"),
        to: str | None = Query(default=None),
        authorization: str | None = Header(default=None),
    ):
        verified = await _require_user(authorization)
        email = _email_from_verified(verified)
        subs = list_subscriptions(email)
        teacher_emails = [s.get("teacherEmail") or "" for s in subs if s.get("teacherEmail")]
        if not teacher_emails:
            return JSONResponse(
                {"classes": []},
                headers=cors_headers(request.headers.get("origin")),
            )
        classes = list_upcoming_classes(
            teacher_emails=teacher_emails,
            from_starts_at=from_ or None,
            to_starts_at=to or None,
        )
        # Hide classes from teachers no longer publicly listed
        out = []
        for cls in classes:
            if not teacher_is_publicly_listed(get_teacher(cls.get("teacherEmail") or "")):
                continue
            out.append(_class_public(enrich_class_for_viewer(cls, viewer_email=email)))
        return JSONResponse(
            {"classes": out},
            headers=cors_headers(request.headers.get("origin")),
        )

    @app.get("/yoga/classes/me")
    async def yoga_classes_me(
        request: Request,
        authorization: str | None = Header(default=None),
    ):
        verified = await _require_user(authorization)
        email = _email_from_verified(verified)
        _require_approved_teacher(email)
        classes = list_classes_for_teacher(email, upcoming_only=False)
        out = [
            _class_public(enrich_class_for_viewer(c, viewer_email=email)) for c in classes
        ]
        return JSONResponse(
            {"classes": out},
            headers=cors_headers(request.headers.get("origin")),
        )

    @app.get("/yoga/classes/me/cancellations")
    async def yoga_class_cancellations_me(
        request: Request,
        authorization: str | None = Header(default=None),
    ):
        verified = await _require_user(authorization)
        email = _email_from_verified(verified)
        items = list_class_cancellations(email)
        return JSONResponse(
            {
                "cancellations": [_cancellation_public(c) for c in items],
                "count": len(items),
            },
            headers=cors_headers(request.headers.get("origin")),
        )

    @app.delete("/yoga/classes/me/cancellations")
    async def yoga_class_cancellations_clear_all(
        request: Request,
        authorization: str | None = Header(default=None),
    ):
        verified = await _require_user(authorization)
        email = _email_from_verified(verified)
        cleared = clear_all_class_cancellations(email)
        return JSONResponse(
            {"ok": True, "clearedCount": cleared},
            headers=cors_headers(request.headers.get("origin")),
        )

    @app.delete("/yoga/classes/me/cancellations/{cancellation_id}")
    async def yoga_class_cancellation_clear_one(
        cancellation_id: str,
        request: Request,
        authorization: str | None = Header(default=None),
    ):
        verified = await _require_user(authorization)
        email = _email_from_verified(verified)
        try:
            ok = clear_class_cancellation(cancellation_id, email)
        except PermissionError:
            raise HTTPException(status_code=403, detail="Not your cancellation")
        if not ok:
            raise HTTPException(status_code=404, detail="Cancellation not found")
        return JSONResponse(
            {"ok": True, "id": cancellation_id},
            headers=cors_headers(request.headers.get("origin")),
        )

    @app.get("/yoga/teachers/{email}/classes")
    async def yoga_teacher_classes(
        email: str,
        request: Request,
        authorization: str | None = Header(default=None),
    ):
        teacher_email = (email or "").strip().lower()
        teacher = get_teacher(teacher_email)
        if not teacher_is_publicly_listed(teacher):
            raise HTTPException(status_code=404, detail="Teacher not found")
        viewer = await _optional_user(authorization)
        viewer_email = _email_from_verified(viewer)
        classes = list_classes_for_teacher(teacher_email, upcoming_only=True)
        out = [
            _class_public(enrich_class_for_viewer(c, viewer_email=viewer_email or None))
            for c in classes
        ]
        return JSONResponse(
            {"classes": out},
            headers=cors_headers(request.headers.get("origin")),
        )

    @app.post("/yoga/classes")
    async def yoga_class_create(
        request: Request,
        body: dict = Body(default_factory=dict),
        authorization: str | None = Header(default=None),
    ):
        verified = await _require_user(authorization)
        email = _email_from_verified(verified)
        _require_class_teacher(email)
        title = str(body.get("title") or "")
        description = str(body.get("description") or "")
        location = str(body.get("location") or "")
        starts_at = str(body.get("startsAt") or "")
        max_registrants = int(body.get("maxRegistrants") or 0)
        image = str(body.get("image") or "")
        recurrence = body.get("recurrence")
        detail_map = {
            "title_required": "Title is required",
            "location_required": "Location is required",
            "starts_at_required": "startsAt is required",
            "starts_at_invalid": "startsAt must be a valid ISO datetime",
            "max_registrants_invalid": "maxRegistrants must be between 1 and 500",
            "max_registrants_below_count": "maxRegistrants cannot be below current registrations",
            "image_too_large": f"Image too large (max {MAX_CLASS_IMAGE_CHARS} chars)",
            "recurrence_frequency_invalid": "recurrence.frequency must be weekly, biweekly, or monthly",
            "recurrence_until_invalid": "recurrence.until must be YYYY-MM-DD",
            "recurrence_until_before_start": "recurrence.until must be on or after the first class date",
            "recurrence_empty": "Recurrence produced no classes",
        }
        try:
            if isinstance(recurrence, dict) and (
                str(recurrence.get("frequency") or "").strip()
                or str(recurrence.get("until") or "").strip()
            ):
                created = create_recurring_classes(
                    teacher_email=email,
                    title=title,
                    description=description,
                    location=location,
                    starts_at=starts_at,
                    max_registrants=max_registrants,
                    image=image,
                    frequency=str(recurrence.get("frequency") or ""),
                    until=str(recurrence.get("until") or ""),
                )
                first = created[0]
                return JSONResponse(
                    {
                        "class": _class_public(
                            enrich_class_for_viewer(first, viewer_email=email)
                        ),
                        "classes": [
                            _class_public(
                                enrich_class_for_viewer(c, viewer_email=email)
                            )
                            for c in created
                        ],
                        "createdCount": len(created),
                    },
                    headers=cors_headers(request.headers.get("origin")),
                )
            cls = upsert_class(
                class_id=None,
                teacher_email=email,
                title=title,
                description=description,
                location=location,
                starts_at=starts_at,
                max_registrants=max_registrants,
                image=image,
            )
        except ValueError as exc:
            code = str(exc)
            raise HTTPException(status_code=400, detail=detail_map.get(code, code))
        return JSONResponse(
            {
                "class": _class_public(enrich_class_for_viewer(cls, viewer_email=email)),
                "classes": [
                    _class_public(enrich_class_for_viewer(cls, viewer_email=email))
                ],
                "createdCount": 1,
            },
            headers=cors_headers(request.headers.get("origin")),
        )

    @app.put("/yoga/classes/{class_id}")
    async def yoga_class_update(
        class_id: str,
        request: Request,
        body: dict = Body(default_factory=dict),
        authorization: str | None = Header(default=None),
    ):
        verified = await _require_user(authorization)
        email = _email_from_verified(verified)
        _require_class_teacher(email)
        existing = get_class(class_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Class not found")
        if existing.get("teacherEmail") != email:
            raise HTTPException(status_code=403, detail="Not your class")
        try:
            cls = upsert_class(
                class_id=class_id,
                teacher_email=email,
                title=str(
                    body.get("title") if body.get("title") is not None else existing.get("title") or ""
                ),
                description=str(
                    body.get("description")
                    if body.get("description") is not None
                    else existing.get("description") or ""
                ),
                location=str(
                    body.get("location")
                    if body.get("location") is not None
                    else existing.get("location") or ""
                ),
                starts_at=str(
                    body.get("startsAt")
                    if body.get("startsAt") is not None
                    else existing.get("startsAt") or ""
                ),
                max_registrants=int(
                    body.get("maxRegistrants")
                    if body.get("maxRegistrants") is not None
                    else existing.get("maxRegistrants") or 1
                ),
                image=str(
                    body.get("image") if body.get("image") is not None else existing.get("image") or ""
                ),
            )
        except PermissionError:
            raise HTTPException(status_code=403, detail="Not your class")
        except ValueError as exc:
            code = str(exc)
            detail_map = {
                "title_required": "Title is required",
                "location_required": "Location is required",
                "starts_at_required": "startsAt is required",
                "starts_at_invalid": "startsAt must be a valid ISO datetime",
                "max_registrants_invalid": "maxRegistrants must be between 1 and 500",
                "max_registrants_below_count": "maxRegistrants cannot be below current registrations",
                "image_too_large": "Image too large",
            }
            raise HTTPException(status_code=400, detail=detail_map.get(code, code))
        return JSONResponse(
            {"class": _class_public(enrich_class_for_viewer(cls, viewer_email=email))},
            headers=cors_headers(request.headers.get("origin")),
        )

    @app.delete("/yoga/classes/{class_id}")
    async def yoga_class_delete(
        class_id: str,
        request: Request,
        authorization: str | None = Header(default=None),
        scope: str | None = Query(default=None),
    ):
        verified = await _require_user(authorization)
        email = _email_from_verified(verified)
        _require_class_teacher(email)
        scope_norm = (scope or "").strip().lower()
        try:
            if scope_norm in ("future", "from", "series_from"):
                result = delete_class_series_from(class_id, email)
                return JSONResponse(
                    {
                        "ok": True,
                        "id": class_id,
                        "deletedCount": int(result.get("deletedCount") or 0),
                        "ids": list(result.get("ids") or []),
                        "scope": "future",
                    },
                    headers=cors_headers(request.headers.get("origin")),
                )
            delete_class(class_id, email)
        except KeyError:
            raise HTTPException(status_code=404, detail="Class not found")
        except PermissionError:
            raise HTTPException(status_code=403, detail="Not your class")
        return JSONResponse(
            {"ok": True, "id": class_id, "deletedCount": 1, "ids": [class_id]},
            headers=cors_headers(request.headers.get("origin")),
        )

    @app.post("/yoga/classes/{class_id}/register")
    async def yoga_class_register(
        class_id: str,
        request: Request,
        authorization: str | None = Header(default=None),
    ):
        verified = await _require_user(authorization)
        email = _email_from_verified(verified)
        try:
            register_for_class(class_id, email)
        except KeyError:
            raise HTTPException(status_code=404, detail="Class not found")
        except PermissionError as exc:
            if str(exc) == "class_full":
                raise HTTPException(status_code=409, detail="Class is full")
            raise
        except ValueError as exc:
            if str(exc) == "cannot_register_own_class":
                raise HTTPException(status_code=400, detail="Cannot register for your own class")
            raise
        cls = get_class(class_id)
        return JSONResponse(
            {
                "ok": True,
                "class": _class_public(
                    enrich_class_for_viewer(cls or {}, viewer_email=email)
                ),
            },
            headers=cors_headers(request.headers.get("origin")),
        )

    @app.delete("/yoga/classes/{class_id}/register")
    async def yoga_class_unregister(
        class_id: str,
        request: Request,
        authorization: str | None = Header(default=None),
    ):
        verified = await _require_user(authorization)
        email = _email_from_verified(verified)
        unregister_from_class(class_id, email)
        cls = get_class(class_id)
        return JSONResponse(
            {
                "ok": True,
                "class": _class_public(
                    enrich_class_for_viewer(cls or {}, viewer_email=email)
                )
                if cls
                else None,
            },
            headers=cors_headers(request.headers.get("origin")),
        )

    @app.get("/yoga/classes/{class_id}/registrants")
    async def yoga_class_registrants(
        class_id: str,
        request: Request,
        authorization: str | None = Header(default=None),
    ):
        verified = await _require_user(authorization)
        email = _email_from_verified(verified)
        _require_approved_teacher(email)
        cls = get_class(class_id)
        if not cls:
            raise HTTPException(status_code=404, detail="Class not found")
        if cls.get("teacherEmail") != email:
            raise HTTPException(status_code=403, detail="Not your class")
        regs = list_registrants(class_id)
        return JSONResponse(
            {"registrants": regs, "class": _class_public(enrich_class_for_viewer(cls, viewer_email=email))},
            headers=cors_headers(request.headers.get("origin")),
        )
