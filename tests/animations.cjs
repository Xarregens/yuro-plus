// Onglet caché : le navigateur ne joue aucune animation CSS, donc le site ne reçoit jamais « animationend » et ses
// effets de combat (retirés à la fin de leur animation) s'empilent — 78 000 le 18/11, et la page se figeait au retour.
// Le script termine lui-même les animations dont la durée est écoulée et prévient le site : les 300 effets simulés
// disparaissent, une animation en boucle n'est pas touchée, un élément qui reste en place reçoit sa fin une fois ;
// les effets animés en JavaScript (element.animate) reçoivent aussi leur « finish » ; onglet visible, le script ne touche à rien (c'est le navigateur qui fait le travail).
const { chromium } = require('playwright');
const fs = require('fs');
const script = fs.readFileSync(process.argv[2], 'utf8');
const PAGE = `<!doctype html><html><head><style>
@keyframes pop { from { opacity: 1 } to { opacity: 0 } }
@keyframes tourne { to { transform: rotate(360deg) } }
.effet { animation: pop 300ms } .reste { animation: pop 300ms forwards } .boucle { animation: tourne 1s infinite }
</style></head><body><main id="combat"></main></body></html>`;
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://yurocollection.fr/**', (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: PAGE }));
  await page.goto('https://yurocollection.fr/#combat');
  await page.evaluate(() => {
    window.__cache = true;
    Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get: () => window.__cache });
    Object.defineProperty(Document.prototype, 'visibilityState', { configurable: true, get: () => window.__cache ? 'hidden' : 'visible' });
    // comme le site : chaque effet est retiré à la fin de son animation
    window.__fins = { effet: 0, reste: 0, noms: new Set() };
    document.addEventListener('animationend', (e) => {
      window.__fins.noms.add(e.animationName);
      if (e.target.classList.contains('effet')) { window.__fins.effet++; e.target.remove(); }
      if (e.target.classList.contains('reste')) window.__fins.reste++;
    });
    // des effets créés pendant que l'onglet est caché : animations figées, comme dans un vrai onglet caché
    window.__cree = (n, extra) => {
      const zone = document.getElementById('combat');
      for (let i = 0; i < n; i++) zone.append(Object.assign(document.createElement('span'), { className: 'effet', textContent: '-' + i }));
      if (extra) {
        zone.append(Object.assign(document.createElement('i'), { className: 'boucle' }));
        zone.append(Object.assign(document.createElement('b'), { className: 'reste', textContent: 'PV' }));
      }
      for (const anim of document.getAnimations()) anim.pause();
    };
    // effets animés en JavaScript (element.animate), retirés par le site dans leur onfinish
    // le navigateur de test n'est pas vraiment caché : il enverrait aussi les vrais « finish ». On compte à part ceux
    // envoyés par le script (isTrusted false) — dans un vrai onglet caché, ce sont les seuls qui arrivent
    window.__finsJs = 0; window.__finsJsScript = 0;
    window.__creeJs = (n) => {
      const zone = document.getElementById('combat');
      for (let i = 0; i < n; i++) {
        const el = Object.assign(document.createElement('em'), { className: 'effet-js', textContent: '+' + i });
        zone.append(el);
        const anim = el.animate([{ opacity: 1 }, { opacity: 0 }], 300);
        anim.onfinish = (e) => { window.__finsJs++; if (!e.isTrusted) window.__finsJsScript++; el.remove(); };
        anim.pause();
      }
    };
  });
  await page.addScriptTag({ content: script });
  const out = {};
  // 1. onglet caché : 300 effets + une boucle + un élément qui reste
  await page.evaluate(() => window.__cree(300, true));
  await page.waitForTimeout(150);
  out.avant = await page.evaluate(() => document.querySelectorAll('.effet').length);
  await page.waitForTimeout(1500);
  out.cache = await page.evaluate(() => ({
    effetsRestants: document.querySelectorAll('.effet').length,
    finsEffets: window.__fins.effet,
    finsReste: window.__fins.reste,
    nom: [...window.__fins.noms].join(','),
    boucle: document.querySelector('.boucle').getAnimations()[0]?.playState ?? 'aucune',
    reste: document.querySelector('.reste') ? getComputedStyle(document.querySelector('.reste')).opacity : 'retiré',
    terminees: yuroPlus.reglages && document.getAnimations().length
  }));
  // 1 bis. onglet caché : 200 effets animés en JavaScript, retirés dans leur onfinish
  await page.evaluate(() => window.__creeJs(200));
  await page.waitForTimeout(1500);
  out.javascript = await page.evaluate(() => ({ restants: document.querySelectorAll('.effet-js').length, fins: window.__finsJs, parLeScript: window.__finsJsScript }));
  // 2. onglet visible : le script laisse faire le navigateur (ici figé), il ne termine rien lui-même
  await page.evaluate(() => { window.__cache = false; window.__cree(50, false); });
  await page.waitForTimeout(1500);
  out.visible = await page.evaluate(() => document.querySelectorAll('.effet').length);
  // 3. arrière-plan coupé : rien non plus
  await page.evaluate(() => { yuroPlus.arrierePlan(false); window.__cache = true; document.querySelectorAll('.effet').forEach((e) => e.remove()); window.__cree(20, false); });
  await page.waitForTimeout(1500);
  out.coupe = await page.evaluate(() => document.querySelectorAll('.effet').length);
  await page.evaluate(() => yuroPlus.arrierePlan(true));
  out.errors = errors;
  const ok = out.avant === 300
    && out.cache.effetsRestants === 0 && out.cache.finsEffets === 300 && out.cache.nom === 'pop'
    && out.cache.boucle === 'paused' && out.cache.finsReste >= 1 && out.cache.finsReste <= 2 && out.cache.reste === '0'
    && out.javascript.restants === 0 && out.javascript.parLeScript === 200
    && out.visible === 50 && out.coupe === 20
    && errors.length === 0;
  console.log(JSON.stringify(out, null, 1));
  console.log(ok ? 'PASS' : 'FAIL');
  await browser.close();
  process.exit(ok ? 0 : 1);
})();
