// Fonctionnement en arrière-plan : le site croit l'onglet visible (document.hidden false, visibilitychange retenu),
// les minuteries et animations posées pendant que l'onglet est « caché » sont rejouées par le worker, et
// yuroPlus.arrierePlan(false) rend tout au navigateur (mémorisé).
const { chromium } = require('playwright');
const fs = require('fs');
const script = fs.readFileSync(process.argv[2], 'utf8');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://yurocollection.fr/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body><main><p>Jeu</p></main></body></html>' }));
  await page.goto('https://yurocollection.fr/#combat');
  // l'onglet se déclare caché (comme couvert par une autre fenêtre) : les lectures « réelles » du script le verront
  await page.evaluate(() => {
    Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get: () => true });
    Object.defineProperty(Document.prototype, 'visibilityState', { configurable: true, get: () => 'hidden' });
  });
  await page.addScriptTag({ content: script });
  const out = {};
  // 1. le site voit l'onglet visible malgré tout
  out.visible = await page.evaluate(() => ({ hidden: document.hidden, state: document.visibilityState }));
  // 2. visibilitychange retenu : un écouteur « du site » n'est pas appelé
  out.evenement = await page.evaluate(() => new Promise((resolve) => {
    let called = 0;
    document.addEventListener('visibilitychange', () => { called++; });
    document.dispatchEvent(new Event('visibilitychange'));
    setTimeout(() => resolve(called), 50);
  }));
  // 3. une minuterie et une animation posées pendant que l'onglet est caché tournent quand même (rejouées par le worker)
  out.minuterie = await page.evaluate(() => new Promise((resolve) => {
    const started = Date.now();
    setTimeout(() => resolve({ apresMs: Date.now() - started }), 400);
    // filet : si jamais rien ne vient
    const guard = () => Date.now() - started > 4000 && resolve({ apresMs: -1 });
    requestAnimationFrame(function loop() { guard(); requestAnimationFrame(loop); });
  }));
  out.animation = await page.evaluate(() => new Promise((resolve) => {
    let frames = 0;
    requestAnimationFrame(function loop() { if (++frames >= 3) return resolve(frames); requestAnimationFrame(loop); });
  }));
  // 4. coupé : le site revoit la réalité, l'écouteur reçoit l'événement, réglage mémorisé
  out.coupeMessage = await page.evaluate(() => yuroPlus.arrierePlan(false));
  out.visibleCoupe = await page.evaluate(() => ({ hidden: document.hidden, state: document.visibilityState }));
  out.evenementCoupe = await page.evaluate(() => new Promise((resolve) => {
    let called = 0;
    document.addEventListener('visibilitychange', () => { called++; });
    document.dispatchEvent(new Event('visibilitychange'));
    setTimeout(() => resolve(called), 50);
  }));
  out.memorise = await page.evaluate(() => JSON.parse(localStorage.getItem('yuro-plus:settings')).fondActif);
  await page.evaluate(() => yuroPlus.arrierePlan(true));
  out.errors = errors;
  const ok = out.visible.hidden === false && out.visible.state === 'visible'
    && out.evenement === 0
    && out.minuterie.apresMs >= 350 && out.minuterie.apresMs < 2000
    && out.animation === 3
    && /coupé/.test(out.coupeMessage) && out.visibleCoupe.hidden === true && out.visibleCoupe.state === 'hidden' && out.evenementCoupe === 1
    && out.memorise === false && errors.length === 0;
  console.log(JSON.stringify(out, null, 1));
  console.log(ok ? 'PASS' : 'FAIL');
  await browser.close();
  process.exit(ok ? 0 : 1);
})();
