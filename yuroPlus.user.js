// ==UserScript==
// @name         Yuro Plus
// @namespace    https://github.com/xarregens/yuro-plus
// @version      0.9.1
// @description  Compagnon pour yurocollection.fr : relance immédiate du replay auto en farm, « Suivant auto » dans le Château de l'infini, « Citrouilles auto » et journal des cartes rares en Halloween ; commandes d'enregistrement yuroDiag.
// @author       Xarregens
// @homepageURL  https://github.com/xarregens/yuro-plus
// @supportURL   https://github.com/xarregens/yuro-plus/issues
// @updateURL    https://raw.githubusercontent.com/xarregens/yuro-plus/main/yuroPlus.user.js
// @downloadURL  https://raw.githubusercontent.com/xarregens/yuro-plus/main/yuroPlus.user.js
// @match        https://yurocollection.fr/*
// @match        https://www.yurocollection.fr/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  if (window.top !== window) return;
  const YURO_VERSION = "0.9.1";

  // ---- masquage : e-mails partout, clés sensibles dans les JSON ----
  const SECRET_KEY = /e-?mail|token|password|secret|session|auth|cookie/i;
  const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
  const mask = (text) => String(text).replace(EMAIL, "<email>");
  function maskJson(value) {
    if (typeof value === "string") return mask(value);
    if (Array.isArray(value)) return value.map(maskJson);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, SECRET_KEY.test(key) ? "<masqué>" : maskJson(inner)]));
    }
    return value;
  }
  const short = (text) => mask(text ?? "").replace(/\s+/g, " ").trim().slice(0, 48);
  function describeNode(node) {
    if (!node || node === window) return node === window ? "window" : String(node);
    if (node === document) return "document";
    if (node.nodeType === Node.TEXT_NODE) return `#text "${short(node.textContent)}"`;
    if (node.nodeType !== Node.ELEMENT_NODE) return node.nodeName;
    const classes = [...node.classList].slice(0, 5).join(".");
    return `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ""}${classes ? `.${classes}` : ""} "${short(node.textContent ?? "")}"`;
  }
  const stamp = () => new Date().toISOString().slice(11, 23);

  // ---- mémoire glissante des échanges avec le serveur, active en permanence :
  // le blocage arrive sans prévenir, ses requêtes doivent déjà être notées ----
  const LIMITS = { api: 200, body: 2e4, ws: 300, wsMsg: 2e3, lines: 5000, html: 2e5 };
  const apiLog = [];
  const wsLog = [];
  const push = (list, max, entry) => {
    list.push(entry);
    if (list.length > max) list.splice(0, list.length - max);
  };
  function recordApi(method, url, status, startedAt, requestBody, text) {
    let path;
    try {
      const parsed = new URL(url, location.origin);
      if (parsed.origin !== location.origin) return;
      path = parsed.pathname + parsed.search;
    } catch {
      return;
    }
    const capped = (value) => {
      if (value == null || typeof value !== "string") return null;
      try {
        return maskJson(JSON.parse(value));
      } catch {
        return mask(value).slice(0, LIMITS.body);
      }
    };
    push(apiLog, LIMITS.api, {
      t: stamp(),
      methode: method.toUpperCase(),
      chemin: mask(path).slice(0, 300),
      statut: status,
      dureeMs: Math.round(performance.now() - startedAt),
      requete: capped(requestBody),
      reponse: text == null ? null : JSON.stringify(capped(text)).length > LIMITS.body ? JSON.stringify(capped(text)).slice(0, LIMITS.body) : capped(text)
    });
  }
  const originalFetch = window.fetch;
  window.fetch = function(input, init) {
    const startedAt = performance.now();
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    const method = init?.method ?? input?.method ?? "GET";
    const requestBody = typeof init?.body === "string" ? init.body : null;
    const result = originalFetch.apply(this, arguments);
    result.then((response) => {
      response.clone().text().then((text) => recordApi(method, url, response.status, startedAt, requestBody, text)).catch(() => {});
    }).catch(() => recordApi(method, url, 0, startedAt, requestBody, null));
    return result;
  };
  const { open: xhrOpen, send: xhrSend } = XMLHttpRequest.prototype;
  XMLHttpRequest.prototype.open = function(method, url) {
    this.__yuroMethod = method;
    this.__yuroUrl = url;
    this.__yuroStart = performance.now();
    return xhrOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function(body) {
    this.addEventListener("load", () => {
      try {
        recordApi(this.__yuroMethod ?? "GET", this.__yuroUrl, this.status, this.__yuroStart ?? performance.now(), typeof body === "string" ? body : null, this.responseText);
      } catch {}
    });
    return xhrSend.apply(this, arguments);
  };
  // les jeux de combat passent souvent par une connexion continue : notée aussi
  const OriginalWebSocket = window.WebSocket;
  function TappedWebSocket(url, protocols) {
    const ws = protocols === void 0 ? new OriginalWebSocket(url) : new OriginalWebSocket(url, protocols);
    push(wsLog, LIMITS.ws, { t: stamp(), sens: "ouverture", texte: mask(String(url)).slice(0, 200) });
    const note = (sens, data) => push(wsLog, LIMITS.ws, { t: stamp(), sens, texte: typeof data === "string" ? mask(data).slice(0, LIMITS.wsMsg) : `<binaire ${data?.byteLength ?? data?.size ?? "?"} octets>` });
    ws.addEventListener("message", (event) => note("reçu", event.data));
    ws.addEventListener("close", (event) => push(wsLog, LIMITS.ws, { t: stamp(), sens: "fermeture", texte: `code ${event.code}` }));
    const send = ws.send.bind(ws);
    ws.send = (data) => {
      note("envoyé", data);
      return send(data);
    };
    return ws;
  }
  TappedWebSocket.prototype = OriginalWebSocket.prototype;
  for (const key of ["CONNECTING", "OPEN", "CLOSING", "CLOSED"]) TappedWebSocket[key] = OriginalWebSocket[key];
  window.WebSocket = TappedWebSocket;

  // ---- enregistrement à la demande : événements et changements de page pendant N secondes ----
  const EVENTS = ["pointerdown", "click", "keydown", "visibilitychange"];
  let recording = null;
  const line = (kind, detail) => recording && recording.lines.length < LIMITS.lines && recording.lines.push({ t: stamp(), genre: kind, ...detail });
  const onEvent = (event) => line("evenement", { type: event.type, cible: describeNode(event.target), vrai: event.isTrusted });
  const onMutations = (records) => line("mutations", {
    nombre: records.length,
    exemples: records.slice(0, 3).map((record) => `${record.type === "attributes" ? `attribut ${record.attributeName} de ` : ""}${describeNode(record.target)}`)
  });
  function stop() {
    if (!recording) return "aucun enregistrement en cours";
    for (const type of EVENTS) window.removeEventListener(type, onEvent, true);
    recording.observer.disconnect();
    clearTimeout(recording.timer);
    const done = recording;
    recording = null;
    window.yuroDiag.dernier = snapshot(done.lines);
    return `${done.lines.length} ligne(s) : yuroDiag.download() pour sauvegarder`;
  }
  function menu(seconds = 30) {
    if (recording) stop();
    recording = { lines: [], observer: new MutationObserver(onMutations), timer: setTimeout(stop, seconds * 1e3) };
    for (const type of EVENTS) window.addEventListener(type, onEvent, true);
    recording.observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    return `enregistrement pendant ${seconds} s : joue normalement (ou laisse le blocage arriver), puis yuroDiag.download()`;
  }
  function snapshot(lines = null) {
    const html = document.body.outerHTML.replace(/<script[\s\S]*?<\/script>/gi, "<script/>");
    const controls = [...document.querySelectorAll('button, a[role="button"], [class*="btn"], input[type="checkbox"], [role="switch"]')].slice(0, 250).map((node) => ({
      element: describeNode(node),
      visible: node.getBoundingClientRect().height > 0,
      desactive: node.disabled === true || node.getAttribute("aria-disabled") === "true",
      coche: node.checked ?? (node.getAttribute("aria-checked") ?? void 0)
    }));
    return {
      version: YURO_VERSION,
      genereLe: new Date().toISOString(),
      page: mask(location.href),
      controles: controls,
      enregistrement: lines,
      api: apiLog.slice(),
      ws: wsLog.slice(),
      html: mask(html).slice(0, LIMITS.html)
    };
  }
  function saveJson(prefix, data) {
    const when = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    const name = `${prefix}-${when}.json`;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: "application/json" }));
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    return name;
  }
  function download() {
    if (recording) stop();
    const data = window.yuroDiag.dernier ?? snapshot();
    window.yuroDiag.dernier = null;
    return `fichier ${saveJson("yuro-diag", data)} téléchargé`;
  }
  // page() : photo immédiate de la page et des derniers échanges, sans enregistrement préalable —
  // à lancer au moment précis où le combat reste bloqué
  const page = () => `fichier ${saveJson("yuro-diag", snapshot())} téléchargé (photo immédiate)`;

  window.yuroDiag = { menu, stop, download, page, dernier: null, version: YURO_VERSION };

  // ---- relance du replay auto en mode farm ----
  // Observé (enregistrements du 10/11/2026) : à la fin d'un combat farm, le site affiche
  // section.story-end-screen.farm-end avec « ↻ Recommencer » (button[data-farm-start]) et, quand « Replay auto » est
  // activé (button[data-combat-auto="replay"].is-on), relance tout seul le combat quelques secondes plus tard
  // (POST /api/save/story-start). Quand il reste bloqué, cet écran ne part pas : au-delà du délai ci-dessous, le script
  // clique « Recommencer » lui-même, celui-là même que le joueur aurait cliqué.
  const SETTINGS_KEY = "yuro-plus:settings";
  const readSettings = () => {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_KEY)) ?? {};
    } catch {
      return {};
    }
  };
  const writeSetting = (name, value) => localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...readSettings(), [name]: value }));
  const reglages = {
    // relance rapide : dès que l'écran de fin apparaît (replay auto activé), « Recommencer » est cliqué après ce court
    // délai, sans attendre la relance plus lente du site
    rapideMs: 600,
    // relance rapide coupée (yuroPlus.relanceRapide(false)) : on n'intervient qu'au-delà de cette attente, en secours
    attenteMs: 12e3,
    // après un clic, temps laissé au site pour réagir avant de considérer le clic sans effet et de réessayer
    reessaiMs: 5e3,
    // après ce nombre de clics sans effet sur le même écran, on arrête d'insister
    essaisMax: 3,
    verifieMs: 250,
    active: readSettings().relanceAuto !== false,
    rapide: readSettings().relanceRapide !== false,
    // Château de l'infini : à la victoire, lancer la chambre suivante (bouton « Suivant auto » du bandeau)
    suivant: readSettings().suivantAuto !== false,
    // Halloween : à la victoire, cliquer « Affronter à nouveau » (notre bouton « Rejouer auto », éteint par défaut :
    // le site a son propre Replay auto pour ce mode ; le nôtre sert quand celui du site est éteint)
    halloween: readSettings().halloweenAuto === true,
    // Boutique Halloween : ouvrir les citrouilles en boucle (« Citrouilles auto »). Chaque ouverture DÉPENSE des
    // bonbons : jamais mémorisé, toujours éteint au chargement, le joueur rallume à chaque séance en connaissance
    // de cause. C'est la seule exception à « jamais les boutons qui dépensent », voulue par le propriétaire.
    citrouilles: false,
    // délai avant chaque clic de la chaîne citrouilles : bien plus court que rapideMs, l'enchaînement n'a pas
    // d'écran de fin à laisser respirer (la lecture des rares est garantie avant « Ouvrir encore », quelle que
    // soit la vitesse)
    citrouillesMs: 100,
    // un bouton d'ouverture désactivé n'arrête la boucle que s'il le reste aussi longtemps : le site le coupe
    // aussi brièvement pendant ses animations
    patienceMs: 8e3,
    // « mode éclair » : pendant que Citrouilles auto tourne, raccourcir les animations du site dans le dialogue
    // d'ouverture (et seulement là). yuroPlus.citrouillesEclair(false) si un écran se comporte mal (mémorisé).
    eclair: readSettings().citrouillesEclair !== false
  };
  const END_SCREEN = "section.story-end-screen.farm-end";
  const RESTART = "[data-farm-start]";
  const AUTO_ON = '[data-combat-auto="replay"].is-on';
  const visible = (node) => Boolean(node) && node.getBoundingClientRect().height > 0;
  let toasts = null;
  function toast(message) {
    if (!toasts?.isConnected) {
      toasts = document.createElement("div");
      toasts.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:99999;display:flex;flex-direction:column;gap:8px;";
      document.body.append(toasts);
    }
    const item = document.createElement("div");
    item.style.cssText = "max-width:340px;padding:10px 14px;border:1px solid #2c3550;border-radius:10px;background:#161b26;color:#e8ecf5;font:13px/1.45 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.45);";
    item.textContent = message;
    toasts.append(item);
    setTimeout(() => item.remove(), 6e3);
  }
  // Un surveillant d'écran de fin : premier clic rapide (ou en secours après attenteMs si la relance rapide est
  // coupée), nouvel essai après reessaiMs si l'écran est toujours là, arrêt après essaisMax clics sans effet.
  function createWatcher({ trouve, nomAction, raisonLente, compte, delai }) {
    let since = null;
    let lastClickAt = 0;
    let attempts = 0;
    let announced = false;
    return () => {
      if (!reglages.active) return;
      const target = trouve();
      if (!target) {
        since = null;
        attempts = 0;
        announced = false;
        return;
      }
      const now = Date.now();
      since ??= now;
      const due = attempts === 0 ? since + (delai ? delai() : reglages.rapide ? reglages.rapideMs : reglages.attenteMs) : lastClickAt + reglages.reessaiMs;
      if (now < due) return;
      if (attempts >= reglages.essaisMax) {
        if (!announced) {
          announced = true;
          toast(`Yuro Plus : ${reglages.essaisMax} relances sans effet, j’arrête d’insister. yuroDiag.page() dans la console pour m’envoyer ce que voit le script.`);
        }
        return;
      }
      attempts++;
      lastClickAt = now;
      if (attempts === 1) compte();
      // en mode rapide, le clic accompagne chaque combat : pas de message, sauf quand un clic est resté sans effet
      if (!reglages.rapide || attempts > 1) toast(`Yuro Plus : ${nomAction} (${attempts > 1 ? `clic précédent sans effet, essai ${attempts}` : raisonLente}).`);
      target.click();
    };
  }
  // Mode farm : le toggle « Replay auto » est celui du site
  const checkFarm = createWatcher({
    trouve: () => {
      const endScreen = document.querySelector(END_SCREEN);
      const autoOn = document.querySelector(AUTO_ON);
      if (!visible(endScreen) || !visible(autoOn)) return null;
      const restart = endScreen.querySelector(RESTART);
      return visible(restart) && !restart.disabled ? restart : null;
    },
    nomAction: "combat relancé",
    raisonLente: `replay auto resté bloqué ${Math.round(reglages.attenteMs / 1e3)} s`,
    compte: () => window.yuroPlus.relances++
  });
  // Château de l'infini (enregistrements du 10/11/2026) : écran de fin section.story-end-screen won/lost, boutons
  // [data-infinity-replay] « Rejouer », [data-infinity-start] « Suivant » (désactivé par le site à la défaite),
  // [data-infinity-lobby] « Retour au château ». Pas de toggle du site pour ce mode : le script ajoute le sien,
  // « ⟳ Suivant auto », dans le bandeau du combat. Double garde : classe won ET bouton Suivant non désactivé.
  const checkTower = createWatcher({
    trouve: () => {
      if (!reglages.suivant) return null;
      const next = document.querySelector("section.story-end-screen.won button[data-infinity-start]");
      return next && !next.disabled && visible(next) ? next : null;
    },
    nomAction: "chambre suivante lancée",
    raisonLente: "écran de victoire resté affiché",
    compte: () => window.yuroPlus.suivantes++
  });
  // Halloween (enregistrements du 10/11/2026) : Replay auto du site allumé → bandeau compact hw-end-compact sans aucun
  // bouton, le site enchaîne lui-même, le script ne touche à rien. Replay auto du site éteint → grand écran hw-end avec
  // « ↻ Affronter à nouveau » [data-hw26-play] : notre « Rejouer auto » le clique à la victoire. Jamais [data-hw26-open]
  // (la citrouille dépense des bonbons), jamais sur un écran lost.
  const checkHalloween = createWatcher({
    trouve: () => {
      if (!reglages.halloween) return null;
      const again = document.querySelector("section.story-end-screen.hw-end.won button[data-hw26-play]");
      return again && !again.disabled && visible(again) ? again : null;
    },
    nomAction: "combat Halloween relancé",
    raisonLente: "écran de victoire resté affiché",
    compte: () => window.yuroPlus.relancesHalloween++
  });
  // Notre « Série V · D » pour Halloween : le compteur du site n'existe que pour son propre enchaînement. Quand notre
  // « Rejouer auto » enchaîne, on compte nous-mêmes chaque écran de fin (une fois par écran) : victoires, défaites et
  // bonbons gagnés. Remis à zéro à chaque allumage du bouton.
  const hwSerie = { v: 0, d: 0, bonbons: 0 };
  let hwScreenSeen = false;
  function countHalloween() {
    const screen = document.querySelector("section.story-end-screen.hw-end");
    if (!visible(screen)) {
      hwScreenSeen = false;
      return;
    }
    if (hwScreenSeen) return;
    hwScreenSeen = true;
    if (!reglages.halloween) return;
    if (screen.classList.contains("won")) {
      hwSerie.v++;
      const gain = parseInt((screen.querySelector(".hw-end-gain b, .hw-end-strip-gain")?.textContent ?? "").replace(/[^0-9]/g, ""), 10);
      if (gain) hwSerie.bonbons += gain;
    } else if (screen.classList.contains("lost")) {
      hwSerie.d++;
    }
  }
  // le badge, même habillage que celui du site (classe qol-series), monté à côté de notre bouton
  function updateHwBadge(header) {
    let badge = header?.querySelector('[data-yuro-serie]');
    if (!header || !reglages.halloween || hwSerie.v + hwSerie.d === 0) {
      badge?.remove();
      return;
    }
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "qol-series";
      badge.setAttribute("data-yuro-serie", "");
      badge.title = "Série comptée par Yuro Plus (Rejouer auto) : victoires · défaites · bonbons gagnés. Remise à zéro à l’allumage du bouton.";
      const bold = document.createElement("b");
      bold.textContent = "Série";
      badge.append(bold);
      for (let index = 0; index < 3; index++) {
        if (index) {
          const dot = document.createElement("i");
          dot.textContent = "·";
          badge.append(dot);
        }
        badge.append(document.createElement("span"));
      }
      const group = header.querySelector('[data-yuro-auto="hw"]')?.parentElement;
      if (group) group.before(badge);
      else header.append(badge);
    }
    const [vSpan, dSpan, candySpan] = badge.querySelectorAll(":scope > span");
    const values = [`${hwSerie.v} V`, `${hwSerie.d} D`, `+${hwSerie.bonbons} bonbons`];
    [vSpan, dSpan, candySpan].forEach((span, index) => {
      if (span.textContent !== values[index]) span.textContent = values[index];
    });
  }
  // ---- Boutique Halloween : « Citrouilles auto » + journal des cartes rares ----
  // Observé (enregistrements du 10/11/2026, page #hw26) : le joueur choisit la quantité ([data-hw26-qty], plafond 10)
  // puis « Ouvrir ×N » (button.hw26-open-main, débite N × 100 bonbons) ouvre le dialogue #packDialog :
  // 1. citrouille à ouvrir : #tearPack.hw26-pack « OUVRE ! » (clic ou Entrée) ;
  // 2. défilé des cartes une à une : « » Tout passer » #skipPackReview saute au récapitulatif ;
  // 3. récapitulatif : tuiles .reveal-card.pack-summary-tile dans #packCards (nom .summary-card-top strong, code de
  //    rareté .summary-card-top span : C/R/SR/SSR/UR/LR/TRS, numéro .summary-card-art span, série
  //    .summary-card-series ; triées plus rares en premier, 10 par page, pager #packSummaryPager
  //    [data-summary-page]), pastilles de comptage .qol-pack-recap (« UR ×1 · SR ×2 … ») dans #revealHint
  //    (« 10 citrouilles · 50 cartes »), barre .pack-actions avec « 🎃 Ouvrir encore ×N » #openAnotherPack qui
  //    renvoie à l'étape 1. La meilleure carte (tuile big-pull-hidden, classe revealed une fois retournée) doit être
  //    RÉVÉLÉE d'un clic — le joueur le fait à chaque fois — avant que l'enchaînement reparte : le script la clique
  //    donc aussi (rien n'est dépensé), et c'est au passage là que nom et rareté deviennent sûrs dans la page.
  // « Citrouilles auto » enchaîne ces clics-là (jamais la pagination de collection, jamais « Voir ma collection »).
  // Les cartes UR, LR, EX et TRS sont notées dans un journal mémorisé (yuroPlus.cartesRares()), que l'ouverture soit
  // automatique ou manuelle. Arrêt de la boucle : bouton éteint, bouton d'ouverture désactivé (plus de bonbons), ou
  // trois clics sans effet (garde-fou de createWatcher).
  const RARE = /^(UR|LR|EX|TRS)$/i;
  const RARES_KEY = "yuro-plus:cartes-rares";
  const citrouilles = { ouvertes: 0, cartes: 0, rares: 0 };
  const lireRares = () => {
    try {
      return JSON.parse(localStorage.getItem(RARES_KEY)) ?? [];
    } catch {
      return [];
    }
  };
  let raresTotal = lireRares().length;
  function noteRare(carte) {
    const journal = lireRares();
    journal.push(carte);
    if (journal.length > 300) journal.splice(0, journal.length - 300);
    localStorage.setItem(RARES_KEY, JSON.stringify(journal));
    raresTotal = journal.length;
    citrouilles.rares++;
    toast(`Yuro Plus : ✦ carte rare ! ${carte.rarete} ${carte.nom} (${carte.numero}${carte.serie ? `, ${carte.serie}` : ""})`);
    if (document.getElementById("yuro-plus-rares")) montrePanneauRares(); // panneau ouvert : rafraîchi en direct
  }
  // le dialogue d'ouverture n'est le nôtre que pour les citrouilles (les boosters classiques passent par le même
  // #packDialog, sans la classe hw26-pack) : ne jamais agir ailleurs
  function hw26Dialog() {
    const dialog = document.querySelector("#packDialog[open]");
    return dialog?.querySelector("#tearPack.hw26-pack") ? dialog : null;
  }
  // …et il peut garder son attribut « open » tout en étant caché une fois refermé : vu depuis la boutique, une
  // ouverture n'est « en cours » que si l'une de ses étapes est réellement affichée (sinon le premier « Ouvrir ×N »
  // ne partirait jamais — bogue du démarrage depuis la boutique en 0.9.0)
  function hw26DialogAffiche() {
    const dialog = hw26Dialog();
    if (!dialog) return null;
    const enCours = ["#tearPack", "#skipPackReview", "#openAnotherPack", "#keepCards"].some((selecteur) => visible(dialog.querySelector(selecteur)));
    return enCours ? dialog : null;
  }
  let tirage = null; // lecture du récapitulatif en cours (une par ouverture)
  function litTuiles(dialog) {
    for (const tuile of dialog.querySelectorAll("#packCards .reveal-card.pack-summary-tile")) {
      const code = tuile.querySelector(".summary-card-top span")?.textContent?.trim() ?? "";
      const numero = tuile.querySelector(".summary-card-art span")?.textContent?.trim() ?? "";
      if (!RARE.test(code) || tirage.vues.has(code + numero)) continue;
      tirage.vues.add(code + numero);
      noteRare({
        quand: new Date().toISOString(),
        rarete: code.toUpperCase(),
        nom: tuile.querySelector(".summary-card-top strong")?.textContent?.trim() ?? "?",
        numero,
        serie: tuile.querySelector(".summary-card-series")?.textContent?.trim() ?? "",
        etiquette: tuile.querySelector(".summary-copy-tag")?.textContent?.trim() ?? ""
      });
    }
  }
  function litRecapitulatif() {
    const dialog = hw26Dialog();
    if (!dialog || !visible(dialog.querySelector("#openAnotherPack"))) {
      tirage = null;
      return;
    }
    if (!tirage) {
      // nouveau récapitulatif : compter l'ouverture, et lire sur les pastilles combien de rares sont annoncées.
      // Tant que le compte de citrouilles ou les tuiles ne sont pas affichés, l'écran est encore en train de se
      // construire : attendre le battement suivant (indispensable à grande vitesse, sinon « Ouvrir encore »
      // partirait avant la lecture et des rares seraient perdues).
      const hint = dialog.querySelector("#revealHint")?.textContent ?? "";
      const nbCitrouilles = parseInt(hint.match(/(\d+)\s*citrouille/)?.[1] ?? "", 10) || 0;
      if (!nbCitrouilles || !dialog.querySelector("#packCards .reveal-card.pack-summary-tile")) return;
      citrouilles.ouvertes += nbCitrouilles;
      citrouilles.cartes += parseInt(hint.match(/(\d+)\s*carte/)?.[1] ?? "", 10) || 0;
      let attendues = 0;
      for (const chip of dialog.querySelectorAll(".qol-pack-recap i")) {
        const code = chip.querySelector("b")?.textContent?.trim() ?? "";
        if (RARE.test(code)) attendues += parseInt(chip.textContent.slice(code.length).replace(/[^0-9]/g, ""), 10) || 0;
      }
      tirage = { attendues, vues: new Set() };
    }
    litTuiles(dialog);
  }
  // toutes les rares annoncées ont-elles été lues ? (les tuiles arrivent triées plus rares en premier : il ne faut
  // tourner les pages que si les pastilles en annoncent plus que la page n'en montre). Relit d'abord la page affichée :
  // quand une page vient d'être tournée, ses rares doivent être notées avant toute décision, sinon un « Ouvrir
  // encore » parti dans le même battement les perdrait.
  function recapLu(dialog) {
    if (!tirage) return false;
    litTuiles(dialog);
    if (tirage.vues.size >= tirage.attendues) return true;
    const suivantes = dialog.querySelector("#packSummaryPager [data-summary-page]:last-of-type");
    return !suivantes || suivantes.disabled;
  }
  function arretCitrouilles(raison) {
    if (!reglages.citrouilles) return;
    reglages.citrouilles = false;
    repaintToggle("pk", false);
    toast(`Yuro Plus : Citrouilles auto arrêté — ${raison}. Bilan : ${citrouilles.ouvertes} citrouille(s), ${citrouilles.cartes} cartes, ${citrouilles.rares} rare(s).`);
    majEclair(); // rendre tout de suite ses animations au dialogue
    if (citrouilles.rares > 0) montrePanneauRares(); // récap de fin de séance : les rares trouvées, sans console
  }
  // un bouton d'ouverture désactivé ne veut pas toujours dire « plus de bonbons » : le site le coupe aussi le temps
  // d'une animation. On ne s'arrête que s'il le reste au-delà de patienceMs.
  const desactiveDepuis = { boutique: null, encore: null };
  function patiente(cle, bouton, raison) {
    if (!bouton.disabled) {
      desactiveDepuis[cle] = null;
      return bouton;
    }
    desactiveDepuis[cle] ??= Date.now();
    if (Date.now() - desactiveDepuis[cle] > reglages.patienceMs) {
      desactiveDepuis[cle] = null;
      arretCitrouilles(raison);
    }
    return null;
  }
  // boutique (dialogue fermé) : cliquer « Ouvrir ×N » avec la quantité que le joueur a choisie
  const checkOuvrir = createWatcher({
    trouve: () => {
      if (!reglages.citrouilles || hw26DialogAffiche()) return null;
      const bouton = document.querySelector("button.hw26-open-main");
      if (!visible(bouton)) return null;
      return patiente("boutique", bouton, "« Ouvrir » est resté désactivé (plus assez de bonbons ?)");
    },
    nomAction: "ouverture lancée depuis la boutique",
    raisonLente: "boutique restée affichée",
    compte: () => {},
    delai: () => reglages.citrouillesMs
  });
  // étape 1 : la citrouille elle-même
  const checkCitrouille = createWatcher({
    trouve: () => {
      if (!reglages.citrouilles) return null;
      const pack = hw26Dialog()?.querySelector("#tearPack");
      return pack && visible(pack) && !pack.disabled ? pack : null;
    },
    nomAction: "citrouille ouverte",
    raisonLente: "citrouille restée fermée",
    compte: () => {},
    delai: () => reglages.citrouillesMs
  });
  // étape 2 : sauter le défilé carte par carte
  const checkPasser = createWatcher({
    trouve: () => {
      if (!reglages.citrouilles) return null;
      const skip = hw26Dialog()?.querySelector("#skipPackReview");
      return skip && visible(skip) && !skip.disabled ? skip : null;
    },
    nomAction: "défilé des cartes sauté",
    raisonLente: "défilé resté affiché",
    compte: () => {},
    delai: () => reglages.citrouillesMs
  });
  // étape 3a : révéler la meilleure carte (face cachée tant qu'on ne la clique pas ; le site attend ce geste avant de
  // laisser repartir « Ouvrir encore », et le joueur le fait lui-même à chaque ouverture)
  const CARTE_CACHEE = "#packCards .reveal-card.pack-summary-tile.big-pull-hidden:not(.revealed)";
  const carteCachee = (dialog) => {
    const tuile = dialog.querySelector(CARTE_CACHEE);
    return tuile && visible(tuile) ? tuile : null;
  };
  const checkRevele = createWatcher({
    trouve: () => {
      const dialog = reglages.citrouilles ? hw26Dialog() : null;
      return dialog ? carteCachee(dialog) : null;
    },
    nomAction: "meilleure carte révélée",
    raisonLente: "carte mystère restée face cachée",
    compte: () => {},
    delai: () => reglages.citrouillesMs
  });
  // étape 3b : s'il reste des rares annoncées à lire, tourner la page du récapitulatif (jamais avant d'avoir révélé :
  // la carte mystère est en page 1, il ne faut pas la quitter face cachée)
  const checkPages = createWatcher({
    trouve: () => {
      const dialog = reglages.citrouilles ? hw26Dialog() : null;
      if (!dialog || !tirage || carteCachee(dialog) || recapLu(dialog)) return null;
      const suivantes = dialog.querySelector("#packSummaryPager [data-summary-page]:last-of-type");
      return suivantes && visible(suivantes) && !suivantes.disabled ? suivantes : null;
    },
    nomAction: "page suivante du récapitulatif",
    raisonLente: "des cartes rares restaient à lire",
    compte: () => {},
    delai: () => reglages.citrouillesMs
  });
  // étape 3c : carte révélée et rares notées → « Ouvrir encore ×N », et la boucle repart à l'étape 1
  const checkEncore = createWatcher({
    trouve: () => {
      const dialog = reglages.citrouilles ? hw26Dialog() : null;
      if (!dialog) return null;
      const encore = dialog.querySelector("#openAnotherPack");
      if (!encore || !visible(encore)) {
        desactiveDepuis.encore = null;
        return null;
      }
      if (carteCachee(dialog) || !recapLu(dialog)) return null;
      return patiente("encore", encore, "« Ouvrir encore » est resté désactivé (plus assez de bonbons ?)");
    },
    nomAction: "citrouilles suivantes ouvertes",
    raisonLente: "récapitulatif resté affiché",
    compte: () => {},
    delai: () => reglages.citrouillesMs
  });
  // bilan sous le bouton de la boutique, dans le même habillage que les textes du site
  function updateCitrouillesBadge() {
    const checkout = document.querySelector("section.hw26-checkout");
    let badge = checkout?.querySelector("[data-yuro-citrouilles]");
    if (!checkout || citrouilles.ouvertes + citrouilles.rares === 0) {
      badge?.remove();
      return;
    }
    if (!badge) {
      badge = document.createElement("p");
      badge.setAttribute("data-yuro-citrouilles", "");
      badge.className = "boutique-availability";
      badge.title = "Compté par Yuro Plus depuis l’allumage de « Citrouilles auto » (les ouvertures manuelles comptent aussi). Journal complet : yuroPlus.cartesRares() dans la console.";
      checkout.append(badge);
    }
    const texte = `Yuro Plus : ${citrouilles.ouvertes} citrouille(s) ouverte(s) · ${citrouilles.cartes} cartes · ${citrouilles.rares} rare(s) UR/LR/EX/TRS`;
    if (badge.textContent !== texte) badge.textContent = texte;
  }
  // « mode éclair » : pendant que Citrouilles auto tourne, les animations du dialogue d'ouverture sont raccourcies à
  // presque rien (durées à 1 ms, jamais 0 : les événements animationend/transitionend doivent continuer d'arriver au
  // site). Portée limitée au dialogue : le reste du jeu garde ses animations. Feuille retirée dès l'arrêt.
  function majEclair() {
    const voulu = reglages.citrouilles && reglages.eclair;
    let style = document.getElementById("yuro-plus-eclair");
    if (voulu && !style) {
      style = document.createElement("style");
      style.id = "yuro-plus-eclair";
      style.textContent = "#packDialog, #packDialog * { animation-duration: 1ms !important; animation-delay: 0ms !important; transition-duration: 1ms !important; transition-delay: 0ms !important; }";
      document.head.append(style);
    } else if (!voulu && style) {
      style.remove();
    }
  }
  // ---- panneau « ✦ Rares » : l'historique des cartes rares lisible depuis le site, sans passer par la console ----
  const COULEUR_RARE = { UR: "#db80ff", LR: "#f5ce65", EX: "#79b8ff", TRS: "#ff414e" };
  const fermePanneauRares = () => document.getElementById("yuro-plus-rares")?.remove();
  function montrePanneauRares() {
    fermePanneauRares();
    const panneau = document.createElement("div");
    panneau.id = "yuro-plus-rares";
    panneau.style.cssText = "position:fixed;right:16px;top:70px;z-index:100000;width:min(380px,calc(100vw - 32px));max-height:72vh;display:flex;flex-direction:column;border:1px solid #2c3550;border-radius:12px;background:#161b26;color:#e8ecf5;font:13px/1.5 system-ui,sans-serif;box-shadow:0 10px 32px rgba(0,0,0,.55);";
    const entete = document.createElement("div");
    entete.style.cssText = "display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid #2c3550;";
    const titre = document.createElement("b");
    titre.textContent = "✦ Cartes rares notées par Yuro Plus";
    titre.style.cssText = "flex:1;";
    const fermer = document.createElement("button");
    fermer.type = "button";
    fermer.textContent = "×";
    fermer.title = "Fermer";
    fermer.style.cssText = "border:0;background:none;color:#e8ecf5;font:16px/1 system-ui;cursor:pointer;padding:2px 6px;";
    fermer.addEventListener("click", fermePanneauRares);
    entete.append(titre, fermer);
    const liste = document.createElement("div");
    liste.style.cssText = "overflow:auto;padding:8px 14px;display:flex;flex-direction:column;gap:6px;";
    const journal = lireRares();
    if (!journal.length) {
      const vide = document.createElement("p");
      vide.textContent = "Aucune carte rare notée pour l’instant (UR, LR, EX, TRS). Elles s’ajoutent ici à chaque ouverture de citrouille, automatique ou manuelle.";
      vide.style.cssText = "margin:6px 0;color:#9aa3b8;";
      liste.append(vide);
    }
    for (const carte of journal.slice().reverse()) {
      const ligne = document.createElement("div");
      ligne.style.cssText = "display:flex;align-items:baseline;gap:8px;";
      const code = document.createElement("b");
      code.textContent = carte.rarete;
      code.style.cssText = `min-width:34px;color:${COULEUR_RARE[carte.rarete] ?? "#e8ecf5"};`;
      const texte = document.createElement("span");
      texte.style.cssText = "flex:1;";
      const nom = document.createElement("strong");
      nom.textContent = carte.nom;
      const detail = document.createElement("span");
      detail.textContent = ` ${carte.numero}${carte.serie ? ` · ${carte.serie}` : ""}${carte.etiquette ? ` · ${carte.etiquette}` : ""}`;
      detail.style.cssText = "color:#9aa3b8;";
      texte.append(nom, detail);
      const quand = document.createElement("small");
      const date = new Date(carte.quand);
      quand.textContent = isNaN(date) ? "" : `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
      quand.style.cssText = "color:#9aa3b8;white-space:nowrap;";
      ligne.append(code, texte, quand);
      liste.append(ligne);
    }
    const pied = document.createElement("div");
    pied.style.cssText = "display:flex;align-items:center;gap:8px;padding:8px 14px;border-top:1px solid #2c3550;color:#9aa3b8;";
    const compte = document.createElement("span");
    compte.textContent = `${journal.length} carte(s) · 300 max, les plus anciennes s’effacent`;
    compte.style.cssText = "flex:1;";
    const vider = document.createElement("button");
    vider.type = "button";
    vider.textContent = "Vider le journal";
    vider.style.cssText = "border:1px solid #2c3550;border-radius:8px;background:none;color:#e8ecf5;font:12px system-ui;cursor:pointer;padding:4px 10px;";
    vider.addEventListener("click", () => {
      localStorage.removeItem(RARES_KEY);
      raresTotal = 0;
      montrePanneauRares();
    });
    pied.append(compte, vider);
    panneau.append(entete, liste, pied);
    document.body.append(panneau);
  }
  // le bouton « ✦ Rares (N) » qui ouvre le panneau, monté aux mêmes endroits que l'interrupteur
  function mountRaresButton(host) {
    if (!host) return;
    let bouton = host.querySelector("[data-yuro-rares]");
    if (!bouton) {
      bouton = document.createElement("button");
      bouton.type = "button";
      bouton.setAttribute("data-yuro-rares", "");
      bouton.className = "btn ghost small combat-auto-btn";
      bouton.title = "Ajouté par Yuro Plus : historique des cartes rares (UR, LR, EX, TRS) tirées des citrouilles, mémorisé d’une session à l’autre.";
      bouton.addEventListener("click", () => {
        if (document.getElementById("yuro-plus-rares")) fermePanneauRares();
        else montrePanneauRares();
      });
      host.append(bouton);
    }
    const texte = `✦ Rares (${raresTotal})`;
    if (bouton.textContent !== texte) bouton.textContent = texte;
  }
  const allumeCitrouilles = (on) => {
    reglages.citrouilles = Boolean(on); // jamais mémorisé : ça dépense des bonbons, rallumage volontaire à chaque fois
    majEclair();
    if (reglages.citrouilles) {
      citrouilles.ouvertes = 0;
      citrouilles.cartes = 0;
      citrouilles.rares = 0;
      toast("Yuro Plus : Citrouilles auto — ouverture en boucle de la quantité choisie (des bonbons sont dépensés à chaque ouverture). Reclique le bouton pour arrêter.");
    }
  };

  // nos interrupteurs dans le bandeau du combat, même habillage que le « Replay auto » du site
  // (un même interrupteur peut être monté à deux endroits, ex. boutique + dialogue : tous repeints)
  function repaintToggle(id, on) {
    for (const button of document.querySelectorAll(`[data-yuro-auto="${id}"]`)) {
      button.className = `btn ghost small combat-auto-btn${on ? " is-on" : ""}`;
      button.setAttribute("aria-pressed", String(on));
      button.querySelector("em").textContent = on ? "ON" : "OFF";
    }
  }
  function mountToggle({ id, header, label, title, lire, ecrire }) {
    if (!header || header.querySelector(`[data-yuro-auto="${id}"]`)) return;
    const state = document.createElement("em");
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("data-yuro-auto", id);
    button.title = title;
    button.append(label, state);
    button.addEventListener("click", () => {
      ecrire(!lire());
      repaintToggle(id, lire());
    });
    const group = document.createElement("span");
    group.className = "combat-auto-group";
    group.append(button);
    header.append(group);
    repaintToggle(id, lire());
  }
  function mountToggles() {
    mountToggle({
      id: "next",
      header: document.querySelector("header button[data-infinity-lobby]")?.closest("header"),
      label: "⟳ Suivant auto",
      title: "Ajouté par Yuro Plus : à la victoire, la chambre suivante se lance toute seule",
      lire: () => reglages.suivant,
      ecrire: (on) => {
        reglages.suivant = on;
        writeSetting("suivantAuto", on);
      }
    });
    const hwHeader = [...document.querySelectorAll("header")].find((node) => /HALLOWEEN/i.test(node.querySelector(".eyebrow")?.textContent ?? ""));
    mountToggle({
      id: "hw",
      header: hwHeader,
      label: "⟳ Rejouer auto",
      title: "Ajouté par Yuro Plus : à la victoire, relance le combat (« Affronter à nouveau »). Utile quand le Replay auto du site est éteint ; quand il est allumé, c’est le site qui enchaîne.",
      lire: () => reglages.halloween,
      ecrire: (on) => {
        reglages.halloween = on;
        writeSetting("halloweenAuto", on);
        if (on) {
          hwSerie.v = 0;
          hwSerie.d = 0;
          hwSerie.bonbons = 0;
        }
      }
    });
    updateHwBadge(hwHeader);
    // « Citrouilles auto » : dans la boutique Halloween, et dans la barre du dialogue d'ouverture pour pouvoir
    // arrêter en pleine séance
    for (const host of [document.querySelector("section.hw26-checkout"), hw26Dialog()?.querySelector(".pack-actions")]) {
      mountToggle({
        id: "pk",
        header: host,
        label: "🎃 Citrouilles auto",
        title: "Ajouté par Yuro Plus : ouvre les citrouilles en boucle avec la quantité choisie — attention, chaque ouverture dépense des bonbons. Les cartes UR, LR, EX et TRS sont notées (yuroPlus.cartesRares() dans la console). Toujours éteint au chargement de la page.",
        lire: () => reglages.citrouilles,
        ecrire: allumeCitrouilles
      });
      mountRaresButton(host?.querySelector(".combat-auto-group"));
    }
    updateCitrouillesBadge();
  }
  // ---- fonctionnement en arrière-plan ----
  // Onglet caché (couvert ou réduit), le navigateur gèle les animations et ralentit les minuteries jusqu'à une par
  // minute : le combat du site se fige et nos vérifications aussi. Parades, coupables par yuroPlus.arrierePlan(false) :
  // 1. nos vérifications battent dans un Web Worker, que le navigateur ne ralentit pas ;
  // 2. le site croit l'onglet toujours visible (document.hidden / visibilityState, événement visibilitychange retenu) ;
  // 3. les animations (requestAnimationFrame) et minuteries que le site pose pendant que l'onglet est caché sont
  //    rejouées par le worker, au rythme de verifieMs : invisible de toute façon, et le jeu avance.
  const fond = { actif: readSettings().fondActif !== false };
  function createTicker(ms) {
    const listeners = new Set();
    const fire = () => listeners.forEach((listener) => {
      try {
        listener();
      } catch {}
    });
    try {
      const worker = new Worker(URL.createObjectURL(new Blob([`setInterval(() => postMessage(0), ${ms});`], { type: "text/javascript" })));
      worker.addEventListener("message", fire);
    } catch {
      setInterval(fire, ms);
    }
    return { add: (listener) => listeners.add(listener) };
  }
  const tick = createTicker(reglages.verifieMs);
  function installFond() {
    const proto = Document.prototype;
    const realHiddenGet = Object.getOwnPropertyDescriptor(proto, "hidden")?.get;
    const realStateGet = Object.getOwnPropertyDescriptor(proto, "visibilityState")?.get;
    const isHidden = () => {
      try {
        return realHiddenGet ? realHiddenGet.call(document) : false;
      } catch {
        return false;
      }
    };
    try {
      Object.defineProperty(proto, "hidden", { configurable: true, get() {
        return fond.actif && this === document ? false : isHidden();
      } });
      Object.defineProperty(proto, "visibilityState", { configurable: true, get() {
        if (fond.actif && this === document) return "visible";
        try {
          return realStateGet ? realStateGet.call(this) : "visible";
        } catch {
          return "visible";
        }
      } });
    } catch {}
    const swallow = (event) => {
      if (fond.actif) event.stopImmediatePropagation();
    };
    for (const type of ["visibilitychange", "webkitvisibilitychange"]) {
      document.addEventListener(type, swallow, true);
      window.addEventListener(type, swallow, true);
    }
    const nativeRaf = window.requestAnimationFrame.bind(window);
    const nativeCancelRaf = window.cancelAnimationFrame.bind(window);
    let nextId = 2e9;
    const rafQueue = new Map();
    window.requestAnimationFrame = (callback) => {
      if (!fond.actif || !isHidden() || typeof callback !== "function") return nativeRaf(callback);
      const id = ++nextId;
      rafQueue.set(id, callback);
      return id;
    };
    window.cancelAnimationFrame = (id) => {
      rafQueue.delete(id);
      nativeCancelRaf(id);
    };
    const nativeSetTimeout = window.setTimeout.bind(window);
    const nativeClearTimeout = window.clearTimeout.bind(window);
    const nativeSetInterval = window.setInterval.bind(window);
    const nativeClearInterval = window.clearInterval.bind(window);
    const timers = new Map();
    window.setTimeout = (callback, delay = 0, ...args) => {
      if (!fond.actif || !isHidden() || typeof callback !== "function") return nativeSetTimeout(callback, delay, ...args);
      const id = ++nextId;
      timers.set(id, { at: Date.now() + (Number(delay) || 0), callback, args });
      return id;
    };
    window.clearTimeout = (id) => {
      timers.delete(id);
      nativeClearTimeout(id);
    };
    window.setInterval = (callback, delay = 0, ...args) => {
      if (!fond.actif || !isHidden() || typeof callback !== "function") return nativeSetInterval(callback, delay, ...args);
      const id = ++nextId;
      timers.set(id, { at: Date.now() + (Number(delay) || 0), every: Math.max(Number(delay) || 0, reglages.verifieMs), callback, args });
      return id;
    };
    window.clearInterval = (id) => {
      timers.delete(id);
      nativeClearInterval(id);
    };
    // Ce qui a été mis de côté pendant que l'onglet était caché est TOUJOURS rejoué, même une fois l'onglet redevenu
    // visible : sinon une animation ou une minuterie prise en charge juste avant le retour resterait en rade et la
    // boucle du combat mourrait là (bogue de la 0.7.0, combats figés « ils se regardent »).
    tick.add(() => {
      if (rafQueue.size) {
        const callbacks = [...rafQueue.values()];
        rafQueue.clear();
        if (isHidden()) {
          const stamp = performance.now();
          for (const callback of callbacks) {
            try {
              callback(stamp);
            } catch {}
          }
        } else {
          for (const callback of callbacks) nativeRaf(callback);
        }
      }
      const now = Date.now();
      for (const [id, timer] of [...timers]) {
        if (timer.at > now) continue;
        if (timer.every) timer.at = now + timer.every;
        else timers.delete(id);
        try {
          timer.callback(...timer.args);
        } catch {}
      }
    });
  }
  installFond();
  tick.add(() => {
    countHalloween();
    litRecapitulatif();
    mountToggles();
    majEclair();
    checkFarm();
    checkTower();
    checkHalloween();
    checkOuvrir();
    checkCitrouille();
    checkPasser();
    checkRevele();
    checkPages();
    checkEncore();
  });
  // la chaîne citrouilles a son propre battement rapide, actif seulement pendant une séance : réaction en ~100 ms à
  // chaque écran (le battement normal ci-dessus reste en secours et gère le journal des ouvertures manuelles)
  const tickCitrouilles = createTicker(100);
  tickCitrouilles.add(() => {
    if (!reglages.citrouilles) return;
    litRecapitulatif();
    checkOuvrir();
    checkCitrouille();
    checkPasser();
    checkRevele();
    checkPages();
    checkEncore();
  });
  // Le site redessine le bandeau du combat à chaque tour, ce qui efface nos interrupteurs : les remonter dès la
  // mutation, avant le prochain affichage, pour qu'ils ne clignotent pas (le battement ci-dessus reste en secours).
  new MutationObserver(() => mountToggles()).observe(document.body, { childList: true, subtree: true });
  window.yuroPlus = {
    version: YURO_VERSION,
    relances: 0,
    suivantes: 0,
    relancesHalloween: 0,
    serieHalloween: hwSerie,
    citrouilles,
    reglages,
    // yuroPlus.citrouillesAuto(true) : ouvrir les citrouilles en boucle (même effet que le bouton de la boutique).
    // Jamais mémorisé : chaque ouverture dépense des bonbons, le rallumage doit rester un geste volontaire.
    citrouillesAuto(on = true) {
      allumeCitrouilles(on);
      repaintToggle("pk", reglages.citrouilles);
      return reglages.citrouilles ? "Citrouilles auto activé : ouverture en boucle, bonbons dépensés à chaque ouverture" : "Citrouilles auto coupé";
    },
    // yuroPlus.cartesRares() : journal mémorisé des cartes UR/LR/EX/TRS tirées ; yuroPlus.cartesRares("vider") l'efface
    // (même journal que le panneau « ✦ Rares » de la boutique)
    cartesRares(action) {
      if (action === "vider") {
        localStorage.removeItem(RARES_KEY);
        raresTotal = 0;
        if (document.getElementById("yuro-plus-rares")) montrePanneauRares();
        return "journal des cartes rares vidé";
      }
      const journal = lireRares();
      return journal.length ? journal : "aucune carte rare notée pour l’instant (UR, LR, EX, TRS)";
    },
    // yuroPlus.citrouillesEclair(false) : rendre leurs animations au dialogue d'ouverture pendant Citrouilles auto
    // (mémorisé ; par défaut elles sont raccourcies pour aller plus vite)
    citrouillesEclair(on = true) {
      reglages.eclair = Boolean(on);
      writeSetting("citrouillesEclair", reglages.eclair);
      majEclair();
      return reglages.eclair ? "mode éclair activé : animations du dialogue raccourcies pendant Citrouilles auto" : "mode éclair coupé : le dialogue garde ses animations normales";
    },
    // yuroPlus.relanceAuto(false) coupe toute relance (mémorisé), yuroPlus.relanceAuto(true) la remet
    relanceAuto(on = true) {
      reglages.active = Boolean(on);
      writeSetting("relanceAuto", reglages.active);
      return reglages.active ? "relance automatique activée" : "relance automatique coupée";
    },
    // yuroPlus.suivantAuto(false) : dans le château, ne plus lancer la chambre suivante (même effet que le bouton du bandeau)
    suivantAuto(on = true) {
      reglages.suivant = Boolean(on);
      writeSetting("suivantAuto", reglages.suivant);
      repaintToggle("next", reglages.suivant);
      return reglages.suivant ? "Suivant auto activé : à la victoire, la chambre suivante se lance toute seule" : "Suivant auto coupé";
    },
    // yuroPlus.halloweenAuto(true) : relancer le combat Halloween à la victoire (même effet que le bouton du bandeau)
    halloweenAuto(on = true) {
      reglages.halloween = Boolean(on);
      writeSetting("halloweenAuto", reglages.halloween);
      if (reglages.halloween) {
        hwSerie.v = 0;
        hwSerie.d = 0;
        hwSerie.bonbons = 0;
      }
      repaintToggle("hw", reglages.halloween);
      return reglages.halloween ? "Rejouer auto (Halloween) activé : à la victoire, « Affronter à nouveau » est cliqué" : "Rejouer auto (Halloween) coupé";
    },
    // yuroPlus.arrierePlan(false) : ne plus maintenir le jeu éveillé quand l'onglet est caché (mémorisé)
    arrierePlan(on = true) {
      fond.actif = Boolean(on);
      writeSetting("fondActif", fond.actif);
      return fond.actif ? "arrière-plan maintenu : le jeu continue quand l’onglet est caché" : "arrière-plan coupé : le navigateur gèlera le jeu quand l’onglet est caché";
    },
    // yuroPlus.relanceRapide(false) : plus de clic immédiat, seulement le secours après 12 s (mémorisé)
    relanceRapide(on = true) {
      reglages.rapide = Boolean(on);
      writeSetting("relanceRapide", reglages.rapide);
      return reglages.rapide ? "relance rapide activée : « Recommencer » est cliqué dès la fin du combat" : "relance rapide coupée : le site relance lui-même, le script n’intervient qu’après 12 s de blocage";
    }
  };
})();
