// Marché, onglet Vendre : puce « Doublons » montée après les puces de rareté du site (éteinte par défaut) ; allumée,
// elle masque les cartes à ×1, clique « Afficher plus de cartes » jusqu'au bout pour faire apparaître les doublons des
// pages suivantes, compte les doublons ; survit au redessin des puces et de la grille par le site ; mémorisée ;
// ne touche à rien d'autre (ni sélection de carte, ni puces du site, ni vente).
const { chromium } = require('playwright');
const fs = require('fs');
const script = fs.readFileSync(process.argv[2], 'utf8');
const PAGE = `<!doctype html><html><body><main>
<div class="mkx-sell" id="marketWorkspace"><section class="mkx-panel mkx-pick"><p class="mkx-sub">60 cartes vendables</p>
<div id="chipsHost"></div><div id="gridHost"></div>
<button type="button" class="mkx-btn is-ghost mkx-more-btn" data-market-more="">Afficher plus de cartes</button></section>
<aside><form id="marketSellForm"><button type="submit" id="publier">Publier l’annonce</button></form></aside></div>
</main><script>
// 60 cartes : doublons aux rangs 1, 30, 45 et 59 (donc 3 d'entre eux hors des 24 premières), une ×3
const cartes = Array.from({ length: 60 }, (_, i) => ({ id: 1000 + i, nom: 'Carte ' + i, n: [1, 30, 45].includes(i) ? 2 : i === 59 ? 3 : 1, rar: i % 2 ? 'Épique' : 'Rare' }));
let montrees = 24, filtre = 'Toutes';
window.__clics = { plus: 0, puceSite: 0, carte: 0, publier: 0 };
const tuile = (c) => '<button type="button" class="mkx-own" data-market-sell="' + c.id + '"><span class="mkx-own-art"><img alt=""><em>×' + c.n + '</em><span class="mkx-rar">SR</span></span><span class="mkx-own-copy"><strong>' + c.nom + '</strong><small>cote 500</small></span></button>';
function rendu() {
  // comme le vrai site : puces et grille entièrement redessinées à chaque changement
  document.getElementById('chipsHost').innerHTML = '<div class="mkx-chips" role="group">' + ['Toutes', 'Rare', 'Épique'].map((r) => '<button type="button" class="mkx-chip' + (r === filtre ? ' active' : '') + '" data-market-sell-rarity="' + r + '"><span>' + r + '</span></button>').join('') + '</div>';
  const liste = cartes.filter((c) => filtre === 'Toutes' || c.rar === filtre);
  document.getElementById('gridHost').innerHTML = '<div class="mkx-own-grid">' + liste.slice(0, montrees).map(tuile).join('') + '</div>';
  document.querySelector('[data-market-more]').style.display = montrees >= liste.length ? 'none' : '';
}
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-market-more]')) { window.__clics.plus++; montrees += 24; rendu(); }
  const puce = e.target.closest('#chipsHost [data-market-sell-rarity]');
  if (puce) { window.__clics.puceSite++; filtre = puce.dataset.marketSellRarity; montrees = 24; rendu(); }
  if (e.target.closest('.mkx-own')) window.__clics.carte++;
  if (e.target.closest('#publier')) { e.preventDefault(); window.__clics.publier++; }
});
rendu();
</${'script'}></body></html>`;
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://yurocollection.fr/**', (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: PAGE }));
  const boot = async () => {
    await page.goto(`https://yurocollection.fr/?t=${Date.now()}#market`);
    await page.addScriptTag({ content: script });
    await page.waitForSelector('.mkx-chips [data-yuro-doublons]', { timeout: 3000 });
  };
  const visibles = () => page.evaluate(() => [...document.querySelectorAll('.mkx-own')].filter((t) => t.getBoundingClientRect().height > 0).map((t) => t.querySelector('strong').textContent));
  const puce = () => page.evaluate(() => { const p = document.querySelector('.mkx-chips [data-yuro-doublons]'); return { texte: p.textContent, active: p.classList.contains('active'), apresSite: p.previousElementSibling?.hasAttribute('data-market-sell-rarity') }; });
  const out = {};
  // 1. puce montée après celles du site, éteinte par défaut : tout est visible, rien n'est cliqué
  await boot();
  await page.waitForTimeout(600);
  out.eteinte = { puce: await puce(), visibles: (await visibles()).length, clics: await page.evaluate(() => ({ ...window.__clics })) };
  // 2. allumée : la liste se charge jusqu'au bout, seuls les 4 doublons restent visibles, compteur à 4
  await page.click('.mkx-chips [data-yuro-doublons]');
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-market-more]')).display === 'none', null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(500);
  out.allumee = { puce: await puce(), visibles: await visibles(), clics: await page.evaluate(() => ({ ...window.__clics })) };
  // 3. le joueur choisit une rareté : le site redessine puces et grille ; notre puce revient, toujours allumée,
  // et la nouvelle liste (Épique : cartes impaires, doublons 1, 45 et 59) se recharge jusqu'au bout
  await page.click('#chipsHost [data-market-sell-rarity="Épique"]');
  await page.waitForTimeout(300);
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-market-more]')).display === 'none', null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(500);
  out.rarete = { puce: await puce(), visibles: await visibles(), nbPuces: await page.evaluate(() => document.querySelectorAll('.mkx-chips [data-yuro-doublons]').length) };
  // 4. mémorisée au rechargement
  await boot();
  await page.waitForTimeout(1500);
  out.memorisee = { active: (await puce()).active, visibles: (await visibles()).length };
  // 5. éteinte : tout revient, le site n'a jamais vu de clic sur une carte ni sur « Publier »
  await page.click('.mkx-chips [data-yuro-doublons]');
  await page.waitForTimeout(400);
  out.reeteinte = { active: (await puce()).active, visibles: (await visibles()).length, memo: await page.evaluate(() => JSON.parse(localStorage.getItem('yuro-plus:settings')).marcheDoublons), clics: await page.evaluate(() => ({ ...window.__clics })) };
  out.errors = errors;
  const ok = out.eteinte.puce.texte === '双Doublons' && !out.eteinte.puce.active && out.eteinte.puce.apresSite && out.eteinte.visibles === 24 && out.eteinte.clics.plus === 0
    && out.allumee.puce.active && out.allumee.puce.texte === '双Doublons · 4' && JSON.stringify(out.allumee.visibles) === JSON.stringify(['Carte 1', 'Carte 30', 'Carte 45', 'Carte 59']) && out.allumee.clics.plus === 2
    && out.rarete.nbPuces === 1 && out.rarete.puce.active && out.rarete.puce.apresSite && JSON.stringify(out.rarete.visibles) === JSON.stringify(['Carte 1', 'Carte 45', 'Carte 59'])
    && out.memorisee.active && out.memorisee.visibles === 4
    && !out.reeteinte.active && out.reeteinte.visibles > 4 && out.reeteinte.memo === false
    && out.reeteinte.clics.carte === 0 && out.reeteinte.clics.publier === 0
    && errors.length === 0;
  console.log(JSON.stringify(out, null, 1));
  console.log(ok ? 'PASS' : 'FAIL');
  await browser.close();
  process.exit(ok ? 0 : 1);
})();
