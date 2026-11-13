/**
 * Voice-follow matcher for the teleprompter.
 * Pure functions + a small stateful follower so the algorithm can be unit-tested
 * without a browser SpeechRecognition implementation.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.TeleprompterFollow = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var STOPWORDS = {
    a: 1, an: 1, and: 1, are: 1, as: 1, at: 1, be: 1, but: 1, by: 1, for: 1,
    from: 1, had: 1, has: 1, have: 1, he: 1, her: 1, his: 1, i: 1, if: 1,
    in: 1, into: 1, is: 1, it: 1, its: 1, me: 1, my: 1, of: 1, on: 1, or: 1,
    our: 1, she: 1, so: 1, than: 1, that: 1, the: 1, their: 1, them: 1,
    then: 1, there: 1, these: 1, they: 1, this: 1, to: 1, uh: 1, um: 1,
    was: 1, we: 1, were: 1, with: 1, you: 1, your: 1
  };

  var ALIASES = {
    ok: "okay",
    okay: "okay",
    gonna: "going",
    wanna: "want",
    gotta: "got",
    kinda: "kind",
    yeah: "yeah",
    yep: "yeah",
    yup: "yeah",
    cause: "because",
    cos: "because",
    cuz: "because",
    til: "until",
    till: "until",
    n: "and",
    im: "im",
    ive: "ive",
    id: "id",
    ill: "ill",
    dont: "dont",
    didnt: "didnt",
    doesnt: "doesnt",
    cant: "cant",
    wont: "wont",
    thats: "thats",
    theres: "theres",
    theyre: "theyre",
    youre: "youre",
    weve: "weve"
  };

  var ONES = [
    "zero", "one", "two", "three", "four", "five", "six", "seven", "eight",
    "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
    "sixteen", "seventeen", "eighteen", "nineteen"
  ];
  var TENS = [
    "", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy",
    "eighty", "ninety"
  ];
  var ORDINALS = {
    "1": "first",
    "2": "second",
    "3": "third",
    "4": "fourth",
    "5": "fifth",
    "6": "sixth",
    "7": "seventh",
    "8": "eighth",
    "9": "ninth",
    "10": "tenth",
    "11": "eleventh",
    "12": "twelfth"
  };
  var ORDINAL_WORDS = {
    first: "first",
    second: "second",
    third: "third",
    fourth: "fourth",
    fifth: "fifth",
    sixth: "sixth",
    seventh: "seventh",
    eighth: "eighth",
    ninth: "ninth",
    tenth: "tenth",
    eleventh: "eleventh",
    twelfth: "twelfth"
  };

  function isStop(tok) {
    return !!STOPWORDS[tok];
  }

  function isContent(tok) {
    return !!tok && !isStop(tok) && tok.length > 1;
  }

  function numberToWords(n) {
    if (n < 0 || n > 99 || !isFinite(n)) return null;
    if (n < 20) return ONES[n];
    var ten = Math.floor(n / 10);
    var one = n % 10;
    return TENS[ten] + (one ? ONES[one] : "");
  }

  function normalizeNumberish(tok) {
    if (ORDINAL_WORDS[tok]) return ORDINAL_WORDS[tok];
    var ord = tok.match(/^(\d+)(st|nd|rd|th)$/);
    if (ord) {
      var n = parseInt(ord[1], 10);
      if (ORDINALS[String(n)]) return ORDINALS[String(n)];
      var words = numberToWords(n);
      return words ? words + "th" : tok;
    }
    if (/^\d+$/.test(tok)) {
      var num = parseInt(tok, 10);
      return numberToWords(num) || tok;
    }
    return tok;
  }

  function normalizeToken(raw) {
    if (raw == null) return "";
    var t = String(raw).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
    t = t.replace(/[’‘`]/g, "'").replace(/[—–]/g, "-");
    t = t.replace(/[^a-z0-9']+/g, "");
    t = t.replace(/'/g, "");
    if (!t) return "";
    t = normalizeNumberish(t);
    if (ALIASES[t]) t = ALIASES[t];
    return t;
  }

  function tokenize(text) {
    var words = [];
    var parts = String(text || "").trim().split(/\s+/);
    for (var p = 0; p < parts.length; p++) {
      var part = parts[p];
      if (!part) continue;
      var subs = part.split(/[-—–/]+/);
      for (var s = 0; s < subs.length; s++) {
        var raw = subs[s];
        var norm = normalizeToken(raw);
        if (norm) words.push({ raw: raw, norm: norm });
      }
    }
    return words;
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    var al = a.length;
    var bl = b.length;
    if (Math.abs(al - bl) > 2) return 99;
    if (!al) return bl;
    if (!bl) return al;
    var prev = new Array(bl + 1);
    var cur = new Array(bl + 1);
    var j, i, c, tmp;
    for (j = 0; j <= bl; j++) prev[j] = j;
    for (i = 1; i <= al; i++) {
      cur[0] = i;
      for (j = 1; j <= bl; j++) {
        c = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + c);
      }
      tmp = prev;
      prev = cur;
      cur = tmp;
    }
    return prev[bl];
  }

  function tokensMatch(a, b, fuzzy) {
    if (!a || !b) return false;
    if (a === b) return true;
    if (!fuzzy) return false;
    var la = a.length;
    var lb = b.length;
    if (Math.abs(la - lb) > 2) return false;
    if (la >= 4 && lb >= 4 && levenshtein(a, b) <= 1) return true;
    if (la >= 6 && lb >= 6 && levenshtein(a, b) <= 2) return true;
    if (la >= 5 && lb >= 5 && (a.indexOf(b) === 0 || b.indexOf(a) === 0)) return true;
    return false;
  }

  function matchScore(spokenTok, scriptTok, recency) {
    if (tokensMatch(spokenTok, scriptTok, false)) {
      return (isContent(scriptTok) ? 5 : 3.2) * recency;
    }
    if (tokensMatch(spokenTok, scriptTok, true)) {
      return (isContent(scriptTok) ? 3 : 1.6) * recency;
    }
    return null;
  }

  function spokenSkipCost(tok, recency) {
    return (isStop(tok) || tok === "uh" || tok === "um" || tok === "er" || tok === "ah" ? 0.12 : 0.55) * recency;
  }

  function scriptSkipCost(tok) {
    return isStop(tok) ? 0.18 : 0.95;
  }

  function recencyWeight(i, n) {
    if (n <= 1) return 1.6;
    return 0.55 + 1.35 * (i / (n - 1));
  }

  function tracebackInfo(prev, spoken, slice, i, j) {
    var matchCount = 0;
    var contentMatchCount = 0;
    var lastMatchJ = -1;
    var spokenMatchAt = [];
    var ci = i;
    var cj = j;
    while (ci > 0 || cj > 0) {
      var dir = prev[ci][cj];
      if (dir === 1) {
        if (matchScore(spoken[ci - 1], slice[cj - 1], 1) != null) {
          matchCount += 1;
          if (isContent(slice[cj - 1])) contentMatchCount += 1;
          if (lastMatchJ < 0) lastMatchJ = cj - 1;
          spokenMatchAt[ci - 1] = cj - 1;
        }
        ci -= 1;
        cj -= 1;
      } else if (dir === 2) {
        ci -= 1;
      } else if (dir === 3) {
        cj -= 1;
      } else {
        break;
      }
    }
    var n = spoken.length;
    var lastIsMatch = spokenMatchAt[n - 1] != null;
    var tail = Math.min(4, n);
    var tailHits = 0;
    var localTailHits = 0;
    var localContentTail = 0;
    // Only count tail words that aligned near the end position, so earlier
    // matches in the rolling window cannot justify a weak local jump.
    var localRadius = tail + 5;
    for (var t = n - tail; t < n; t++) {
      if (spokenMatchAt[t] == null) continue;
      tailHits += 1;
      if (lastMatchJ >= 0 && spokenMatchAt[t] <= lastMatchJ && spokenMatchAt[t] >= lastMatchJ - localRadius) {
        localTailHits += 1;
        if (isContent(spoken[t])) localContentTail += 1;
      }
    }
    return {
      matchCount: matchCount,
      contentMatchCount: contentMatchCount,
      lastMatchJ: lastMatchJ,
      lastIsMatch: lastIsMatch,
      tailHits: tailHits,
      localTailHits: localTailHits,
      localContentTail: localContentTail,
      tail: tail
    };
  }

  function align(spoken, slice) {
    var n = spoken.length;
    var m = slice.length;
    var dp = new Array(n + 1);
    var prev = new Array(n + 1);
    var i, j;
    for (i = 0; i <= n; i++) {
      dp[i] = new Float64Array(m + 1);
      prev[i] = new Int8Array(m + 1);
    }
    for (i = 1; i <= n; i++) {
      dp[i][0] = dp[i - 1][0] - spokenSkipCost(spoken[i - 1], recencyWeight(i - 1, n));
      prev[i][0] = 2;
    }
    for (j = 1; j <= m; j++) {
      dp[0][j] = 0;
      prev[0][j] = 3;
    }

    for (i = 1; i <= n; i++) {
      var rw = recencyWeight(i - 1, n);
      for (j = 1; j <= m; j++) {
        var ms = matchScore(spoken[i - 1], slice[j - 1], rw);
        var diag = dp[i - 1][j - 1] + (ms == null ? -2 * rw : ms);
        var del = dp[i - 1][j] - spokenSkipCost(spoken[i - 1], rw);
        var ins = dp[i][j - 1] - scriptSkipCost(slice[j - 1]);
        var best = diag;
        var dir = 1;
        if (del > best) {
          best = del;
          dir = 2;
        }
        if (ins > best) {
          best = ins;
          dir = 3;
        }
        dp[i][j] = best;
        prev[i][j] = dir;
      }
    }

    var candidates = [];
    for (j = 1; j <= m; j++) {
      var info = tracebackInfo(prev, spoken, slice, n, j);
      if (info.lastMatchJ < 0) continue;
      if (!info.lastIsMatch && info.localTailHits < Math.min(2, info.tail)) continue;
      candidates.push({
        indexOffset: info.lastMatchJ,
        score: dp[n][j],
        matchCount: info.matchCount,
        contentMatchCount: info.contentMatchCount,
        lastIsMatch: info.lastIsMatch,
        tailHits: info.tailHits,
        localTailHits: info.localTailHits,
        localContentTail: info.localContentTail,
        tail: info.tail
      });
    }
    return candidates;
  }

  function confidenceOf(c, spokenLen, jump) {
    var coverage = spokenLen ? c.matchCount / spokenLen : 0;
    var tailRatio = c.tail ? (c.localTailHits || 0) / c.tail : 0;
    var conf = 0.25 * coverage + 0.35 * tailRatio + 0.2 * Math.min(1, c.matchCount / 4);
    if (c.lastIsMatch) conf += 0.15;
    if (c.contentMatchCount >= 2) conf += 0.1;
    if (c.contentMatchCount >= 3) conf += 0.05;
    if (jump > 8 && c.contentMatchCount < 2) conf -= 0.3;
    if (conf < 0) conf = 0;
    if (conf > 1) conf = 1;
    return conf;
  }

  function isBetterCandidate(a, b, cursor) {
    var sig = 3.2;
    if (a.score >= b.score + sig) return true;
    if (b.score >= a.score + sig) return false;
    var da = a.index >= cursor ? a.index - cursor : 1000 + (cursor - a.index);
    var db = b.index >= cursor ? b.index - cursor : 1000 + (cursor - b.index);
    if (da !== db) return da < db;
    return a.matchCount > b.matchCount;
  }

  function passesThreshold(c, jump) {
    if (c.matchCount < 1) return false;
    var local = c.localTailHits || 0;
    var localContent = c.localContentTail || 0;
    if (jump === 0) return c.lastIsMatch || local >= 2;
    // A lone filler ("a", "the") must not inch forward just because earlier
    // words in the rolling window already matched farther back.
    if (jump <= 2) {
      if (c.lastIsMatch && localContent >= 1) return true;
      if (c.lastIsMatch && local >= 2) return true;
      return false;
    }
    if (jump <= 6) return local >= 2 && (c.lastIsMatch || local >= 3);
    if (jump <= 16) return local >= 3 && localContent >= 2 && c.lastIsMatch;
    return c.matchCount >= 3 && c.contentMatchCount >= 3 && localContent >= 2 && c.lastIsMatch && local >= 3;
  }

  /**
   * Match a sliding window of recent spoken tokens to a lookahead window of the script.
   * Returns a new cursor (last matched script index). Never moves backward on a weak match.
   */
  function followScript(scriptNorms, spokenNorms, cursor, options) {
    options = options || {};
    var lookahead = options.lookahead != null ? options.lookahead : 80;
    var backContext = options.backContext != null ? options.backContext : 8;
    var windowSize = options.windowSize != null ? options.windowSize : 14;

    if (!scriptNorms || !scriptNorms.length) {
      return { index: 0, confidence: 0, matched: false };
    }

    var last = scriptNorms.length - 1;
    var cur = cursor == null ? 0 : cursor;
    if (cur < 0) cur = 0;
    if (cur > last) cur = last;

    var spoken = [];
    var i;
    if (spokenNorms && spokenNorms.length) {
      var startSp = Math.max(0, spokenNorms.length - windowSize);
      for (i = startSp; i < spokenNorms.length; i++) {
        if (spokenNorms[i]) spoken.push(spokenNorms[i]);
      }
    }
    if (!spoken.length) {
      return { index: cur, confidence: 0, matched: false };
    }

    var lo = Math.max(0, cur - backContext);
    var hi = Math.min(scriptNorms.length, cur + lookahead);
    var slice = [];
    for (i = lo; i < hi; i++) slice.push(scriptNorms[i]);

    var raw = align(spoken, slice);
    if (!raw.length) {
      return { index: cur, confidence: 0, matched: false };
    }

    var best = null;
    for (i = 0; i < raw.length; i++) {
      var c = raw[i];
      c.index = lo + c.indexOffset;
      c.jump = c.index - cur;
      c.confidence = confidenceOf(c, spoken.length, c.jump);
      if (!best || isBetterCandidate(c, best, cur)) best = c;
    }

    if (!best) {
      return { index: cur, confidence: 0, matched: false };
    }

    // Never jump backward on a weak (or even moderately strong) match.
    // Repeats and earlier words in the rolling window must not rewind the prompt.
    if (best.index < cur) {
      return { index: cur, confidence: best.confidence, matched: false, reason: "no-backward" };
    }

    if (!passesThreshold(best, best.jump)) {
      return { index: cur, confidence: best.confidence, matched: false, reason: "weak" };
    }

    return {
      index: best.index,
      confidence: best.confidence,
      matched: true,
      matchCount: best.matchCount,
      contentMatchCount: best.contentMatchCount,
      jump: best.jump
    };
  }

  function VoiceFollower(scriptText, options) {
    this.options = options || {};
    this.rolling = [];
    this.setScript(scriptText || "");
  }

  VoiceFollower.prototype.setScript = function (text) {
    this.words = tokenize(text || "");
    this.norms = this.words.map(function (w) { return w.norm; });
    this.cursor = 0;
    this.rolling = [];
  };

  VoiceFollower.prototype.resetCursor = function () {
    this.cursor = 0;
    this.rolling = [];
  };

  VoiceFollower.prototype.setCursor = function (index) {
    var last = this.words.length ? this.words.length - 1 : 0;
    var i = index == null ? 0 : index;
    if (i < 0) i = 0;
    if (i > last) i = last;
    this.cursor = i;
  };

  /**
   * Ingest a recognition hypothesis.
   * Finals are appended to a rolling window; interims are applied only for this call
   * so growing partials stay low-latency without being double-counted when finalized.
   */
  VoiceFollower.prototype.ingest = function (transcript, isFinal) {
    var tokens = tokenize(transcript || "").map(function (w) { return w.norm; });
    if (!tokens.length) {
      return { index: this.cursor, confidence: 0, matched: false, cursor: this.cursor };
    }
    var spoken;
    if (isFinal) {
      if (tokens.length) {
        this.rolling = this.rolling.concat(tokens);
        if (this.rolling.length > 20) this.rolling = this.rolling.slice(-20);
      }
      spoken = this.rolling;
    } else {
      spoken = this.rolling.concat(tokens);
      if (spoken.length > 20) spoken = spoken.slice(-20);
    }
    var result = followScript(this.norms, spoken, this.cursor, this.options);
    if (result.matched) this.cursor = result.index;
    result.cursor = this.cursor;
    return result;
  };

  return {
    STOPWORDS: STOPWORDS,
    normalizeToken: normalizeToken,
    tokenize: tokenize,
    tokensMatch: tokensMatch,
    levenshtein: levenshtein,
    followScript: followScript,
    VoiceFollower: VoiceFollower
  };
});
