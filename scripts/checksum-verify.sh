#!/usr/bin/env bash
# Generate or verify a manifest of SHA-256 checksums for files under a
# directory - "did anything in this deployment/backup/download change
# since the manifest was made." Wraps sha256sum; no other dependencies.
set -uo pipefail

usage() {
    echo "Usage: $(basename "$0") generate <directory> [--out FILE]" >&2
    echo "       $(basename "$0") verify <directory> --manifest FILE" >&2
    exit 2
}

[ $# -ge 1 ] || usage
mode="$1"
shift

dir=""
manifest=""
out=""

while [ $# -gt 0 ]; do
    case "$1" in
        --manifest)
            manifest="$2"
            shift 2
            ;;
        --out)
            out="$2"
            shift 2
            ;;
        -h|--help)
            usage
            ;;
        *)
            if [ -z "$dir" ]; then
                dir="$1"
                shift
            else
                usage
            fi
            ;;
    esac
done

[ -n "$dir" ] || usage
[ -d "$dir" ] || { echo "Not a directory: $dir" >&2; exit 2; }

case "$mode" in
    generate)
        [ -z "$manifest" ] || usage
        ;;
    verify)
        [ -n "$manifest" ] || usage
        [ -f "$manifest" ] || { echo "No such manifest file: $manifest" >&2; exit 2; }
        [ -z "$out" ] || usage
        ;;
    *)
        usage
        ;;
esac

# List files under $dir, relative to $dir, with forward slashes and sorted
# for deterministic output across runs.
list_files() {
    ( cd "$dir" && find . -type f | sed 's|^\./||' | sort )
}

# sha256sum prefixes its output line with a literal backslash whenever the
# path it was given contains a backslash or newline (GNU coreutils escape
# convention) - which is every path on this platform. Strip that marker
# before taking the hash field, or it silently corrupts the stored sum.
sha256_of() {
    local line
    line="$(sha256sum "$1")"
    line="${line#\\}"
    printf '%s' "${line%% *}"
}

if [ "$mode" = "generate" ]; then
    tmp="$(mktemp)"
    trap 'rm -f "$tmp"' EXIT

    count=0
    while IFS= read -r rel; do
        [ -z "$rel" ] && continue
        sum="$(sha256_of "$dir/$rel")"
        printf '%s  %s\n' "$sum" "$rel" >> "$tmp"
        count=$((count + 1))
    done < <(list_files)

    if [ -n "$out" ]; then
        mv -f -- "$tmp" "$out"
        trap - EXIT
        echo "Wrote $count checksum(s) to $out"
    else
        cat "$tmp"
        echo "$count checksum(s) generated." >&2
    fi
    exit 0
fi

# --- verify ---
ok=0
mismatched=0
missing=0
extra=0

manifest_files_tmp="$(mktemp)"
trap 'rm -f "$manifest_files_tmp"' EXIT

while IFS= read -r line; do
    [ -z "$line" ] && continue
    expected_sum="${line%%  *}"
    rel="${line#*  }"
    echo "$rel" >> "$manifest_files_tmp"

    path="$dir/$rel"
    if [ ! -f "$path" ]; then
        echo "MISSING: $rel"
        missing=$((missing + 1))
        continue
    fi

    actual_sum="$(sha256_of "$path")"
    if [ "$actual_sum" = "$expected_sum" ]; then
        ok=$((ok + 1))
    else
        echo "MISMATCH: $rel"
        mismatched=$((mismatched + 1))
    fi
done < "$manifest"

while IFS= read -r rel; do
    [ -z "$rel" ] && continue
    if ! grep -qxF "$rel" "$manifest_files_tmp"; then
        echo "EXTRA: $rel"
        extra=$((extra + 1))
    fi
done < <(list_files)

echo
echo "$ok OK, $mismatched mismatched, $missing missing, $extra extra."

if [ "$mismatched" -gt 0 ] || [ "$missing" -gt 0 ]; then
    exit 1
fi
exit 0
