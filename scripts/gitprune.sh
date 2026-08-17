#!/usr/bin/env bash
# List (or delete, with --delete) local git branches already fully merged
# into a base branch. Dry-run by default. No dependencies beyond git.
set -uo pipefail

usage() {
    echo "Usage: $(basename "$0") [repo-dir] [--base BRANCH] [--delete] [--yes]" >&2
    exit 1
}

repo="."
base=""
delete=0
yes=0

while [ $# -gt 0 ]; do
    case "$1" in
        --base)
            base="$2"
            shift 2
            ;;
        --delete)
            delete=1
            shift
            ;;
        --yes)
            yes=1
            shift
            ;;
        -h|--help)
            usage
            ;;
        *)
            repo="$1"
            shift
            ;;
    esac
done

if [ ! -d "$repo/.git" ]; then
    echo "Not a git repository: $repo" >&2
    exit 1
fi

if [ -z "$base" ]; then
    if git -C "$repo" show-ref --verify --quiet refs/heads/main; then
        base="main"
    elif git -C "$repo" show-ref --verify --quiet refs/heads/master; then
        base="master"
    else
        echo "Could not auto-detect a base branch (no local 'main' or 'master'); pass --base." >&2
        exit 1
    fi
elif ! git -C "$repo" show-ref --verify --quiet "refs/heads/$base"; then
    echo "Base branch not found: $base" >&2
    exit 1
fi

current="$(git -C "$repo" branch --show-current)"

mapfile -t merged < <(
    git -C "$repo" branch --merged "$base" --format='%(refname:short)' \
        | grep -vx -e "$base" -e "$current"
)

if [ "${#merged[@]}" -eq 0 ]; then
    echo "No branches merged into '$base' to prune."
    exit 0
fi

printf '%s\n' "${merged[@]}"
echo
echo "${#merged[@]} branch(es) merged into '$base'."

if [ "$delete" -eq 0 ]; then
    exit 0
fi

if [ "$yes" -eq 0 ]; then
    read -r -p "Delete all branches listed above? [y/N] " answer
    case "$answer" in
        y|Y) ;;
        *) echo "Aborted, nothing deleted."; exit 0 ;;
    esac
fi

deleted=0
failed=0
for b in "${merged[@]}"; do
    if git -C "$repo" branch -d "$b" > /dev/null 2>&1; then
        deleted=$((deleted + 1))
    else
        echo "Failed to delete: $b" >&2
        failed=$((failed + 1))
    fi
done

echo "Deleted $deleted branch(es)."
[ "$failed" -eq 0 ]
