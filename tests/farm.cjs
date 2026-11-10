// Relance du replay auto en mode farm : écran de fin resté affiché avec « Replay auto ON » → clic sur « Recommencer »
// après le délai ; rien si le toggle est OFF, si l'écran part tout seul (replay normal) ou si la relance est coupée ;
// après N clics sans effet, le script s'arrête et le dit.
const { chromium } = require('playwright');
const fs = require('fs');
const script = fs.readFileSync(process.argv[2], 'utf8');
const pageHtml = `<!doctype html><html><body><main>
<header><button type="button" class="btn ghost small combat-auto-btn is-on" data-combat-auto="replay" aria-pressed="true">⟳ Replay auto<em>ON</em></button></header>
<section class="story-end-screen farm-end won" style="min-height:120px"><div class="story-result-buttons">
<button type="button" class="btn primary" data-farm-start="">↻ Recommencer</button>
<button type="button" class="btn ghost" data-story-map="">Retour à la salle</button>
</div></section>
</main></body></html>`;
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://yurocollection.fr/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: pageHtml }));
  const boot = async () => {
    await page.goto(`https://yurocollection.fr/?t=${Date.now()}#combat`);
    await page.addScriptTag({ content: script });
    // délais courts pour le test : bloqué après 1 s, vérification toutes les 150 ms
    await page.evaluate(() => { yuroPlus.reglages.attenteMs = 1000; yuroPlus.reglages.verifieMs = 150; window.__clics = 0; document.querySelector('[data-farm-start]').addEventListener('click', () => { window.__clics++; }); });
  };
  const out = {};
  // 1. bloqué, replay auto ON : relancé après ~1 s (pas avant), toast affiché, compteur incrémenté
  await boot();
  await page.waitForTimeout(600);
  out.avantDelai = await page.evaluate(() => window.__clics);
  await page.waitForFunction(() => window.__clics > 0, null, { timeout: 5000 }).catch(() => {});
  out.relance = await page.evaluate(() => ({ clics: window.__clics, compteur: yuroPlus.relances, toast: [...document.querySelectorAll('div')].some((d) => /combat relancé/.test(d.textContent)) }));
  // le même écran toujours là : réessaie, puis s'arrête après essaisMax avec un message
  await page.waitForTimeout(4000);
  out.abandon = await page.evaluate(() => ({ clics: window.__clics, stop: [...document.querySelectorAll('div')].some((d) => /arrête d’insister/.test(d.textContent)) }));
  // 2. l'écran part tout seul avant le délai (replay auto normal) : aucun clic
  await boot();
  await page.waitForTimeout(500);
  await page.evaluate(() => document.querySelector('.story-end-screen').remove());
  await page.waitForTimeout(1500);
  out.normal = await page.evaluate(() => window.__clics);
  // 3. toggle OFF : aucun clic
  await boot();
  await page.evaluate(() => document.querySelector('[data-combat-auto]').classList.remove('is-on'));
  await page.waitForTimeout(2000);
  out.toggleOff = await page.evaluate(() => window.__clics);
  // 4. relance coupée par yuroPlus.relanceAuto(false), mémorisée au rechargement
  await boot();
  out.coupeMessage = await page.evaluate(() => yuroPlus.relanceAuto(false));
  await page.waitForTimeout(2000);
  out.coupe = await page.evaluate(() => window.__clics);
  await boot();
  out.coupeApresRechargement = await page.evaluate(() => yuroPlus.reglages.active);
  await page.evaluate(() => yuroPlus.relanceAuto(true));
  out.errors = errors;
  const ok = out.avantDelai === 0 && out.relance.clics === 1 && out.relance.compteur === 1 && out.relance.toast
    && out.abandon.clics === 3 && out.abandon.stop
    && out.normal === 0 && out.toggleOff === 0
    && /coupée/.test(out.coupeMessage) && out.coupe === 0 && out.coupeApresRechargement === false
    && errors.length === 0;
  console.log(JSON.stringify(out, null, 1));
  console.log(ok ? 'PASS' : 'FAIL');
  await browser.close();
  process.exit(ok ? 0 : 1);
})();
