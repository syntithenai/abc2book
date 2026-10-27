# Remove `score-convert-secret` from Tune Book (abc2book)

Handover written 2026-10-27 from the yogapp/Synth session. Work happens in this repo
(`/home/stever/projects/abc2book`), not in yogapp.

## Goal

1. Stop using the Secret Manager secret `score-convert-secret` / the
   `X-Tunebook-Internal-Token` header as the gate for `tunebook-score-convert`.
   Cloud Run IAM already protects that service; the shared secret is redundant.
2. Delete `score-convert-secret`.
3. Optional cost cleanup: destroy four superseded Stripe secret versions.

Project `abc2book`, region `australia-southeast1`, billing account `tunebook`
(shared with 3 other projects).

## Verified state (2026-10-27, read-only checks)

- `tunebook-score-convert` is deployed with `--no-allow-unauthenticated`. Its only
  `roles/run.invoker` member is
  `serviceAccount:927667106833-compute@developer.gserviceaccount.com`.
- `tunebook-resolver-light` is `--allow-unauthenticated` (public for tunebook.net) and
  runs as that same compute service account
  (`spec.template.spec.serviceAccountName = 927667106833-compute@developer.gserviceaccount.com`),
  so it already has permission to call the sidecar.
- `local-resolver/score_convert_client.py` already supports OIDC:
  `SCORE_CONVERT_USE_ID_TOKEN=true` makes it fetch a Google ID token and send
  `Authorization: Bearer …` alongside `X-Tunebook-Internal-Token`.
- **Finding to confirm:** the running light service has `SCORE_CONVERT_SECRET` but no
  `SCORE_CONVERT_URL` and no `SCORE_CONVERT_USE_ID_TOKEN`, and the local
  `local-resolver/deploy/cloud-run-env.yaml` has neither. Because
  `score_convert_configured()` requires URL **and** secret, hosted conversion is
  currently falling back to inline conversion. Decide whether that is intentional. If
  not, Part 1 fixes it as part of this migration.

## Why deleting the secret is safe

Cloud Run rejects unauthenticated requests to `tunebook-score-convert` before the
container runs. Only the light resolver's service account can invoke it. The shared
secret adds no protection once IAM is in place, and it is one more billable version
($0.06/mo) plus a credential to rotate.

**Do not** remove `--allow-unauthenticated` from `tunebook-resolver-light`; the SPA and
native clients call it directly.

---

## Part 1 — make sure the light service actually calls the sidecar with OIDC

Get the sidecar URL:

```bash
gcloud run services describe tunebook-score-convert \
  --project=abc2book --region=australia-southeast1 --format='value(status.url)'
```

Add both lines to `local-resolver/deploy/cloud-run-env.yaml` (gitignored, so this is a
local edit; the example file already has them):

```yaml
SCORE_CONVERT_URL: "<the URL printed above>"
SCORE_CONVERT_USE_ID_TOKEN: "true"
```

`google.oauth2.id_token` comes in transitively via `google-cloud-firestore`, but add it
explicitly to `local-resolver/requirements-light.txt` so the dependency is not accidental:

```
google-auth>=2.30,<3
```

## Part 2 — code changes

### 2a. `local-resolver/score_convert_client.py`

Current (lines ~14–17, 27–28, 39–43):

```python
SCORE_CONVERT_SECRET = (os.getenv("SCORE_CONVERT_SECRET") or "").strip()
...
def score_convert_configured() -> bool:
    return bool(SCORE_CONVERT_URL and SCORE_CONVERT_SECRET)
...
async def _internal_headers() -> dict[str, str]:
    headers = {"X-Tunebook-Internal-Token": SCORE_CONVERT_SECRET}
    if SCORE_CONVERT_USE_ID_TOKEN and SCORE_CONVERT_URL:
        token = await asyncio.to_thread(_fetch_gcp_id_token, SCORE_CONVERT_URL)
        headers["Authorization"] = "Bearer " + token
    return headers
```

Change to:

```python
def score_convert_configured() -> bool:
    # IAM + OIDC is the gate; the legacy shared secret is optional.
    return bool(SCORE_CONVERT_URL)
```

```python
async def _internal_headers() -> dict[str, str]:
    headers: dict[str, str] = {}
    if SCORE_CONVERT_SECRET:  # legacy; removed once the secret is deleted
        headers["X-Tunebook-Internal-Token"] = SCORE_CONVERT_SECRET
    if SCORE_CONVERT_USE_ID_TOKEN and SCORE_CONVERT_URL:
        token = await asyncio.to_thread(_fetch_gcp_id_token, SCORE_CONVERT_URL)
        headers["Authorization"] = "Bearer " + token
    return headers
```

Both changes are needed: the first makes the client use the sidecar when only the URL is
configured; the second stops it sending an empty header after the secret is gone.

### 2b. `local-resolver/server_score_convert.py`

Current (lines ~25, 29–36), used by both `/score2xml` and `/midi2abc`:

```python
SCORE_CONVERT_SECRET = os.getenv("SCORE_CONVERT_SECRET", "").strip()

def require_internal_token(token: str | None) -> None:
    if not SCORE_CONVERT_SECRET:
        raise HTTPException(
            status_code=503,
            detail="Score convert service is not configured (missing SCORE_CONVERT_SECRET)",
        )
    if not token or token.strip() != SCORE_CONVERT_SECRET:
        raise HTTPException(status_code=401, detail="Invalid internal token")
```

Change to an optional legacy check (add `import hmac` at the top):

```python
def require_internal_token(token: str | None) -> None:
    """Legacy shared-secret check.

    Cloud Run IAM is the real gate: the service is deployed with
    --no-allow-unauthenticated and only the light resolver's service account holds
    roles/run.invoker. While SCORE_CONVERT_SECRET exists we still enforce the header;
    once the secret is removed this is a no-op.
    """
    if not SCORE_CONVERT_SECRET:
        return
    if not token or not hmac.compare_digest(token.strip(), SCORE_CONVERT_SECRET):
        raise HTTPException(status_code=401, detail="Invalid internal token")
```

After the secret is deleted and both services are verified, you can remove the function,
the `Header(...)` parameter and the env constant entirely (optional cleanup).

### 2c. Tests — `local-resolver/test_score_convert_service.py`

- `test_rejects_missing_internal_token` still passes while the test sets
  `SCORE_CONVERT_SECRET` (the optional check is still enforced).
- Add a case for the post-migration behaviour: with `SCORE_CONVERT_SECRET` empty, a
  request **without** the header must be accepted (locally there is no IAM in front, so
  this only tests that the app itself no longer blocks):

  ```python
  @patch.dict(os.environ, {"SCORE_CONVERT_SECRET": ""})
  def test_no_secret_no_header_is_allowed_after_migration(self):
      ...
  ```

  Re-import/reload the module or patch `server_score_convert.SCORE_CONVERT_SECRET = ""`
  for the duration of the test.
- Run the light resolver's suites before deploying (the deploy script also runs the
  billing tests): `python3 -m pytest` in `local-resolver/` (or the project's usual
  test command).

## Part 3 — deploy order (secret still exists)

The server must tolerate a missing secret **before** any caller stops sending it.

1. Deploy the sidecar with the tolerant check:
   ```bash
   cd /home/stever/projects/abc2book/local-resolver
   ./deploy-cloud-score-convert.sh
   ```
   It still mounts `score-convert-secret`, so the check remains active — behaviour is
   unchanged at this point.
2. Deploy the light resolver with the client changes (still sends both headers):
   ```bash
   ./deploy-cloud-light.sh
   ```
3. Verify (below). Hosted conversion must work before you remove anything.

### Verify

```bash
# 1. The sidecar is unreachable anonymously (Cloud Run 403, not app 401):
curl -sS -o /dev/null -w '%{http_code}\n' \
  "$(gcloud run services describe tunebook-score-convert --project=abc2book \
      --region=australia-southeast1 --format='value(status.url)')/health"
# expect 403

# 2. The light resolver reports conversion available:
curl -sS https://tunebook-resolver-light-ytrp5enyda-ts.a.run.app/health \
  | python3 -c 'import json,sys; f=json.load(sys.stdin).get("features",{}); print(f.get("scoreConvert"), f.get("midiImport"))'
# expect True True

# 3. Exercise a real conversion through the public route (needs a signed-in token and
#    credit): POST /score2xml on the light resolver with a small .mscx/.mid file.
```

If `scoreConvert` stays false, `SCORE_CONVERT_URL` or the ID token is wrong — stop and
fix before proceeding.

## Part 4 — remove the secret refs, then delete the secret

Deleting a secret while a revision still references it breaks cold starts. Clear the
refs first.

1. Edit the deploy scripts:
   - `local-resolver/deploy-cloud-light.sh`: drop the last entry
     `SCORE_CONVERT_SECRET=score-convert-secret:latest` from `CLOUD_RUN_SECRETS`
     (line ~73).
   - `local-resolver/deploy-cloud-score-convert.sh`: replace
     `--set-secrets="SCORE_CONVERT_SECRET=score-convert-secret:latest"` with
     `--clear-secrets` (or remove the flag after running the one-off update in step 2).
2. Clear the ref on the running sidecar immediately:
   ```bash
   gcloud run services update tunebook-score-convert \
     --project=abc2book --region=australia-southeast1 \
     --remove-secrets=SCORE_CONVERT_SECRET
   ```
3. Redeploy the light resolver with the edited script:
   ```bash
   ./deploy-cloud-light.sh
   ```
4. Re-run the Part 3 verification.
5. Delete the secret:
   ```bash
   gcloud secrets delete score-convert-secret --project=abc2book
   ```
   (`gcloud secrets delete` destroys all versions immediately and irreversibly.)
6. Re-run the verification once more, and force a fresh instance (e.g. a few requests
   after a period of idleness) to confirm no revision references the deleted secret:
   ```bash
   gcloud run services describe tunebook-resolver-light --project=abc2book \
     --region=australia-southeast1 --format=json | grep -c score-convert-secret   # 0
   gcloud run services describe tunebook-score-convert --project=abc2book \
     --region=australia-southeast1 --format=json | grep -c score-convert-secret   # 0
   ```

## Part 5 — optional: destroy superseded Stripe secret versions

`abc2book` has 3 versions each of `stripe-secret-key` and `stripe-webhook-secret`; only
`latest` is mounted. Versions 1 and 2 of each are superseded and still bill. Confirm the
latest value is the one Stripe/the webhook endpoint currently uses, then:

```bash
for s in stripe-secret-key stripe-webhook-secret; do
  for v in 1 2; do
    gcloud secrets versions destroy "$v" --secret="$s" --project=abc2book --quiet
  done
done
```

That removes 4 versions ≈ $0.24/mo. Do **not** destroy version 3.

## Rollback

- If the light resolver must go back to the shared-secret path, recreate the secret,
  restore its version to both deploy scripts, and redeploy. The tolerant server code keeps
  working either way.
- Do not roll back to an old revision that mounts `score-convert-secret` after deleting
  it — that revision cannot start new instances. Redeploy current code instead.

## Cost context

Secret Manager bills $0.06 per active version per month; the first 6 versions are free
across the whole `tunebook` billing account.

- Deleting `score-convert-secret`: −1 version.
- Destroying the four stale Stripe versions: −4 versions.
- After both: `abc2book` goes from 12 to 7 active versions.

The sister project `synthfit-suite` was migrated on the same day: a single
`resolver-master-key` now derives its per-feature keys, and Cloud Scheduler OIDC replaced
its shared task secret. Nothing in that work touches this repo.
