// Boîte noire et garde-fous de l'arrière-plan : une page figée (calcul sans fin pendant un rejeu onglet caché) est
// repérée par le worker, qui note le rappel en cours et ses derniers états en IndexedDB, puis l'heure de reprise ;
// le rapport donne aussi la suite des derniers rappels et le code du rappel qui a bloqué plus d'une seconde ; blocage
// au RETOUR au premier plan, hors de notre rejeu (cas réel du 18/11) : repère du retour daté, fonction nommée par la
// mesure du navigateur (long animation frame) ;
// yuroDiag.boiteNoire() télécharge le rapport ; message au chargement suivant (une seule fois) ; aucune fausse alerte
// sur une page normale ; frein anti ping-pong quand le site retire nos boutons aussitôt ajoutés.
const { chromium } = require('playwright');
const fs = require('fs');
const script = fs.readFileSync(process.argv[2], 'utf8');
// le « code du site » vit dans un vrai fichier, comme sur yurocollection.fr : le navigateur peut alors en donner
// l'adresse et la position, et le script y relire le passage en cause
const JEU_JS = `window.figeAuRetour = function figeAuRetour() {
  // boucle de rattrapage du site (simulée)
  const fin = Date.now() + 10000;
  while (Date.now() < fin) {}
};`;
const HTML = `<!doctype html><html><head><script src="/jeu.js"></script></head><body><main><p>Jeu</p>
<header><div><span class="eyebrow">HALLOWEEN · LE COMTE DE MINUIT</span></div></header></main></body></html>`;
const toasts = (page) => page.evaluate(() => [...document.querySelectorAll('body > div > div')].map((d) => d.textContent));
(async () => {
  const browser = await chromium.launch();
  const out = {};
  const errors = [];
  const nouvellePage = async () => {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('https://yurocollection.fr/**', (route) => new URL(route.request().url()).pathname === '/jeu.js'
      ? route.fulfill({ status: 200, contentType: 'text/javascript', body: JEU_JS })
      : route.fulfill({ status: 200, contentType: 'text/html', body: HTML }));
    return page;
  };
  const demarre = async (page, cache) => {
    await page.goto(`https://yurocollection.fr/?t=${Date.now()}#combat`);
    if (cache) {
      await page.evaluate(() => {
        window.__cache = true;
        Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get: () => window.__cache });
        Object.defineProperty(Document.prototype, 'visibilityState', { configurable: true, get: () => window.__cache ? 'hidden' : 'visible' });
      });
    }
    await page.addScriptTag({ content: script });
  };

  // 1. page normale pendant 11 s : aucune fausse alerte
  const calme = await nouvellePage();
  await demarre(calme, true);
  await calme.waitForTimeout(11000);
  await calme.evaluate(() => yuroDiag.boiteNoire());
  await calme.waitForTimeout(500);
  out.fausseAlerte = (await toasts(calme)).find((t) => /boîte noire/.test(t)) ?? 'aucun message';
  await calme.close();

  // 2. onglet caché, une minuterie du site fige la page 11 s pendant son rejeu
  const page = await nouvellePage();
  await demarre(page, true);
  await page.waitForTimeout(2500); // quelques états envoyés au worker
  await page.evaluate(() => { setTimeout(function figeLaPage() { const fin = Date.now() + 11000; while (Date.now() < fin) {} }, 100); });
  await page.waitForTimeout(14000);
  const [fichier] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => yuroDiag.boiteNoire())]);
  const rapport = JSON.parse(fs.readFileSync(await fichier.path(), 'utf8'));
  out.rapport = {
    nom: fichier.suggestedFilename(),
    rappel: rapport.rappelEnCours,
    figee: Boolean(rapport.figeeVueLe),
    reprise: Boolean(rapport.repriseLe),
    etats: rapport.journal.length,
    sequence: (rapport.derniersRappels ?? []).at(-1),
    // le code de la fonction en cours est connu dès son lancement : même une fonction qui ne rendrait jamais la main
    codeEnCours: /while \(Date\.now\(\) < fin\)/.test(rapport.codeEnCours ?? ''),
    long: rapport.rappelsLongs?.[0] && { nom: rapport.rappelsLongs[0].nom, type: rapport.rappelsLongs[0].type, dureeMs: rapport.rappelsLongs[0].dureeMs, code: /while \(Date\.now\(\) < fin\)/.test(rapport.rappelsLongs[0].code) },
    dernierEtat: rapport.journal.at(-1) && { ongletCache: rapport.journal.at(-1).ongletCache, arrierePlan: rapport.journal.at(-1).arrierePlan, page: rapport.journal.at(-1).page }
  };
  // 2 bis. le cas réel du 18/11 : tout va bien onglet caché, mais au RETOUR au premier plan une fonction du site, hors
  // de notre rejeu, bloque la page 10 s. Le rapport doit dater le retour, et la mesure du navigateur doit nommer la
  // fonction (avec la taille de la page et le nombre d'animations dans les états)
  const retour = await nouvellePage();
  await demarre(retour, true);
  await retour.waitForTimeout(2500);
  const loaf = await retour.evaluate(() => (PerformanceObserver.supportedEntryTypes ?? []).includes('long-animation-frame'));
  await retour.evaluate(() => {
    window.__cache = false; // la fenêtre revient
    setTimeout(() => requestAnimationFrame(window.figeAuRetour), 600);
  });
  await retour.waitForTimeout(14000);
  const [fichierRetour] = await Promise.all([retour.waitForEvent('download'), retour.evaluate(() => yuroDiag.boiteNoire())]);
  const rapportRetour = JSON.parse(fs.readFileSync(await fichierRetour.path(), 'utf8'));
  const mesure = (rapportRetour.rappelsLongs ?? []).find((r) => /navigateur/.test(r.type));
  out.retour = {
    loaf,
    repere: (rapportRetour.derniersRappels ?? []).some((r) => r.nom === '— retour au premier plan —' && r.type === 'onglet'),
    reprise: Boolean(rapportRetour.repriseLe),
    mesure: mesure && { type: mesure.type, dureeMs: mesure.dureeMs, fonctions: mesure.scripts.map((x) => x.fonction), fichiers: mesure.scripts.map((x) => x.fichier), code: mesure.scripts.some((x) => /boucle de rattrapage du site/.test(x.code ?? '')) },
    etat: rapportRetour.journal.at(-1) && { ongletCache: rapportRetour.journal.at(-1).ongletCache, elements: rapportRetour.journal.at(-1).elements, animationsCss: rapportRetour.journal.at(-1).animationsCss }
  };
  await retour.close();

  // 2 ter. disjoncteur (cas réel du 18/11 12:45) : onglet caché, le jeu devient lent — trois fonctions du site bloquent
  // chacune plus d'une seconde. Au troisième blocage, l'arrière-plan se met en pause (le site revoit l'onglet caché)
  // et un message prévient ; deux blocages seulement ne suffisent pas
  const lent = await nouvellePage();
  await demarre(lent, true);
  await lent.waitForTimeout(800);
  const bloque = () => lent.evaluate(() => { setTimeout(function combatLent() { const fin = Date.now() + 1100; while (Date.now() < fin) {} }, 50); });
  await bloque(); await lent.waitForTimeout(1800);
  await bloque(); await lent.waitForTimeout(1800);
  out.disjoncteurAvant = await lent.evaluate(() => document.hidden);
  await bloque(); await lent.waitForTimeout(1800);
  out.disjoncteur = await lent.evaluate(() => ({
    hidden: document.hidden,
    message: [...document.querySelectorAll('body > div > div')].some((d) => /mis l’arrière-plan en pause/.test(d.textContent) && /combatLent/.test(d.textContent))
  }));
  out.relance = await lent.evaluate(() => { yuroPlus.arrierePlan(true); return document.hidden; });
  await lent.close();

  // 3. au chargement suivant, un message propose le rapport ; une seule fois
  await demarre(page, false);
  await page.waitForTimeout(800);
  out.annonce = (await toasts(page)).some((t) => /s’est figée/.test(t) && /reparti/.test(t));
  await demarre(page, false);
  await page.waitForTimeout(800);
  out.annonceUneFois = !(await toasts(page)).some((t) => /s’est figée/.test(t));
  await page.close();

  // 4. le site retire nos boutons dès qu'on les ajoute (son propre observateur) : sans frein, la page se figerait
  // dans un ping-pong sans fin ; avec, elle reste réactive et le nombre de recréations reste borné
  const pingPong = await nouvellePage();
  await pingPong.goto(`https://yurocollection.fr/?t=${Date.now()}#combat`);
  await pingPong.evaluate(() => {
    window.__retraits = 0;
    const header = document.querySelector('header');
    new MutationObserver(() => {
      for (const bouton of header.querySelectorAll('[data-yuro-auto]')) { window.__retraits++; (bouton.closest('.combat-auto-group') ?? bouton).remove(); }
    }).observe(header, { childList: true, subtree: true });
  });
  await pingPong.addScriptTag({ content: script });
  await pingPong.waitForTimeout(1500);
  out.pingPong = await Promise.race([
    pingPong.evaluate(() => ({ reactive: true, retraits: window.__retraits })),
    new Promise((resolve) => setTimeout(() => resolve({ reactive: false }), 5000))
  ]);
  out.errors = errors;
  const ok = out.fausseAlerte.includes('vide')
    && out.rapport.nom.startsWith('yuro-boite-noire-') && /figeLaPage/.test(out.rapport.rappel ?? '') && out.rapport.figee && out.rapport.reprise
    && out.rapport.sequence?.nom === 'figeLaPage' && out.rapport.sequence?.type === 'minuterie 100 ms'
    && out.rapport.codeEnCours
    && out.disjoncteurAvant === false && out.disjoncteur.hidden === true && out.disjoncteur.message && out.relance === false
    && out.rapport.long?.nom === 'figeLaPage' && out.rapport.long.type === 'minuterie 100 ms' && out.rapport.long.dureeMs >= 10000 && out.rapport.long.code
    && out.rapport.etats >= 1 && out.rapport.dernierEtat.ongletCache === true && out.rapport.dernierEtat.arrierePlan === true && out.rapport.dernierEtat.page === '#combat'
    && out.retour.repere && out.retour.reprise && out.retour.mesure?.dureeMs >= 9000
    && (out.retour.loaf ? out.retour.mesure.fichiers.some((f) => f.endsWith('/jeu.js')) && out.retour.mesure.code : true)
    && out.retour.etat.ongletCache === false && out.retour.etat.elements > 0 && typeof out.retour.etat.animationsCss === 'number'
    && out.annonce && out.annonceUneFois
    && out.pingPong.reactive && out.pingPong.retraits > 0 && out.pingPong.retraits < 200
    && errors.length === 0;
  console.log(JSON.stringify(out, null, 1));
  console.log(ok ? 'PASS' : 'FAIL');
  await browser.close();
  process.exit(ok ? 0 : 1);
})();
