#!/bin/sh
# Dynamic DNS updater for Namecheap.
#
# Keeps one or more Namecheap hosts pointed at this machine's current public
# IPv4 address by polling a public IP service and calling Namecheap's Dynamic
# DNS update API whenever the address changes.
#
# Required env:
#   NAMECHEAP_DDNS_DOMAIN     Registered domain, e.g. syntithenai.com
#   NAMECHEAP_DDNS_PASSWORD   Dynamic DNS password from the Namecheap domain
#                             (Advanced DNS -> Dynamic DNS). NOT your account password.
# Optional env:
#   NAMECHEAP_DDNS_HOSTS      Comma-separated hosts/subdomains (default "@" = apex).
#                             Example: "peppertrees" or "peppertrees,@,www"
#   NAMECHEAP_DDNS_INTERVAL   Seconds between checks (default 300).
#   NAMECHEAP_DDNS_IP_LOOKUP_URL  Public IPv4 echo service (default ipv4.icanhazip.com).

set -u

DOMAIN="${NAMECHEAP_DDNS_DOMAIN:-}"
PASSWORD="${NAMECHEAP_DDNS_PASSWORD:-}"
HOSTS="${NAMECHEAP_DDNS_HOSTS:-@}"
INTERVAL="${NAMECHEAP_DDNS_INTERVAL:-300}"
IP_LOOKUP_URL="${NAMECHEAP_DDNS_IP_LOOKUP_URL:-https://ipv4.icanhazip.com}"

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

log "starting; domain=${DOMAIN} hosts=${HOSTS} interval=${INTERVAL}s lookup=${IP_LOOKUP_URL}"

last_ip=""
while true; do
  ip="$(curl -fsS4 --max-time 30 "$IP_LOOKUP_URL" 2>/dev/null | tr -d '[:space:]' || true)"

  if ! printf '%s' "$ip" | grep -Eq '^([0-9]{1,3}\.){3}[0-9]{1,3}$'; then
    log "could not determine public IPv4 (got '${ip:-}'); retrying in ${INTERVAL}s"
    sleep "$INTERVAL" & wait $!
    continue
  fi

  if [ "$ip" != "$last_ip" ]; then
    log "public IPv4 ${last_ip:-none} -> ${ip}; updating hosts: $(echo "$HOSTS" | tr ',' ' ')"
    all_ok=1
    for h in $(echo "$HOSTS" | tr ',' ' '); do
      [ -n "$h" ] || continue
      update_host "$h" "$ip" || all_ok=0
    done
    if [ "$all_ok" -eq 1 ]; then
      last_ip="$ip"
    else
      log "one or more hosts failed; will retry next cycle"
    fi
  fi

  sleep "$INTERVAL" & wait $!
done
