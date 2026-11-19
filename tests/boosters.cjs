// Boutique de boosters (depuis le 18/11/2026) : « Ouverture auto » (éteinte par défaut, jamais mémorisée) ouvre les
// boosters GRATUITS puis DE QUÊTE par lots de 10 — choisit ×10, reprend la puce Gratuit si le joueur a pris Ki,
// « Ouvrir » → déchirer → « Tout passer » → lecture des rares (page suivante si besoin) → « Ouvrir encore des
// boosters » — et s'arrête quand le bouton ne propose plus que du ki. JAMAIS de clic sur « Ouvrir » payé en ki, sur
// une jaquette (« Ouvrir ici ») ni sur « Rouvrir ». Notre bouton vit à côté de la section qui se redessine. Mode éclair
// pendant la séance seulement ; journal UR/LR/EX/TRS mémorisé (aussi en ouverture manuelle), panneau « ✦ Rares »
// ouvert en fin de séance et vidable. Le récapitulatif simulé montre d'abord les cartes de l'ouverture précédente
// (comme le vrai site) : aucune rare ne doit être notée deux fois ni manquée ; bilan détaillé par rareté. Le booster simulé ignore les clics pendant son animation d'arrivée (0,7 s) :
// il doit quand même être déchiré en moins de 1,5 s (la 0.11.2 attendait 5 s après un clic trop précoce).
const { chromium } = require('playwright');
const fs = require('fs');
const script = fs.readFileSync(process.argv[2], 'utf8');
const PAGE = `<!doctype html><html><body><main>
<section class="bv4" id="boosterShop" data-sel="multivers">
 <div class="bv4-rail"><button class="bv4-pack" data-pack="multivers">YURO Ouvrir ici Multivers</button><button class="bv4-pack" data-pack="eclipse">YURO Ouvrir ici Éclipse</button></div>
 <section id="boosterPurchase" class="bv4-act"></section>
</section>
<dialog id="packDialog" style="position:static">
 <div id="packStage"><button id="tearPack" class="blue-booster-pack pack-to-open">MULTIVERS</button></div>
 <button id="skipPackReview" class="btn ghost small">» Tout passer</button>
 <div class="pack-actions"><button id="revealAll" hidden disabled>Tout révéler ✦</button><button id="keepCards">Voir ma collection →</button><button type="button" id="openAnotherPack">Ouvrir encore des boosters ↗</button><button type="button" id="reopenSamePack" data-pay="free">Rouvrir · Multivers ×10</button><button id="returnBoosterTab">Revenir à l’onglet</button></div>
 <div class="pack-result-heading"><h2 id="packTitle">Multivers</h2><p id="revealHint"></p></div>
 <div id="packCards" class="pack-cards"></div>
 <nav id="packSummaryPager"><button class="btn" data-summary-page="-1" disabled>← Précédentes</button><span></span><button class="btn" data-summary-page="1">Suivantes →</button></nav>
</dialog>
</main><script>
// Simulation de la boutique : mêmes identifiants, classes et attributs que le vrai site (enregistrements du 18/11/2026)
const $ = (s) => document.querySelector(s);
window.__reserve = { free: 2, reward: 8 };
let lot = 1, choix = null, tirageNo = -1, pageNo = 0;
window.__clics = { ouvrir: 0, ki: 0, lot10: 0, puceFree: 0, puceKi: 0, jaquette: 0, rouvrir: 0, tear: 0, tearIgnore: 0, skip: 0, pages: 0, encore: 0, keep: 0, retour: 0 };
window.__dechireEn = [];
window.__achats = [];
const sourceAuto = () => choix ?? (window.__reserve.free ? 'free' : window.__reserve.reward ? 'reward' : 'ki');
// comme le vrai site : la section entière est redessinée (innerHTML) à chaque changement
function boutique() {
 const src = sourceAuto();
 const dispo = src === 'ki' ? lot : Math.min(lot, window.__reserve[src]);
 const puces = (window.__reserve.free ? '<button type="button" role="radio" class="bv4-chip" data-bv4-pay="free" aria-checked="' + (src === 'free') + '">Gratuit <b>' + window.__reserve.free + '</b></button>' : '')
  + (window.__reserve.reward ? '<button type="button" role="radio" class="bv4-chip" data-bv4-pay="reward" aria-checked="' + (src === 'reward') + '">Quêtes <b>' + window.__reserve.reward + '</b></button>' : '')
  + '<button type="button" role="radio" class="bv4-chip" data-bv4-pay="ki" aria-checked="' + (src === 'ki') + '">Ki</button>';
 $('#boosterPurchase').innerHTML = '<h2 id="purchaseTitle">Ouvrir Multivers</h2><div class="batch-presets bv4-seg">'
  + [1, 5, 10].map((n) => '<button type="button" data-batch-count="' + n + '" aria-pressed="' + (n === lot) + '">×' + n + '</button>').join('') + '</div>'
  + '<button type="button" class="bv4-open is-' + src + '" id="bv4Open" ' + ({ free: 'data-free-booster', reward: 'data-quest-booster', ki: 'data-buy-booster' })[src] + ' data-source="' + src + '"' + (src !== 'ki' && !window.__reserve[src] ? ' disabled' : '') + '><span class="bv4-open-main">Ouvrir' + (src === 'ki' ? ' ×' + lot : '') + '</span> <span class="bv4-open-pay">' + (src === 'free' ? 'Gratuit' : src === 'reward' ? 'Récompense de quête' : lot * 100 + ' ki') + '</span></button>'
  + '<div class="bv4-pay"><span>Payer avec</span>' + puces + '</div><p class="bv4-note">' + (src !== 'ki' && dispo < lot ? 'Lot ajusté à ta réserve : ' + dispo + ' booster.' : '') + '</p>';
}
const front = (code, nom, numero, serie, tag) => '<span class="reveal-front"><span class="summary-card-top"><strong>' + nom + '</strong><span>' + code + '</span></span><span class="summary-card-art"><span>' + numero + '</span></span><span class="summary-card-series">' + serie + '</span></span><span class="summary-copy-tag">' + tag + '</span>';
const tuile = (code, nom, numero, serie, tag) => '<button class="reveal-card pack-summary-tile revealed">' + front(code, nom, numero, serie, tag) + '</button>';
const remplissage = (n) => Array.from({ length: n }, (_, i) => tuile('C', 'Figurant ' + i, '#9' + i, 'Série ' + i, 'Doublon')).join('');
// tirage 0 (2 gratuits) : une UR en page 1 ; tirage 1 (8 de quête) : UR + TRS annoncées, la TRS en page 2
window.__tirages = [
 { chips: '<i><b>UR</b>×1</i><i><b>C</b>×9</i>', pages: [tuile('UR', 'Hidan', '#889', 'Naruto', 'Doublon') + remplissage(9)] },
 { chips: '<i><b>UR</b>×1</i><i><b>TRS</b>×1</i><i><b>C</b>×38</i>', pages: [tuile('UR', 'Madara', '#100', 'Naruto', 'Nouvelle') + remplissage(9), tuile('TRS', 'Goku', '#007', 'Dragon Ball', 'Nouvelle') + remplissage(9)] }
];
const montre = (el, oui) => { el.style.display = oui ? '' : 'none'; };
function etape(nom) {
 montre($('#packStage'), nom === 'dechirer');
 montre($('#skipPackReview'), nom === 'defile');
 for (const s of ['.pack-actions', '.pack-result-heading', '#packCards', '#packSummaryPager']) montre($(s), nom === 'recap');
 if (nom === 'ferme') $('#packDialog').removeAttribute('open'); else $('#packDialog').setAttribute('open', '');
}
let enCours = 0;
// comme le vrai site (enregistrement du 18/11) : le récapitulatif et « Ouvrir encore » s'affichent d'abord avec les
// cartes de l'ouverture PRÉCÉDENTE, les nouvelles n'arrivent qu'un peu après (ici 150 ms)
window.__recap = (indice, nb) => {
 etape('recap');
 setTimeout(() => {
  tirageNo = indice; pageNo = 0;
  const t = window.__tirages[indice];
  $('#revealHint').innerHTML = nb + ' booster' + (nb > 1 ? 's' : '') + ' · ' + nb * 5 + ' cartes<span class="qol-pack-recap">' + t.chips + '</span>';
  window.__page(0);
 }, 150);
};
window.__page = (p) => { pageNo = p; $('#packCards').innerHTML = window.__tirages[tirageNo].pages[p]; $('#packSummaryPager [data-summary-page="1"]').disabled = p >= window.__tirages[tirageNo].pages.length - 1; };
document.addEventListener('click', (e) => {
 const t = e.target;
 const lotBtn = t.closest('[data-batch-count]');
 if (lotBtn) { lot = +lotBtn.dataset.batchCount; if (lot === 10) window.__clics.lot10++; boutique(); return; }
 const puce = t.closest('[data-bv4-pay]');
 if (puce) { choix = puce.dataset.bv4Pay; if (choix === 'ki') window.__clics.puceKi++; else window.__clics.puceFree++; boutique(); return; }
 if (t.closest('.bv4-pack')) { window.__clics.jaquette++; return; }
 if (t.closest('#bv4Open')) {
  window.__clics.ouvrir++;
  const src = sourceAuto();
  if (src === 'ki') { window.__clics.ki++; return; }
  const nb = Math.min(lot, window.__reserve[src]);
  // window.__basculeAuto === false : comme peut-être le vrai site, la source épuisée reste choisie (bouton grisé)
  window.__reserve[src] -= nb; choix = window.__basculeAuto === false ? src : null;
  window.__achats.push({ payment: src, quantity: nb });
  enCours = nb;
  etape('dechirer');
  window.__ouvertA = Date.now();
  return;
 }
 // comme le vrai site : le booster ignore les clics pendant son animation d'arrivée (~0,7 s)
 if (t.closest('#tearPack')) { if (Date.now() - window.__ouvertA < 700) { window.__clics.tearIgnore++; return; } window.__clics.tear++; window.__dechireEn.push(Date.now() - window.__ouvertA); etape('defile'); return; }
 if (t.closest('#skipPackReview')) { window.__clics.skip++; window.__recap(window.__achats.length - 1, enCours); return; }
 if (t.closest('#packSummaryPager [data-summary-page="1"]')) { if (!t.closest('button').disabled) { window.__clics.pages++; window.__page(pageNo + 1); } return; }
 if (t.closest('#openAnotherPack')) { window.__clics.encore++; etape('ferme'); boutique(); return; }
 if (t.closest('#reopenSamePack')) { window.__clics.rouvrir++; return; }
 if (t.closest('#keepCards')) window.__clics.keep++;
 if (t.closest('#returnBoosterTab')) window.__clics.retour++;
});
etape('ferme');
boutique();
</${'script'}></body></html>`;
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://yurocollection.fr/**', (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: PAGE }));
  const boot = async () => {
    await page.goto(`https://yurocollection.fr/?t=${Date.now()}#boosters`);
    await page.addScriptTag({ content: script });
    // délais réels du script (rien d'accéléré) : le test mesure aussi la vitesse de déchirage
    await page.waitForSelector('#yuro-plus-boosters [data-yuro-auto="pk"]', { timeout: 3000 });
  };
  const out = {};
  // 1. monté à côté de la section Ouvrir (pas dedans), éteint par défaut : rien ne part
  await boot();
  out.monte = await page.evaluate(() => ({ texte: document.querySelector('#yuro-plus-boosters [data-yuro-auto="pk"]').textContent, apresSection: document.getElementById('yuro-plus-boosters').previousElementSibling.id }));
  await page.waitForTimeout(800);
  out.eteint = await page.evaluate(() => ({ ...window.__clics }));
  // 2. le joueur a pris « Ki » : allumé, le script remet le paiement sur Gratuit, choisit ×10, ouvre les 2 gratuits
  // puis les 8 de quête, lit les rares (page 2 comprise), et s'arrête quand il ne reste que du ki
  await page.evaluate(() => document.querySelector('[data-bv4-pay="ki"]').click());
  await page.evaluate(() => { window.__eclairVu = false; setInterval(() => { if (document.getElementById('yuro-plus-eclair')) window.__eclairVu = true; }, 20); });
  await page.click('#yuro-plus-boosters [data-yuro-auto="pk"]');
  // (pas d'abandon si elle ne s'arrête pas : le compte des clics ci-dessous dit pourquoi, ki compris)
  await page.waitForFunction(() => yuroPlus.reglages.ouverture === false, null, { timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(800);
  out.seance = await page.evaluate(() => ({
    clics: { ...window.__clics },
    dechireEnMs: window.__dechireEn,
    achats: window.__achats,
    reserve: { ...window.__reserve },
    bilan: { ...yuroPlus.packs },
    journal: [].concat(yuroPlus.cartesRares()).filter((c) => c.nom).map((c) => `${c.rarete} ${c.nom} ${c.numero}`),
    toastFin: [...document.querySelectorAll('body > div > div')].some((d) => /plus de boosters gratuits ni de quête/.test(d.textContent) && /jamais en ki/.test(d.textContent)),
    panneau: Boolean(document.getElementById('yuro-plus-rares')) && /Goku/.test(document.getElementById('yuro-plus-rares').textContent),
    eclair: { pendant: window.__eclairVu, apres: Boolean(document.getElementById('yuro-plus-eclair')) },
    bilanAffiche: document.querySelector('#yuro-plus-boosters [data-yuro-bilan-packs]')?.textContent ?? 'absent',
    boutonRares: document.querySelector('#yuro-plus-boosters [data-yuro-rares]')?.textContent ?? 'absent'
  }));
  // 2 bis. le site ne passe PAS tout seul aux Quêtes : la source « Gratuit » épuisée reste choisie, bouton grisé,
  // puce Quêtes disponible. Le script doit choisir la puce Quêtes et ouvrir les 8, toujours sans ki
  await boot();
  await page.evaluate(() => { window.__basculeAuto = false; document.getElementById('yuro-plus-rares')?.remove(); yuroPlus.ouvertureAuto(true); });
  await page.waitForFunction(() => yuroPlus.reglages.ouverture === false, null, { timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(500);
  out.sansBascule = await page.evaluate(() => ({
    achats: window.__achats, ki: window.__clics.ki, puces: window.__clics.puceFree, jaquette: window.__clics.jaquette, rouvrir: window.__clics.rouvrir,
    diag: [...document.querySelectorAll('body > div > div')].map((d) => d.textContent).find((t) => /arrêtée/.test(t)) ?? 'aucun message'
  }));
  // 3. rallumé sans aucune réserve gratuite : il s'arrête aussitôt, sans cliquer « Ouvrir » (payé en ki)
  await page.evaluate(() => { document.getElementById('yuro-plus-rares')?.remove(); yuroPlus.ouvertureAuto(true); });
  await page.waitForFunction(() => yuroPlus.reglages.ouverture === false, null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(500);
  out.sansReserve = await page.evaluate(() => ({ eteint: !yuroPlus.reglages.ouverture, ki: window.__clics.ki, ouvrir: window.__clics.ouvrir }));
  // 4. jamais mémorisé ; le journal, lui, reste (3 rares de la séance + 3 de la séance « sans bascule »)
  await page.evaluate(() => yuroPlus.ouvertureAuto(true));
  await boot();
  out.pasMemorise = await page.evaluate(() => ({ off: yuroPlus.reglages.ouverture === false, reglage: /ouverture"/.test(localStorage.getItem('yuro-plus:settings') ?? ''), journal: yuroPlus.cartesRares().length }));
  // 5. ouverture manuelle (bouton éteint) : la rare est notée, aucun clic du script
  await page.evaluate(() => { window.__tirages[0] = { chips: '<i><b>LR</b>×1</i>', pages: ['<button class="reveal-card pack-summary-tile revealed"><span class="summary-card-top"><strong>Alucard</strong><span>LR</span></span><span class="summary-card-art"><span>#666</span></span><span class="summary-card-series">Hellsing</span></button>'] }; window.__achats.push({}); window.__recap(0, 1); });
  await page.waitForFunction(() => yuroPlus.packs.rares === 1, null, { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(700);
  out.manuel = await page.evaluate(() => ({ clics: Object.values(window.__clics).reduce((a, b) => a + b, 0), dernier: yuroPlus.cartesRares().at(-1)?.nom, journal: yuroPlus.cartesRares().length }));
  out.vider = await page.evaluate(() => { yuroPlus.cartesRares('vider'); return yuroPlus.cartesRares(); });
  out.errors = errors;
  const c = out.seance.clics;
  const dechire = out.seance.dechireEnMs;
  const ok = dechire.length === 2 && dechire.every((ms) => ms >= 700 && ms < 1500)
    && out.monte.texte === '🎁 Ouverture autoOFF' && out.monte.apresSection === 'boosterPurchase'
    && Object.values(out.eteint).every((n) => n === 0)
    && c.puceFree === 1 && c.lot10 === 1 && c.ouvrir === 2 && c.ki === 0 && c.jaquette === 0 && c.rouvrir === 0
    && c.tear === 2 && c.skip === 2 && c.pages === 1 && c.encore === 2 && c.keep === 0 && c.retour === 0
    && JSON.stringify(out.seance.achats) === JSON.stringify([{ payment: 'free', quantity: 2 }, { payment: 'reward', quantity: 8 }])
    && out.seance.reserve.free === 0 && out.seance.reserve.reward === 0
    && out.seance.bilan.ouvertes === 10 && out.seance.bilan.cartes === 50 && out.seance.bilan.rares === 3
    && JSON.stringify(out.seance.journal) === JSON.stringify(['UR Hidan #889', 'UR Madara #100', 'TRS Goku #007'])
    && out.seance.toastFin && out.seance.panneau && out.seance.eclair.pendant && !out.seance.eclair.apres
    && /10 booster/.test(out.seance.bilanAffiche) && /\(TRS 1 · UR 2 · C 47\)/.test(out.seance.bilanAffiche) && /3 rare/.test(out.seance.bilanAffiche) && out.seance.boutonRares === '✦ Rares (3)'
    && JSON.stringify(out.sansBascule.achats) === JSON.stringify([{ payment: 'free', quantity: 2 }, { payment: 'reward', quantity: 8 }])
    && out.sansBascule.ki === 0 && out.sansBascule.puces === 1 && out.sansBascule.jaquette === 0 && out.sansBascule.rouvrir === 0
    && /plus de boosters gratuits ni de quête.*\[bouton : reward, grisé · puces : ki\]/.test(out.sansBascule.diag)
    && out.sansReserve.eteint && out.sansReserve.ki === 0 && out.sansReserve.ouvrir === 2
    && out.pasMemorise.off && !out.pasMemorise.reglage && out.pasMemorise.journal === 6
    && out.manuel.clics === 0 && out.manuel.dernier === 'Alucard' && out.manuel.journal === 7
    && typeof out.vider === 'string'
    && errors.length === 0;
  console.log(JSON.stringify(out, null, 1));
  console.log(ok ? 'PASS' : 'FAIL');
  await browser.close();
  process.exit(ok ? 0 : 1);
})();
