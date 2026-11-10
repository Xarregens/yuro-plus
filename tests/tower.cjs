// Château de l'infini : bouton « ⟳ Suivant auto » ajouté au bandeau (mémorisé), chambre suivante lancée à la victoire
// (clic sur [data-infinity-start]), jamais à la défaite (classe lost + bouton désactivé par le site), compteur dédié.
const { chromium } = require('playwright');
const fs = require('fs');
const script = fs.readFileSync(process.argv[2], 'utf8');
const page_ = (won) => `<!doctype html><html><body><main>
<header><button class="btn ghost small" data-infinity-lobby="">← Quitter le combat</button><div><span class="eyebrow">CHAMBRE 212 · Château de l’infini</span><h2>Chambre 212</h2></div><span class="story-round">TOUR 8</span></header>
<section class="story-end-screen ${won ? 'won' : 'lost'}" style="min-height:120px"><div class="story-result-buttons">
<button class="btn primary" data-infinity-replay="">↻ Rejouer</button>
<button class="btn ghost" data-infinity-start="" ${won ? '' : 'disabled=""'}>Suivant →</button>
<button class="btn ghost" data-infinity-lobby="">Retour au château</button>
</div></section>
</main></body></html>`;
let won = true;
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://yurocollection.fr/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: page_(won) }));
  const boot = async () => {
    await page.goto(`https://yurocollection.fr/?t=${Date.now()}#combat`);
    await page.addScriptTag({ content: script });
    await page.evaluate(() => { Object.assign(yuroPlus.reglages, { rapideMs: 200, reessaiMs: 400, verifieMs: 50 }); window.__suivant = 0; document.querySelector('[data-infinity-start]').addEventListener('click', () => { window.__suivant++; document.querySelector('.story-end-screen').remove(); }); });
  };
  const out = {};
  // 1. victoire : toggle monté dans le bandeau (ON), « Suivant » cliqué vite, compteur dédié, pas de message
  await boot();
  await page.waitForSelector('header [data-yuro-auto="next"]', { timeout: 3000 });
  out.toggle = await page.evaluate(() => { const b = document.querySelector('[data-yuro-auto="next"]'); return { texte: b.textContent, on: b.classList.contains('is-on'), dansHeader: Boolean(b.closest('header')) }; });
  await page.waitForFunction(() => window.__suivant > 0, null, { timeout: 3000 }).catch(() => {});
  out.victoire = await page.evaluate(() => ({ clics: window.__suivant, suivantes: yuroPlus.suivantes, relances: yuroPlus.relances, toasts: [...document.querySelectorAll('div')].filter((d) => /Yuro Plus/.test(d.textContent)).length }));
  // 2. défaite : aucun clic
  won = false;
  await boot();
  await page.waitForTimeout(800);
  out.defaite = await page.evaluate(() => window.__suivant);
  won = true;
  // 3. toggle coupé d'un clic sur le bouton du bandeau : aucun clic, état mémorisé au rechargement
  await boot();
  await page.waitForSelector('[data-yuro-auto="next"]', { timeout: 3000 });
  await page.click('[data-yuro-auto="next"]');
  out.coupeTexte = await page.evaluate(() => document.querySelector('[data-yuro-auto="next"]').textContent);
  await page.waitForTimeout(800);
  out.coupe = await page.evaluate(() => window.__suivant);
  await boot();
  await page.waitForSelector('[data-yuro-auto="next"]', { timeout: 3000 });
  out.apresRechargement = await page.evaluate(() => ({ reglage: yuroPlus.reglages.suivant, texte: document.querySelector('[data-yuro-auto="next"]')?.textContent ?? 'absent' }));
  out.remis = await page.evaluate(() => yuroPlus.suivantAuto(true));
  out.remisTexte = await page.evaluate(() => document.querySelector('[data-yuro-auto="next"]').textContent);
  out.errors = errors;
  const ok = out.toggle.texte === '⟳ Suivant autoON' && out.toggle.on && out.toggle.dansHeader
    && out.victoire.clics === 1 && out.victoire.suivantes === 1 && out.victoire.relances === 0 && out.victoire.toasts === 0
    && out.defaite === 0
    && out.coupeTexte === '⟳ Suivant autoOFF' && out.coupe === 0
    && out.apresRechargement.reglage === false && out.apresRechargement.texte === '⟳ Suivant autoOFF'
    && /activé/.test(out.remis) && out.remisTexte === '⟳ Suivant autoON'
    && errors.length === 0;
  console.log(JSON.stringify(out, null, 1));
  console.log(ok ? 'PASS' : 'FAIL');
  await browser.close();
  process.exit(ok ? 0 : 1);
})();
