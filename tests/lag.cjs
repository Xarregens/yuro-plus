// yuroDiag.lag(s) : mesure qui fait ramer la page — images en retard attribuées par origine (ici le site, dont un
// script ralentit volontairement des images), temps passé dans le code de Yuro Plus par partie, poids de la page ;
// résumé à l'écran et fichier yuro-diag-lag. Et le journal des requêtes ne décode plus les grosses réponses
// (sauvegardes) : texte brut coupé, mais toujours masqué (jeton, e-mail).
const { chromium } = require('playwright');
const fs = require('fs');
const script = fs.readFileSync(process.argv[2], 'utf8');
// le « code du site » vit dans un vrai fichier, comme sur yurocollection.fr, pour que le navigateur l'attribue
const JEU_JS = `window.rame = function rameAffichage(n) {
  let reste = n;
  requestAnimationFrame(function image() { const fin = performance.now() + 120; while (performance.now() < fin) {} if (--reste > 0) requestAnimationFrame(image); });
};`;
const GROSSE_SAUVEGARDE = JSON.stringify({ accountId: '42', token: 'SECRET123', contact: 'joueur@mail.fr', save: { qty: Array.from({ length: 30000 }, (_, i) => i % 3) } });
const HTML = `<!doctype html><html><head><script src="/jeu.js"></script></head><body><main><p>Jeu</p></main></body></html>`;
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://yurocollection.fr/**', (route) => {
    const chemin = new URL(route.request().url()).pathname;
    if (chemin === '/jeu.js') return route.fulfill({ status: 200, contentType: 'text/javascript', body: JEU_JS });
    if (chemin === '/api/save') return route.fulfill({ status: 200, contentType: 'application/json', body: GROSSE_SAUVEGARDE });
    return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: HTML });
  });
  await page.goto('https://yurocollection.fr/#combat');
  await page.addScriptTag({ content: script });
  const out = {};
  out.lance = await page.evaluate(() => yuroDiag.lag(3));
  await page.waitForTimeout(400);
  await page.evaluate(() => window.rame(6)); // 6 images de 120 ms, dues au site
  await page.evaluate(() => fetch('/api/save', { method: 'PUT', body: JSON.stringify({ save: { ki: 1 } }) }).then((r) => r.text()));
  const [fichier] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.waitForTimeout(10)]);
  const rapport = JSON.parse(fs.readFileSync(await fichier.path(), 'utf8'));
  out.rapport = {
    nom: fichier.suggestedFilename().replace(/-\d{4}-.*/, ''),
    images: rapport.imagesEnRetard,
    site: rapport.scriptsParOrigineMs['le site'] ?? 0,
    fonction: Object.keys(rapport.fonctionsLesPlusLourdesMs)[0] ?? '',
    chrono: rapport.yuroPlusChronoMs,
    parties: Object.keys(rapport.yuroPlusParPartie),
    page: rapport.pageFin
  };
  out.resume = await page.evaluate(() => [...document.querySelectorAll('body > div > div')].some((d) => /mesure du lag sur 3 s/.test(d.textContent) && /Code de Yuro Plus/.test(d.textContent)));
  // journal : la grosse sauvegarde est notée en texte coupé, masqué
  const [photo] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => yuroDiag.page())]);
  const diag = JSON.parse(fs.readFileSync(await photo.path(), 'utf8'));
  const entree = diag.api.find((a) => a.chemin === '/api/save');
  out.journal = entree && { type: typeof entree.reponse, longueur: String(entree.reponse).length, secret: /SECRET123|joueur@mail/.test(String(entree.reponse)), masque: /"token":"<masqué>"/.test(String(entree.reponse)) };
  out.errors = errors;
  const ok = out.rapport.nom === 'yuro-diag-lag' && out.rapport.images >= 4 && out.rapport.site >= 400 && /^le site — (rameAffichage|image) /.test(out.rapport.fonction)
    && typeof out.rapport.chrono === 'number' && out.rapport.parties.includes('battement 250 ms') && out.rapport.parties.includes('journal des requêtes')
    && out.rapport.page.elements > 0 && out.resume
    && out.journal?.type === 'string' && out.journal.longueur <= 20000 && !out.journal.secret && out.journal.masque
    && errors.length === 0;
  console.log(JSON.stringify(out, null, 1));
  console.log(ok ? 'PASS' : 'FAIL');
  await browser.close();
  process.exit(ok ? 0 : 1);
})();
