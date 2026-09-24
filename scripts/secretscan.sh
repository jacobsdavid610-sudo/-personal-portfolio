#!/usr/bin/env bash
# Scan files under a directory for patterns that look like leaked
# credentials - AWS access key IDs, PEM private key blocks, GitHub and
# Slack tokens, and generic api_key/secret/token/password assignments -
# and report file:line:rule, with the matched secret itself redacted in
# the output. Meant for a pre-commit hook or CI gate: exit 1 means
# something was found. Wraps grep; no other dependencies.
set -uo pipefail

usage() {
    echo "Usage: $(basename "$0") <path> [--ignore GLOB]..." >&2
    exit 2
}

[ $# -ge 1 ] || usage
target="$1"
shift

ignore_globs=()
while [ $# -gt 0 ]; do
    case "$1" in
        --ignore)
            ignore_globs+=("$2")
            shift 2
            ;;
        -h|--help)
            usage
            ;;
        *)
            usage
            ;;
    esac
done

[ -e "$target" ] || { echo "No such file or directory: $target" >&2; exit 2; }

# rule name, then its ERE pattern. Kept as two parallel arrays rather
# than a single "name:pattern" string, since several of the patterns
# themselves contain ':' and '|' and would need escaping to survive
# being packed into one field.
rule_names=(
    AWS_ACCESS_KEY_ID
    PRIVATE_KEY_BLOCK
    GITHUB_TOKEN
    SLACK_TOKEN
    GENERIC_ASSIGNMENT
)
rule_patterns=(
    'AKIA[0-9A-Z]{16}'
    '-----BEGIN [A-Z ]*PRIVATE KEY-----'
    'gh[pousr]_[A-Za-z0-9]{36}'
    'xox[baprs]-[A-Za-z0-9-]{10,}'
    '(api[_-]?key|secret|token|password)[[:space:]]*[:=][[:space:]]*['\''"][A-Za-z0-9_/+=-]{12,}['\''"]'
)

# Redact a matched secret without leaking its length: a fixed
# placeholder regardless of how long the real match was, plus up to 4
# leading characters so the finding is still recognizable in a report
# without reproducing the secret itself.
redact() {
    local match="$1" prefix_len=4
    if [ "${#match}" -le "$prefix_len" ]; then
        echo "…redacted…"
    else
        echo "${match:0:prefix_len}…redacted…"
    fi
}

find_args=(-type f -not -path '*/.git/*' -not -path '*/node_modules/*')
for glob in "${ignore_globs[@]:-}"; do
    [ -n "$glob" ] && find_args+=(-not -path "$glob")
done

findings=0
files_scanned=0

while IFS= read -r file; do
    files_scanned=$((files_scanned + 1))
    for i in "${!rule_names[@]}"; do
        name="${rule_names[$i]}"
        pattern="${rule_patterns[$i]}"
        # -I skips files grep detects as binary; -n for line numbers.
        # `--` has to come *before* the pattern, not just before the
        # filename: several of these patterns (the private-key block
        # marker especially) start with '-' themselves, and grep only
        # stops treating subsequent args as options once it's seen `--`.
        while IFS=: read -r lineno content; do
            [ -z "$lineno" ] && continue
            match="$(grep -oE -- "$pattern" <<< "$content" | head -n 1)"
            redacted="$(redact "$match")"
            echo "$file:$lineno: $name: $redacted"
            findings=$((findings + 1))
        done < <(grep -InE -- "$pattern" "$file" 2>/dev/null)
    done
done < <(find "$target" "${find_args[@]}")

echo
echo "Scanned $files_scanned file(s), $findings finding(s)."

[ "$findings" -eq 0 ]
