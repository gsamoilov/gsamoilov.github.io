/* Word Chase rules. No DOM here: the page and the tests both use this file. */
(function (root) {
  var START_LETTERS = 'abcdefghilmnoprstuw'; // no q x z j k v y: too few follow-ups to start on

  function parseWords(text) {
    var set = new Set();
    text.split('\n').forEach(function (line) {
      var w = line.trim().toLowerCase();
      if (w) set.add(w);
    });
    return set;
  }

  function randomStartLetter(rng) {
    var r = (rng || Math.random)();
    return START_LETTERS[Math.min(START_LETTERS.length - 1, Math.floor(r * START_LETTERS.length))];
  }

  function newRun(startLetter) {
    return { need: startLetter, used: new Set(), words: [], steps: 0 };
  }

  function normalize(input) {
    return String(input == null ? '' : input).trim().toLowerCase();
  }

  function checkWord(run, input, dict) {
    var w = normalize(input);
    if (w.length < 2) return { ok: false, reason: 'short' };
    if (w[0] !== run.need) return { ok: false, reason: 'letter' };
    if (!/^[a-z]+$/.test(w) || !dict.has(w)) return { ok: false, reason: 'notword' };
    if (run.used.has(w)) return { ok: false, reason: 'used' };
    return { ok: true, word: w };
  }

  function applyWord(run, word) {
    run.used.add(word);
    run.words.push(word);
    run.steps += word.length;
    run.need = word[word.length - 1];
    return word.length;
  }

  // Chaser speed in px/s (one step = 28 px). A base that creeps up every 5 s,
  // plus a pull that grows with the gap: the further ahead you get, the harder it runs.
  var CHASE_BASE = 16, CHASE_PER_5S = 1, CHASE_PULL = 0.05;
  function chaserSpeed(t, gap) {
    return CHASE_BASE + CHASE_PER_5S * Math.floor(t / 5) + CHASE_PULL * Math.max(0, gap);
  }

  var api = { chaserSpeed: chaserSpeed, START_LETTERS: START_LETTERS, parseWords: parseWords, randomStartLetter: randomStartLetter,
    newRun: newRun, normalize: normalize, checkWord: checkWord, applyWord: applyWord };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WordChase = api;
})(this);
