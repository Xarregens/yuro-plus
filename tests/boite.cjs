// Boîte noire et garde-fous de l'arrière-plan : une page figée (calcul sans fin pendant un rejeu onglet caché) est
// repérée par le worker, qui note le rappel en cours et ses derniers états en IndexedDB, puis l'heure de reprise ;
// yuroDiag.boiteNoire() télécharge le rapport ; message au chargement suivant (une seule fois) ; aucune fausse alerte
// sur une page normale ; frein anti ping-pong quand le site retire nos boutons aussitôt ajoutés.
const { chromium } = require('playwright');
const fs = require('fs');
const script = fs.readFileSync(process.argv[2], 'utf8');
const HTML = `<!doctype html><html><body><main><p>Jeu</p>
<header><div><span class="eyebrow">HALLOWEEN · LE COMTE DE MINUIT</span></div></header></main></body></html>`;
const toasts = (page) => page.evaluate(() => [...document.querySelectorAll('body > div > div')].map((d) => d.textContent));
(async () => {
  const browser = await chromium.launch();
  const out = {};
  const errors = [];
  const nouvellePage = async () => {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('https://yurocollection.fr/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: HTML }));
    return page;
  };
  const demarre = async (page, cache) => {
    await page.goto(`https://yurocollection.fr/?t=${Date.now()}#combat`);
    if (cache) {
      await page.evaluate(() => {
        Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get: () => true });
        Object.defineProperty(Document.prototype, 'visibilityState', { configurable: true, get: () => 'hidden' });
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
    dernierEtat: rapport.journal.at(-1) && { ongletCache: rapport.journal.at(-1).ongletCache, arrierePlan: rapport.journal.at(-1).arrierePlan, page: rapport.journal.at(-1).page }
  };
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
    && out.rapport.etats >= 1 && out.rapport.dernierEtat.ongletCache === true && out.rapport.dernierEtat.arrierePlan === true && out.rapport.dernierEtat.page === '#combat'
    && out.annonce && out.annonceUneFois
    && out.pingPong.reactive && out.pingPong.retraits > 0 && out.pingPong.retraits < 200
    && errors.length === 0;
  console.log(JSON.stringify(out, null, 1));
  console.log(ok ? 'PASS' : 'FAIL');
  await browser.close();
  process.exit(ok ? 0 : 1);
})();
