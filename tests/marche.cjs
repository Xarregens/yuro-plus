// Marché, onglet Vendre : puce « Doublons » montée après les puces de rareté du site (éteinte par défaut) ; allumée,
// elle masque les cartes à ×1, clique « Afficher plus de cartes » jusqu'au bout — vite : 300 cartes en moins d'une
// seconde — pour faire apparaître les doublons des pages suivantes, compte les doublons ; survit au redessin des puces
// et de la grille par le site sans jamais disparaître d'une image à l'autre (pas de clignotement) ; absente des
// onglets Acheter / Échanges, où rien n'est cliqué ; éteinte à chaque arrivée sur Vendre et pas mémorisée.
// Puce « 値 Prix en ligne » : trie toute la liste par prix le moins cher en ligne chez les autres joueurs (ventes
// actives seulement : ni mes annonces, ni échanges, ni annonces vendues), puis par cote ; prix écrit sous chaque carte ;
// combinable avec Doublons ; données lues dans marketUI.data du site, ou, sans elle, dans la réponse /api/market
// reçue au passage. Ne touche à rien d'autre (ni sélection de carte, ni puces du site, ni vente).
const { chromium } = require('playwright');
const fs = require('fs');
const script = fs.readFileSync(process.argv[2], 'utf8');
// annonces du marché (structure de la capture du 17/11 ; la liste des annonces des autres n'a jamais été vue en
// entier, d'où une clé inventée « offres » : le script doit les trouver où qu'elles soient)
const h = (i) => (0xabc000 + i).toString(16).padStart(8, '0');
const img = (i) => `https://yurocollection.fr/card-art/${h(i)}.webp`;
const annonce = (id, i, price, extra = {}) => ({ id, kind: 'sale', status: 'active', seller_id: 'v' + id, seller_name: 'Vendeur ' + id, price, card: { name: 'Carte ' + i, image: img(i), rarity: 'Épique' }, ...extra });
const MARCHE = {
  mine: [annonce('m1', 1, 99999, { seller_id: 'moi', seller_name: 'Moi' })],
  sales: [{ price: 50, card_key: 'key:x', created_at: '2026-11-19T10:00:00Z' }],
  offres: [annonce('a', 40, 15000), annonce('b', 5, 12000), annonce('c', 5, 9000), annonce('d', 2, 500), annonce('e', 7, 88888, { kind: 'trade' }),
    annonce('f', 8, 77777, { status: 'sold' }), annonce('g', 9, 66666, { seller_id: 'moi' }), annonce('h', 150, 2000)]
};
const PAGE = `<!doctype html><html><body><main>
<section class="market-page mkx" data-mkx="sell"><nav class="market-tabs"><button type="button" data-market-tab="buy">Acheter</button><button type="button" data-market-tab="sell" class="active">Vendre</button></nav>
<div class="mkx-sell" id="marketWorkspace"><section class="mkx-panel mkx-pick"><p class="mkx-sub">300 cartes vendables</p>
<div id="chipsHost"></div><div id="gridHost"></div>
<button type="button" class="mkx-btn is-ghost mkx-more-btn" data-market-more="">Afficher plus de cartes</button></section>
<aside><form id="marketSellForm"><button type="submit" id="publier">Publier l’annonce</button></form></aside></div></section>
</main><script>
// comme le site : ses données du marché dans marketUI.data (absente dans la variante « sansui »)
var marketUI = location.search.includes('sansui') ? undefined : { data: null };
const chargeMarche = () => fetch('/api/market').then((r) => r.json()).then((d) => { if (marketUI) marketUI.data = d; });
chargeMarche();
// 300 cartes : doublons aux rangs 1, 30, 45, 59 (×3), 150 et 299 — la plupart bien au-delà des 24 premières
const DOUBLONS = { 1: 2, 30: 2, 45: 2, 59: 3, 150: 2, 299: 2 };
const cartes = Array.from({ length: 300 }, (_, i) => ({ id: 1000 + i, nom: 'Carte ' + i, n: DOUBLONS[i] ?? 1, rar: i % 2 ? 'Épique' : 'Rare' }));
let montrees = 24, filtre = 'Toutes', onglet = 'sell';
window.__clics = { plus: 0, plusAchat: 0, puceSite: 0, carte: 0, publier: 0 };
// clignotement : à chaque image affichée, la puce Yuro Plus est-elle là ? (compté seulement une fois allumée)
window.__imagesSansPuce = 0;
requestAnimationFrame(function image() {
  if (window.__surveille && onglet === 'sell' && !document.querySelector('.mkx-chips [data-yuro-doublons]')) window.__imagesSansPuce++;
  requestAnimationFrame(image);
});
const hx = (i) => (0xabc000 + i).toString(16).padStart(8, '0');
const tuile = (c) => '<button type="button" class="mkx-own" data-market-sell="' + c.id + '"><span class="mkx-own-art"><img alt="" src="/card-art/t/' + hx(c.id - 1000) + '.webp" data-full="https://yurocollection.fr/card-art/' + hx(c.id - 1000) + '.webp"><em>×' + c.n + '</em><span class="mkx-rar">傑SR</span></span><span class="mkx-own-copy"><strong>' + c.nom + '</strong><small>cote ' + (1000 - (c.id - 1000)) + ' <span>ki</span></small></span></button>';
function rendu() {
  document.querySelector('section.market-page').dataset.mkx = onglet;
  if (onglet === 'buy') {
    // l'onglet Acheter a lui aussi des puces de rareté et un « Afficher plus », mais pas de grille .mkx-own-grid
    document.getElementById('chipsHost').innerHTML = '<div class="mkx-chips" role="group"><button type="button" class="mkx-chip active" data-market-buy-rarity="Toutes"><span>Toutes</span></button></div>';
    document.getElementById('gridHost').innerHTML = '<div class="mkx-offers"><article class="mkx-offer">Offre</article></div>';
    document.querySelector('[data-market-more]').style.display = '';
    return;
  }
  // comme le vrai site : puces et grille entièrement redessinées à chaque changement
  document.getElementById('chipsHost').innerHTML = '<div class="mkx-chips" role="group">' + ['Toutes', 'Rare', 'Épique'].map((r) => '<button type="button" class="mkx-chip' + (r === filtre ? ' active' : '') + '" data-market-sell-rarity="' + r + '"><span>' + r + '</span></button>').join('') + '</div>';
  const liste = cartes.filter((c) => filtre === 'Toutes' || c.rar === filtre);
  document.getElementById('gridHost').innerHTML = '<div class="mkx-own-grid">' + liste.slice(0, montrees).map(tuile).join('') + '</div>';
  document.querySelector('[data-market-more]').style.display = montrees >= liste.length ? 'none' : '';
}
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-market-more]')) { if (onglet === 'buy') { window.__clics.plusAchat++; return; } window.__clics.plus++; montrees += 24; rendu(); }
  const tab = e.target.closest('[data-market-tab]');
  if (tab) { onglet = tab.dataset.marketTab; montrees = 24; rendu(); if (onglet === 'sell') chargeMarche(); }
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
  await page.route('https://yurocollection.fr/**', (route) => {
    const chemin = new URL(route.request().url()).pathname;
    if (chemin === '/api/market') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MARCHE) });
    if (chemin.startsWith('/card-art/')) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: PAGE });
  });
  const boot = async (variante = '') => {
    await page.goto(`https://yurocollection.fr/?t=${Date.now()}${variante}#market`);
    await page.waitForTimeout(200); // le site a chargé ses données du marché AVANT le script (comme document-idle)
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
  // 2. allumée : la liste se charge jusqu'au bout, vite, seuls les 6 doublons restent visibles, compteur à 6, et la
  // puce (toujours le même bouton, sans animation) n'a manqué à aucune image pendant les redessins du site
  await page.evaluate(() => { window.__puceRef = document.querySelector('.mkx-chips [data-yuro-doublons]'); window.__surveille = true; });
  const depart = Date.now();
  await page.click('.mkx-chips [data-yuro-doublons]');
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-market-more]')).display === 'none', null, { timeout: 15000, polling: 20 }).catch(() => {});
  const dureeMs = Date.now() - depart;
  await page.waitForTimeout(500);
  out.allumee = {
    dureeMs,
    puce: await puce(),
    visibles: await visibles(),
    clics: await page.evaluate(() => ({ ...window.__clics })),
    memeBouton: await page.evaluate(() => document.querySelector('.mkx-chips [data-yuro-doublons]') === window.__puceRef),
    sansAnimation: await page.evaluate(() => { const st = getComputedStyle(document.querySelector('.mkx-chips [data-yuro-doublons]')); return st.animationName === 'none' && st.transitionDuration === '0s'; }),
    imagesSansPuce: await page.evaluate(() => window.__imagesSansPuce)
  };
  // 3. le joueur choisit une rareté : le site redessine puces et grille ; notre puce revient, toujours allumée,
  // et la nouvelle liste (Épique : cartes impaires, doublons 1, 45, 59 et 299) se recharge jusqu'au bout
  await page.click('#chipsHost [data-market-sell-rarity="Épique"]');
  await page.waitForTimeout(300);
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-market-more]')).display === 'none', null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(500);
  out.rarete = { puce: await puce(), visibles: await visibles(), nbPuces: await page.evaluate(() => document.querySelectorAll('.mkx-chips [data-yuro-doublons]').length) };
  // 3 bis. onglet Acheter (puces de rareté et « Afficher plus » à lui) : pas de puce, aucun clic, filtre inactif
  await page.click('[data-market-tab="buy"]');
  await page.waitForTimeout(1200);
  out.achat = await page.evaluate(() => ({ puces: document.querySelectorAll('[data-yuro-doublons]').length, plusAchat: window.__clics.plusAchat, filtre: document.documentElement.hasAttribute('data-yuro-filtre-doublons') }));
  await page.click('[data-market-tab="sell"]');
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-market-more]')).display === 'none', null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(300);
  // retour sur Vendre : la puce repart éteinte (demande du 19/11), toute la première page est visible
  out.retourVente = { puce: await puce(), visibles: (await visibles()).length };
  // 4. pas mémorisée : éteinte au rechargement, rien dans les réglages
  await page.click('.mkx-chips [data-yuro-doublons]');
  await page.waitForTimeout(300);
  await boot();
  await page.waitForTimeout(800);
  out.rechargee = { active: (await puce()).active, visibles: (await visibles()).length, memo: await page.evaluate(() => (localStorage.getItem('yuro-plus:settings') ?? '').includes('marcheDoublons')) };
  // 5. tri par prix en ligne (données du site, marketUI.data) : toute la liste chargée puis triée
  const tri = () => page.evaluate(() => {
    const p = document.querySelector('.mkx-chips [data-yuro-tri]');
    const cases = [...document.querySelectorAll('.mkx-own')].filter((t) => t.getBoundingClientRect().height > 0);
    const etiquette = (nom) => cases.find((t) => t.querySelector('strong').textContent === nom)?.querySelector('[data-yuro-prix]')?.textContent ?? 'absente';
    return { puce: p?.textContent, active: p?.classList.contains('active'), apresDoublons: p?.previousElementSibling?.hasAttribute('data-yuro-doublons'), ordre: cases.slice(0, 6).map((t) => t.querySelector('strong').textContent), nb: cases.length,
      etiquettes: { c40: etiquette('Carte 40'), c5: etiquette('Carte 5'), c0: etiquette('Carte 0'), c7: etiquette('Carte 7'), c9: etiquette('Carte 9'), c1: etiquette('Carte 1') } };
  });
  out.triEteint = await tri();
  await page.click('.mkx-chips [data-yuro-tri]');
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-market-more]')).display === 'none', null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(600);
  out.triAllume = await tri();
  // 5 bis. combiné avec Doublons : les 6 doublons, triés (seul Carte 150 a une annonce, les autres par cote)
  await page.click('.mkx-chips [data-yuro-doublons]');
  await page.waitForTimeout(600);
  out.triDoublons = (await tri()).ordre;
  // 5 ter. éteint : plus d'étiquettes de prix
  await page.click('.mkx-chips [data-yuro-tri]');
  await page.waitForTimeout(400);
  out.triCoupe = await page.evaluate(() => document.querySelectorAll('[data-yuro-prix]').length);
  // 6. sans marketUI : le chargement initial du site a eu lieu AVANT le script ; tri par cote en attendant, puis, dès
  // que le site recharge le marché (passage par Acheter), tri par prix grâce à la réponse lue au passage
  await boot('&sansui');
  await page.click('.mkx-chips [data-yuro-tri]');
  await page.waitForTimeout(800);
  out.sansDonnees = await tri();
  out.sansDonneesMessage = await page.evaluate(() => [...document.querySelectorAll('body > div > div')].some((d) => /pas encore la liste des annonces/.test(d.textContent)));
  await page.click('[data-market-tab="buy"]');
  await page.waitForTimeout(300);
  await page.click('[data-market-tab="sell"]');
  await page.waitForTimeout(300);
  await page.click('.mkx-chips [data-yuro-tri]'); // l'arrivée sur Vendre l'a éteint : on le rallume
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-market-more]')).display === 'none', null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(600);
  out.parReponse = await tri();
  out.clics = await page.evaluate(() => ({ ...window.__clics }));
  out.errors = errors;
  const ok = out.eteinte.puce.texte === '双Doublons' && !out.eteinte.puce.active && out.eteinte.puce.apresSite && out.eteinte.visibles === 24 && out.eteinte.clics.plus === 0
    && out.allumee.puce.active && out.allumee.puce.texte === '双Doublons · 6' && JSON.stringify(out.allumee.visibles) === JSON.stringify(['Carte 1', 'Carte 30', 'Carte 45', 'Carte 59', 'Carte 150', 'Carte 299']) && out.allumee.clics.plus === 12
    && out.allumee.dureeMs < 1000 && out.allumee.memeBouton && out.allumee.sansAnimation && out.allumee.imagesSansPuce === 0
    && out.rarete.nbPuces === 1 && out.rarete.puce.active && out.rarete.puce.apresSite && JSON.stringify(out.rarete.visibles) === JSON.stringify(['Carte 1', 'Carte 45', 'Carte 59', 'Carte 299'])
    && out.achat.puces === 0 && out.achat.plusAchat === 0 && !out.achat.filtre
    && !out.retourVente.puce.active && out.retourVente.visibles === 24
    && !out.rechargee.active && out.rechargee.visibles === 24 && !out.rechargee.memo
    && out.triEteint.puce === '値Prix en ligne' && !out.triEteint.active && out.triEteint.apresDoublons && out.triEteint.etiquettes.c0 === 'absente'
    && out.triAllume.active && out.triAllume.puce === '値Prix en ligne ↓' && out.triAllume.nb === 300
    && JSON.stringify(out.triAllume.ordre) === JSON.stringify(['Carte 40', 'Carte 5', 'Carte 150', 'Carte 2', 'Carte 0', 'Carte 1'])
    && /^en ligne 15\D000$/.test(out.triAllume.etiquettes.c40) && /^en ligne 9\D000 · 2 annonces$/.test(out.triAllume.etiquettes.c5)
    && ['c0', 'c7', 'c9', 'c1'].every((k) => out.triAllume.etiquettes[k] === 'aucune annonce')
    && JSON.stringify(out.triDoublons) === JSON.stringify(['Carte 150', 'Carte 1', 'Carte 30', 'Carte 45', 'Carte 59', 'Carte 299'])
    && out.triCoupe === 0
    && out.sansDonnees.puce === '値Prix en ligne ↓ (cote)' && out.sansDonneesMessage && out.sansDonnees.etiquettes.c0 === 'en ligne : ?'
    && JSON.stringify(out.parReponse.ordre) === JSON.stringify(['Carte 40', 'Carte 5', 'Carte 150', 'Carte 2', 'Carte 0', 'Carte 1'])
    && out.clics.carte === 0 && out.clics.publier === 0
    && errors.length === 0;
  console.log(JSON.stringify(out, null, 1));
  console.log(ok ? 'PASS' : 'FAIL');
  await browser.close();
  process.exit(ok ? 0 : 1);
})();
