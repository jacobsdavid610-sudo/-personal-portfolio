const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const url = require("node:url");
const { encode, decode, toASCII, toUnicode, PunycodeError, main } = require("../scripts/punycode.js");

const CLI = path.join(__dirname, "..", "scripts", "punycode.js");

function run(args, input) {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", input });
  return { code: r.status, out: r.stdout.replace(/\r\n/g, "\n"), err: r.stderr };
}

function sink() {
  const chunks = [];
  return { write: (s) => chunks.push(s), text: () => chunks.join("") };
}

// Every sample string in RFC 3492 section 7.1, (A) to (S), with the
// Punycode exactly as the RFC prints it.
const RFC_SAMPLES = [
  ["A", "ليهمابتكلموشعربي؟", "egbpdaj6bu4bxfgehfvwxn"],
  ["B", "他们为什么不说中文", "ihqwcrb4cv8a8dqg056pqjye"],
  ["C", "他們爲什麽不說中文", "ihqwctvzc91f659drss3x8bo0yb"],
  ["D", "Pročprostěnemluvíčesky", "Proprostnemluvesky-uyb24dma41a"],
  ["E", "למההםפשוטלאמדבריםעברית", "4dbcagdahymbxekheh6e0a7fei0b"],
  ["F", "यहलोगहिन्दीक्योंनहींबोलसकतेहैं", "i1baa7eci9glrd9b2ae1bj0hfcgg6iyaf8o0a1dig0cd"],
  ["G", "なぜみんな日本語を話してくれないのか", "n8jok5ay5dzabd5bym9f0cm5685rrjetr6pdxa"],
  ["H", "세계의모든사람들이한국어를이해한다면얼마나좋을까", "989aomsvi5e83db1d2a355cv1e0vak1dwrv93d5xbh15a0dt30a5jpsd879ccm6fea98c"],
  ["I", "почемужеонинеговорятпорусски", "b1abfaaepdrnnbgefbaDotcwatmq2g4l"],
  ["J", "PorquénopuedensimplementehablarenEspañol", "PorqunopuedensimplementehablarenEspaol-fmd56a"],
  ["K", "TạisaohọkhôngthểchỉnóitiếngViệt", "TisaohkhngthchnitingVit-kjcr8268qyxafd2f1b9g"],
  ["L", "3年B組金八先生", "3B-ww4c5e180e575a65lsy2b"],
  ["M", "安室奈美恵-with-SUPER-MONKEYS", "-with-SUPER-MONKEYS-pc58ag80a8qai00g7n9n"],
  ["N", "Hello-Another-Way-それぞれの場所", "Hello-Another-Way--fc4qua05auwb3674vfr0b"],
  ["O", "ひとつ屋根の下2", "2-u9tlzr9756bt3uc0v"],
  ["P", "MajiでKoiする5秒前", "MajiKoi5-783gue6qz075azm5e"],
  ["Q", "パフィーdeルンバ", "de-jg4avhby1noc0d"],
  ["R", "そのスピードで", "d9juau41awczczp"],
  ["S", "-> $1.00 <-", "-> $1.00 <--"],
];

// The RFC shows sample (I) with "mixed-case annotation": one digit is upper
// case to remember that a letter was. This encoder doesn't annotate, so it
// writes every digit in lower case; the copied basic part keeps its case.
function withoutAnnotation(puny) {
  const d = puny.lastIndexOf("-");
  return d < 0 ? puny.toLowerCase() : puny.slice(0, d + 1) + puny.slice(d + 1).toLowerCase();
}

// Small seeded generator so the random tests are the same every run.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The digits the encoder would write for one delta at a given bias. Used
// to build inputs no encoder would produce, to check decode refuses them.
function digitsFor(q, bias = 72) {
  let out = "";
  for (let k = 36; ; k += 36) {
    const t = k <= bias ? 1 : k >= bias + 26 ? 26 : k - bias;
    const ch = (d) => String.fromCharCode(d < 26 ? 97 + d : 22 + d);
    if (q < t) return out + ch(q);
    out += ch(t + ((q - t) % (36 - t)));
    q = Math.floor((q - t) / (36 - t));
  }
}

test("all 19 RFC 3492 samples encode and decode", () => {
  assert.strictEqual(RFC_SAMPLES.length, 19);
  for (const [name, unicode, puny] of RFC_SAMPLES) {
    assert.strictEqual(encode(unicode), withoutAnnotation(puny), `sample ${name}`);
    assert.strictEqual(decode(puny), unicode, `sample ${name}`);
  }
});

test("only sample (I) carries an upper-case digit", () => {
  const annotated = RFC_SAMPLES.filter(([, , p]) => withoutAnnotation(p) !== p).map(([n]) => n);
  assert.deepStrictEqual(annotated, ["I"]);
});

test("digits decode in either case", () => {
  assert.strictEqual(decode("MNCHEN-3YA"), "MüNCHEN");
  assert.strictEqual(decode("mnchen-3YA"), "münchen");
  assert.strictEqual(decode("IHQWCRB4CV8A8DQG056PQJYE"), RFC_SAMPLES[1][1]);
});

test("strings with no non-ASCII characters", () => {
  assert.strictEqual(encode(""), "");
  assert.strictEqual(decode(""), "");
  assert.strictEqual(encode("abc"), "abc-");
  assert.strictEqual(decode("abc-"), "abc");
  assert.strictEqual(encode("-"), "--");
  assert.strictEqual(decode("--"), "-");
});

test("code points outside the BMP", () => {
  assert.strictEqual(encode("\u{1F600}"), "e28h");
  assert.strictEqual(decode("e28h"), "\u{1F600}");
  assert.strictEqual(encode("i❤"), "i-7iq");
  const s = "a\u{10FFFF}b\u{1F600}é";
  assert.strictEqual(decode(encode(s)), s);
});

test("a lone surrogate can't be encoded", () => {
  for (const s of ["\ud800", "a\udc00b", "\ud83d"]) {
    assert.throws(() => encode(s), PunycodeError, JSON.stringify(s));
  }
});

test("decode refuses what the RFC says to refuse", () => {
  const cases = {
    "abc-!": /invalid Punycode digit "!"/,
    "abc-a-b": /truncated/, // only the last "-" is the delimiter, so "b" is all the digits
    "-abc": /invalid Punycode digit "-"/, // nothing before the delimiter, so it isn't one
    "abé-x": /non-ASCII/,
    "9": /truncated/,
    "mnchen-3y": /truncated/,
    "99999999999": /overflow/,
    "a-999999999999": /overflow/,
  };
  for (const [input, msg] of Object.entries(cases)) {
    assert.throws(() => decode(input), (e) => e instanceof PunycodeError && msg.test(e.message), JSON.stringify(input));
  }
});

test("decode refuses surrogates and code points past U+10FFFF", () => {
  assert.strictEqual(decode(digitsFor(0xd7ff - 128)), "퟿");
  assert.strictEqual(decode(digitsFor(0xe000 - 128)), "");
  assert.strictEqual(decode(digitsFor(0x10ffff - 128)), "\u{10FFFF}");
  for (const cp of [0xd800, 0xdbff, 0xdc00, 0xdfff, 0x110000, 0x7fff0000]) {
    assert.throws(() => decode(digitsFor(cp - 128)), /invalid code point|overflow/, cp.toString(16));
  }
});

test("non-strings are a TypeError", () => {
  for (const f of [encode, decode, toASCII, toUnicode]) {
    assert.throws(() => f(42), TypeError);
    assert.throws(() => f(null), TypeError);
  }
});

test("random strings survive encode then decode", () => {
  const rand = rng(3492);
  for (let n = 0; n < 500; n++) {
    let s = "";
    const len = Math.floor(rand() * 20);
    for (let j = 0; j < len; j++) {
      const pick = rand();
      let cp;
      if (pick < 0.3) cp = 0x20 + Math.floor(rand() * 0x5f);
      else if (pick < 0.8) cp = 0x80 + Math.floor(rand() * (0xd800 - 0x80));
      else cp = 0xe000 + Math.floor(rand() * (0x110000 - 0xe000));
      s += String.fromCodePoint(cp);
    }
    const enc = encode(s);
    assert.match(enc, /^[\x20-\x7e]*$/);
    assert.strictEqual(decode(enc), s, JSON.stringify(s));
  }
});

test("toASCII on everyday names", () => {
  assert.strictEqual(toASCII("münchen.de"), "xn--mnchen-3ya.de");
  assert.strictEqual(toASCII("例え.テスト"), "xn--r8jz45g.xn--zckzah");
  assert.strictEqual(toASCII("пример.рф"), "xn--e1afmkfd.xn--p1ai");
  assert.strictEqual(toASCII("example.com"), "example.com");
  assert.strictEqual(toASCII("localhost"), "localhost");
  assert.strictEqual(toASCII("_dmarc.münchen.de"), "_dmarc.xn--mnchen-3ya.de");
});

test("toASCII lower-cases and normalises, so spellings of a name agree", () => {
  const want = "xn--mnchen-3ya.de";
  for (const d of ["MÜNCHEN.DE", "München.De", "münchen.de", "XN--MNCHEN-3YA.DE"]) {
    assert.strictEqual(toASCII(d), want, JSON.stringify(d));
  }
});

test("toASCII keeps a trailing dot and accepts the ideographic full stops", () => {
  assert.strictEqual(toASCII("münchen.de."), "xn--mnchen-3ya.de.");
  assert.strictEqual(toASCII("例え。テスト"), "xn--r8jz45g.xn--zckzah");
  assert.strictEqual(toASCII("a．b｡c"), "a.b.c");
});

test("toASCII refuses empty labels and over-long names", () => {
  for (const d of ["", ".", "a..b", ".a", "a.b..", "münchen..de"]) {
    assert.throws(() => toASCII(d), /empty label/, JSON.stringify(d));
  }
  assert.strictEqual(toASCII("a".repeat(63) + ".de").length, 66);
  assert.throws(() => toASCII("a".repeat(64) + ".de"), /longer than 63/);
  // Sample (H) is 24 characters in Unicode but 73 once encoded.
  assert.throws(() => toASCII(RFC_SAMPLES[7][1] + ".kr"), /longer than 63/);
  const label = "a".repeat(63);
  const ok = [label, label, label, "a".repeat(61)].join("."); // 253
  assert.strictEqual(toASCII(ok), ok);
  assert.strictEqual(toASCII(ok + "."), ok + ".");
  assert.throws(() => toASCII(ok + "a"), /longer than 253/);
});

test("toASCII checks labels that already have the xn-- prefix", () => {
  assert.throws(() => toASCII("xn--abc-.de"), /plain ASCII/);
  assert.throws(() => toASCII("xn--a!b.de"), /invalid Punycode digit/);
  assert.throws(() => toASCII("xn--.de"), /plain ASCII/);
});

test("toUnicode decodes xn-- labels and leaves the rest", () => {
  assert.strictEqual(toUnicode("xn--mnchen-3ya.de"), "münchen.de");
  assert.strictEqual(toUnicode("www.xn--r8jz45g.xn--zckzah."), "www.例え.テスト.");
  assert.strictEqual(toUnicode("XN--MNCHEN-3YA.de"), "münchen.de");
  assert.strictEqual(toUnicode("Example.COM"), "Example.COM");
  assert.strictEqual(toUnicode("münchen.de"), "münchen.de");
});

test("toUnicode refuses non-canonical encodings", () => {
  // Each of these decodes to something toASCII would never have produced.
  const upper = "xn--" + encode("MÜNCHEN"); // upper case survives in the basic part
  const decomposed = "xn--" + encode("münchen"); // not NFC
  for (const label of [upper, decomposed]) {
    assert.throws(() => toUnicode(label + ".de"), /not a canonical encoding/, label);
  }
  assert.throws(() => toUnicode("xn--abc-.de"), /plain ASCII/);
  assert.throws(() => toUnicode("xn--zz.de"), /truncated|invalid/);
  assert.throws(() => toUnicode("a..b"), /empty label/);
});

test("agrees with Node's url.domainToASCII and domainToUnicode on real names", () => {
  const names = [
    "münchen.de", "bücher.example", "straße.de", "faß.de", "例え.テスト", "пример.рф", "ελληνικά.gr",
    "中国.cn", "한국.kr", "مثال.إختبار", "דוגמה.טעסט", "उदाहरण.परीक्षा", "i❤.ws", "😀.example",
    "ПРИМЕР.РФ", "Bücher.EXAMPLE.", "münchen.de", "españa.com", "türkiye.tr", "việtnam.vn",
  ];
  for (const name of names) {
    const ascii = toASCII(name);
    assert.strictEqual(ascii, url.domainToASCII(name), name);
    assert.strictEqual(toUnicode(ascii), url.domainToUnicode(ascii), name);
  }
});

test("agrees with url.domainToASCII on 300 random single-script names", () => {
  const scripts = [
    [0x61, 0x7a], // a-z, so labels mix ASCII in
    [0xe0, 0xf6], // à-ö
    [0x430, 0x44f], // а-я
    [0x3b1, 0x3c1], // α-ρ
    [0x3041, 0x3093], // hiragana
    [0x4e00, 0x9fa5], // CJK ideographs
    [0xac00, 0xd7a3], // Hangul syllables
  ];
  const rand = rng(1123);
  for (let n = 0; n < 300; n++) {
    const [lo, hi] = scripts[1 + Math.floor(rand() * (scripts.length - 1))];
    const labels = [];
    const count = 1 + Math.floor(rand() * 3);
    for (let j = 0; j < count; j++) {
      let label = "";
      const len = 1 + Math.floor(rand() * 10);
      for (let k = 0; k < len; k++) {
        const [a, b] = rand() < 0.3 ? scripts[0] : [lo, hi];
        label += String.fromCodePoint(a + Math.floor(rand() * (b - a + 1)));
      }
      labels.push(label);
    }
    const name = labels.join(".") + ".example";
    assert.strictEqual(toASCII(name), url.domainToASCII(name), name);
    assert.strictEqual(toUnicode(toASCII(name)), name);
  }
});

test("CLI: names as arguments, both ways", () => {
  let r = run(["münchen.de", "例え.テスト"]);
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.out, "xn--mnchen-3ya.de\nxn--r8jz45g.xn--zckzah\n");
  r = run(["-d", "xn--mnchen-3ya.de", "example.com"]);
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.out, "münchen.de\nexample.com\n");
});

test("CLI: --raw is bare RFC 3492", () => {
  let r = run(["--raw", RFC_SAMPLES[3][1]]);
  assert.strictEqual(r.out, "Proprostnemluvesky-uyb24dma41a\n");
  r = run(["--raw", "-d", "egbpdaj6bu4bxfgehfvwxn"]);
  assert.strictEqual(r.out, RFC_SAMPLES[0][1] + "\n");
});

test("CLI: one name per line from stdin, CRLF and blank lines tolerated", () => {
  const r = run([], "münchen.de\r\n\r\nпример.рф\nexample.com\n");
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.out, "xn--mnchen-3ya.de\nxn--e1afmkfd.xn--p1ai\nexample.com\n");
});

test("CLI: a bad name is reported, the rest still convert, exit 1", () => {
  const r = run(["-d", "xn--mnchen-3ya.de", "xn--abc-.de", "a..b", "xn--r8jz45g"]);
  assert.strictEqual(r.code, 1);
  assert.strictEqual(r.out, "münchen.de\n例え\n");
  assert.match(r.err, /"xn--abc-\.de": xn--abc- encodes plain ASCII/);
  assert.match(r.err, /"a\.\.b": empty label/);
});

test("CLI: usage errors exit 2, and -- ends the options", () => {
  let r = run(["-x", "a"]);
  assert.strictEqual(r.code, 2);
  assert.match(r.err, /unknown option -x/);
  assert.match(r.err, /^usage:/m);
  r = run(["--", "-d"]);
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.out, "-d\n");
});

test("main can be driven in-process", () => {
  const out = sink();
  const err = sink();
  assert.strictEqual(main([], "münchen.de\nxn--zz\n", out, err), 1);
  assert.strictEqual(out.text(), "xn--mnchen-3ya.de\n");
  assert.match(err.text(), /"xn--zz"/);
});
