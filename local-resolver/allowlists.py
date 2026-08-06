"""Email allowlist parsing for resolver access and admin features.

Special token ALL (case-insensitive) allows every verified Google email.
Empty RESOLVER_ACCESS_EMAILS means allow-all when auth is required.
"""

from __future__ import annotations

import os


ALL_TOKEN = "all"


def parse_email_allowlist(raw: str | None) -> set[str]:
    """Parse comma-separated emails; preserve ALL as the token 'all'."""
    result: set[str] = set()
    if not raw:
        return result
    for part in str(raw).split(","):
        email = part.strip().lower()
        if email:
            result.add(email)
    return result


def email_allowed(allowlist: set[str] | None, email: str | None) -> bool:
    if not email:
        return False
    if not allowlist:
        return False
    if ALL_TOKEN in allowlist:
        return True
    return email.strip().lower() in allowlist


def load_resolver_access_emails() -> set[str]:
    """Who may use this resolver host. Empty list = allow all signed-in users."""
    return parse_email_allowlist(os.getenv("RESOLVER_ACCESS_EMAILS", ""))


def load_allowed_admin_emails() -> set[str]:
    return parse_email_allowlist(os.getenv("ALLOWED_ADMIN_EMAILS", ""))


def load_music_collection_emails() -> set[str]:
    return parse_email_allowlist(os.getenv("MUSIC_COLLECTION_EMAILS", ""))


def resolver_access_allowed(
    email: str | None,
    resolver_access: set[str],
    require_auth: bool,
) -> bool:
    """When REQUIRE_AUTH is off, anyone may use this host; else must match list if non-empty."""
    if not require_auth:
        return True
    if not resolver_access:
        return True
    return email_allowed(resolver_access, email)


def music_collection_access_allowed(
    email: str | None,
    collection_allowlist: set[str],
    require_auth: bool,
    *,
    collection_enabled: bool = True,
) -> bool:
    """Music collection: dedicated list when set; open when auth is off and list empty."""
    if not collection_enabled:
        return False
    if collection_allowlist:
        if not email:
            return False
        return email_allowed(collection_allowlist, email)
    if not require_auth:
        return True
    return False
