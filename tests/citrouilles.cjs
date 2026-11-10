// Boutique Halloween : « Citrouilles auto » (éteint par défaut, jamais mémorisé) enchaîne Ouvrir ×N → citrouille →
// « Tout passer » → révélation de la carte mystère (le site n'active « Ouvrir encore » qu'après) → lecture des rares
// (pages tournées si besoin) → « Ouvrir encore ×N » ; patiente si le bouton n'est désactivé qu'un instant, s'arrête
// s'il le reste ; journal des cartes UR/LR/EX/TRS mémorisé, alimenté aussi lors d'une ouverture manuelle ; ne touche
// jamais quantité, « Voir ma collection », « Revenir à l'onglet » ni le dialogue des boosters classiques.
const { chromium } = require('playwright');
const fs = require('fs');
const script = fs.readFileSync(process.argv[2], 'utf8');
const PAGE = `<!doctype html><html><body><main>
<section class="hw26-checkout">
 <div class="batch-presets boutique-quantity"><button type="button" data-hw26-qty="1">×1</button><button type="button" data-hw26-qty="5">×5</button><button type="button" data-hw26-qty="10" aria-pressed="true">×10</button></div>
 <button type="button" class="boutique-open-free hw26-open-main" data-hw26-open="pumpkin" data-hw26-count="10"><strong>Ouvrir ×10</strong><span>1 000 bonbons</span></button>
 <p class="boutique-availability">Tu peux ouvrir jusqu’à 10 citrouilles d’un coup.</p>
</section>
<dialog id="packDialog" style="position:static">
 <div id="stageTear"><button id="tearPack" class="blue-booster-pack pack-to-open hw26-pack">OUVRE !</button></div>
 <div class="pack-actions"><button id="revealAll" hidden disabled>Toutes révélées ✓</button><button id="keepCards">Voir ma collection →</button><button type="button" id="openAnotherPack">🎃 Ouvrir encore ×10</button><button id="returnBoosterTab">Revenir à l’onglet</button></div>
 <div class="pack-result-heading"><h2 id="packTitle"></h2><p id="revealHint"></p></div>
 <div id="packCards" class="pack-cards"></div>
 <nav id="packSummaryPager"><button class="btn" data-summary-page="-1" disabled>← Précédentes</button><span></span><button class="btn" data-summary-page="1">Suivantes →</button></nav>
 <button id="skipPackReview" class="btn ghost small">» Tout passer</button>
</dialog>
</main><script>
// Simulation de la boutique : mêmes identifiants et classes que le vrai site (enregistrements du 10/11/2026)
const $ = (s) => document.querySelector(s);
const front = (code, nom, numero, serie, tag) => '<span class="reveal-front">'
 + '<span class="summary-card-top"><strong>' + nom + '</strong><span>' + code + '</span></span>'
 + '<span class="summary-card-art"><span>' + numero + '</span></span>'
 + '<span class="summary-card-series">' + serie + '</span></span>'
 + '<span class="summary-copy-tag">' + tag + '</span>';
const tuile = (code, nom, numero, serie, tag) => '<button class="reveal-card pack-summary-tile revealed">' + front(code, nom, numero, serie, tag) + '</button>';
// la meilleure carte : face cachée, aucune donnée dedans tant qu'elle n'est pas révélée (comme le vrai site)
const cachee = '<button class="reveal-card pack-summary-tile pack-summary-best big-pull-hidden"><b>À RÉVÉLER</b></button>';
const remplissage = (n) => Array.from({ length: n }, (_, i) => tuile('C', 'Figurant ' + i, '#9' + i, 'Série ' + i, 'Doublon')).join('');
// deux ouvertures, chacune avec une carte mystère à révéler avant que le site n'active « Ouvrir encore » :
// la 1re le réactive 400 ms après la révélation (désactivation passagère : la boucle doit patienter, pas s'arrêter) ;
// la 2e annonce UR + TRS, la TRS est en page 2, et son « Ouvrir encore » reste désactivé (plus de bonbons) → arrêt.
window.__tirages = [
 { chips: '<i><b>UR</b>×1</i><i><b>SR</b>×2</i>', front: front('UR', 'Hidan', '#889', 'Naruto', 'Doublon'), pages: [cachee + remplissage(9)], encoreApres: 400 },
 { chips: '<i><b>UR</b>×1</i><i><b>TRS</b>×1</i>', front: front('UR', 'Madara', '#100', 'Naruto', 'Nouvelle'), pages: [cachee + remplissage(9), tuile('TRS', 'Goku', '#007', 'Dragon Ball', 'Nouvelle') + remplissage(9)], encoreApres: -1 }
];
window.__clics = { ouvre: 0, tear: 0, skip: 0, revele: 0, pages: 0, encore: 0, qty: 0, keep: 0, retour: 0 };
let courant = -1, pageCourante = 0;
const montre = (el, oui) => { el.style.display = oui ? '' : 'none'; };
function etape(nom) {
 montre($('#stageTear'), nom === 'citrouille');
 montre($('.pack-actions'), nom === 'recap');
 montre($('.pack-result-heading'), nom === 'recap');
 montre($('#packCards'), nom === 'recap');
 montre($('#packSummaryPager'), nom === 'recap');
 montre($('#skipPackReview'), nom === 'defile');
 if (nom === 'ferme') $('#packDialog').removeAttribute('open');
 else $('#packDialog').setAttribute('open', '');
}
window.__recap = (indice) => {
 courant = indice; pageCourante = 0;
 const t = window.__tirages[indice];
 $('#revealHint').innerHTML = '10 citrouilles · 50 cartes<span class="qol-pack-recap">' + t.chips + '</span>';
 // comme le vrai site : « Ouvrir encore » reste désactivé tant que la carte mystère n'est pas révélée
 $('#openAnotherPack').disabled = t.pages[0].includes('big-pull-hidden');
 window.__page(0);
 etape('recap');
};
// révélation de la carte mystère : la donnée de la carte n'apparaît qu'à ce moment-là, puis le site réactive
// (ou non) « Ouvrir encore » après un délai
$('#packCards').addEventListener('click', (e) => {
 const mystere = e.target.closest('.big-pull-hidden');
 if (!mystere || mystere.classList.contains('revealed')) return;
 window.__clics.revele++;
 mystere.classList.add('revealed');
 mystere.insertAdjacentHTML('beforeend', window.__tirages[courant].front);
 const apres = window.__tirages[courant].encoreApres;
 if (apres >= 0) setTimeout(() => { $('#openAnotherPack').disabled = false; }, apres);
});
window.__page = (p) => {
 pageCourante = p;
 const t = window.__tirages[courant];
 $('#packCards').innerHTML = t.pages[p];
 $('#packSummaryPager [data-summary-page="1"]').disabled = p >= t.pages.length - 1;
};
let aOuvrir = 0;
$('.hw26-open-main').addEventListener('click', () => { window.__clics.ouvre++; aOuvrir = window.__clics.ouvre + window.__clics.encore - 1; etape('citrouille'); });
$('#tearPack').addEventListener('click', () => { window.__clics.tear++; etape('defile'); });
$('#skipPackReview').addEventListener('click', () => { window.__clics.skip++; window.__recap(aOuvrir); });
$('#packSummaryPager [data-summary-page="1"]').addEventListener('click', (e) => { if (!e.currentTarget.disabled) { window.__clics.pages++; window.__page(pageCourante + 1); } });
$('#openAnotherPack').addEventListener('click', () => { window.__clics.encore++; aOuvrir = window.__clics.ouvre + window.__clics.encore - 1; etape('citrouille'); });
for (const [cle, sel] of [['qty', '[data-hw26-qty]'], ['keep', '#keepCards'], ['retour', '#returnBoosterTab']]) {
 for (const el of document.querySelectorAll(sel)) el.addEventListener('click', () => { window.__clics[cle]++; });
}
etape('ferme');
</${'script'}></body></html>`;
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://yurocollection.fr/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: PAGE }));
  const boot = async () => {
    await page.goto(`https://yurocollection.fr/?t=${Date.now()}#hw26`);
    await page.addScriptTag({ content: script });
    await page.evaluate(() => { Object.assign(yuroPlus.reglages, { rapideMs: 150, reessaiMs: 500, patienceMs: 1500 }); });
    await page.waitForSelector('.hw26-checkout [data-yuro-auto="pk"]', { timeout: 3000 });
  };
  const out = {};
  // 1. monté dans la boutique, éteint par défaut : rien ne part tout seul
  await boot();
  out.monte = await page.evaluate(() => document.querySelector('[data-yuro-auto="pk"]').textContent);
  await page.waitForTimeout(800);
  out.eteint = await page.evaluate(() => ({ ...window.__clics }));
  // 2. allumé : la chaîne complète s'enchaîne, les rares sont notées (page 2 lue quand il en manque),
  // puis arrêt automatique quand « Ouvrir encore » est désactivé ; le mode éclair (animations raccourcies)
  // n'existe que pendant la séance
  await page.evaluate(() => {
    window.__eclairVu = false;
    setInterval(() => { if (document.getElementById('yuro-plus-eclair')) window.__eclairVu = true; }, 20);
  });
  await page.click('.hw26-checkout [data-yuro-auto="pk"]');
  await page.waitForFunction(() => yuroPlus.reglages.citrouilles === false, null, { timeout: 20000 });
  out.eclair = await page.evaluate(() => ({ pendant: window.__eclairVu, apres: Boolean(document.getElementById('yuro-plus-eclair')) }));
  // à l'arrêt, le panneau des rares s'est ouvert tout seul avec la séance dedans
  out.panneauAuto = await page.evaluate(() => {
    const p = document.getElementById('yuro-plus-rares');
    return p ? { goku: /Goku/.test(p.textContent), hidan: /Hidan/.test(p.textContent), compte: /3 carte/.test(p.textContent) } : 'absent';
  });
  out.boutonRares = await page.evaluate(() => document.querySelector('.hw26-checkout [data-yuro-rares]')?.textContent ?? 'absent');
  out.clics = await page.evaluate(() => ({ ...window.__clics }));
  out.compteurs = await page.evaluate(() => ({ ...yuroPlus.citrouilles }));
  out.journal = await page.evaluate(() => yuroPlus.cartesRares().map((c) => `${c.rarete} ${c.nom} ${c.numero} ${c.serie} ${c.etiquette}`));
  out.toggleDialogue = await page.evaluate(() => document.querySelectorAll('.pack-actions [data-yuro-auto="pk"]').length === 1 && document.querySelector('.pack-actions [data-yuro-auto="pk"] em').textContent);
  out.badge = await page.evaluate(() => document.querySelector('[data-yuro-citrouilles]')?.textContent ?? 'absent');
  // 3. jamais mémorisé : au rechargement le bouton est éteint, aucune trace dans les réglages ; le journal, lui, reste
  await page.evaluate(() => yuroPlus.citrouillesAuto(true));
  await boot();
  out.pasMemorise = await page.evaluate(() => ({
    off: yuroPlus.reglages.citrouilles === false,
    reglage: (localStorage.getItem('yuro-plus:settings') ?? '').includes('citrouille'),
    journal: yuroPlus.cartesRares().length
  }));
  // 4. ouverture manuelle (bouton éteint) : la rare est notée quand même, mais aucun clic du script
  await page.evaluate(() => { window.__tirages[0] = { chips: '<i><b>LR</b>×1</i>', front: '', pages: [tuile('LR', 'Alucard', '#666', 'Hellsing', 'Nouvelle') + remplissage(9)], encoreApres: -1 }; window.__recap(0); });
  await page.waitForFunction(() => yuroPlus.citrouilles.rares === 1, null, { timeout: 3000 });
  await page.waitForTimeout(700);
  out.manuel = await page.evaluate(() => ({ clics: { ...window.__clics }, dernier: yuroPlus.cartesRares().at(-1).nom, journal: yuroPlus.cartesRares().length }));
  // 5. le bouton « ✦ Rares » ouvre le panneau (toute l'histoire, pas que la séance), « Vider le journal » l'efface,
  // et cartesRares() relit alors le message « aucune carte… »
  out.panneau = await page.evaluate(() => {
    document.querySelector('.hw26-checkout [data-yuro-rares]').click();
    const p = document.getElementById('yuro-plus-rares');
    const avant = { bouton: document.querySelector('.hw26-checkout [data-yuro-rares]').textContent, alucard: /Alucard/.test(p.textContent), hidan: /Hidan/.test(p.textContent) };
    [...p.querySelectorAll('button')].find((b) => /Vider/.test(b.textContent)).click();
    const apres = { vide: /Aucune carte rare/.test(document.getElementById('yuro-plus-rares').textContent) };
    return { avant, apres };
  });
  out.vider = await page.evaluate(() => yuroPlus.cartesRares());
  out.errors = errors;
  const ok = out.monte === '🎃 Citrouilles autoOFF'
    && Object.values(out.eteint).every((n) => n === 0)
    && out.clics.ouvre === 1 && out.clics.tear === 2 && out.clics.skip === 2 && out.clics.revele === 2 && out.clics.pages === 1 && out.clics.encore === 1
    && out.clics.qty === 0 && out.clics.keep === 0 && out.clics.retour === 0
    && out.compteurs.ouvertes === 20 && out.compteurs.cartes === 100 && out.compteurs.rares === 3
    && JSON.stringify(out.journal) === JSON.stringify(['UR Hidan #889 Naruto Doublon', 'UR Madara #100 Naruto Nouvelle', 'TRS Goku #007 Dragon Ball Nouvelle'])
    && out.toggleDialogue === 'OFF' && /20 citrouille/.test(out.badge) && /3 rare/.test(out.badge)
    && out.eclair.pendant && !out.eclair.apres
    && out.panneauAuto.goku && out.panneauAuto.hidan && out.panneauAuto.compte
    && out.boutonRares === '✦ Rares (3)'
    && out.pasMemorise.off && !out.pasMemorise.reglage && out.pasMemorise.journal === 3
    && out.manuel.clics.encore === 0 && out.manuel.clics.ouvre === 0 && out.manuel.dernier === 'Alucard' && out.manuel.journal === 4
    && out.panneau.avant.bouton === '✦ Rares (4)' && out.panneau.avant.alucard && out.panneau.avant.hidan && out.panneau.apres.vide
    && typeof out.vider === 'string'
    && errors.length === 0;
  console.log(JSON.stringify(out, null, 1));
  console.log(ok ? 'PASS' : 'FAIL');
  await browser.close();
  process.exit(ok ? 0 : 1);
})();
