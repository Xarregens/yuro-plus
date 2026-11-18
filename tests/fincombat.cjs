// yuroDiag.finCombat() : attend le prochain écran de fin de combat — même si le site a renommé ses classes, il est
// reconnu à son bouton « Recommencer » —, le photographie (yuro-diag-fin) puis enregistre la relance jusqu'à sa
// disparition (yuro-diag-relance, avec les changements de page et la requête de relance). Un écran déjà affiché au
// lancement est ignoré : c'est le suivant qui compte. Ne clique rien.
const { chromium } = require('playwright');
const fs = require('fs');
const script = fs.readFileSync(process.argv[2], 'utf8');
const PAGE = `<!doctype html><html><body><main id="combat"><div class="arene">Combat en cours</div>
<div class="nv-fin" id="dejaLa"><button class="nv-btn">↻ Recommencer</button></div></main></body></html>`;
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://yurocollection.fr/**', (route) => new URL(route.request().url()).pathname.startsWith('/api/')
    ? route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
    : route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: PAGE }));
  await page.goto('https://yurocollection.fr/#combat');
  await page.addScriptTag({ content: script });
  const fichiers = [];
  page.on('download', async (d) => fichiers.push({ nom: d.suggestedFilename(), data: JSON.parse(fs.readFileSync(await d.path(), 'utf8')) }));
  const out = {};
  out.lance = await page.evaluate(() => yuroDiag.finCombat(1));
  // clics comptés hors liens de téléchargement des fichiers (créés par le script lui-même)
  await page.evaluate(() => { window.__clics = 0; document.addEventListener('click', (e) => { if (!e.target.download) window.__clics++; }, true); });
  // l'écran déjà là au lancement part (combat suivant), puis un NOUVEL écran de fin apparaît
  await page.waitForTimeout(500);
  await page.evaluate(() => document.getElementById('dejaLa').remove());
  await page.waitForTimeout(800);
  out.avantFin = fichiers.length;
  await page.evaluate(() => document.getElementById('combat').insertAdjacentHTML('beforeend', '<div class="nv-fin" id="fin"><b>VICTOIRE</b><button class="nv-btn">↻ Recommencer</button></div>'));
  await page.waitForTimeout(1000);
  // le Replay auto du site relance : l'écran part et la requête de combat suivant passe
  await page.evaluate(() => { document.getElementById('fin').remove(); return fetch('/api/save/story-start', { method: 'POST', body: JSON.stringify({ mode: 'farm', level: 3 }) }).then((r) => r.json()); });
  await page.waitForTimeout(3000);
  out.fichiers = fichiers.map((f) => f.nom.replace(/-\d{4}-.*/, ''));
  const fin = fichiers.find((f) => f.nom.startsWith('yuro-diag-fin-'));
  const relance = fichiers.find((f) => f.nom.startsWith('yuro-diag-relance-'));
  out.fin = fin && { ecran: /VICTOIRE/.test(fin.data.html) && /id="fin"/.test(fin.data.html) };
  out.relance = relance && {
    mutations: (relance.data.enregistrement ?? []).some((l) => l.genre === 'mutations'),
    requete: relance.data.api.some((a) => a.chemin === '/api/save/story-start' && a.requete?.mode === 'farm')
  };
  out.clics = await page.evaluate(() => window.__clics);
  out.errors = errors;
  const ok = out.avantFin === 0
    && JSON.stringify(out.fichiers) === JSON.stringify(['yuro-diag-fin', 'yuro-diag-relance'])
    && out.fin?.ecran && out.relance?.mutations && out.relance?.requete
    && out.clics === 0 && errors.length === 0;
  console.log(JSON.stringify(out, null, 1));
  console.log(ok ? 'PASS' : 'FAIL');
  await browser.close();
  process.exit(ok ? 0 : 1);
})();
