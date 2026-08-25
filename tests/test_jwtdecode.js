const test = require("node:test");
const assert = require("node:assert");
const { decode, base64UrlDecode, describeClaims } = require("../scripts/jwtdecode.js");

function base64UrlEncode(str) {
  return Buffer.from(str, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function makeToken(header, payload, signature = "fakesig") {
  const headerSeg = base64UrlEncode(JSON.stringify(header));
  const payloadSeg = base64UrlEncode(JSON.stringify(payload));
  return `${headerSeg}.${payloadSeg}.${signature}`;
}

test("decodes a well-formed token's header and payload", () => {
  const token = makeToken({ alg: "HS256", typ: "JWT" }, { sub: "user123", name: "Ada" });
  const { header, payload, signature } = decode(token);
  assert.deepStrictEqual(header, { alg: "HS256", typ: "JWT" });
  assert.deepStrictEqual(payload, { sub: "user123", name: "Ada" });
  assert.strictEqual(signature, "fakesig");
});

test("round-trips base64url encoding without standard-base64 padding characters", () => {
  // A payload chosen so its base64 encoding needs '+' / '/' in standard
  // base64 - confirms the URL-safe substitution actually round-trips.
  const payload = { data: "\xfb\xff\xfe???" };
  const token = makeToken({ alg: "none" }, payload);
  assert.ok(!token.includes("+"));
  assert.ok(!token.includes("/"));
  assert.ok(!token.includes("="));
  const { payload: decoded } = decode(token);
  assert.deepStrictEqual(decoded, payload);
});

test("base64UrlDecode handles all three padding-length cases", () => {
  assert.strictEqual(base64UrlDecode(base64UrlEncode("a")), "a");
  assert.strictEqual(base64UrlDecode(base64UrlEncode("ab")), "ab");
  assert.strictEqual(base64UrlDecode(base64UrlEncode("abc")), "abc");
  assert.strictEqual(base64UrlDecode(base64UrlEncode("abcd")), "abcd");
});

test("rejects a token that isn't exactly 3 segments", () => {
  assert.throws(() => decode("only.two"), /3 dot-separated segments/);
  assert.throws(() => decode("a.b.c.d"), /3 dot-separated segments/);
  assert.throws(() => decode(""), /3 dot-separated segments/);
});

test("rejects a token whose header isn't valid JSON", () => {
  const badHeader = base64UrlEncode("not json");
  const payload = base64UrlEncode(JSON.stringify({ sub: "x" }));
  assert.throws(() => decode(`${badHeader}.${payload}.sig`), /Could not decode\/parse header/);
});

test("rejects a token whose payload isn't valid JSON", () => {
  const header = base64UrlEncode(JSON.stringify({ alg: "none" }));
  const badPayload = base64UrlEncode("not json");
  assert.throws(() => decode(`${header}.${badPayload}.sig`), /Could not decode\/parse payload/);
});

test("rejects a non-string input", () => {
  assert.throws(() => decode(12345), TypeError);
});

test("describeClaims reports iat/nbf/exp as ISO timestamps when present", () => {
  const payload = { iat: 1700000000, nbf: 1700000000, exp: 9999999999 };
  const lines = describeClaims(payload).join("\n");
  assert.ok(lines.includes("issued at:"));
  assert.ok(lines.includes("not before:"));
  assert.ok(lines.includes("expires:"));
  assert.ok(lines.includes("valid"));
  assert.ok(!lines.includes("EXPIRED"));
});

test("describeClaims flags an exp in the past as EXPIRED", () => {
  const payload = { exp: 1000000000 }; // long in the past
  const lines = describeClaims(payload).join("\n");
  assert.ok(lines.includes("EXPIRED"));
});

test("describeClaims returns an empty array when no standard claims are present", () => {
  assert.deepStrictEqual(describeClaims({ custom: "value" }), []);
});
