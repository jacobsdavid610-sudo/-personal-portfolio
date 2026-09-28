#!/usr/bin/env node
// Verify a JWT's HMAC signature (HS256/HS384/HS512) and its exp/nbf
// claims. jwtdecode.js deliberately only decodes - this is the actual
// auth check. No dependencies beyond node:crypto.

const crypto = require("crypto");
const { base64UrlDecode, base64UrlToBuffer } = require("./jwtdecode.js");

const HMAC_ALGS = {
  HS256: "sha256",
  HS384: "sha384",
  HS512: "sha512",
};

/**
 * Verifies token against secret.
 *
 * @param {string} token
 * @param {string|Buffer} secret
 * @param {object} [options]
 * @param {string[]} [options.algorithms] - required. The header's `alg`
 *   must be one of these. There is deliberately no default: silently
 *   accepting whatever algorithm the token itself claims is exactly the
 *   "algorithm confusion" hole that lets a token forged for a different
 *   algorithm (or, canonically, `alg: none`) sail through - the caller
 *   has to say what they actually expect to see.
 * @param {number} [options.leewaySec=0] - seconds of clock skew
 *   tolerance applied to exp/nbf checks.
 * @param {Function} [options.clock=Date.now] - injectable so exp/nbf
 *   checks are testable without depending on the real current time.
 * @returns {{valid: boolean, reason?: string, header?: object, payload?: object}}
 *   Never throws for a malformed-but-parseable token or a bad
 *   signature - those come back as `{ valid: false, reason }`. Throws
 *   only for a caller error (missing `algorithms`) or a token that
 *   isn't even shaped like a JWT.
 */
function verify(token, secret, options = {}) {
  const { algorithms, leewaySec = 0, clock = Date.now } = options;
  if (!Array.isArray(algorithms) || algorithms.length === 0) {
    throw new TypeError("options.algorithms is required, e.g. { algorithms: ['HS256'] }");
  }

  if (typeof token !== "string") {
    throw new TypeError("token must be a string");
  }
  const parts = token.trim().split(".");
  if (parts.length !== 3) {
    throw new Error(`Malformed JWT: expected 3 dot-separated segments, got ${parts.length}`);
  }
  const [headerSeg, payloadSeg, signatureSeg] = parts;

  let header;
  try {
    header = JSON.parse(base64UrlDecode(headerSeg));
  } catch (err) {
    return { valid: false, reason: `could not decode/parse header: ${err.message}` };
  }

  if (!algorithms.includes(header.alg)) {
    return { valid: false, reason: `alg '${header.alg}' is not in the allowed list [${algorithms.join(", ")}]` };
  }
  const hmacAlgo = HMAC_ALGS[header.alg];
  if (!hmacAlgo) {
    // Reachable if the caller passed a non-HMAC algorithm (e.g. RS256)
    // in their own allowlist - this verifier only implements the HMAC
    // family, so that's a caller misconfiguration, not a forged token.
    return { valid: false, reason: `'${header.alg}' is not an HMAC algorithm this verifier supports` };
  }

  const expected = crypto.createHmac(hmacAlgo, secret).update(`${headerSeg}.${payloadSeg}`).digest();
  let actual;
  try {
    actual = base64UrlToBuffer(signatureSeg);
  } catch (err) {
    return { valid: false, reason: `could not decode signature: ${err.message}` };
  }

  // Length check before timingSafeEqual: it throws on mismatched
  // lengths rather than returning false, and the expected length only
  // depends on the algorithm (not on anything attacker-controlled), so
  // checking it first leaks nothing that isn't already public.
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    return { valid: false, reason: "signature mismatch" };
  }

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadSeg));
  } catch (err) {
    return { valid: false, reason: `could not decode/parse payload: ${err.message}` };
  }

  const now = Math.floor(clock() / 1000);
  if (typeof payload.exp === "number" && now > payload.exp + leewaySec) {
    return { valid: false, reason: "token has expired", header, payload };
  }
  if (typeof payload.nbf === "number" && now < payload.nbf - leewaySec) {
    return { valid: false, reason: "token is not yet valid", header, payload };
  }

  return { valid: true, header, payload };
}

module.exports = { verify };

if (require.main === module) {
  const [token, secret] = process.argv.slice(2);
  if (!token || !secret) {
    console.error("Usage: jwtverify.js <token> <secret> [--alg HS256]");
    process.exit(2);
  }
  const algIdx = process.argv.indexOf("--alg");
  const algorithms = algIdx !== -1 ? [process.argv[algIdx + 1]] : ["HS256"];

  let result;
  try {
    result = verify(token, secret, { algorithms });
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }

  if (result.valid) {
    console.log("VALID");
    console.log(JSON.stringify(result.payload, null, 2));
    process.exit(0);
  } else {
    console.log(`INVALID: ${result.reason}`);
    process.exit(1);
  }
}
