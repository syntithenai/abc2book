#!/bin/sh
# Dynamic DNS updater for Namecheap.
#
# Keeps one or more Namecheap hosts pointed at this machine's current public
# IPv4 address by polling public IP services and calling Namecheap's Dynamic
# DNS update API whenever the address changes. It also periodically reasserts
# the current address so DNS drift can self-heal even when the local public IP
# has not changed.
#
# Required env:
#   NAMECHEAP_DDNS_DOMAIN     Registered domain, e.g. syntithenai.com
#   NAMECHEAP_DDNS_PASSWORD   Dynamic DNS password from the Namecheap domain
#                             (Advanced DNS -> Dynamic DNS). NOT your account password.
# Optional env:
#   NAMECHEAP_DDNS_HOSTS      Comma-separated hosts/subdomains (default "@" = apex).
#                             Example: "peppertrees" or "peppertrees,@,www"
#   NAMECHEAP_DDNS_INTERVAL   Seconds between checks (default 300).
#   NAMECHEAP_DDNS_IP_LOOKUP_URLS Comma-separated public IPv4 echo services.
#   NAMECHEAP_DDNS_IP_LOOKUP_URL  Backward-compatible single lookup URL.
#   NAMECHEAP_DDNS_FORCE_INTERVAL Number of successful check cycles between
#                                forced updates (default 12, roughly hourly
#                                with the default 300s interval).

set -u

DOMAIN="${NAMECHEAP_DDNS_DOMAIN:-}"
PASSWORD="${NAMECHEAP_DDNS_PASSWORD:-}"
HOSTS="${NAMECHEAP_DDNS_HOSTS:-@}"
INTERVAL="${NAMECHEAP_DDNS_INTERVAL:-300}"
DEFAULT_IP_LOOKUP_URLS="https://ipv4.icanhazip.com,https://api.ipify.org,https://checkip.amazonaws.com"
IP_LOOKUP_URLS="${NAMECHEAP_DDNS_IP_LOOKUP_URLS:-${NAMECHEAP_DDNS_IP_LOOKUP_URL:-$DEFAULT_IP_LOOKUP_URLS}}"
FORCE_INTERVAL="${NAMECHEAP_DDNS_FORCE_INTERVAL:-12}"

log() {
  echo "[ddns-namecheap] $(date -u '+%Y-%m-%dT%H:%M:%SZ') $*"
}

if [ -z "$DOMAIN" ] || [ -z "$PASSWORD" ]; then
  log "ERROR: NAMECHEAP_DDNS_DOMAIN and NAMECHEAP_DDNS_PASSWORD are required"
  exit 1
fi

# Allow a clean, prompt shutdown while sleeping between cycles.
trap 'log "stopping"; exit 0' TERM INT

update_host() {
  _host="$1"
  _ip="$2"
  _resp="$(curl -fsS --max-time 30 \
    "https://dynamicdns.park-your-domain.com/update?host=${_host}&domain=${DOMAIN}&password=${PASSWORD}&ip=${_ip}" \
    2>/dev/null || true)"
  if printf '%s' "$_resp" | grep -q '<ErrCount>0</ErrCount>'; then
    log "ok: ${_host}.${DOMAIN} -> ${_ip}"
    return 0
  fi
  _err="$(printf '%s' "$_resp" | sed -n 's:.*<Err1>\(.*\)</Err1>.*:\1:p')"
  log "ERROR: ${_host}.${DOMAIN}: ${_err:-no/invalid response from Namecheap}"
  return 1
}

is_ipv4() {
  printf '%s' "$1" | grep -Eq '^([0-9]{1,3}\.){3}[0-9]{1,3}$'
}

lookup_public_ip() {
  for _url in $(echo "$IP_LOOKUP_URLS" | tr ',' ' '); do
    [ -n "$_url" ] || continue
    _ip="$(curl -fsS4 --max-time 30 "$_url" 2>/dev/null | tr -d '[:space:]' || true)"
    if is_ipv4 "$_ip"; then
      printf '%s\n' "$_ip"
      return 0
    fi
    log "lookup failed: ${_url} returned '${_ip:-}'"
  done
  return 1
}

update_all_hosts() {
  _ip="$1"
  all_ok=1
  for h in $(echo "$HOSTS" | tr ',' ' '); do
    [ -n "$h" ] || continue
    update_host "$h" "$_ip" || all_ok=0
  done
  [ "$all_ok" -eq 1 ]
}

log "starting; domain=${DOMAIN} hosts=${HOSTS} interval=${INTERVAL}s lookups=${IP_LOOKUP_URLS} force_interval=${FORCE_INTERVAL}"

last_ip=""
cycles_since_update=0
while true; do
  ip="$(lookup_public_ip || true)"

  if ! is_ipv4 "$ip"; then
    log "could not determine public IPv4; retrying in ${INTERVAL}s"
    sleep "$INTERVAL" & wait $!
    continue
  fi

  force_update=0
  if [ "$FORCE_INTERVAL" -gt 0 ] 2>/dev/null && [ "$cycles_since_update" -ge "$FORCE_INTERVAL" ]; then
    force_update=1
  fi

  if [ "$ip" != "$last_ip" ]; then
    log "public IPv4 ${last_ip:-none} -> ${ip}; updating hosts: $(echo "$HOSTS" | tr ',' ' ')"
    if update_all_hosts "$ip"; then
      last_ip="$ip"
      cycles_since_update=0
    else
      log "one or more hosts failed; will retry next cycle"
    fi
  elif [ "$force_update" -eq 1 ]; then
    log "reasserting unchanged public IPv4 ${ip}; updating hosts: $(echo "$HOSTS" | tr ',' ' ')"
    if update_all_hosts "$ip"; then
      cycles_since_update=0
    else
      log "one or more hosts failed; will retry next cycle"
    fi
  else
    cycles_since_update=$((cycles_since_update + 1))
  fi

  sleep "$INTERVAL" & wait $!
done
