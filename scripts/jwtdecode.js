#!/usr/bin/env node
// Decode a JWT's header and payload for inspection. Does NOT verify the
// signature - this is a debugging/inspection tool, not an auth check. No
// dependencies.

/**
 * Base64url-decodes a JWT segment into a UTF-8 string.
 */
function base64UrlDecode(segment) {
  let base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4;
  if (pad === 2) base64 += "==";
  else if (pad === 3) base64 += "=";
  else if (pad !== 0) {
    throw new Error("Invalid base64url segment length");
  }
  return Buffer.from(base64, "base64").toString("utf8");
}

/**
 * Decodes a JWT into { header, payload, signature }. `header` and
 * `payload` are parsed JSON objects; `signature` is the raw base64url
 * segment, unverified and unvalidated - this function makes no claim
 * about whether the token is authentic.
 */
function decode(token) {
  if (typeof token !== "string") {
    throw new TypeError("token must be a string");
  }

  const parts = token.trim().split(".");
  if (parts.length !== 3) {
    throw new Error(`Malformed JWT: expected 3 dot-separated segments, got ${parts.length}`);
  }
  const [headerSeg, payloadSeg, signature] = parts;

  let header, payload;
  try {
    header = JSON.parse(base64UrlDecode(headerSeg));
  } catch (err) {
    throw new Error(`Could not decode/parse header: ${err.message}`);
  }
  try {
    payload = JSON.parse(base64UrlDecode(payloadSeg));
  } catch (err) {
    throw new Error(`Could not decode/parse payload: ${err.message}`);
  }

  return { header, payload, signature };
}

/**
 * Returns a short human-readable summary of standard registered claims
 * present in `payload` (exp/iat/nbf as ISO timestamps, plus whether the
 * token is currently expired), skipping any that are absent.
 */
function describeClaims(payload) {
  const lines = [];
  const now = Math.floor(Date.now() / 1000);

  if (typeof payload.iat === "number") {
    lines.push(`issued at:  ${new Date(payload.iat * 1000).toISOString()}`);
  }
  if (typeof payload.nbf === "number") {
    lines.push(`not before: ${new Date(payload.nbf * 1000).toISOString()}`);
  }
  if (typeof payload.exp === "number") {
    const expired = payload.exp < now;
    lines.push(
      `expires:    ${new Date(payload.exp * 1000).toISOString()} (${expired ? "EXPIRED" : "valid"})`
    );
  }
  return lines;
}

module.exports = { decode, base64UrlDecode, describeClaims };

if (require.main === module) {
  const token = process.argv[2];
  if (!token) {
    console.error("Usage: jwtdecode.js <token>");
    process.exit(2);
  }

  try {
    const { header, payload } = decode(token);
    console.log("Header:");
    console.log(JSON.stringify(header, null, 2));
    console.log("\nPayload:");
    console.log(JSON.stringify(payload, null, 2));

    const claimLines = describeClaims(payload);
    if (claimLines.length > 0) {
      console.log("\nClaims:");
      for (const line of claimLines) console.log("  " + line);
    }

    console.log("\n(signature not verified - this tool only decodes)");
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
