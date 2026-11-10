// Halloween : notre « ⟳ Rejouer auto » (éteint par défaut) monté dans le bandeau ; allumé, il clique « Affronter à
// nouveau » à la victoire — jamais la citrouille (bonbons), jamais à la défaite, rien sur le bandeau compact du site
// (Replay auto du site allumé) ; état mémorisé.
const { chromium } = require('playwright');
const fs = require('fs');
const script = fs.readFileSync(process.argv[2], 'utf8');
const page_ = (variant) => `<!doctype html><html><body><main>
<header><button class="btn ghost small" data-story-map="">← Quitter le combat</button><div><span class="eyebrow">HALLOWEEN · LE COMTE DE MINUIT · Halloween</span><h2>Cauchemar : le Roi sans vie</h2></div><span class="story-round">TOUR 8</span><span class="combat-auto-group"><button type="button" class="btn ghost small combat-auto-btn ${variant === 'compact' ? 'is-on' : ''}" data-combat-auto="replay">⟳ Replay auto<em>${variant === 'compact' ? 'ON' : 'OFF'}</em></button></span></header>
${variant === 'compact'
  ? `<section class="story-end-screen hw-end hw-end-compact won" style="min-height:80px"><div class="hw-end-strip"><b>VICTOIRE</b><small>Combat suivant…</small></div></section>`
  : `<section class="story-end-screen hw-end ${variant}" style="min-height:120px"><div class="hw-end-actions">
<button type="button" class="hw-btn is-main" data-hw26-play="970002">↻ Affronter à nouveau</button>
<button type="button" class="hw-btn" data-hw26-open="pumpkin">🎃 Ouvrir une citrouille · 2,8K</button>
<button type="button" class="hw-btn" data-hw26-back="">↩ Retour à l’événement</button>
</div></section>`}
</main></body></html>`;
let variant = 'won';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://yurocollection.fr/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: page_(variant) }));
  const boot = async () => {
    await page.goto(`https://yurocollection.fr/?t=${Date.now()}#combat`);
    await page.addScriptTag({ content: script });
    await page.evaluate(() => {
      Object.assign(yuroPlus.reglages, { rapideMs: 200, reessaiMs: 400 });
      window.__clics = { play: 0, pumpkin: 0, back: 0 };
      for (const [key, sel] of [['play', '[data-hw26-play]'], ['pumpkin', '[data-hw26-open]'], ['back', '[data-hw26-back]']]) document.querySelector(sel)?.addEventListener('click', () => { window.__clics[key]++; });
    });
    await page.waitForSelector('[data-yuro-auto="hw"]', { timeout: 3000 });
  };
  const out = {};
  // 1. monté, éteint par défaut : aucun clic même sur une victoire
  await boot();
  out.toggle = await page.evaluate(() => { const b = document.querySelector('[data-yuro-auto="hw"]'); return { texte: b.textContent, pasDeSuivantAuto: !document.querySelector('[data-yuro-auto="next"]') }; });
  await page.waitForTimeout(800);
  out.eteint = await page.evaluate(() => window.__clics);
  // 2. allumé d'un clic : « Affronter à nouveau » cliqué vite, jamais la citrouille ni le retour
  await page.click('[data-yuro-auto="hw"]');
  await page.waitForFunction(() => window.__clics.play > 0, null, { timeout: 3000 }).catch(() => {});
  out.allume = await page.evaluate(() => ({ ...window.__clics, compteur: yuroPlus.relancesHalloween, texte: document.querySelector('[data-yuro-auto="hw"]').textContent }));
  // 3. mémorisé au rechargement ; défaite : aucun clic
  variant = 'lost';
  await boot();
  out.memorise = await page.evaluate(() => yuroPlus.reglages.halloween);
  await page.waitForTimeout(800);
  out.defaite = await page.evaluate(() => window.__clics);
  // 4. bandeau compact du site (Replay auto du site allumé) : rien à cliquer, rien ne casse
  variant = 'compact';
  await boot();
  await page.waitForTimeout(800);
  out.compact = await page.evaluate(() => window.__clics);
  await page.evaluate(() => yuroPlus.halloweenAuto(false));
  // 5. le site redessine le bandeau (changement de tour) : le bouton revient aussitôt, sans attendre l'intervalle,
  // avec son état, et sans s'empiler
  variant = 'won';
  await boot();
  await page.evaluate(() => { yuroPlus.reglages.verifieMs = 1e9; });
  await page.evaluate(() => { const h = document.querySelector('header'); const our = h.querySelector('[data-yuro-auto="hw"]')?.parentElement; our?.remove(); h.querySelector('.story-round').textContent = 'TOUR 9'; });
  await page.waitForTimeout(150);
  out.redessine = await page.evaluate(() => ({ boutons: document.querySelectorAll('[data-yuro-auto="hw"]').length, texte: document.querySelector('[data-yuro-auto="hw"]')?.textContent ?? 'absent' }));
  out.errors = errors;
  const ok = out.toggle.texte === '⟳ Rejouer autoOFF' && out.toggle.pasDeSuivantAuto
    && out.eteint.play === 0
    && out.allume.play === 1 && out.allume.pumpkin === 0 && out.allume.back === 0 && out.allume.compteur === 1 && out.allume.texte === '⟳ Rejouer autoON'
    && out.memorise === true && out.defaite.play === 0
    && out.compact.play === 0 && out.redessine.boutons === 1 && out.redessine.texte === '⟳ Rejouer autoOFF' && errors.length === 0;
  console.log(JSON.stringify(out, null, 1));
  console.log(ok ? 'PASS' : 'FAIL');
  await browser.close();
  process.exit(ok ? 0 : 1);
})();
