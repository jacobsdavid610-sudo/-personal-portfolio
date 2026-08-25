# jwtdecode.js

Decodes a JWT's header and payload for inspection — pretty-printed JSON
plus a human-readable summary of `iat`/`nbf`/`exp`. **Does not verify the
signature.** This is a debugging tool for looking inside a token you
already have, not an authentication check.

## Why

"What's actually in this token" is a question that comes up constantly
when debugging auth flows, and copy-pasting a JWT into a random website to
find out is a real, ongoing security habit worth not having — this does
the same base64url-decode-and-parse locally, with the one thing that
matters most (that it doesn't verify anything) stated up front, in the
code and in every CLI run.

## Usage

```js
const { decode, describeClaims } = require("./jwtdecode.js");

const { header, payload, signature } = decode(token);
describeClaims(payload); // human-readable iat/nbf/exp lines
```

As a CLI:

```
jwtdecode.js <token>
```

## Real example

```
$ jwtdecode.js eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTQyIiwibmFtZSI6IkFkYSBMb3ZlbGFjZSIsImlhdCI6MTc4NzY4Mjk1NywiZXhwIjoxNzg3Njg2NTU3fQ.fakesignature
Header:
{
  "alg": "HS256",
  "typ": "JWT"
}

Payload:
{
  "sub": "user-42",
  "name": "Ada Lovelace",
  "iat": 1787682957,
  "exp": 1787686557
}

Claims:
  issued at:  2026-08-25T18:35:57.000Z
  expires:    2026-08-25T19:35:57.000Z (valid)

(signature not verified - this tool only decodes)
```

## API

- `decode(token)` — returns `{ header, payload, signature }`. `header` and
  `payload` are parsed JSON objects; `signature` is the raw, still-encoded
  final segment (never decoded or checked — there's nothing to check it
  against without the signing key). Throws if `token` isn't a 3-segment
  string, or either segment isn't valid base64url-encoded JSON.
- `base64UrlDecode(segment)` — decodes one base64url segment to a UTF-8
  string (handles the `-`/`_` substitution and re-adds standard base64
  padding).
- `describeClaims(payload)` — returns an array of readable lines for
  whichever of `iat`/`nbf`/`exp` are present as numbers (Unix timestamps,
  per the JWT spec), including whether `exp` has already passed. Returns
  `[]` if none of the three are present.

## Exit codes (CLI)

- `0` — success.
- `1` — malformed token (wrong segment count, or a segment that isn't
  valid base64url JSON).
- `2` — no token argument given (usage error).

## Design notes

- No signature verification, by explicit design — that requires the
  signing key/algorithm and turns this from an inspection tool into
  something that could be mistaken for an auth check if it silently
  "passed." The CLI prints a reminder of this on every run rather than
  leaving it to the README alone.
- Base64url differs from standard base64 in two ways this handles:
  `+`/`/` become `-`/`_`, and trailing `=` padding is stripped from JWTs
  (re-added here based on segment length mod 4) — a token round-tripped
  through standard base64 tooling without this translation would fail to
  decode or, worse, decode to the wrong bytes.

## Running the tests

```
node --test tests/test_jwtdecode.js
```

10 tests: decoding a well-formed token's header/payload/signature,
round-tripping data whose base64 form would need `+`/`/`/padding (proving
the URL-safe substitution is correct both ways), `base64UrlDecode`'s three
padding-length cases, rejecting the wrong segment count, rejecting
invalid-JSON header and payload segments separately, rejecting a
non-string input, `describeClaims` reporting all three timestamp claims
when present, correctly flagging a past `exp` as `EXPIRED`, and returning
an empty array when no standard claims exist.
