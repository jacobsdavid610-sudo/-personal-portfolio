#!/usr/bin/env bash
# Create a timestamped tar.gz backup of a directory into a destination
# folder, pruning old backups beyond --keep. No dependencies beyond tar.
set -uo pipefail

usage() {
    echo "Usage: $(basename "$0") <source-dir> <dest-dir> [--keep N] [--dry-run]" >&2
    exit 2
}

source_dir=""
dest_dir=""
keep=5
dry_run=0

while [ $# -gt 0 ]; do
    case "$1" in
        --keep)
            keep="$2"
            shift 2
            ;;
        --dry-run)
            dry_run=1
            shift
            ;;
        -h|--help)
            usage
            ;;
        *)
            if [ -z "$source_dir" ]; then
                source_dir="$1"
            elif [ -z "$dest_dir" ]; then
                dest_dir="$1"
            else
                usage
            fi
            shift
            ;;
    esac
done

[ -n "$source_dir" ] && [ -n "$dest_dir" ] || usage
case "$keep" in ''|*[!0-9]*) echo "--keep must be a non-negative integer" >&2; exit 2 ;; esac
[ -d "$source_dir" ] || { echo "Not a directory: $source_dir" >&2; exit 2; }

if [ ! -d "$dest_dir" ]; then
    if [ "$dry_run" -eq 1 ]; then
        echo "Would create destination directory: $dest_dir"
    else
        mkdir -p -- "$dest_dir"
    fi
fi

base_name="$(basename -- "$source_dir")"
timestamp="$(date +%Y%m%d-%H%M%S)"
archive_name="${base_name}-${timestamp}.tar.gz"
archive_path="$dest_dir/$archive_name"

if [ "$dry_run" -eq 1 ]; then
    echo "Would create: $archive_path"
else
    # --force-local: without it, GNU tar treats an archive path starting
    # with a drive letter and colon (e.g. "C:\Users\...") as a remote
    # "host:file" spec and tries to shell out to a remote tar over ssh -
    # a classic gotcha on Windows-style paths, caught via smoke testing.
    tar --force-local -czf "$archive_path" -C "$(dirname -- "$source_dir")" "$base_name"
    size="$(wc -c < "$archive_path" | tr -d ' ')"
    echo "Created: $archive_path ($size byte(s))"
fi

# Prune old backups matching this source's naming pattern, oldest first,
# keeping only the newest --keep. Uses `ls -t` (newest first) so this
# stays correct even if the destination has backups for other sources
# mixed in - only files matching this base_name's prefix are candidates.
mapfile -t existing < <(
    ls -t "$dest_dir"/"${base_name}"-*.tar.gz 2> /dev/null
)

to_prune=("${existing[@]:$keep}")

if [ "${#to_prune[@]}" -eq 0 ]; then
    exit 0
fi

for old in "${to_prune[@]}"; do
    if [ "$dry_run" -eq 1 ]; then
        echo "Would delete: $old"
    else
        rm -f -- "$old"
        echo "Deleted: $old"
    fi
done
