#!/usr/bin/env bash
# Report how many days remain before a TLS certificate expires - either a
# live host:port or a local cert file - and warn/fail once it's inside a
# threshold. Wraps openssl s_client/x509; no other dependencies.
set -uo pipefail

usage() {
    echo "Usage: $(basename "$0") <host[:port]> [--warn-days N]" >&2
    echo "       $(basename "$0") --file <cert.pem> [--warn-days N]" >&2
    exit 2
}

target=""
file=""
warn_days=14

while [ $# -gt 0 ]; do
    case "$1" in
        --file)
            file="$2"
            shift 2
            ;;
        --warn-days)
            warn_days="$2"
            shift 2
            ;;
        -h|--help)
            usage
            ;;
        *)
            if [ -z "$target" ]; then
                target="$1"
                shift
            else
                usage
            fi
            ;;
    esac
done

case "$warn_days" in ''|*[!0-9]*) echo "--warn-days must be a non-negative integer" >&2; exit 2 ;; esac

if [ -n "$file" ] && [ -n "$target" ]; then
    usage
fi
if [ -z "$file" ] && [ -z "$target" ]; then
    usage
fi

if [ -n "$file" ]; then
    [ -f "$file" ] || { echo "No such file: $file" >&2; exit 2; }
    label="$file"
    enddate="$(openssl x509 -in "$file" -noout -enddate 2>/dev/null | sed 's/^notAfter=//')"
    if [ -z "$enddate" ]; then
        echo "Could not read a certificate from: $file" >&2
        exit 2
    fi
else
    host="${target%%:*}"
    port="${target#*:}"
    [ "$port" = "$target" ] && port=443
    label="$target"
    enddate="$(
        timeout 10 openssl s_client -connect "$host:$port" -servername "$host" \
            </dev/null 2>/dev/null \
        | openssl x509 -noout -enddate 2>/dev/null \
        | sed 's/^notAfter=//'
    )"
    if [ -z "$enddate" ]; then
        echo "Could not retrieve a certificate from: $target" >&2
        exit 2
    fi
fi

expiry_epoch="$(date -d "$enddate" +%s 2>/dev/null || date -j -f "%b %d %T %Y %Z" "$enddate" +%s 2>/dev/null)"
if [ -z "$expiry_epoch" ]; then
    echo "Could not parse certificate expiry date: $enddate" >&2
    exit 2
fi

now_epoch="$(date +%s)"
days_left=$(( (expiry_epoch - now_epoch) / 86400 ))

if [ "$days_left" -lt 0 ]; then
    echo "EXPIRED: $label expired $((-days_left)) day(s) ago ($enddate)"
    exit 2
elif [ "$days_left" -le "$warn_days" ]; then
    echo "WARN: $label expires in $days_left day(s) ($enddate)"
    exit 1
else
    echo "OK: $label expires in $days_left day(s) ($enddate)"
    exit 0
fi
