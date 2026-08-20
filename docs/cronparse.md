# cronparse.sh

Validates a 5-field cron expression and describes it in plain English —
"what does `*/15 9-17 * * 1-5` actually mean" without reaching for a web
cron-explainer site.

## Why

Cron syntax is dense and easy to get subtly wrong (is it minute-then-hour or
hour-then-minute? does `7` mean Sunday?). This gives an immediate, local
sanity check: catches out-of-range values, backwards ranges, and zero steps
before they end up silently not firing (or firing constantly) in a real
crontab.

## Usage

```
cronparse.sh "MIN HOUR DOM MONTH DOW"
```

Pass the whole 5-field expression as a single quoted argument.

## Example

```
$ cronparse.sh "*/15 * * * *"
Runs every 15 minutes.

$ cronparse.sh "30 9 * * *"
Runs at minute 30, at hour 9.

$ cronparse.sh "0 9-17 * * *"
Runs at minute 0, from hour 9 through 17.

$ cronparse.sh "0,15,30,45 * * * *"
Runs at minutes 0, 15, 30, and 45.

$ cronparse.sh "0 0 1 1,6 1-5"
Runs at minute 0, at hour 0, on day-of-month 1, in months 1 and 6, from day-of-week 1 through 5.

$ cronparse.sh "0 17-9 * * *"
Range out of bounds (0-23) or backwards in hour field: 17-9
```

## Field syntax

Per field: `*`, `*/N` (step), `A` (single value), `A-B` (range), or `A,B,C`
(comma list of plain values). Valid ranges: minute `0-59`, hour `0-23`,
day-of-month `1-31`, month `1-12`, day-of-week `0-7` (both `0` and `7`
mean Sunday, matching standard cron).

## Exit codes

- `0` — valid expression, description printed to stdout.
- `1` — wrong number of fields, or a field fails validation (out-of-range
  value, backwards range, non-numeric value, step less than 1, or a
  non-plain-number inside a comma list). The specific reason goes to
  stderr.

## Design notes

- Deliberately doesn't support step-on-range (`A-B/N`) or mixed-type
  comma lists (`A,*/N`) — real crontabs mostly don't need them, and
  supporting every combination would make both the parser and its output
  wording much harder to keep correct. A list item that isn't a plain
  number is rejected with a specific error rather than silently
  misparsed.
- No seconds or year field — this is standard 5-field cron (what `cron`/
  `crontab` actually read), not the 6- or 7-field variants some schedulers
  use.

## Running the tests

```
bash tests/test_cronparse.sh
```

14 tests: exact output strings for `*`, a step, single values, a range, a
comma list, all five fields combined in one sentence, and the day-of-week-7
Sunday alias — plus rejection of a 4-field expression, no argument at all,
an out-of-range value, a step of `0`, a backwards range, a step expression
inside a comma list, and an out-of-range day-of-week.
