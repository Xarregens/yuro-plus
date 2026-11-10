// Relance du mode farm : par défaut « Recommencer » est cliqué dès la fin du combat (relance rapide, sans message) ;
// clic resté sans effet → nouvel essai puis arrêt après essaisMax ; relanceRapide(false) → seulement le secours après
// attenteMs avec message ; rien si toggle OFF, écran parti tout seul, ou relance coupée ; réglages mémorisés.
const { chromium } = require('playwright');
const fs = require('fs');
const script = fs.readFileSync(process.argv[2], 'utf8');
const pageHtml = `<!doctype html><html><body><main>
<header><button type="button" class="btn ghost small combat-auto-btn is-on" data-combat-auto="replay" aria-pressed="true">⟳ Replay auto<em>ON</em></button></header>
<section class="story-end-screen farm-end won" style="min-height:120px"><div class="story-result-buttons">
<button type="button" class="btn primary" data-farm-start="">↻ Recommencer</button>
<button type="button" class="btn ghost" data-story-map="">Retour à la salle</button>
</div></section>
</main></body></html>`;
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://yurocollection.fr/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: pageHtml }));
  const boot = async () => {
    await page.goto(`https://yurocollection.fr/?t=${Date.now()}#combat`);
    await page.addScriptTag({ content: script });
    // délais courts pour le test
    await page.evaluate(() => { Object.assign(yuroPlus.reglages, { rapideMs: 200, attenteMs: 1000, reessaiMs: 400, verifieMs: 50 }); window.__clics = 0; document.querySelector('[data-farm-start]').addEventListener('click', () => { window.__clics++; }); });
  };
  const toasts = () => page.evaluate(() => [...document.querySelectorAll('div')].map((d) => d.textContent).filter((t) => /Yuro Plus/.test(t)));
  const out = {};
  // 1. relance rapide (défaut) : clic dès ~200 ms, sans message ; écran toujours là → essais 2 et 3 avec message, puis arrêt
  await boot();
  await page.waitForFunction(() => window.__clics > 0, null, { timeout: 3000 }).catch(() => {});
  out.rapide = await page.evaluate(() => ({ clics: window.__clics, compteur: yuroPlus.relances }));
  out.toastApresPremier = (await toasts()).length;
  await page.waitForTimeout(1800);
  out.abandon = { clics: await page.evaluate(() => window.__clics), toasts: await toasts() };
  // 2. écran retiré au premier clic (relance qui marche) : un seul clic, pas de message, compteur 1
  await boot();
  await page.evaluate(() => document.querySelector('[data-farm-start]').addEventListener('click', () => document.querySelector('.story-end-screen').remove()));
  await page.waitForFunction(() => window.__clics > 0, null, { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(1200);
  out.marche = { clics: await page.evaluate(() => window.__clics), toasts: (await toasts()).length };
  // 3. relance rapide coupée : rien avant attenteMs, puis clic avec message ; réglage mémorisé au rechargement
  await boot();
  out.rapideCoupeMsg = await page.evaluate(() => yuroPlus.relanceRapide(false));
  await page.waitForTimeout(600);
  out.secoursAvant = await page.evaluate(() => window.__clics);
  await page.waitForFunction(() => window.__clics > 0, null, { timeout: 3000 }).catch(() => {});
  out.secours = { clics: await page.evaluate(() => window.__clics), toast: (await toasts()).some((t) => /resté bloqué/.test(t)) };
  await boot();
  out.rapideApresRechargement = await page.evaluate(() => yuroPlus.reglages.rapide);
  await page.evaluate(() => yuroPlus.relanceRapide(true));
  // 4. toggle OFF : aucun clic
  await boot();
  await page.evaluate(() => document.querySelector('[data-combat-auto]').classList.remove('is-on'));
  await page.waitForTimeout(800);
  out.toggleOff = await page.evaluate(() => window.__clics);
  // 5. relance coupée entièrement, mémorisée
  await boot();
  await page.evaluate(() => yuroPlus.relanceAuto(false));
  await page.waitForTimeout(800);
  out.coupe = await page.evaluate(() => window.__clics);
  await boot();
  out.coupeApresRechargement = await page.evaluate(() => yuroPlus.reglages.active);
  await page.evaluate(() => yuroPlus.relanceAuto(true));
  out.errors = errors;
  const ok = out.rapide.clics === 1 && out.rapide.compteur === 1 && out.toastApresPremier === 0
    && out.abandon.clics === 3 && out.abandon.toasts.some((t) => /essai 2/.test(t)) && out.abandon.toasts.some((t) => /arrête d’insister/.test(t))
    && out.marche.clics === 1 && out.marche.toasts === 0
    && /coupée/.test(out.rapideCoupeMsg) && out.secoursAvant === 0 && out.secours.clics >= 1 && out.secours.toast && out.rapideApresRechargement === false
    && out.toggleOff === 0 && out.coupe === 0 && out.coupeApresRechargement === false
    && errors.length === 0;
  console.log(JSON.stringify(out, null, 1));
  console.log(ok ? 'PASS' : 'FAIL');
  await browser.close();
  process.exit(ok ? 0 : 1);
})();
