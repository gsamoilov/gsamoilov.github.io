const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const W = require('../pages/wordchase/wordchase-logic.js');

const dict = W.parseWords('zoo\norb\r\nbreak\n\nKey\n');

test('parseWords', () => {
  assert.deepEqual([...dict].sort(), ['break', 'key', 'orb', 'zoo']);
});

test('spec chain z→zoo→orb→break', () => {
  const r = W.newRun('z');
  for (const w of ['zoo', 'orb', 'break']) {
    const c = W.checkWord(r, w, dict);
    assert.equal(c.ok, true);
    W.applyWord(r, c.word);
  }
  assert.equal(r.need, 'k');
  assert.equal(r.steps, 11);
  assert.deepEqual(r.words, ['zoo', 'orb', 'break']);
});

test('applyWord returns steps gained', () => {
  assert.equal(W.applyWord(W.newRun('z'), 'zoo'), 3);
});

test('normalizes messy input', () => {
  assert.deepEqual(W.checkWord(W.newRun('z'), '  ZoO ', dict), { ok: true, word: 'zoo' });
});

test('rejection reasons', () => {
  const r = W.newRun('z');
  assert.equal(W.checkWord(r, 'z', dict).reason, 'short');
  assert.equal(W.checkWord(r, 'orb', dict).reason, 'letter');
  assert.equal(W.checkWord(r, 'zzz', dict).reason, 'notword');
  assert.equal(W.checkWord(r, "zo'o", dict).reason, 'notword');
  assert.equal(W.checkWord(r, 'zo-o', dict).reason, 'notword');
  W.applyWord(r, 'zoo');
  r.need = 'z';
  assert.equal(W.checkWord(r, 'zoo', dict).reason, 'used');
  assert.equal(W.checkWord(r, '', dict).reason, 'short');
});

test('start letters', () => {
  for (let i = 0; i < 200; i++) assert.ok(W.START_LETTERS.includes(W.randomStartLetter()));
  assert.equal(W.randomStartLetter(() => 0), 'a');
  assert.equal(W.randomStartLetter(() => 0.9999), 'w');
  assert.ok(!/[qxzjkvy]/.test(W.START_LETTERS));
});

test('real list sanity', () => {
  const big = W.parseWords(fs.readFileSync(path.join(__dirname, '..', 'pages', 'wordchase', 'words.txt'), 'utf8'));
  assert.equal(big.size, 172823);
  for (const w of ['zoo', 'orb', 'break']) assert.ok(big.has(w));
});

test('chaser speeds up over time', () => {
  assert.ok(W.chaserSpeed(60, 260) > W.chaserSpeed(0, 260));
  assert.ok(W.chaserSpeed(120, 260) > W.chaserSpeed(60, 260));
});

test('chaser is faster the further ahead you are', () => {
  assert.ok(W.chaserSpeed(0, 600) > W.chaserSpeed(0, 260));
  assert.ok(W.chaserSpeed(0, 260) > W.chaserSpeed(0, 40));
});

test('chaser speed values', () => {
  assert.equal(W.chaserSpeed(0, 0), 16);
  assert.equal(W.chaserSpeed(0, 260), 29);   // start of a run: about the old pace
  assert.equal(W.chaserSpeed(0, -50), 16);   // never slower than the base
  assert.equal(W.chaserSpeed(4.9, 0), 16);   // time bumps come every 5 s
  assert.equal(W.chaserSpeed(5, 0), 17);
});
