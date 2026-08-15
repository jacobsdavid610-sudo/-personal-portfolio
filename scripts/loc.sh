#!/usr/bin/env bash
# Count lines of code per file extension under a directory (a tiny
# cloc-alike). No dependencies beyond coreutils (find/wc/awk/sort).
set -uo pipefail

usage() {
    echo "Usage: $(basename "$0") <directory> [--no-blank] [--exclude NAME]..." >&2
    exit 2
}

dir=""
no_blank=0
excludes=(".git" "node_modules" "__pycache__" ".venv")

while [ $# -gt 0 ]; do
    case "$1" in
        --no-blank)
            no_blank=1
            shift
            ;;
        --exclude)
            excludes+=("$2")
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
[ -d "$dir" ] || { echo "Not a directory: $dir" >&2; exit 1; }

# Build a find "prune" expression: -prune on any directory whose basename
# matches one of the excluded names, at any depth.
prune_args=()
for ex in "${excludes[@]}"; do
    [ "${#prune_args[@]}" -gt 0 ] && prune_args+=(-o)
    prune_args+=(-name "$ex")
done

# Extension of a filename: text after the last dot, but a dotfile with no
# further dot (".gitignore") has no extension - the leading dot isn't one.
extension_of() {
    local base="$1" stripped="$1"
    if [ "${base:0:1}" = "." ]; then
        stripped="${base:1}"
    fi
    case "$stripped" in
        *.*) echo "${stripped##*.}" ;;
        *) echo "(no extension)" ;;
    esac
}

counts_file="$(mktemp)"
trap 'rm -f "$counts_file"' EXIT

while IFS= read -r -d '' file; do
    ext="$(extension_of "$(basename "$file")")"
    if [ "$no_blank" -eq 1 ]; then
        lines="$(grep -c -v '^[[:space:]]*$' -- "$file" 2>/dev/null)"
    else
        lines="$(wc -l < "$file" 2>/dev/null | tr -d ' ')"
    fi
    [ -n "$lines" ] || lines=0
    printf '%s\t%s\n' "$ext" "$lines" >> "$counts_file"
done < <(find "$dir" \( "${prune_args[@]}" \) -prune -o -type f -print0)

if [ ! -s "$counts_file" ]; then
    echo "No files found under $dir."
    exit 0
fi

awk -F'\t' '{ sum[$1] += $2 } END { for (ext in sum) printf "%s\t%d\n", ext, sum[ext] }' "$counts_file" \
    | sort -t "$(printf '\t')" -k2,2nr \
    | while IFS="$(printf '\t')" read -r ext total; do
        printf '%-20s %6d\n' "$ext" "$total"
    done

total_files="$(wc -l < "$counts_file" | tr -d ' ')"
total_lines="$(awk -F'\t' '{ sum += $2 } END { print sum + 0 }' "$counts_file")"
echo
echo "$total_files file(s), $total_lines line(s) total under $dir."
