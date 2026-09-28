# jwtverify.js

Verifies a JWT's HMAC signature (`HS256`/`HS384`/`HS512`) and its
`exp`/`nbf` claims. `jwtdecode.js` deliberately only decodes and says so
in its own header comment — this is the script that actually closes
that gap and makes a trust decision. No dependencies beyond
`node:crypto`.

## Usage

```js
const { verify } = require("./jwtverify.js");

const result = verify(token, secret, { algorithms: ["HS256"] });
if (result.valid) {
  console.log("authenticated as", result.payload.sub);
} else {
  console.log("rejected:", result.reason);
}
```

- `verify(token, secret, options)`
  - `options.algorithms` (**required**, no default) — array of algorithm
    names the caller actually expects (e.g. `["HS256"]`). The token's
    own `header.alg` must be in this list.
  - `options.leewaySec` (default `0`) — clock-skew tolerance applied to
    `exp`/`nbf`.
  - `options.clock` (default `Date.now`) — injectable, same pattern as
    `memoize.js`'s and `ratelimiter.py`'s clock, so expiry checks are
    testable without depending on real time.
- Returns `{ valid: true, header, payload }` or `{ valid: false, reason,
  header?, payload? }` — a bad signature, expired token, or malformed
  header/payload all come back as `valid: false` with a `reason`, never
  a thrown exception. It throws only for genuine caller errors: missing
  `options.algorithms`, or a `token` that isn't even shaped like three
  dot-separated segments.

## Real example

```
$ node -e "
const crypto = require('crypto');
const { verify } = require('./scripts/jwtverify.js');
const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+\$/,'');
const h = b64url({alg:'HS256',typ:'JWT'}), p = b64url({sub:'ada', exp: 9999999999});
const sig = crypto.createHmac('sha256','shh').update(h+'.'+p).digest('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+\$/,'');
console.log(verify(h+'.'+p+'.'+sig, 'shh', { algorithms: ['HS256'] }));
"
{ valid: true, header: { alg: 'HS256', typ: 'JWT' }, payload: { sub: 'ada', exp: 9999999999 } }
```

## Design notes

- **`options.algorithms` has no default and must be passed explicitly.**
  This is the actual security-relevant decision in the whole script.
  Trusting whatever algorithm the token's own header claims is the
  canonical JWT "algorithm confusion" hole — a token with `alg: "none"`
  sails through a verifier that just does "whatever alg says, do that,"
  and so does one forged for an algorithm the server never meant to
  accept. Requiring the caller to name their allowed algorithms up
  front means an attacker-chosen `alg` value can only ever fail the
  allowlist check, never redirect what verification actually happens.
- **The signature is decoded to raw bytes and compared with
  `crypto.timingSafeEqual`, not compared as base64url strings.**
  Comparing strings (or using `===` on buffers) short-circuits on the
  first differing byte, which leaks timing information about how much
  of a guessed signature was correct — the whole reason constant-time
  comparison functions exist. The one wrinkle: `timingSafeEqual` throws
  on mismatched-length buffers instead of returning `false`, so the
  length is checked first — safe to do because the expected length only
  depends on the algorithm, never on anything attacker-supplied.
- **Reused `jwtdecode.js`'s padding logic instead of rewriting it.**
  The signature segment is binary, not UTF-8 text, so it can't go
  through `jwtdecode.js`'s existing `base64UrlDecode` (which ends in
  `.toString("utf8")` and would corrupt arbitrary signature bytes on
  the round trip). Rather than copy-pasting the padding-fixup logic a
  second time, `jwtdecode.js` now exposes the shared byte-level step as
  `base64UrlToBuffer`, with `base64UrlDecode` becoming a one-line
  wrapper around it. Padding correctness is exactly the kind of detail
  that shouldn't exist in two places that could quietly drift apart -
  confirmed the refactor changed nothing observable by re-running
  `jwtdecode.js`'s existing test suite unchanged before writing this
  script's own tests.
- **Signature/expiry/nbf failures return a result object; only
  structurally-invalid input throws.** A caller checking "is this
  request authenticated" wants a value to branch on, not a `try/catch`
  around every login attempt — throwing is reserved for actual
  programmer errors (forgetting `algorithms`) or input that isn't
  recoverable enough to even attempt verification against.

## Exit codes (CLI)

`0` if valid, `1` if invalid (bad signature, expired, not yet valid,
disallowed algorithm), `2` on a usage error.

## Running the tests

```
node --test tests/test_jwtverify.js
```

16 tests: a correctly-signed token verifying, the wrong secret being
rejected, a tampered-but-still-valid-JSON payload being caught by the
signature check, `alg: none` being rejected outright rather than
treated as "no signature needed," an algorithm outside the caller's
allowlist being rejected even when it's a real HMAC algorithm, HS384
and HS512 both verifying correctly when explicitly allowed, a non-HMAC
algorithm in the caller's *own* allowlist being rejected cleanly rather
than crashing, omitting `options.algorithms` throwing instead of
silently trusting the token, exp/nbf checks via the injected clock in
both directions, `leewaySec` forgiving a small overshoot, a token with
no exp/nbf at all being valid regardless of the clock, a malformed
header being rejected without throwing, and a non-3-segment token
throwing rather than returning `valid: false`. All passing. Also
re-ran `jwtdecode.js`'s existing test suite after the shared-helper
refactor to confirm nothing about its behavior changed, and ran the CLI
by hand against a token signed with a real HMAC secret before
committing.
