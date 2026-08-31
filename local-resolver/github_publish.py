"""Commit scrape ABC book files to GitHub (admin-only)."""

from __future__ import annotations

import base64
import os
from typing import Any

import httpx


class GitHubPublishError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


def _config() -> dict[str, str]:
    token = (os.getenv("GITHUB_TOKEN") or os.getenv("GITHUB_PUBLISH_TOKEN") or "").strip()
    repo = (os.getenv("GITHUB_PUBLISH_REPO") or "syntithenai/abc2book").strip()
    branch = (os.getenv("GITHUB_PUBLISH_BRANCH") or "main").strip()
    path_prefix = (os.getenv("GITHUB_PUBLISH_SCRAPE_PREFIX") or "scrape").strip().strip("/")
    return {
        "token": token,
        "repo": repo,
        "branch": branch,
        "path_prefix": path_prefix,
    }


def publish_scrape_file(
    *,
    filename: str,
    content: str,
    message: str,
    book: str | None = None,
) -> dict[str, Any]:
    cfg = _config()
    if not cfg["token"]:
        raise GitHubPublishError(
            "GITHUB_TOKEN (or GITHUB_PUBLISH_TOKEN) is not configured on the resolver",
            status_code=503,
        )
    safe_name = os.path.basename(str(filename || "").strip())
    if not safe_name.endswith(".abc") or "/" in safe_name or "\\" in safe_name:
        raise GitHubPublishError("filename must be a bare .abc scrape name")
    body = str(content or "")
    if not body.strip():
        raise GitHubPublishError("ABC content is empty")
    commit_message = (message or "").strip() or f"Publish {safe_name} from tunebook"
    if book:
        commit_message = commit_message or f"Publish {book} to scrape/{safe_name}"

    api = f"https://api.github.com/repos/{cfg['repo']}/contents/{cfg['path_prefix']}/{safe_name}"
    headers = {
        "Authorization": f"Bearer {cfg['token']}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "abc2book-local-resolver",
    }
    encoded = base64.b64encode(body.encode("utf-8")).decode("ascii")
    sha = None
    with httpx.Client(timeout=60.0) as client:
        existing = client.get(api, headers=headers, params={"ref": cfg["branch"]})
        if existing.status_code == 200:
            sha = (existing.json() or {}).get("sha")
        elif existing.status_code not in (404,):
            raise GitHubPublishError(
                f"GitHub lookup failed ({existing.status_code})",
                status_code=502,
            )
        payload: dict[str, Any] = {
            "message": commit_message,
            "content": encoded,
            "branch": cfg["branch"],
        }
        if sha:
            payload["sha"] = sha
        put = client.put(api, headers=headers, json=payload)
        if put.status_code not in (200, 201):
            detail = put.text[:300]
            raise GitHubPublishError(
                f"GitHub commit failed ({put.status_code}): {detail}",
                status_code=502,
            )
        data = put.json() or {}
        commit = data.get("commit") or {}
        content_meta = data.get("content") or {}
        return {
            "ok": True,
            "repo": cfg["repo"],
            "branch": cfg["branch"],
            "path": content_meta.get("path") or f"{cfg['path_prefix']}/{safe_name}",
            "sha": commit.get("sha") or content_meta.get("sha"),
            "commitUrl": commit.get("html_url"),
            "contentUrl": content_meta.get("html_url"),
        }
