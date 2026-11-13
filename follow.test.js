"use strict";

const assert = require("assert/strict");
const {
  normalizeToken,
  tokenize,
  tokensMatch,
  followScript,
  VoiceFollower
} = require("./follow.js");

const SAMPLE = [
  "Welcome. This is a sample script you can replace with your own.",
  "Take a breath, look at the lens, and speak a little slower than feels natural.",
  "The text can scroll at a steady speed, or it can follow your voice as you read.",
  "When you are ready, open the script panel, paste your copy, and press play.",
  "If you pause, the scroll waits. If you change speed or size, it updates live.",
  "That is all you need to know. Now swap this out and record your take."
].join(" ");

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log("ok  " + name);
  } catch (err) {
    failed += 1;
    failures.push({ name, err });
    console.error("FAIL  " + name);
    console.error("  " + (err && err.stack ? err.stack : err));
  }
}

function norms(text) {
  return tokenize(text).map((w) => w.norm);
}

function indexOfPhrase(scriptNorms, phrase) {
  const p = norms(phrase);
  for (let i = 0; i <= scriptNorms.length - p.length; i++) {
    let ok = true;
    for (let j = 0; j < p.length; j++) {
      if (scriptNorms[i + j] !== p[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return i + p.length - 1;
  }
  throw new Error("phrase not found in script: " + phrase);
}

function wordIndex(scriptNorms, word, from) {
  const n = normalizeToken(word);
  const start = from || 0;
  const i = scriptNorms.indexOf(n, start);
  if (i < 0) throw new Error("word not found: " + word);
  return i;
}

// --- normalize / tokenize ---

test("normalize lowercases and strips punctuation", () => {
  assert.equal(normalizeToken("Welcome."), "welcome");
  assert.equal(normalizeToken("It's"), "its");
  assert.equal(normalizeToken("\"Hello,\""), "hello");
  assert.equal(normalizeToken("lens—"), "lens");
});

test("normalize maps numbers and ordinals to words", () => {
  assert.equal(normalizeToken("20"), "twenty");
  assert.equal(normalizeToken("twenty"), "twenty");
  assert.equal(normalizeToken("1st"), "first");
  assert.equal(normalizeToken("first"), "first");
  assert.equal(normalizeToken("3rd"), "third");
  assert.equal(normalizeToken("12"), "twelve");
});

test("normalize applies spoken aliases", () => {
  assert.equal(normalizeToken("gonna"), "going");
  assert.equal(normalizeToken("OK"), "okay");
  assert.equal(normalizeToken("ok"), "okay");
  assert.equal(normalizeToken("'cause"), "because");
});

test("tokenize splits on whitespace and hyphens, keeps display raw", () => {
  const w = tokenize("Hello, live-video world.");
  assert.deepEqual(w.map((x) => x.norm), ["hello", "live", "video", "world"]);
  assert.ok(w[0].raw.toLowerCase().startsWith("hello"));
});

test("fuzzy token match tolerates a single typo on longer words", () => {
  assert.equal(tokensMatch("teleprompter", "telepromter", true), true);
  assert.equal(tokensMatch("natural", "natual", true), true);
  assert.equal(tokensMatch("the", "tha", true), false);
  assert.equal(tokensMatch("script", "script", true), true);
});

// --- exact / sequential follow ---

test("follows an exact spoken prefix word by word", () => {
  const script = norms(SAMPLE);
  let cursor = 0;
  const spoken = [];
  const steps = ["welcome", "this", "is", "a", "sample", "script"];
  for (const w of steps) {
    spoken.push(w);
    const r = followScript(script, spoken, cursor);
    assert.equal(r.matched, true, "should match " + w + " " + JSON.stringify(r));
    assert.ok(r.index >= cursor, "should not go backward");
    cursor = r.index;
  }
  assert.equal(cursor, indexOfPhrase(script, "sample script"));
});

test("interim-style growing transcript advances with low latency", () => {
  const script = norms(SAMPLE);
  const f = new VoiceFollower(SAMPLE);
  f.ingest("Welcome", false);
  assert.equal(f.cursor, wordIndex(f.norms, "welcome"));
  f.ingest("Welcome this is", false);
  assert.equal(f.cursor, indexOfPhrase(f.norms, "Welcome this is"));
  f.ingest("Welcome this is a sample script", false);
  assert.equal(f.cursor, indexOfPhrase(f.norms, "a sample script"));
});

// --- skips, ad-libs, repeats ---

test("tolerates skipped filler and a skipped content word", () => {
  const script = norms(SAMPLE);
  // "this is a sample script you can replace" spoken as "this is sample script you replace"
  const r = followScript(
    script,
    norms("Welcome this is sample script you replace"),
    0
  );
  assert.equal(r.matched, true, JSON.stringify(r));
  assert.equal(r.index, indexOfPhrase(script, "you can replace") - 1 + 1);
  // "replace" is the last spoken content word
  assert.equal(script[r.index], "replace");
});

test("tolerates ad-libbed fillers in the middle of a phrase", () => {
  const script = norms(SAMPLE);
  const r = followScript(
    script,
    norms("Welcome um this is uh actually a sample script"),
    0
  );
  assert.equal(r.matched, true, JSON.stringify(r));
  assert.equal(script[r.index], "script");
});

test("tolerates repeated words without jumping or going backward", () => {
  const script = norms(SAMPLE);
  const f = new VoiceFollower(SAMPLE);
  f.ingest("Welcome this this is is a sample script script", true);
  assert.equal(f.cursor, indexOfPhrase(f.norms, "a sample script"));
  const before = f.cursor;
  f.ingest("script script script", true);
  assert.equal(f.cursor, before);
});

test("ad-libs mixed with a skip still land on the last real script word", () => {
  const script = norms("Take a breath look at the lens and speak a little slower");
  const r = followScript(
    script,
    norms("Take a breath okay look at lens and speak slower"),
    0
  );
  assert.equal(r.matched, true, JSON.stringify(r));
  assert.equal(script[r.index], "slower");
});

// --- no weak backward jump ---

test("never jumps backward when a weak earlier phrase reappears", () => {
  const script = norms(SAMPLE);
  const f = new VoiceFollower(SAMPLE);
  f.ingest("Welcome this is a sample script you can replace with your own", true);
  const advanced = f.cursor;
  assert.ok(advanced > 6, "should have moved into the first sentence, got " + advanced);
  const r = f.ingest("Welcome this is a", true);
  assert.ok(f.cursor >= advanced, "cursor rewound from " + advanced + " to " + f.cursor);
  assert.equal(r.matched, false);
  assert.equal(f.cursor, advanced);
});

test("followScript itself refuses a backward jump to the opening words", () => {
  const script = norms(SAMPLE);
  const mid = indexOfPhrase(script, "follow your voice");
  const r = followScript(script, norms("Welcome this is a sample"), mid);
  assert.equal(r.matched, false);
  assert.equal(r.index, mid);
});

// --- forward re-sync ---

test("re-syncs forward when a unique later phrase is spoken", () => {
  const script = norms(SAMPLE);
  const start = indexOfPhrase(script, "sample script");
  const r = followScript(
    script,
    norms("open the script panel paste your copy"),
    start
  );
  assert.equal(r.matched, true, JSON.stringify(r));
  assert.equal(script[r.index], "copy");
  assert.ok(r.index > start + 8, "should have jumped forward, index=" + r.index);
});

test("does not jump forward on a weak single stopword match", () => {
  const script = norms(SAMPLE);
  const start = wordIndex(script, "welcome");
  const r = followScript(script, norms("the"), start);
  assert.equal(r.index, start, "jumped from welcome to " + r.index + " on 'the'");
  assert.equal(r.matched, false);
});

test("does not jump to a later repeated common word on a short match", () => {
  const script = norms(SAMPLE);
  // "you" appears several times. After "welcome", a lone "you" must not skip ahead.
  const start = wordIndex(script, "welcome");
  const r = followScript(script, norms("you"), start);
  assert.equal(r.index, start);
  assert.equal(r.matched, false);
});

// --- restarts (new recognition sessions) ---

test("a restarted session continues from the existing cursor", () => {
  const f = new VoiceFollower(SAMPLE);
  f.ingest("Welcome this is a sample script", true);
  const first = f.cursor;
  assert.equal(f.norms[first], "script");
  // Safari often ends recognition and starts a fresh result list.
  f.ingest("you can replace with your own", true);
  assert.equal(f.norms[f.cursor], "own");
  assert.ok(f.cursor > first);
});

test("short restart transcripts still advance one or two words", () => {
  const f = new VoiceFollower(SAMPLE);
  f.ingest("Welcome this is a sample script you can replace", true);
  const prev = f.cursor;
  f.ingest("with your own", true);
  assert.ok(f.cursor > prev);
  assert.equal(f.norms[f.cursor], "own");
});

test("final then interim then a new-session final (Safari-style restart)", () => {
  const f = new VoiceFollower(SAMPLE);
  f.ingest("Welcome this is a sample", true);
  f.ingest("Welcome this is a sample script you", false);
  assert.equal(f.norms[f.cursor], "you");
  // New session: rolling still has the last final ("...sample"), plus this new final.
  f.ingest("can replace with your own", true);
  assert.equal(f.norms[f.cursor], "own");
});

test("interim results do not get double-counted when the same text is finalized", () => {
  const f = new VoiceFollower(SAMPLE);
  f.ingest("Take a breath look at the lens", false);
  const mid = f.cursor;
  f.ingest("Take a breath look at the lens", true);
  assert.equal(f.cursor, mid);
  assert.equal(f.norms[f.cursor], "lens");
});

// --- fuzzy ASR + numbers ---

test("fuzzy match recovers from an ASR typo and keeps going", () => {
  const script = norms("The teleprompter can follow your voice as you read");
  const r = followScript(
    script,
    norms("the telepromter can follow your voice"),
    0
  );
  assert.equal(r.matched, true, JSON.stringify(r));
  assert.equal(script[r.index], "voice");
});

test("twenty and 20 match each other in script or speech", () => {
  const script = norms("I have 20 years of practice on this take");
  const r = followScript(script, norms("I have twenty years of practice"), 0);
  assert.equal(r.matched, true, JSON.stringify(r));
  assert.equal(script[r.index], "practice");
});

// --- VoiceFollower helpers / edges ---

test("empty or unmatched speech leaves the cursor alone", () => {
  const f = new VoiceFollower(SAMPLE);
  f.ingest("Welcome this is a sample script", true);
  const mid = f.cursor;
  const r1 = f.ingest("", false);
  assert.equal(r1.matched, false);
  assert.equal(f.cursor, mid);
  // Gibberish is kept in the rolling window as possible ad-libs, but it
  // must not move the cursor (a rematch of already-aligned words is ok).
  f.ingest("zzzzzyblat fooblex", true);
  assert.equal(f.cursor, mid);
});

test("setCursor lets a manual scrub re-anchor follow", () => {
  const f = new VoiceFollower(SAMPLE);
  const target = indexOfPhrase(f.norms, "press play");
  f.setCursor(target);
  f.ingest("If you pause the scroll waits", true);
  assert.equal(f.norms[f.cursor], "waits");
});

test("resetCursor returns to the start of the script", () => {
  const f = new VoiceFollower(SAMPLE);
  f.ingest("Welcome this is a sample script", true);
  f.resetCursor();
  assert.equal(f.cursor, 0);
  f.ingest("Welcome this is", true);
  assert.equal(f.norms[f.cursor], "is");
});

test("full sample read with skips, an ad-lib, and two restarts", () => {
  const f = new VoiceFollower(SAMPLE);
  f.ingest("Welcome this is a sample script you can replace with your own", true);
  f.ingest("Take a breath um look at the lens and speak a little slower than feels natural", true);
  // skip the sentence about steady speed; jump to the unique later phrase
  f.ingest("When you are ready open the script panel", true);
  assert.equal(f.norms[f.cursor], "panel");
  // restart
  f.ingest("paste your copy and press play", true);
  assert.equal(f.norms[f.cursor], "play");
  // restart again, with a skip ("the scroll waits" skipped "If you pause")
  f.ingest("If you pause the scroll waits", true);
  assert.equal(f.norms[f.cursor], "waits");
});

console.log("");
console.log(passed + " passed, " + failed + " failed");
if (failed) {
  process.exit(1);
}
