#!/usr/bin/env bash
# Validate a 5-field cron expression and describe it in plain English.
# Per field, supports: *, */N (step), A (single value), A-B (range), and
# A,B,C (comma list of plain values). No seconds/year field, no
# step-on-range, no mixed lists. No dependencies.
set -uo pipefail

usage() {
    echo "Usage: $(basename "$0") \"MIN HOUR DOM MONTH DOW\"" >&2
    exit 1
}

[ $# -eq 1 ] || usage

read -r minute hour dom month dow extra <<< "$1"
if [ -z "$minute" ] || [ -z "$hour" ] || [ -z "$dom" ] || [ -z "$month" ] || [ -z "$dow" ] || [ -n "${extra:-}" ]; then
    echo "Expected exactly 5 whitespace-separated fields, got: '$1'" >&2
    exit 1
fi

validate_item() {
    local item="$1" min="$2" max="$3" name="$4"
    case "$item" in
        '*')
            return 0
            ;;
        '*/'*)
            local step="${item#\*/}"
            case "$step" in
                ''|*[!0-9]*)
                    echo "Invalid step in $name field: $item" >&2
                    return 1
                    ;;
            esac
            [ "$step" -ge 1 ] || { echo "Step must be >= 1 in $name field: $item" >&2; return 1; }
            return 0
            ;;
        *-*)
            local lo="${item%-*}" hi="${item#*-}"
            case "$lo" in ''|*[!0-9]*) echo "Invalid range start in $name field: $item" >&2; return 1 ;; esac
            case "$hi" in ''|*[!0-9]*) echo "Invalid range end in $name field: $item" >&2; return 1 ;; esac
            if [ "$lo" -lt "$min" ] || [ "$hi" -gt "$max" ] || [ "$lo" -gt "$hi" ]; then
                echo "Range out of bounds ($min-$max) or backwards in $name field: $item" >&2
                return 1
            fi
            return 0
            ;;
        *)
            case "$item" in ''|*[!0-9]*) echo "Invalid value in $name field: $item" >&2; return 1 ;; esac
            if [ "$item" -lt "$min" ] || [ "$item" -gt "$max" ]; then
                echo "Value out of bounds ($min-$max) in $name field: $item" >&2
                return 1
            fi
            return 0
            ;;
    esac
}

validate_field() {
    local field="$1" min="$2" max="$3" name="$4"
    if [[ "$field" == *,* ]]; then
        local IFS=','
        local -a items
        read -ra items <<< "$field"
        local item
        for item in "${items[@]}"; do
            case "$item" in
                ''|*[!0-9]*)
                    echo "List items must be plain numbers in $name field: $item" >&2
                    return 1
                    ;;
            esac
            validate_item "$item" "$min" "$max" "$name" || return 1
        done
        return 0
    fi
    validate_item "$field" "$min" "$max" "$name"
}

join_with_and() {
    local IFS=','
    local -a items=($1)
    local n="${#items[@]}"
    if [ "$n" -eq 1 ]; then
        echo "${items[0]}"
    elif [ "$n" -eq 2 ]; then
        echo "${items[0]} and ${items[1]}"
    else
        local head
        head="$(printf '%s, ' "${items[@]:0:$((n - 1))}")"
        echo "${head}and ${items[$((n - 1))]}"
    fi
}

describe_field() {
    local field="$1" singular="$2" plural="$3" at_word="$4"
    case "$field" in
        '*')
            echo ""
            ;;
        '*/'*)
            local step="${field#\*/}"
            echo "every $step $plural"
            ;;
        *-*)
            local lo="${field%-*}" hi="${field#*-}"
            echo "from $singular $lo through $hi"
            ;;
        *,*)
            echo "$at_word $plural $(join_with_and "$field")"
            ;;
        *)
            echo "$at_word $singular $field"
            ;;
    esac
}

for spec in "$minute 0 59 minute" "$hour 0 23 hour" "$dom 1 31 day-of-month" \
            "$month 1 12 month" "$dow 0 7 day-of-week"; do
    read -r field min max name <<< "$spec"
    validate_field "$field" "$min" "$max" "$name" || exit 1
done

parts=()
m_desc="$(describe_field "$minute" "minute" "minutes" "at")"
[ -n "$m_desc" ] && parts+=("$m_desc")
h_desc="$(describe_field "$hour" "hour" "hours" "at")"
[ -n "$h_desc" ] && parts+=("$h_desc")
dom_desc="$(describe_field "$dom" "day-of-month" "days-of-month" "on")"
[ -n "$dom_desc" ] && parts+=("$dom_desc")
month_desc="$(describe_field "$month" "month" "months" "in")"
[ -n "$month_desc" ] && parts+=("$month_desc")
dow_desc="$(describe_field "$dow" "day-of-week" "days-of-week" "on")"
[ -n "$dow_desc" ] && parts+=("$dow_desc")

if [ "${#parts[@]}" -eq 0 ]; then
    echo "Runs every minute."
    exit 0
fi

joined="$(printf '%s, ' "${parts[@]}")"
joined="${joined%, }"
echo "Runs ${joined}."
