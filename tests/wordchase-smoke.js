// Browser smoke test for Word Chase. Run: node tests/wordchase-smoke.js
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const assert = require('assert/strict');

const ROOT = path.join(__dirname, '..');
const PORT = 8766;
const URL = `http://localhost:${PORT}/pages/wordchase.html`;
const SHOTS = process.env.SHOT_DIR || ROOT;

(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 700));
  const browser = await chromium.launch();
  let failed = false;
  try {
    // 1. loads and becomes ready
    const page = await browser.newPage({ viewport: { width: 1000, height: 650 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(URL);
    await page.waitForFunction(() => window.__wc && window.__wc.state === 'ready', null, { timeout: 15000 });
    assert.equal(await page.isEnabled('#word'), true);

    // 2. the spec's chain
    await page.evaluate(() => window.__wcSetNeed('z'));
    assert.equal(await page.textContent('#need'), 'Z');
    for (const w of ['zoo', 'orb', 'break']) { await page.fill('#word', w); await page.press('#word', 'Enter'); }
    assert.equal(await page.textContent('#score'), '3');
    assert.equal(await page.textContent('#need'), 'K');
    assert.equal(await page.evaluate(() => window.__wc.run.steps), 11);
    assert.equal(await page.evaluate(() => window.__wc.state), 'playing');

    // 3. a fake word is rejected
    await page.fill('#word', 'kzzz');
    await page.press('#word', 'Enter');
    assert.equal(await page.evaluate(() => document.getElementById('word').classList.contains('shake')), true);
    assert.match(await page.textContent('#reason'), /not a word/);
    assert.equal(await page.textContent('#score'), '3');
    // repeated word
    await page.evaluate(() => window.__wc.run.need = 'z');
    await page.fill('#word', 'zoo');
    await page.press('#word', 'Enter');
    assert.match(await page.textContent('#reason'), /already used/);

    // 4. hiding the tab pauses
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    assert.equal(await page.evaluate(() => window.__wc.state), 'paused');
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); });
    await page.click('#word');
    assert.equal(await page.evaluate(() => window.__wc.state), 'playing');
    await page.screenshot({ path: path.join(SHOTS, 'wc-desktop.png') });

    // 6. getting caught ends the run
    await page.evaluate(() => { window.__wc.chaserX = window.__wc.runnerX; });
    await page.waitForFunction(() => document.getElementById('over').classList.contains('show'), null, { timeout: 3000 });
    assert.equal(await page.evaluate(() => window.__wc.state), 'over');
    assert.equal(await page.evaluate(() => localStorage.getItem('wordchase-best')), '3');
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(SHOTS, 'wc-over.png') });
    // play again resets
    await page.click('#again');
    assert.equal(await page.textContent('#score'), '0');
    assert.equal(await page.evaluate(() => window.__wc.state), 'ready');
    assert.deepEqual(errors, []);

    // 5. dictionary fails to load
    const p2 = await browser.newPage();
    await p2.route('**/words.txt', r => r.abort());
    await p2.goto(URL);
    await p2.waitForFunction(() => /couldn.t load/.test(document.getElementById('status').textContent), null, { timeout: 5000 });
    assert.equal(await p2.isVisible('#retry'), true);
    assert.equal(await p2.isEnabled('#word'), false);
    await p2.unroute('**/words.txt');
    await p2.click('#retry');
    await p2.waitForFunction(() => window.__wc.state === 'ready', null, { timeout: 15000 });

    // phone layout
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const p3 = await ctx.newPage();
    await p3.goto(URL);
    await p3.waitForFunction(() => window.__wc && window.__wc.state === 'ready', null, { timeout: 15000 });
    await p3.fill('#word', 'a');
    await p3.screenshot({ path: path.join(SHOTS, 'wc-phone.png') });

    console.log('SMOKE PASS');
  } catch (e) {
    failed = true;
    console.error('SMOKE FAIL:', e.message);
  } finally {
    await browser.close();
    srv.kill();
  }
  process.exit(failed ? 1 : 0);
})();
