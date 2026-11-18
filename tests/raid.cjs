// Raids (capture du 18/11/2026) : avec le Replay auto du site allumé, à la victoire, « ↻ Rejouer » [data-raid-level]
// est cliqué après rapideMs au lieu des ~2 s du site. Jamais : Replay auto éteint, défaite, écran déjà en train de
// partir (combat-end-leaving), « Suivant » / « Retour aux actes », ni le « Rejouer » du Château de l'infini.
const { chromium } = require('playwright');
const fs = require('fs');
const script = fs.readFileSync(process.argv[2], 'utf8');
const ecran = ({ resultat = 'won', auto = true, partant = false, chateau = false } = {}) => `<!doctype html><html><body><main>
<header><button class="btn ghost small" data-story-map="">← Quitter le combat</button><div><span class="eyebrow">RAID 2 · Dragon Ball</span><h2>Sacrifice</h2></div>
<span class="combat-auto-group"><button type="button" class="btn ghost small combat-auto-btn" data-combat-auto="next" aria-pressed="false">⏭ Suivant auto<em>OFF</em></button><button type="button" class="btn ghost small combat-auto-btn${auto ? ' is-on' : ''}" data-combat-auto="replay" aria-pressed="${auto}">⟳ Replay auto<em>${auto ? 'ON' : 'OFF'}</em></button></span></header>
<section class="story-end-screen ${resultat}${partant ? ' combat-end-leaving' : ''}" style="min-height:200px"><div class="story-end-panel end-v2"><button type="button" class="story-result-close" data-story-map="">×</button><h2>${resultat === 'won' ? 'VICTOIRE' : 'DÉFAITE'}</h2>
<div class="story-result-buttons">${chateau
  ? '<button type="button" class="btn primary" data-infinity-replay="">↻ Rejouer</button>'
  : '<button type="button" class="btn primary" data-raid-level="91015"><span class="yi yi-refresh">↻</span> Rejouer</button><button type="button" class="btn ghost" disabled="">Suivant →</button><button type="button" class="btn ghost" data-story-map="">Retour aux actes</button>'}</div></div></section>
</main></body></html>`;
let variante = {};
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://yurocollection.fr/**', (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: ecran(variante) }));
  const essai = async (v, attente = 2000) => {
    variante = v;
    await page.goto(`https://yurocollection.fr/?t=${Date.now()}#combat`);
    await page.evaluate(() => { window.__clics = []; window.__t0 = performance.now(); document.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) window.__clics.push({ ms: Math.round(performance.now() - window.__t0), texte: b.textContent.trim(), raid: b.hasAttribute('data-raid-level') }); }, true); });
    await page.addScriptTag({ content: script });
    await page.waitForTimeout(attente);
    return page.evaluate(() => ({ clics: window.__clics, relances: yuroPlus.relances }));
  };
  const out = {};
  out.victoire = await essai({});
  out.eteint = await essai({ auto: false });
  out.defaite = await essai({ resultat: 'lost' });
  out.partant = await essai({ partant: true });
  out.chateau = await essai({ chateau: true });
  out.errors = errors;
  const v = out.victoire.clics;
  const ok = v.length === 1 && v[0].raid && /Rejouer/.test(v[0].texte) && v[0].ms < 1500 && out.victoire.relances === 1
    && out.eteint.clics.length === 0 && out.defaite.clics.length === 0 && out.partant.clics.length === 0 && out.chateau.clics.length === 0
    && errors.length === 0;
  console.log(JSON.stringify(out, null, 1));
  console.log(ok ? 'PASS' : 'FAIL');
  await browser.close();
  process.exit(ok ? 0 : 1);
})();
