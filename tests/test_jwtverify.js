const test = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const { verify } = require("../scripts/jwtverify.js");

function base64UrlEncode(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function sign(header, payload, secret, hmacAlgo = "sha256") {
  const headerSeg = base64UrlEncode(JSON.stringify(header));
  const payloadSeg = base64UrlEncode(JSON.stringify(payload));
  const sig = crypto.createHmac(hmacAlgo, secret).update(`${headerSeg}.${payloadSeg}`).digest();
  return `${headerSeg}.${payloadSeg}.${base64UrlEncode(sig)}`;
}

test("a correctly-signed token with an allowed algorithm verifies", () => {
  const token = sign({ alg: "HS256", typ: "JWT" }, { sub: "u1" }, "secret");
  const result = verify(token, "secret", { algorithms: ["HS256"] });
  assert.strictEqual(result.valid, true);
  assert.deepStrictEqual(result.payload, { sub: "u1" });
});

test("the wrong secret is rejected", () => {
  const token = sign({ alg: "HS256" }, { sub: "u1" }, "secret");
  const result = verify(token, "wrong-secret", { algorithms: ["HS256"] });
  assert.strictEqual(result.valid, false);
  assert.match(result.reason, /signature mismatch/);
});

test("a tampered payload is rejected even though it's still valid JSON", () => {
  const token = sign({ alg: "HS256" }, { sub: "u1" }, "secret");
  const [headerSeg, , sigSeg] = token.split(".");
  const forgedPayload = base64UrlEncode(JSON.stringify({ sub: "admin" }));
  const forged = `${headerSeg}.${forgedPayload}.${sigSeg}`;
  const result = verify(forged, "secret", { algorithms: ["HS256"] });
  assert.strictEqual(result.valid, false);
  assert.match(result.reason, /signature mismatch/);
});

test("alg: none is rejected outright, not treated as 'no signature needed'", () => {
  const headerSeg = base64UrlEncode(JSON.stringify({ alg: "none", typ: "JWT" }));
  const payloadSeg = base64UrlEncode(JSON.stringify({ sub: "attacker" }));
  const token = `${headerSeg}.${payloadSeg}.`;
  const result = verify(token, "secret", { algorithms: ["HS256"] });
  assert.strictEqual(result.valid, false);
  assert.match(result.reason, /not in the allowed list/);
});

test("an algorithm not in the caller's allowlist is rejected even if it's a real HMAC alg", () => {
  const token = sign({ alg: "HS384" }, { sub: "u1" }, "secret", "sha384");
  const result = verify(token, "secret", { algorithms: ["HS256"] });
  assert.strictEqual(result.valid, false);
  assert.match(result.reason, /not in the allowed list/);
});

test("HS384 verifies correctly when explicitly allowed", () => {
  const token = sign({ alg: "HS384" }, { sub: "u1" }, "secret", "sha384");
  const result = verify(token, "secret", { algorithms: ["HS384"] });
  assert.strictEqual(result.valid, true);
});

test("HS512 verifies correctly when explicitly allowed", () => {
  const token = sign({ alg: "HS512" }, { sub: "u1" }, "secret", "sha512");
  const result = verify(token, "secret", { algorithms: ["HS512"] });
  assert.strictEqual(result.valid, true);
});

test("a non-HMAC algorithm in the caller's own allowlist is rejected, not crashed on", () => {
  const token = sign({ alg: "RS256" }, { sub: "u1" }, "secret");
  const result = verify(token, "secret", { algorithms: ["RS256"] });
  assert.strictEqual(result.valid, false);
  assert.match(result.reason, /not an HMAC algorithm/);
});

test("omitting options.algorithms throws rather than silently trusting the token's own alg", () => {
  const token = sign({ alg: "HS256" }, { sub: "u1" }, "secret");
  assert.throws(() => verify(token, "secret", {}), /algorithms is required/);
  assert.throws(() => verify(token, "secret"), /algorithms is required/);
});

test("exp in the past is rejected, using the injected clock", () => {
  const token = sign({ alg: "HS256" }, { sub: "u1", exp: 1000 }, "secret");
  const result = verify(token, "secret", { algorithms: ["HS256"], clock: () => 2000 * 1000 });
  assert.strictEqual(result.valid, false);
  assert.match(result.reason, /expired/);
});

test("exp in the future passes, using the injected clock", () => {
  const token = sign({ alg: "HS256" }, { sub: "u1", exp: 2000 }, "secret");
  const result = verify(token, "secret", { algorithms: ["HS256"], clock: () => 1000 * 1000 });
  assert.strictEqual(result.valid, true);
});

test("nbf in the future is rejected", () => {
  const token = sign({ alg: "HS256" }, { sub: "u1", nbf: 2000 }, "secret");
  const result = verify(token, "secret", { algorithms: ["HS256"], clock: () => 1000 * 1000 });
  assert.strictEqual(result.valid, false);
  assert.match(result.reason, /not yet valid/);
});

test("leewaySec forgives a small amount of expiry overshoot", () => {
  const token = sign({ alg: "HS256" }, { sub: "u1", exp: 1000 }, "secret");
  const justPast = () => (1000 + 5) * 1000;
  assert.strictEqual(verify(token, "secret", { algorithms: ["HS256"], clock: justPast }).valid, false);
  assert.strictEqual(
    verify(token, "secret", { algorithms: ["HS256"], clock: justPast, leewaySec: 10 }).valid,
    true,
  );
});

test("a token with no exp/nbf claims at all is valid regardless of the clock", () => {
  const token = sign({ alg: "HS256" }, { sub: "u1" }, "secret");
  const result = verify(token, "secret", { algorithms: ["HS256"], clock: () => 99999999999 * 1000 });
  assert.strictEqual(result.valid, true);
});

test("a malformed header is rejected without throwing", () => {
  const badHeader = base64UrlEncode("not json");
  const payloadSeg = base64UrlEncode(JSON.stringify({ sub: "u1" }));
  const result = verify(`${badHeader}.${payloadSeg}.sig`, "secret", { algorithms: ["HS256"] });
  assert.strictEqual(result.valid, false);
  assert.match(result.reason, /could not decode\/parse header/);
});

test("a token that isn't 3 segments throws, rather than returning valid: false", () => {
  assert.throws(() => verify("only.two", "secret", { algorithms: ["HS256"] }), /3 dot-separated segments/);
});
