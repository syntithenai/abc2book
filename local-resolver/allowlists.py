"""Email allowlist parsing for free access and embedded credentials.

Special token ALL (case-insensitive) allows every verified Google email.
Empty list is deny-all when auth gates apply (fail-closed).
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
    """Free-access list: FREE_ACCESS_EMAILS, else legacy ALLOWED_EMAILS."""
    free = parse_email_allowlist(os.getenv("FREE_ACCESS_EMAILS", ""))
    if free:
        return free
    return parse_email_allowlist(os.getenv("ALLOWED_EMAILS", ""))


def load_embedded_creds_emails() -> set[str]:
    return parse_email_allowlist(os.getenv("EMBEDDED_CREDS_EMAILS", ""))


def media_access_allowed(email: str | None, free_access: set[str], require_auth: bool) -> bool:
    """When REQUIRE_AUTH is off, anyone may use media; else must be free-access allowlisted."""
    if not require_auth:
        return True
    return email_allowed(free_access, email)
