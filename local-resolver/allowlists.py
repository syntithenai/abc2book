"""Email allowlist parsing for resolver access, free access, and embedded credentials.

Special token ALL (case-insensitive) allows every verified Google email.
Empty list is deny-all when auth gates apply (fail-closed), except resolver
access where an empty list means allow-all (local dev default).
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


def load_free_access_emails() -> set[str]:
    """Universal free-access list: FREE_ACCESS_EMAILS only (no ALLOWED_EMAILS fallback)."""
    return parse_email_allowlist(os.getenv("FREE_ACCESS_EMAILS", ""))


def load_resolver_access_emails() -> set[str]:
    """Who may use the operator full resolver. Legacy fallback: ALLOWED_EMAILS."""
    resolver = parse_email_allowlist(os.getenv("RESOLVER_ACCESS_EMAILS", ""))
    if resolver:
        return resolver
    return parse_email_allowlist(os.getenv("ALLOWED_EMAILS", ""))


def load_hosted_free_access_emails() -> set[str]:
    """Free tier on cloud-lite: HOSTED_FREE_ACCESS_EMAILS, else FREE_ACCESS_EMAILS."""
    hosted = parse_email_allowlist(os.getenv("HOSTED_FREE_ACCESS_EMAILS", ""))
    if hosted:
        return hosted
    return load_free_access_emails()


def load_embedded_creds_emails() -> set[str]:
    return parse_email_allowlist(os.getenv("EMBEDDED_CREDS_EMAILS", ""))


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


def media_access_allowed(email: str | None, free_access: set[str], require_auth: bool) -> bool:
    """When REQUIRE_AUTH is off, anyone may use media; else must be free-access allowlisted."""
    if not require_auth:
        return True
    return email_allowed(free_access, email)


def music_collection_access_allowed(
    email: str | None,
    collection_allowlist: set[str],
    free_access: set[str],
    require_auth: bool,
    *,
    collection_enabled: bool = True,
) -> bool:
    """Music collection: FREE_ACCESS users always allowed; dedicated list when set."""
    if not collection_enabled:
        return False
    if email_allowed(free_access, email):
        return True
    if collection_allowlist:
        if not email:
            return False
        return email_allowed(collection_allowlist, email)
    if not require_auth:
        return True
    if not email:
        return False
    return media_access_allowed(email, free_access, require_auth)
