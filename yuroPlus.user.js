// ==UserScript==
// @name         Yuro Plus
// @namespace    https://github.com/xarregens/yuro-plus
// @version      0.12.0
// @description  Compagnon pour yurocollection.fr : relance immédiate du replay auto en farm et en raid, « Suivant auto » dans le Château de l'infini, « Ouverture auto » des boosters gratuits et de quête avec journal des cartes rares, filtre « Doublons » et tri par prix en ligne au marché ; commandes d'enregistrement yuroDiag.
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
  const YURO_VERSION = "0.12.0";

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
    if (text && status === 200) noteMarche(method, path, text);
    // un seul passage par message (analyse, masquage, mesure) : ce journal tourne en permanence, y compris onglet caché
    // pendant les combats auto, il doit rester léger. Au-delà de 2 Mo, on note seulement la taille.
    const capped = (value) => {
      if (value == null || typeof value !== "string") return null;
      if (value.length > 2e6) return `<${value.length} caractères, non noté>`;
      try {
        const masked = maskJson(JSON.parse(value));
        const flat = JSON.stringify(masked);
        return flat.length > LIMITS.body ? flat.slice(0, LIMITS.body) : masked;
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
      reponse: capped(text)
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
    // Marché, onglet Vendre : ne montrer que les cartes possédées en 2 exemplaires ou plus (puce « Doublons »)
    // (pas mémorisé : éteint à chaque arrivée sur l'onglet Vendre, à la demande du propriétaire le 19/11)
    doublons: false,
    // Marché, onglet Vendre : trier les cartes par prix en ligne décroissant (puce « 値 Prix en ligne », pas mémorisé)
    triPrix: false,
    // Boosters : ouvrir en boucle les boosters GRATUITS et DE QUÊTE (« Ouverture auto »), jamais ceux payés en ki.
    // Pas mémorisé : toujours éteint au chargement, le joueur l'allume quand il veut vider ses réserves.
    ouverture: false,
    // délai avant chaque clic de la chaîne d'ouverture : bien plus court que rapideMs, l'enchaînement n'a pas
    // d'écran de fin à laisser respirer (la lecture des rares est garantie avant « Ouvrir encore », quelle que
    // soit la vitesse)
    ouvertureMs: 100,
    // déchirer le booster : nouvel essai après ce délai si le site a ignoré le clic (animation d'arrivée en cours)
    dechirerReessaiMs: 500,
    // un bouton d'ouverture désactivé n'arrête la boucle que s'il le reste aussi longtemps : le site le coupe
    // aussi brièvement pendant ses animations
    patienceMs: 8e3,
    // onglet caché : temps maximal passé à rejouer animations et minuteries du site en un seul battement
    budgetMs: 100,
    // disjoncteur de l'arrière-plan : tant de blocages de plus d'une seconde, dans cette fenêtre de temps
    disjoncteurNombre: 3,
    disjoncteurFenetreMs: 18e4,
    // au-delà de ce nombre de boutons recréés en une seconde, on cesse de les remonter sur mutation (voir le frein)
    remontagesMax: 30,
    // « mode éclair » : pendant que Ouverture auto tourne, raccourcir les animations du site dans le dialogue
    // d'ouverture (et seulement là). yuroPlus.ouvertureEclair(false) si un écran se comporte mal (mémorisé).
    eclair: readSettings().ouvertureEclair !== false
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
  // delai / reessai / essais : réglages propres à un surveillant (sinon ceux des combats : rapideMs, reessaiMs, essaisMax)
  function createWatcher({ trouve, nomAction, raisonLente, compte, delai, reessai, essais }) {
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
      const due = attempts === 0 ? since + (delai ? delai() : reglages.rapide ? reglages.rapideMs : reglages.attenteMs) : lastClickAt + (reessai ? reessai() : reglages.reessaiMs);
      const maxEssais = essais ? essais() : reglages.essaisMax;
      if (now < due) return;
      if (attempts >= maxEssais) {
        if (!announced) {
          announced = true;
          toast(`Yuro Plus : ${maxEssais} relances sans effet, j’arrête d’insister. yuroDiag.page() dans la console pour m’envoyer ce que voit le script.`);
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
  // Raids (et autres combats Story) : capture yuroDiag.finCombat() du 18/11/2026, Raid 2 « Sacrifice » — écran de fin
  // section.story-end-screen.won (pas de classe farm-end), boutons .story-result-buttons : « ↻ Rejouer »
  // [data-raid-level="91015"] (button.btn.primary), « Suivant → » (désactivé ici), « Retour aux actes »
  // [data-story-map]. Replay auto du site [data-combat-auto="replay"].is-on : le site attend ~2 s, puis ajoute la classe
  // combat-end-leaving à l'écran et relance. Comme en farm, on clique « Rejouer » nous-mêmes après rapideMs, seulement
  // à la victoire (rien de connu sur la relance après défaite), jamais le « Rejouer » du château [data-infinity-replay].
  const checkRejouer = createWatcher({
    trouve: () => {
      const fin = document.querySelector("section.story-end-screen.won:not(.farm-end):not(.hw-end)");
      if (!visible(fin) || fin.classList.contains("combat-end-leaving") || !visible(document.querySelector(AUTO_ON))) return null;
      return [...fin.querySelectorAll(".story-result-buttons button:not([data-infinity-replay])")].find((bouton) => /rejouer/i.test(bouton.textContent ?? "") && !bouton.disabled && visible(bouton)) ?? null;
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
  // ---- Boosters : « Ouverture auto » (packs gratuits et de quête) + journal des cartes rares ----
  // Observé (enregistrements du 18/11/2026, page #boosters, nouvelle boutique après la fin de l'événement Halloween) :
  // section #boosterShop (data-sel = pack choisi), quantité .bv4-seg [data-batch-count] ×1/×5/×10, et le bouton
  // #bv4Open dont data-source dit ce qu'il va dépenser : "free" (« Gratuit », réserve qui se recharge toutes les
  // 10 min), "quest" (« Récompense de quête »), ou "ki" (« Ouvrir ×10 · 1 000 ki »). Le site prend tout seul une source
  // gratuite tant qu'il en reste et ajuste le lot à la réserve (« Lot ajusté à ta réserve : 1 booster »), puis bascule
  // sur le ki. Puces de paiement .bv4-pay [data-bv4-pay=free|quest|ki] (seulement les sources disponibles). Requête :
  // POST /api/booster {packId, quantity, payment:"free"|"quest", expectedRevision}. Les boosters gratuits et de quête
  // ne s'ouvrent que dans Multivers. La section #boosterPurchase se redessine d'après son attribut data-html : notre
  // bouton se monte À CÔTÉ (#yuro-plus-boosters), jamais dedans.
  // Dialogue #packDialog (le même qu'à Halloween) : #tearPack (clic) → défilé, « Tout passer » #skipPackReview →
  // récapitulatif (tuiles .pack-summary-tile, pastilles .qol-pack-recap, #revealHint « 8 boosters · 40 cartes », pager
  // #packSummaryPager) → « Ouvrir encore des boosters ↗ » #openAnotherPack, qui ramène à la boutique.
  // RÈGLE DE SÉCURITÉ : #bv4Open n'est cliqué QUE si son data-source est free ou quest. Jamais le ki, jamais une
  // jaquette de pack (« Ouvrir ici »), jamais « Rouvrir » #reopenSamePack (on ne sait pas ce qu'il paierait). Plus de
  // source gratuite : arrêt, bilan et panneau des rares.
  // Les cartes UR, LR, EX et TRS sont notées dans un journal mémorisé (yuroPlus.cartesRares()), que l'ouverture soit
  // automatique ou manuelle.
  const RARE = /^(UR|LR|EX|TRS)$/i;
  const RARES_KEY = "yuro-plus:cartes-rares";
  const bilanPacks = { ouvertes: 0, cartes: 0, rares: 0, parRarete: {} };
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
    bilanPacks.rares++;
    toast(`Yuro Plus : ✦ carte rare ! ${carte.rarete} ${carte.nom} (${carte.numero}${carte.serie ? `, ${carte.serie}` : ""})`);
    if (document.getElementById("yuro-plus-rares")) montrePanneauRares(); // panneau ouvert : rafraîchi en direct
  }
  // le dialogue d'ouverture des packs (le même pour tous les boosters depuis Halloween)
  function dialoguePack() {
    const dialog = document.querySelector("#packDialog[open]");
    return dialog?.querySelector("#tearPack") ? dialog : null;
  }
  // …et il peut garder son attribut « open » tout en étant caché une fois refermé : vu depuis la boutique, une
  // ouverture n'est « en cours » que si l'une de ses étapes est réellement affichée (sinon le premier « Ouvrir ×N »
  // ne partirait jamais — bogue du démarrage depuis la boutique en 0.9.0)
  function dialoguePackAffiche() {
    const dialog = dialoguePack();
    if (!dialog) return null;
    const enCours = ["#tearPack", "#skipPackReview", "#openAnotherPack", "#keepCards"].some((selecteur) => visible(dialog.querySelector(selecteur)));
    return enCours ? dialog : null;
  }
  let tirage = null; // lecture du récapitulatif en cours (une par ouverture)
  // Cartes d'avant (enregistrement du 18/11, signalé par le propriétaire) : le dialogue garde le récapitulatif de
  // l'ouverture précédente, et après « Tout passer » le site affiche le récapitulatif et « Ouvrir encore » 40 à 90 ms
  // AVANT d'y mettre les nouvelles cartes. Lu dans ce créneau, le récapitulatif était celui d'avant : rares notées en
  // double, puis « Ouvrir encore » cliqué sans avoir vu les nouvelles. Désormais, tant qu'une ouverture est en cours
  // (dialogue en déchirage / défilé / fermeture), les tuiles présentes sont marquées « anciennes » et ignorées ; un
  // récapitulatif n'est lu qu'une fois de NOUVELLES tuiles affichées (filet : au bout de 3 s, on lit ce qu'il y a).
  const TUILES = "#packCards .reveal-card.pack-summary-tile";
  const TUILES_NEUVES = `${TUILES}:not([data-yuro-ancienne])`;
  const recap = { ancienHint: null, vuDepuis: 0, neuvesDepuis: 0 };
  function marqueAnciennes(dialog) {
    for (const tuile of dialog.querySelectorAll(TUILES_NEUVES)) tuile.setAttribute("data-yuro-ancienne", "");
    recap.ancienHint = dialog.querySelector("#revealHint")?.textContent ?? "";
  }
  const ORDRE_RARETES = ["TRS", "EX", "LR", "UR", "SSR", "SR", "R", "C"];
  function litTuiles(dialog) {
    for (const tuile of dialog.querySelectorAll(TUILES_NEUVES)) {
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
    const dialog = dialoguePack();
    if (!dialog) {
      tirage = null;
      recap.vuDepuis = 0;
      recap.neuvesDepuis = 0;
      return;
    }
    if (!visible(dialog.querySelector("#openAnotherPack")) || dialog.classList.contains("closing")) {
      // ouverture en cours ou dialogue qui se referme : ce que contient le récapitulatif date d'avant
      marqueAnciennes(dialog);
      tirage = null;
      recap.vuDepuis = 0;
      recap.neuvesDepuis = 0;
      return;
    }
    if (!tirage) {
      const maintenant = Date.now();
      recap.vuDepuis ||= maintenant;
      const filet = maintenant - recap.vuDepuis > 3e3;
      const neuves = dialog.querySelectorAll(TUILES_NEUVES).length;
      if (!neuves && !filet) return; // les nouvelles cartes ne sont pas encore là
      if (neuves) recap.neuvesDepuis ||= maintenant;
      // même texte qu'avant (« 10 boosters · 50 cartes » + pastilles) : laisser 0,4 s au site pour le mettre à jour
      if (!filet && (dialog.querySelector("#revealHint")?.textContent ?? "") === recap.ancienHint && maintenant - recap.neuvesDepuis < 400) return;
      if (filet) for (const tuile of dialog.querySelectorAll("[data-yuro-ancienne]")) tuile.removeAttribute("data-yuro-ancienne");
      // nouveau récapitulatif : compter l'ouverture, et lire sur les pastilles combien de rares sont annoncées.
      // Tant que le compte de boosters (« 8 boosters · 40 cartes ») ou les tuiles ne sont pas affichés, l'écran est encore en train de se
      // construire : attendre le battement suivant (indispensable à grande vitesse, sinon « Ouvrir encore »
      // partirait avant la lecture et des rares seraient perdues).
      const hint = dialog.querySelector("#revealHint")?.textContent ?? "";
      const nbBoosters = parseInt(hint.match(/(\d+)\s*(?:booster|citrouille)/)?.[1] ?? "", 10) || 0;
      if (!nbBoosters || !dialog.querySelector("#packCards .reveal-card.pack-summary-tile")) return;
      bilanPacks.ouvertes += nbBoosters;
      bilanPacks.cartes += parseInt(hint.match(/(\d+)\s*carte/)?.[1] ?? "", 10) || 0;
      let attendues = 0;
      for (const chip of dialog.querySelectorAll(".qol-pack-recap i")) {
        const code = chip.querySelector("b")?.textContent?.trim() ?? "";
        const nombre = parseInt(chip.textContent.slice(code.length).replace(/[^0-9]/g, ""), 10) || 0;
        if (RARE.test(code)) attendues += nombre;
        // détail par rareté pour le bilan (les pastilles « NEW » comptent les nouvelles cartes, pas une rareté)
        if (code && !/^new$/i.test(code)) bilanPacks.parRarete[code.toUpperCase()] = (bilanPacks.parRarete[code.toUpperCase()] ?? 0) + nombre;
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
  function arretOuverture(raison) {
    if (!reglages.ouverture) return;
    reglages.ouverture = false;
    repaintToggle("pk", false);
    toast(`Yuro Plus : Ouverture auto arrêtée — ${raison}. Bilan : ${bilanPacks.ouvertes} booster(s), ${bilanPacks.cartes} cartes, ${bilanPacks.rares} rare(s).`);
    majEclair(); // rendre tout de suite ses animations au dialogue
    if (bilanPacks.rares > 0) montrePanneauRares(); // récap de fin de séance : les rares trouvées, sans console
  }
  // un bouton d'ouverture désactivé ne veut pas toujours dire « plus rien à ouvrir » : le site le coupe aussi le temps
  // d'une animation. On ne s'arrête que s'il le reste au-delà de patienceMs.
  const desactiveDepuis = { boutique: null, encore: null, fin: null };
  function patiente(cle, bouton, raison) {
    if (!bouton.disabled) {
      desactiveDepuis[cle] = null;
      return bouton;
    }
    desactiveDepuis[cle] ??= Date.now();
    if (Date.now() - desactiveDepuis[cle] > reglages.patienceMs) {
      desactiveDepuis[cle] = null;
      arretOuverture(raison);
    }
    return null;
  }
  // sources gratuites. Vu sur le site (18/11) : « Gratuit » = data-source "free" (bouton data-free-booster),
  // « Quêtes » / « Récompense de quête » = data-source "reward" (classe is-reward, bouton data-quest-booster, puce
  // data-bv4-pay="reward"), alors que la requête envoyée dit payment "quest" ; le ki = "ki" (data-buy-booster). Le
  // parrainage (referralBoosters dans les réponses) n'a pas encore été vu à l'écran : nom deviné. Tout ce qui
  // ressemble à du ki ou à un achat est refusé, même si un autre indice disait « gratuit ».
  const SOURCE_GRATUITE = /^(free|rewards?|quests?|referrals?)$/;
  const boutonOuvrir = () => {
    const bouton = document.querySelector("#bv4Open");
    return visible(bouton) ? bouton : null;
  };
  const sourceGratuite = (bouton) => {
    if (!bouton) return false;
    const source = bouton.dataset.source ?? "";
    if (/ki/i.test(source) || bouton.classList.contains("is-ki") || bouton.hasAttribute("data-buy-booster")) return false;
    return SOURCE_GRATUITE.test(source) || [...bouton.classList].some((classe) => /^is-(free|rewards?|quests?|referrals?)$/.test(classe));
  };
  const pucesGratuites = () => [...document.querySelectorAll(".bv4-pay [data-bv4-pay]")].filter((puce) => SOURCE_GRATUITE.test(puce.dataset.bv4Pay ?? "") && visible(puce) && !puce.disabled);
  const puceGratuite = () => pucesGratuites()[0];
  // ce que voyait le script, pour le message d'arrêt (et le diagnostic si une source n'est pas reconnue)
  const etatBoutique = () => {
    const bouton = boutonOuvrir();
    const puces = [...document.querySelectorAll(".bv4-pay [data-bv4-pay]")].map((puce) => `${puce.dataset.bv4Pay}${puce.getAttribute("aria-checked") === "true" ? " (choisie)" : ""}`);
    return `bouton : ${bouton ? `${bouton.dataset.source ?? "?"}${bouton.disabled ? ", grisé" : ""}` : "absent"} · puces : ${puces.join(", ") || "aucune"}`;
  };
  // une source gratuite encore disponible mais pas choisie — le joueur a pris « Ki », ou le site garde la source
  // épuisée (bouton grisé) au lieu de passer aux Quêtes : la choisir. Choisir le moyen de paiement ne dépense rien.
  const checkSource = createWatcher({
    trouve: () => {
      if (!reglages.ouverture || dialoguePackAffiche()) return null;
      const bouton = boutonOuvrir();
      if (!bouton || (sourceGratuite(bouton) && !bouton.disabled)) return null;
      return pucesGratuites().find((puce) => puce.getAttribute("aria-checked") !== "true") ?? null;
    },
    nomAction: "paiement remis sur les boosters gratuits",
    raisonLente: "paiement en ki sélectionné",
    compte: () => {},
    delai: () => reglages.ouvertureMs
  });
  // plus aucune source gratuite : le bouton propose du ki, ou reste grisé sur une source épuisée, et il n'y a plus
  // aucune puce Gratuit / Quêtes / Parrainage. Fin de séance, après un court délai pour laisser la boutique se redessiner
  function finDesGratuits() {
    if (!reglages.ouverture || dialoguePackAffiche()) {
      desactiveDepuis.fin = null;
      return;
    }
    const bouton = boutonOuvrir();
    if (!bouton || (sourceGratuite(bouton) && !bouton.disabled) || puceGratuite()) {
      desactiveDepuis.fin = null;
      return;
    }
    desactiveDepuis.fin ??= Date.now();
    if (Date.now() - desactiveDepuis.fin > 1500) {
      desactiveDepuis.fin = null;
      console.info("Yuro Plus : fin de l’ouverture auto,", etatBoutique());
      arretOuverture(`plus de boosters gratuits ni de quête (ils ne s’ouvrent que dans le pack Multivers) — le script ne paie jamais en ki [${etatBoutique()}]`);
    }
  }
  // lot au maximum (×10) : le site l'ajuste de lui-même à la réserve gratuite
  const lotDix = () => {
    const dix = document.querySelector('.bv4-seg [data-batch-count="10"]');
    return dix && visible(dix) && dix.getAttribute("aria-pressed") !== "true" ? dix : null;
  };
  const checkLot = createWatcher({
    trouve: () => {
      if (!reglages.ouverture || dialoguePackAffiche() || !sourceGratuite(boutonOuvrir())) return null;
      return lotDix();
    },
    nomAction: "lot de 10 choisi",
    raisonLente: "lot plus petit sélectionné",
    compte: () => {},
    delai: () => reglages.ouvertureMs
  });
  // boutique (dialogue fermé) : « Ouvrir », SEULEMENT si le site le fait payer en Gratuit ou en Quêtes
  const checkOuvrir = createWatcher({
    trouve: () => {
      if (!reglages.ouverture || dialoguePackAffiche()) return null;
      const bouton = boutonOuvrir();
      if (!bouton || !sourceGratuite(bouton) || lotDix()) return null;
      // grisé : une autre source gratuite → checkSource la choisit ; plus aucune → finDesGratuits arrête la séance
      if (bouton.disabled && !pucesGratuites().every((puce) => puce.getAttribute("aria-checked") === "true")) return null;
      if (bouton.disabled && !puceGratuite()) return null;
      return patiente("boutique", bouton, `« Ouvrir » est resté grisé [${etatBoutique()}]`);
    },
    nomAction: "ouverture lancée depuis la boutique",
    raisonLente: "boutique restée affichée",
    compte: () => {},
    delai: () => reglages.ouvertureMs
  });
  // étape 1 : déchirer le booster
  const checkDechire = createWatcher({
    trouve: () => {
      if (!reglages.ouverture) return null;
      const pack = dialoguePack()?.querySelector("#tearPack");
      return pack && visible(pack) && !pack.disabled ? pack : null;
    },
    nomAction: "booster déchiré",
    raisonLente: "booster resté fermé",
    compte: () => {},
    delai: () => reglages.ouvertureMs,
    // le site ignore les clics sur le booster tant que son animation d'arrivée n'est pas finie : un clic trop tôt
    // attendait 5 s (délai des combats) avant le suivant — c'était la lenteur du début d'ouverture. Ici, nouvel
    // essai toutes les dechirerReessaiMs, sans mitrailler (un clic pendant l'animation pourrait la relancer)
    reessai: () => reglages.dechirerReessaiMs,
    essais: () => 20
  });
  // étape 2 : sauter le défilé carte par carte
  const checkPasser = createWatcher({
    trouve: () => {
      if (!reglages.ouverture) return null;
      const skip = dialoguePack()?.querySelector("#skipPackReview");
      return skip && visible(skip) && !skip.disabled ? skip : null;
    },
    nomAction: "défilé des cartes sauté",
    raisonLente: "défilé resté affiché",
    compte: () => {},
    delai: () => reglages.ouvertureMs
  });
  // étape 3a : révéler la meilleure carte si le site la laisse face cachée (gros tirages ; à Halloween il attendait ce
  // geste avant de laisser repartir « Ouvrir encore » ; le joueur le fait lui-même)
  const CARTE_CACHEE = "#packCards .reveal-card.pack-summary-tile.big-pull-hidden:not(.revealed)";
  const carteCachee = (dialog) => {
    const tuile = dialog.querySelector(CARTE_CACHEE);
    return tuile && visible(tuile) ? tuile : null;
  };
  const checkRevele = createWatcher({
    trouve: () => {
      const dialog = reglages.ouverture ? dialoguePack() : null;
      return dialog ? carteCachee(dialog) : null;
    },
    nomAction: "meilleure carte révélée",
    raisonLente: "carte mystère restée face cachée",
    compte: () => {},
    delai: () => reglages.ouvertureMs
  });
  // étape 3b : s'il reste des rares annoncées à lire, tourner la page du récapitulatif (jamais avant d'avoir révélé :
  // la carte mystère est en page 1, il ne faut pas la quitter face cachée)
  const checkPages = createWatcher({
    trouve: () => {
      const dialog = reglages.ouverture ? dialoguePack() : null;
      if (!dialog || !tirage || carteCachee(dialog) || recapLu(dialog)) return null;
      const suivantes = dialog.querySelector("#packSummaryPager [data-summary-page]:last-of-type");
      return suivantes && visible(suivantes) && !suivantes.disabled ? suivantes : null;
    },
    nomAction: "page suivante du récapitulatif",
    raisonLente: "des cartes rares restaient à lire",
    compte: () => {},
    delai: () => reglages.ouvertureMs
  });
  // étape 3c : rares notées → « Ouvrir encore des boosters », retour à la boutique, et la boucle repart
  const checkEncore = createWatcher({
    trouve: () => {
      const dialog = reglages.ouverture ? dialoguePack() : null;
      if (!dialog) return null;
      const encore = dialog.querySelector("#openAnotherPack");
      if (!encore || !visible(encore)) {
        desactiveDepuis.encore = null;
        return null;
      }
      if (carteCachee(dialog) || !recapLu(dialog)) return null;
      return patiente("encore", encore, "« Ouvrir encore » est resté désactivé");
    },
    nomAction: "retour à la boutique pour les boosters suivants",
    raisonLente: "récapitulatif resté affiché",
    compte: () => {},
    delai: () => reglages.ouvertureMs
  });
  // notre encart, juste APRÈS la section #boosterPurchase (pas dedans : elle se redessine d'après son data-html)
  function hoteBoosters() {
    const achat = document.getElementById("boosterPurchase");
    let hote = document.getElementById("yuro-plus-boosters");
    if (!achat || !visible(achat)) {
      hote?.remove();
      return null;
    }
    if (!hote || hote.previousElementSibling !== achat) {
      hote?.remove();
      stats.remontages++;
      totalCreations++;
      hote = document.createElement("div");
      hote.id = "yuro-plus-boosters";
      hote.style.cssText = "display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px;margin:10px auto 0;";
      achat.after(hote);
    }
    return hote;
  }
  // bilan dans notre encart à côté de la boutique, dans le même habillage que les textes du site
  function majBilanPacks() {
    const hote = document.getElementById("yuro-plus-boosters");
    let badge = hote?.querySelector("[data-yuro-bilan-packs]");
    if (!hote || bilanPacks.ouvertes + bilanPacks.rares === 0) {
      badge?.remove();
      return;
    }
    if (!badge) {
      badge = document.createElement("p");
      badge.setAttribute("data-yuro-bilan-packs", "");
      badge.className = "bv4-note";
      badge.title = "Compté par Yuro Plus depuis l’allumage de « Ouverture auto » (les ouvertures manuelles comptent aussi). Journal complet : bouton « ✦ Rares ».";
      hote.append(badge);
    }
    const detail = Object.entries(bilanPacks.parRarete)
      .sort(([a], [b]) => (ORDRE_RARETES.indexOf(a) + 1 || 99) - (ORDRE_RARETES.indexOf(b) + 1 || 99))
      .map(([code, nombre]) => `${code} ${nombre}`).join(" · ");
    const texte = `Yuro Plus : ${bilanPacks.ouvertes} booster(s) ouvert(s) · ${bilanPacks.cartes} cartes${detail ? ` (${detail})` : ""} · ${bilanPacks.rares} rare(s) UR/LR/EX/TRS notée(s)`;
    if (badge.textContent !== texte) badge.textContent = texte;
  }
  // « mode éclair » : pendant que Ouverture auto tourne, les animations du dialogue d'ouverture sont raccourcies à
  // presque rien (durées à 1 ms, jamais 0 : les événements animationend/transitionend doivent continuer d'arriver au
  // site). Portée limitée au dialogue : le reste du jeu garde ses animations. Feuille retirée dès l'arrêt.
  function majEclair() {
    const voulu = reglages.ouverture && reglages.eclair;
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
      vide.textContent = "Aucune carte rare notée pour l’instant (UR, LR, EX, TRS). Elles s’ajoutent ici à chaque ouverture de booster, automatique ou manuelle.";
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
      bouton.title = "Ajouté par Yuro Plus : historique des cartes rares (UR, LR, EX, TRS) tirées des boosters, mémorisé d’une session à l’autre.";
      bouton.addEventListener("click", () => {
        if (document.getElementById("yuro-plus-rares")) fermePanneauRares();
        else montrePanneauRares();
      });
      host.append(bouton);
    }
    const texte = `✦ Rares (${raresTotal})`;
    if (bouton.textContent !== texte) bouton.textContent = texte;
  }
  const allumeOuverture = (on) => {
    reglages.ouverture = Boolean(on); // jamais mémorisé : rallumage volontaire à chaque séance
    majEclair();
    if (reglages.ouverture) {
      bilanPacks.ouvertes = 0;
      bilanPacks.parRarete = {};
      bilanPacks.cartes = 0;
      bilanPacks.rares = 0;
      toast("Yuro Plus : Ouverture auto — j’ouvre tes boosters gratuits puis ceux de quêtes, par lots de 10, sans jamais payer en ki. Reclique le bouton pour arrêter.");
    }
  };

  // ---- Marché, onglet « Vendre » : puce « Doublons » ----
  // Observé (yuroDiag du 17/11/2026, page #market) : grille .mkx-own-grid de button.mkx-own[data-market-sell=id],
  // pastille <em>×N</em> = exemplaires possédés (confirmé par le propriétaire), puces de rareté
  // .mkx-chips [data-market-sell-rarity], 24 cartes affichées à la fois et « Afficher plus de cartes »
  // [data-market-more] pour la suite — sans requête au serveur, la collection est déjà dans la page. Le site réserve
  // le dernier exemplaire : seules les cartes à ×2 ou plus se vendent sans perdre la carte.
  // Notre puce, à la suite de celles du site : allumée, les cartes à ×1 sont masquées (une feuille de style, attribut
  // sur <html> pour survivre aux redessins de la grille) et « Afficher plus » est cliqué jusqu'au bout pour que
  // tous les doublons apparaissent. Elle ne touche à rien d'autre (ni vente, ni prix).
  // Uniquement dans l'onglet Vendre : la page du marché porte section.market-page[data-mkx="sell"] (les onglets
  // Acheter / Échanges ont aussi des puces de rareté et un « Afficher plus », qu'il ne faut pas toucher).
  const DOUBLONS_CSS = "html[data-yuro-filtre-doublons] .mkx-own-grid .mkx-own:not([data-yuro-doublon]) { display: none !important; }";
  function zoneVente() {
    const page = document.querySelector('section.market-page[data-mkx="sell"]');
    const grille = page?.querySelector(".mkx-own-grid");
    if (!grille) return null;
    return { page, grille, chips: page.querySelector(".mkx-pick .mkx-chips") ?? page.querySelector(".mkx-chips"), plus: page.querySelector("[data-market-more]") };
  }
  // la marque data-yuro-ex retient le texte de la pastille : on n'écrit dans la page que si elle a changé (le site
  // peut réutiliser une case pour une autre carte), ce qui garde le passage sur un millier de cartes très léger
  function marqueDoublons(grille) {
    let doublons = 0;
    for (const tuile of grille.querySelectorAll(".mkx-own")) {
      const pastille = tuile.querySelector(".mkx-own-art em")?.textContent ?? "";
      const doublon = (parseInt(pastille.replace(/[^0-9]/g, ""), 10) || 0) >= 2;
      if (doublon) doublons++;
      if (tuile.getAttribute("data-yuro-ex") === pastille) continue;
      tuile.setAttribute("data-yuro-ex", pastille);
      tuile.toggleAttribute("data-yuro-doublon", doublon);
    }
    return doublons;
  }
  const chargement = { tuilesAuClic: -1, dernierClic: 0, sansProgres: 0 };
  // « Afficher plus » cliqué tant que la puce est allumée : plusieurs fois d'affilée tant que le site ajoute les
  // cartes aussitôt (dans la limite de 120 ms par battement, pour que la page reste fluide), sinon au battement
  // suivant ; 3 clics sans nouvelle carte : fin de la liste (ou le site a changé), on arrête.
  function chargeDoublons() {
    if (!reglages.doublons && !reglages.triPrix) return; // Doublons et Tri ont tous deux besoin de toute la liste
    const zone = zoneVente();
    const plusVisible = () => zone && visible(zone.plus) && !zone.plus.disabled;
    if (!plusVisible()) {
      chargement.sansProgres = 0;
      chargement.tuilesAuClic = -1;
      return;
    }
    const debut = performance.now();
    while (plusVisible() && chargement.sansProgres < 3 && performance.now() - debut < 120) {
      const tuiles = zone.page.querySelectorAll(".mkx-own-grid .mkx-own").length;
      if (tuiles === chargement.tuilesAuClic) {
        if (Date.now() - chargement.dernierClic < 1500) return; // cartes pas encore ajoutées : on attend
        chargement.sansProgres++;
      } else {
        chargement.sansProgres = 0;
      }
      chargement.tuilesAuClic = tuiles;
      chargement.dernierClic = Date.now();
      zone.plus.click();
      if (zone.page.querySelectorAll(".mkx-own-grid .mkx-own").length === tuiles) return; // ajout différé par le site
    }
  }
  // une seule puce pour toute la séance : remise en place telle quelle si le site redessine ses puces, sans animation
  // d'apparition, largeur du compteur fixe — sinon elle clignotait à chaque nouveau doublon
  let puceDoublons = null;
  function creePuceDoublons() {
    const puce = document.createElement("button");
    puce.type = "button";
    puce.className = "mkx-chip";
    puce.setAttribute("data-yuro-doublons", "");
    puce.setAttribute("data-rarity-plain", "");
    puce.style.cssText = "--r:#7ee0a8;animation:none!important;transition:none!important;font-variant-numeric:tabular-nums;";
    puce.title = "Ajouté par Yuro Plus : ne montrer que les cartes que tu possèdes en 2 exemplaires ou plus (le site garde toujours ton dernier exemplaire). Charge toute la liste automatiquement. Combinable avec les raretés, l’univers et la recherche.";
    const kanji = document.createElement("b");
    kanji.lang = "ja";
    kanji.setAttribute("aria-hidden", "true");
    kanji.textContent = "双";
    puce.append(kanji, document.createElement("span"));
    puce.addEventListener("click", (event) => {
      event.stopPropagation(); // la puce n'est pas une rareté : le site n'a pas à la voir
      reglages.doublons = !reglages.doublons;
      chargement.sansProgres = 0;
      chargement.tuilesAuClic = -1;
      majDoublons();
    });
    return puce;
  }
  let surVente = false;
  function majDoublons() {
    const zone = zoneVente();
    // à chaque arrivée sur l'onglet Vendre, Doublons et Tri repartent éteints (demande du propriétaire, 19/11)
    if (Boolean(zone) !== surVente) {
      surVente = Boolean(zone);
      if (surVente) {
        reglages.doublons = false;
        reglages.triPrix = false;
      }
    }
    const actif = reglages.doublons && Boolean(zone);
    if (actif !== document.documentElement.hasAttribute("data-yuro-filtre-doublons")) document.documentElement.toggleAttribute("data-yuro-filtre-doublons", actif);
    if (actif && !document.getElementById("yuro-plus-doublons-css")) {
      const style = document.createElement("style");
      style.id = "yuro-plus-doublons-css";
      style.textContent = DOUBLONS_CSS;
      document.head.append(style);
    }
    // hors de l'onglet Vendre : pas de puce
    for (const egaree of document.querySelectorAll("[data-yuro-doublons], [data-yuro-tri]")) {
      if (!zone?.chips || egaree.parentElement !== zone.chips) egaree.remove();
    }
    if (!zone?.chips) return;
    const doublons = marqueDoublons(zone.grille);
    puceDoublons ??= creePuceDoublons();
    if (puceDoublons.parentElement !== zone.chips) {
      stats.remontages++;
      totalCreations++;
      zone.chips.append(puceDoublons);
    }
    puceTri ??= creePuceTri();
    if (puceTri.parentElement !== zone.chips || puceTri.previousElementSibling !== puceDoublons) {
      stats.remontages++;
      totalCreations++;
      puceDoublons.after(puceTri);
    }
    const chargeEncore = (reglages.doublons || reglages.triPrix) && chargement.sansProgres < 3 && visible(zone.plus) && !zone.plus.disabled;
    const ecrit = (puce, texte, allumee) => {
      const libelle = puce.querySelector("span");
      if (libelle.textContent !== texte) libelle.textContent = texte;
      if (puce.classList.contains("active") !== allumee) puce.classList.toggle("active", allumee);
      if (puce.getAttribute("aria-pressed") !== String(allumee)) puce.setAttribute("aria-pressed", String(allumee));
    };
    ecrit(puceDoublons, reglages.doublons ? `Doublons · ${doublons}${chargeEncore ? "…" : ""}` : "Doublons", reglages.doublons);
    ecrit(puceTri, reglages.triPrix ? `Prix en ligne ↓${chargeEncore ? "…" : ""}${marche.source ? "" : " (cote)"}` : "Prix en ligne", reglages.triPrix);
  }

  // ---- Marché, onglet « Vendre » : tri par prix en ligne (puce « 値 Prix en ligne ») ----
  // Demande du propriétaire (19/11/2026) : trier ses cartes par prix décroissant, d'après le prix déjà mis en ligne par
  // les autres joueurs — ce que le panneau de droite appelle « Moins chère en ligne : 7100 · 1 annonce » (« Aucune autre
  // annonce de cette carte en ligne. » sinon), affiché seulement pour la carte choisie. Ces annonces viennent de
  // GET /api/market (capture du 17/11 : objets {id, card:{name, image, rarity, series}, kind:"sale"|"trade", price,
  // status:"active"|"sold"|"cancelled"|"expired", seller_id, seller_name}, liste « mine » = mes annonces, « sales » =
  // ventes récentes sans carte ; la liste des annonces des autres n'a JAMAIS été vue en entier, le journal coupant à
  // 20 000 caractères). D'où une lecture générique : toute annonce de VENTE ACTIVE d'un autre joueur, où qu'elle soit
  // dans la réponse, hors « mine » et hors mon propre identifiant. Source : la variable du site marketUI.data si elle
  // est accessible, sinon la dernière réponse complète de /api/market lue au passage (le script démarre après le site).
  // Rapprochement carte ↔ annonce par l'image (même empreinte /card-art/<empreinte>.webp), sinon nom + rareté.
  // Cartes sans annonce : à la suite, par cote décroissante. Le tri déplace les cases de la grille, rien d'autre ;
  // le prix en ligne s'affiche sous chaque carte tant que le tri est allumé. yuroDiag.marche() télécharge les données.
  const RARETE_NOM = { C: "Commun", R: "Rare", SR: "Épique", SSR: "Légendaire", UR: "Mythique", LR: "Secret", TRS: "Transcendant", EX: "Exclusive" };
  const empreinte = (url) => String(url ?? "").match(/card-art\/(?:t\/)?([0-9a-f]{8,})\./i)?.[1]?.toLowerCase() ?? null;
  const marche = { source: null, dernierRecu: null, recuA: 0, parImage: new Map(), parNom: new Map(), annonces: 0 };
  function extraitAnnonces(data) {
    const miennes = new Set();
    const moi = new Set();
    for (const item of Array.isArray(data?.mine) ? data.mine : []) {
      if (item?.id) miennes.add(item.id);
      if (item?.seller_id && (item.kind ?? "sale") === "sale") moi.add(item.seller_id);
    }
    const annonces = [];
    const parcourt = (valeur, profondeur) => {
      if (!valeur || typeof valeur !== "object" || profondeur > 5) return;
      if (Array.isArray(valeur)) {
        for (const element of valeur) parcourt(element, profondeur + 1);
        return;
      }
      if (typeof valeur.price === "number" && valeur.card && typeof valeur.card === "object") {
        annonces.push(valeur);
        return;
      }
      for (const [cle, element] of Object.entries(valeur)) if (cle !== "mine") parcourt(element, profondeur + 1);
    };
    parcourt(data, 0);
    return annonces.filter((annonce) => (annonce.status ?? "active") === "active" && (annonce.kind ?? "sale") === "sale" && !miennes.has(annonce.id) && !moi.has(annonce.seller_id));
  }
  function indexeMarche(data) {
    marche.source = data;
    marche.parImage = new Map();
    marche.parNom = new Map();
    const annonces = extraitAnnonces(data);
    marche.annonces = annonces.length;
    const ajoute = (carte, cle, prix) => {
      if (!cle) return;
      const deja = carte.get(cle);
      if (!deja) carte.set(cle, { min: prix, nb: 1 });
      else {
        deja.min = Math.min(deja.min, prix);
        deja.nb++;
      }
    };
    for (const annonce of annonces) {
      ajoute(marche.parImage, empreinte(annonce.card.image), annonce.price);
      ajoute(marche.parNom, `${String(annonce.card.name ?? "").trim().toLowerCase()}|${annonce.card.rarity ?? ""}`, annonce.price);
    }
  }
  // appelée pour chaque réponse lue par le journal : on garde la dernière réponse du marché qui contient des annonces
  function noteMarche(method, path, text) {
    if (String(method).toUpperCase() !== "GET" || !path.startsWith("/api/market") || /mysales/.test(path)) return;
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return;
    }
    if (!extraitAnnonces(data).length) return;
    marche.dernierRecu = data;
    marche.recuA = Date.now();
  }
  function donneesMarche() {
    let source = null;
    try {
      // variable du site (déclarée au premier niveau de son script, donc visible ici) ; absente : réponse lue au passage
      if (typeof marketUI !== "undefined" && marketUI?.data && extraitAnnonces(marketUI.data).length) source = marketUI.data;
    } catch {}
    source ??= marche.dernierRecu;
    if (source && source !== marche.source) indexeMarche(source);
    return source;
  }
  function prixEnLigne(tuile) {
    const image = tuile.querySelector(".mkx-own-art img");
    const parImage = marche.parImage.get(empreinte(image?.getAttribute("data-full")) ?? empreinte(image?.getAttribute("src")));
    if (parImage) return parImage;
    const nom = tuile.querySelector(".mkx-own-copy strong")?.textContent?.trim().toLowerCase() ?? "";
    const code = (tuile.querySelector(".mkx-rar")?.textContent ?? "").replace(/[^A-Z]/g, "");
    return marche.parNom.get(`${nom}|${RARETE_NOM[code] ?? ""}`) ?? null;
  }
  const coteDe = (tuile) => parseInt((tuile.querySelector(".mkx-own-copy small")?.textContent ?? "").match(/cote\s*([\d\s  ]+)/i)?.[1]?.replace(/\D/g, "") ?? "", 10) || 0;
  const formatKi = (nombre) => Number(nombre).toLocaleString("fr-FR");
  // trie les cases déjà chargées (les nouvelles arrivent au battement suivant) et écrit le prix en ligne sous chacune
  function trieParPrix() {
    const zone = zoneVente();
    if (!zone) return;
    const tuiles = [...zone.grille.children].filter((element) => element.classList.contains("mkx-own"));
    if (!reglages.triPrix) {
      for (const etiquette of zone.grille.querySelectorAll("[data-yuro-prix]")) etiquette.remove();
      return;
    }
    donneesMarche();
    const fiches = tuiles.map((tuile, rang) => ({ tuile, rang, offre: prixEnLigne(tuile), cote: coteDe(tuile) }));
    for (const { tuile, offre } of fiches) {
      const copie = tuile.querySelector(".mkx-own-copy");
      if (!copie) continue;
      let etiquette = copie.querySelector("[data-yuro-prix]");
      if (!etiquette) {
        etiquette = document.createElement("small");
        etiquette.setAttribute("data-yuro-prix", "");
        etiquette.style.cssText = "display:block;color:#7ee0a8;";
        copie.append(etiquette);
      }
      const texte = !marche.source ? "en ligne : ?" : offre ? `en ligne ${formatKi(offre.min)}${offre.nb > 1 ? ` · ${offre.nb} annonces` : ""}` : "aucune annonce";
      if (etiquette.textContent !== texte) etiquette.textContent = texte;
    }
    const triees = [...fiches].sort((a, b) => (b.offre?.min ?? -1) - (a.offre?.min ?? -1) || b.cote - a.cote || a.rang - b.rang);
    if (triees.some((fiche, index) => fiche.tuile !== tuiles[index])) {
      const avant = zone.plus && zone.plus.parentElement === zone.grille ? zone.plus : null;
      for (const { tuile } of triees) zone.grille.insertBefore(tuile, avant);
    }
  }
  let puceTri = null;
  function creePuceTri() {
    const puce = document.createElement("button");
    puce.type = "button";
    puce.className = "mkx-chip";
    puce.setAttribute("data-yuro-tri", "");
    puce.setAttribute("data-rarity-plain", "");
    puce.style.cssText = "--r:#f5ce65;animation:none!important;transition:none!important;";
    puce.title = "Ajouté par Yuro Plus : trier tes cartes du plus cher au moins cher, d’après le prix le moins cher déjà en ligne chez les autres joueurs (comme « Moins chère en ligne » à droite) ; les cartes sans annonce suivent, par cote. Charge toute la liste automatiquement. Le prix en ligne s’affiche sous chaque carte.";
    const kanji = document.createElement("b");
    kanji.lang = "ja";
    kanji.setAttribute("aria-hidden", "true");
    kanji.textContent = "値";
    puce.append(kanji, document.createElement("span"));
    puce.addEventListener("click", (event) => {
      event.stopPropagation();
      reglages.triPrix = !reglages.triPrix;
      chargement.sansProgres = 0;
      chargement.tuilesAuClic = -1;
      if (reglages.triPrix && !donneesMarche()) {
        toast("Yuro Plus : je n’ai pas encore la liste des annonces du marché. Ouvre l’onglet « Acheter » puis reviens sur « Vendre » (le site la recharge) : le tri se fera tout seul. En attendant, les cartes sont triées par cote.");
      }
      majDoublons();
      trieParPrix();
    });
    return puce;
  }
  window.yuroDiag.marche = () => {
    donneesMarche();
    if (!marche.source) return "aucune donnée du marché reçue pour l’instant : ouvre l’onglet Acheter puis Vendre, et recommence";
    return `fichier ${saveJson("yuro-diag-marche", { version: YURO_VERSION, genereLe: new Date().toISOString(), annoncesRetenues: marche.annonces, cartesAvecAnnonce: marche.parImage.size, donnees: maskJson(marche.source) })} téléchargé`;
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
  let totalCreations = 0;
  function mountToggle({ id, header, label, title, lire, ecrire }) {
    if (!header || header.querySelector(`[data-yuro-auto="${id}"]`)) return;
    stats.remontages++;
    totalCreations++;
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
    // « Ouverture auto » : à côté du bouton Ouvrir de la boutique, et dans la barre du dialogue d'ouverture pour pouvoir
    // arrêter en pleine séance
    for (const host of [hoteBoosters(), dialoguePack()?.querySelector(".pack-actions")]) {
      mountToggle({
        id: "pk",
        header: host,
        label: "🎁 Ouverture auto",
        title: "Ajouté par Yuro Plus : ouvre en boucle tes boosters gratuits puis ceux de quêtes (pack Multivers), par lots de 10, et s’arrête quand il n’y en a plus — jamais de paiement en ki. Les cartes UR, LR, EX et TRS sont notées (bouton « ✦ Rares »). Toujours éteint au chargement de la page.",
        lire: () => reglages.ouverture,
        ecrire: allumeOuverture
      });
      mountRaresButton(host?.querySelector(".combat-auto-group"));
    }
    majBilanPacks();
    majDoublons();
  }
  // ---- fonctionnement en arrière-plan ----
  // Onglet caché (couvert ou réduit), le navigateur gèle les animations et ralentit les minuteries jusqu'à une par
  // minute : le combat du site se fige et nos vérifications aussi. Parades, coupables par yuroPlus.arrierePlan(false) :
  // 1. nos vérifications battent dans un Web Worker, que le navigateur ne ralentit pas ;
  // 2. le site croit l'onglet toujours visible (document.hidden / visibilityState, événement visibilitychange retenu) ;
  // 3. les animations (requestAnimationFrame) et minuteries que le site pose pendant que l'onglet est caché sont
  //    rejouées par le worker, au rythme de verifieMs : invisible de toute façon, et le jeu avance.
  const fond = { actif: readSettings().fondActif !== false };
  // ---- boîte noire : ce qui s'est passé juste avant que la page se fige ----
  // Une page figée (calcul sans fin) ne répond plus à rien, pas même à F5 ni à yuroDiag.page() : il faut fermer
  // l'onglet. Pour savoir quand même ce qui s'est passé, la page envoie chaque seconde un petit état à un worker
  // séparé, qui continue de tourner pendant le blocage. Sans nouvelles depuis seuilMs alors que lui-même tournait
  // normalement (pas une mise en veille de l'ordinateur), il écrit ses derniers états en IndexedDB ; si la page
  // reprend vie, il note l'heure de reprise. Au chargement suivant, un message propose yuroDiag.boiteNoire().
  const stats = { mutations: 0, remontages: 0, rejeuMs: 0, pireMs: 0, pireNom: "", minuteries: 0, animations: 0, disjoncte: false, animationsTerminees: 0, animationsDetail: null };
  const BOITE = { base: "yuro-plus", magasin: "boite-noire", cle: "dernier", seuilMs: 8e3 };
  const boiteNoire = (() => {
    const code = `
      let dernier = Date.now(), tour = Date.now(), journal = [], enCours = null, incident = null, sequence = [], longs = [], recent = null, recentJusqua = 0;
      const codes = {};
      const ecrire = (fiche) => {
        const ouverture = indexedDB.open(${JSON.stringify(BOITE.base)}, 1);
        ouverture.onupgradeneeded = () => ouverture.result.createObjectStore(${JSON.stringify(BOITE.magasin)});
        ouverture.onsuccess = () => {
          const tx = ouverture.result.transaction(${JSON.stringify(BOITE.magasin)}, "readwrite");
          tx.objectStore(${JSON.stringify(BOITE.magasin)}).put(fiche, ${JSON.stringify(BOITE.cle)});
          tx.oncomplete = () => ouverture.result.close();
        };
      };
      onmessage = (e) => {
        if (e.data.genre === "debut") {
          enCours = e.data.nom;
          sequence.push({ t: e.data.t, nom: e.data.nom, type: e.data.type });
          if (e.data.code && !(e.data.nom in codes)) {
            codes[e.data.nom] = e.data.code;
            const noms = Object.keys(codes);
            if (noms.length > 120) delete codes[noms[0]];
          }
          if (sequence.length > 20) sequence.shift();
          return;
        }
        if (e.data.genre === "long") {
          longs.push(e.data.rappel);
          if (longs.length > 5) longs.shift();
          // les mesures du navigateur n'arrivent qu'une fois le blocage fini, parfois après la reprise
          const cible = incident ?? (Date.now() < recentJusqua ? recent : null);
          if (cible) { cible.rappelsLongs = longs.slice(); ecrire({ ...cible }); }
          return;
        }
        dernier = Date.now();
        enCours = null;
        journal.push(e.data.etat);
        if (journal.length > 60) journal.shift();
        if (incident) { incident.repriseLe = new Date(dernier).toISOString(); ecrire({ ...incident }); recent = incident; recentJusqua = dernier + 3e4; incident = null; }
      };
      setInterval(() => {
        const maintenant = Date.now();
        if (maintenant - tour > 3000) dernier = maintenant; // le worker était lui-même suspendu (veille) : pas un blocage
        tour = maintenant;
        if (incident || !journal.length || maintenant - dernier < ${BOITE.seuilMs}) return;
        incident = { figeeVueLe: new Date(maintenant).toISOString(), dernierSigneDeVie: new Date(dernier).toISOString(), rappelEnCours: enCours, codeEnCours: codes[enCours] ?? null, codesRecents: Object.fromEntries([...new Set(sequence.map((r) => r.nom))].filter((nom) => nom in codes).map((nom) => [nom, codes[nom]])), derniersRappels: sequence.slice(), rappelsLongs: longs.slice(), repriseLe: null, journal: journal.slice() };
        ecrire({ ...incident });
      }, 1000);`;
    let worker = null;
    try {
      worker = new Worker(URL.createObjectURL(new Blob([code], { type: "text/javascript" })));
    } catch {}
    let dernierEnvoi = 0;
    const codesEnvoyes = new Set();
    const envoie = (message) => {
      try {
        worker?.postMessage(message);
      } catch {}
    };
    const lit = () => new Promise((resolve) => {
      try {
        const ouverture = indexedDB.open(BOITE.base, 1);
        ouverture.onupgradeneeded = () => ouverture.result.createObjectStore(BOITE.magasin);
        ouverture.onerror = () => resolve(null);
        ouverture.onsuccess = () => {
          const lecture = ouverture.result.transaction(BOITE.magasin).objectStore(BOITE.magasin).get(BOITE.cle);
          lecture.onsuccess = () => {
            ouverture.result.close();
            resolve(lecture.result ?? null);
          };
          lecture.onerror = () => resolve(null);
        };
      } catch {
        resolve(null);
      }
    });
    const marque = (incident) => {
      try {
        const ouverture = indexedDB.open(BOITE.base, 1);
        ouverture.onsuccess = () => {
          const tx = ouverture.result.transaction(BOITE.magasin, "readwrite");
          tx.objectStore(BOITE.magasin).put(incident, BOITE.cle);
          tx.oncomplete = () => ouverture.result.close();
        };
      } catch {}
    };
    return {
      // appelé à chaque battement : un état par seconde suffit, petit et sans donnée personnelle
      battement(cache, force = false) {
        const maintenant = Date.now();
        if (!worker || (!force && maintenant - dernierEnvoi < 1e3)) return;
        dernierEnvoi = maintenant;
        const derniere = apiLog.at(-1);
        envoie({ genre: "etat", etat: {
          t: stamp(),
          page: location.hash,
          ongletCache: cache,
          arrierePlan: fond.actif,
          ...stats,
          derniereRequete: derniere ? `${derniere.t} ${derniere.methode} ${derniere.chemin.split("?")[0]} ${derniere.statut}` : null,
          memoireMo: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null,
          // ce qui pourrait s'accumuler onglet caché et se rattraper d'un bloc au retour
          elements: document.getElementsByTagName("*").length,
          animationsCss: document.getAnimations ? document.getAnimations().length : null
        } });
        stats.mutations = 0;
        stats.remontages = 0;
        stats.pireMs = 0;
        stats.pireNom = "";
      },
      // juste avant chaque rappel rejoué onglet caché : si la page se fige dedans, la boîte noire saura lequel
      debut: (nom, type, callback) => {
        if (!worker) return;
        let code;
        if (callback && !codesEnvoyes.has(nom)) {
          codesEnvoyes.add(nom);
          code = String(callback).slice(0, 4e3);
        }
        envoie({ genre: "debut", nom, type, t: stamp(), code });
      },
      // un rappel du site qui a bloqué la page plus d'une seconde : son code (celui du site, pas une donnée du joueur)
      // est joint au rapport, pour savoir ce qu'il fait
      long: (rappel) => worker && envoie({ genre: "long", rappel }),
      lit,
      // au chargement : prévenir une fois qu'un rapport attend
      async annonce() {
        const incident = await lit();
        if (!incident || incident.annonce) return;
        toast(`Yuro Plus : la page s’est figée le ${new Date(incident.figeeVueLe).toLocaleString("fr-FR")}${incident.repriseLe ? " (elle a fini par repartir)" : ""}. Tape yuroDiag.boiteNoire() dans la console pour télécharger le rapport et me l’envoyer.`);
        marque({ ...incident, annonce: true });
      }
    };
  })();
  // yuroDiag.boiteNoire() : télécharge le rapport du dernier blocage (à lancer dans un NOUVEL onglet après avoir
  // fermé la page figée)
  window.yuroDiag.boiteNoire = () => {
    boiteNoire.lit().then((incident) => {
      if (!incident) return toast("Yuro Plus : la boîte noire est vide, aucun blocage enregistré.");
      toast(`Yuro Plus : rapport ${saveJson("yuro-boite-noire", { version: YURO_VERSION, ...incident })} téléchargé, tu peux me l’envoyer.`);
    });
    return "lecture de la boîte noire…";
  };
  boiteNoire.annonce();
  // Le navigateur sait mesurer toute image ou tâche anormalement longue, y compris hors de nos rejeux (retour au
  // premier plan, événements du site, calcul de la mise en page) et nommer les scripts en cause : « long animation
  // frame » (Chrome 123+), sinon « longtask » sans le détail. Rapport joint à la boîte noire au-delà d'une seconde.
  try {
    const types = PerformanceObserver.supportedEntryTypes ?? [];
    const type = types.includes("long-animation-frame") ? "long-animation-frame" : types.includes("longtask") ? "longtask" : null;
    if (type) {
      // le passage du code du site désigné par le navigateur (fichier + position) : relu depuis le fichier du site,
      // en lecture seule et normalement depuis le cache du navigateur, pour savoir ce qui a tourné si longtemps
      const fichiers = new Map();
      const extrait = async (script) => {
        try {
          const url = new URL(script.sourceURL, location.href);
          if (url.origin !== location.origin || !(script.sourceCharPosition >= 0)) return;
          if (!fichiers.has(url.href)) fichiers.set(url.href, originalFetch(url.href, { cache: "force-cache" }).then((reponse) => reponse.text()));
          const texte = await fichiers.get(url.href);
          const debut = script.sourceCharPosition;
          return texte.slice(Math.max(0, debut - 300), debut + 2500);
        } catch {}
      };
      new PerformanceObserver((liste) => {
        for (const mesure of liste.getEntries()) {
          if (mesure.duration < 1e3) continue;
          const fin = mesure.startTime + mesure.duration;
          const scripts = [...(mesure.scripts ?? [])].slice(0, 12);
          Promise.all(scripts.map(extrait)).then((extraits) => boiteNoire.long({
            t: stamp(),
            type: type === "longtask" ? "tâche longue (navigateur)" : "image longue (navigateur)",
            dureeMs: Math.round(mesure.duration),
            ilYAMs: Math.round(performance.now() - fin),
            miseEnPageMs: mesure.styleAndLayoutStart ? Math.round(fin - mesure.styleAndLayoutStart) : null,
            scripts: scripts.map((script, index) => ({
              declencheur: String(script.invoker ?? "").slice(0, 160),
              genre: script.invokerType,
              fonction: script.sourceFunctionName,
              fichier: String(script.sourceURL ?? "").split("?")[0].slice(-120),
              position: script.sourceCharPosition,
              dureeMs: Math.round(script.duration),
              miseEnPageForceeMs: Math.round(script.forcedStyleAndLayoutDuration ?? 0),
              code: extraits[index] ?? null
            }))
          }));
        }
      }).observe({ type, buffered: true });
    }
  } catch {}
  const nomRappel = (callback) => (callback.name || String(callback)).replace(/\s+/g, " ").slice(0, 160);
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
      timers.set(id, { at: Date.now() + (Number(delay) || 0), delai: Number(delay) || 0, callback, args });
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
    // Budget par battement (budgetMs) : au-delà, le reste attend le battement suivant, pour ne jamais enchaîner des
    // secondes de calcul d'un bloc. Chaque rappel est chronométré pour la boîte noire.
    const rejoue = (callback, args, cache, type) => {
      const debut = performance.now();
      if (cache) boiteNoire.debut(nomRappel(callback), type, callback);
      try {
        callback(...args);
      } catch {}
      const duree = performance.now() - debut;
      if (duree > stats.pireMs) {
        stats.pireMs = Math.round(duree);
        stats.pireNom = nomRappel(callback);
      }
      if (duree > 1e3) {
        boiteNoire.long({ t: stamp(), nom: callback.name || "(anonyme)", type, dureeMs: Math.round(duree), ongletCache: cache, code: String(callback).slice(0, 4e3) });
        if (cache) disjoncteur(nomRappel(callback));
      }
    };
    // Disjoncteur (boîte noire du 18/11 12:45 : avant que la page ne meure, le pilote des combats du site passait de
    // 0,1 s à plus d'1 s par coup, 5 fois en 3 minutes). Au-delà de disjoncteurNombre blocages de plus d'une seconde
    // en disjoncteurFenetreMs, onglet caché, l'arrière-plan est mis en pause pour cette page : le navigateur reprend la
    // main et met le jeu en sommeil comme sans le script, la page reste en vie. Pas mémorisé : rechargée, la page repart
    // avec l'arrière-plan (et allégée) ; yuroPlus.arrierePlan(true) le relance tout de suite.
    // Animations terminées à la place du navigateur (boîte noire du 18/11 15:49, cause du figeage trouvée) : un onglet
    // caché ne joue AUCUNE animation CSS, donc aucun « animationend » ; or le site retire ses effets de combat (≈ 170
    // par combat) à la fin de leur animation. Onglet caché, ils s'empilaient : 78 000 dans la page, et au retour le
    // navigateur les terminait tous d'un coup → page figée (et une image de 4,8 s déclenchée par onanimationend).
    // Onglet caché, on fait donc ce que ferait le navigateur visible : une animation dont la durée est écoulée
    // (mesurée depuis qu'on l'a vue) est menée à son terme, et le site reçoit son animationend / transitionend.
    // Les animations sans fin (en boucle) ne sont jamais touchées. Chaque animation n'est traitée qu'une fois.
    const animationsVues = new WeakMap();
    const animationsTraitees = new WeakSet();
    function termineAnimations(debutBattement) {
      if (!fond.actif || !isHidden() || !document.getAnimations) return;
      const maintenant = performance.now();
      for (const anim of document.getAnimations()) {
        if (performance.now() - debutBattement > reglages.budgetMs * 2) break; // le reste au battement suivant
        if (animationsTraitees.has(anim)) continue;
        let fin;
        try {
          fin = anim.effect?.getComputedTiming().endTime;
        } catch {}
        if (!Number.isFinite(fin)) continue; // en boucle : laissée au navigateur
        if (!animationsVues.has(anim)) animationsVues.set(anim, maintenant);
        if (maintenant - animationsVues.get(anim) < fin) continue;
        animationsTraitees.add(anim);
        stats.animationsTerminees++;
        const cible = anim.effect?.target;
        const secondes = fin / 1e3;
        const css = typeof CSSAnimation !== "undefined" && anim instanceof CSSAnimation;
        const transition = typeof CSSTransition !== "undefined" && anim instanceof CSSTransition;
        try {
          if (cible && css) {
            cible.dispatchEvent(new AnimationEvent("animationend", { bubbles: true, animationName: anim.animationName, elapsedTime: secondes, pseudoElement: anim.effect.pseudoElement ?? "" }));
          } else if (cible && transition) {
            cible.dispatchEvent(new TransitionEvent("transitionend", { bubbles: true, propertyName: anim.transitionProperty, elapsedTime: secondes, pseudoElement: anim.effect.pseudoElement ?? "" }));
          }
        } catch {}
        // élément retiré par le site : l'animation part avec lui ; resté en place : figé sur sa position finale
        try {
          if (cible && !cible.isConnected) anim.cancel();
          else anim.finish();
        } catch {}
        // animation JavaScript (element.animate) : finish() règle sa promesse « finished », mais son événement « finish »
        // (onfinish, souvent celui qui retire l'effet) n'est envoyé qu'au prochain rendu — jamais onglet caché (boîte
        // noire du 18/11 17:33 : 52 000 animations restées malgré 77 000 terminées). On l'envoie nous-mêmes.
        if (!css && !transition) {
          try {
            anim.dispatchEvent(new AnimationPlaybackEvent("finish", { currentTime: anim.currentTime, timelineTime: document.timeline?.currentTime ?? null }));
          } catch {}
        }
      }
    }
    // Pour la boîte noire, toutes les 10 s onglet caché : de quoi sont faites les animations encore en vie (genre, en
    // boucle ou non, déjà traitées par nous ou non, et les éléments/animations les plus fréquents)
    let detailA = 0;
    function decritAnimations() {
      if (!isHidden() || !document.getAnimations || Date.now() - detailA < 1e4) return;
      detailA = Date.now();
      const resume = { total: 0, css: 0, transitions: 0, javascript: 0, enBoucle: 0, dejaTraitees: 0, enPause: 0, enCours: 0, finies: 0 };
      const signatures = new Map();
      const parents = new Map();
      const plus = (carte, cle) => carte.set(cle, (carte.get(cle) ?? 0) + 1);
      const decrit = (el) => el ? `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${[...el.classList].slice(0, 3).map((c) => `.${c}`).join("")}` : "?";
      for (const anim of document.getAnimations()) {
        resume.total++;
        const css = typeof CSSAnimation !== "undefined" && anim instanceof CSSAnimation;
        const transition = typeof CSSTransition !== "undefined" && anim instanceof CSSTransition;
        if (css) resume.css++;
        else if (transition) resume.transitions++;
        else resume.javascript++;
        let fin;
        try {
          fin = anim.effect?.getComputedTiming().endTime;
        } catch {}
        if (!Number.isFinite(fin)) resume.enBoucle++;
        if (animationsTraitees.has(anim)) resume.dejaTraitees++;
        if (anim.playState === "paused") resume.enPause++;
        else if (anim.playState === "running") resume.enCours++;
        else if (anim.playState === "finished") resume.finies++;
        const cible = anim.effect?.target;
        plus(signatures, `${decrit(cible)}${anim.effect?.pseudoElement ?? ""} « ${css ? anim.animationName : transition ? anim.transitionProperty : anim.id || "js"} »${Number.isFinite(fin) ? ` ${Math.round(fin)} ms` : " en boucle"}`);
        plus(parents, decrit(cible?.parentElement));
      }
      const top = (carte) => [...carte].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([cle, n]) => `${n} × ${cle}`);
      stats.animationsDetail = { ...resume, plusFrequentes: top(signatures), parents: top(parents) };
    }
    const lents = [];
    function disjoncteur(nom) {
      const maintenant = Date.now();
      lents.push(maintenant);
      while (lents.length && maintenant - lents[0] > reglages.disjoncteurFenetreMs) lents.shift();
      if (!fond.actif || lents.length < reglages.disjoncteurNombre) return;
      fond.actif = false;
      stats.disjoncte = true;
      lents.length = 0;
      boiteNoire.debut("— arrière-plan mis en pause : jeu trop lent —", "disjoncteur");
      toast(`Yuro Plus : le jeu devenait très lent en arrière-plan (« ${nom.slice(0, 40)} » a bloqué la page plus d’une seconde ${reglages.disjoncteurNombre} fois), signe qu’elle risquait de se figer. J’ai mis l’arrière-plan en pause : recharge la page (F5) en revenant, elle repartira allégée avec l’arrière-plan.`);
    }
    let dernierCache = isHidden();
    tick.add(() => {
      const debut = performance.now();
      const cache = isHidden();
      if (cache !== dernierCache) {
        // l'instant précis du retour (ou du départ) : un état tout de suite, et un repère dans la suite des rappels
        boiteNoire.debut(cache ? "— passage en arrière-plan —" : "— retour au premier plan —", "onglet");
        boiteNoire.battement(cache, true);
        dernierCache = cache;
      }
      const horsBudget = () => performance.now() - debut > reglages.budgetMs;
      if (rafQueue.size) {
        const entries = [...rafQueue];
        rafQueue.clear();
        if (cache) {
          const stamp = performance.now();
          const reste = [];
          for (const [id, callback] of entries) {
            if (horsBudget()) reste.push([id, callback]);
            else rejoue(callback, [stamp], true, "animation");
          }
          if (reste.length) {
            const nouveaux = [...rafQueue];
            rafQueue.clear();
            for (const [id, callback] of [...reste, ...nouveaux]) rafQueue.set(id, callback);
          }
        } else {
          for (const [, callback] of entries) nativeRaf(callback);
        }
      }
      const now = Date.now();
      for (const [id, timer] of [...timers]) {
        if (timer.at > now) continue;
        if (horsBudget()) break;
        if (timer.every) timer.at = now + timer.every;
        else timers.delete(id);
        rejoue(timer.callback, timer.args, cache, timer.every ? `intervalle ${timer.every} ms` : `minuterie ${timer.delai} ms`);
      }
      termineAnimations(debut);
      decritAnimations();
      stats.rejeuMs = Math.round(performance.now() - debut);
      stats.minuteries = timers.size;
      stats.animations = rafQueue.size;
      boiteNoire.battement(cache);
    });
  }
  installFond();
  tick.add(() => {
    countHalloween();
    litRecapitulatif();
    mountToggles();
    majEclair();
    checkFarm();
    checkRejouer();
    checkTower();
    checkHalloween();
    checkSource();
    checkLot();
    checkOuvrir();
    finDesGratuits();
    checkDechire();
    checkPasser();
    checkRevele();
    checkPages();
    checkEncore();
  });
  // la chaîne d'ouverture a son propre battement rapide, actif seulement pendant une séance : réaction en ~100 ms à
  // chaque écran (le battement normal ci-dessus reste en secours et gère le journal des ouvertures manuelles)
  const tickOuverture = createTicker(100);
  // le chargement de la liste du marché profite du même battement rapide
  tickOuverture.add(chargeDoublons);
  tickOuverture.add(trieParPrix);
  // ---- yuroDiag.finCombat() : capture automatique de l'écran de fin de combat ----
  // L'écran de fin ne reste qu'une ou deux secondes quand le Replay auto du site est allumé : impossible d'y taper
  // yuroDiag.page() à temps. finCombat() attend le prochain écran de fin (ancien écran story-end-screen, ou tout bouton
  // « Recommencer / Rejouer / Affronter à nouveau / Combat suivant / Retour à la salle » qui apparaît), le photographie
  // dès qu'il s'affiche (fichier yuro-diag-fin), enregistre clics, changements de page et requêtes jusqu'à ce qu'il
  // disparaisse (la relance), puis télécharge ce second fichier (yuro-diag-relance). Diagnostic seul : ne clique rien.
  const FIN_SELECTEURS = 'section.story-end-screen, [class*="end-screen"], [class*="result-screen"], [class*="combat-end"], [data-farm-start], [data-infinity-start], [data-hw26-play]';
  const FIN_TEXTE = /recommencer|rejouer|affronter à nouveau|combat suivant|retour à la salle/i;
  const ecranDeFin = () => {
    for (const element of document.querySelectorAll(FIN_SELECTEURS)) {
      if (visible(element) && !element.closest("[data-yuro-auto], #yuro-plus-rares, #yuro-plus-boosters")) return element;
    }
    return [...document.querySelectorAll("button, a[role='button']")].find((bouton) => visible(bouton) && FIN_TEXTE.test(bouton.textContent ?? "") && !bouton.closest("[data-yuro-auto], [data-yuro-rares], #yuro-plus-rares, #yuro-plus-boosters")) ?? null;
  };
  let guetteFin = null;
  tickOuverture.add(() => {
    if (!guetteFin) return;
    const fin = ecranDeFin();
    const maintenant = Date.now();
    if (maintenant > guetteFin.jusqua) {
      guetteFin = null;
      const fichier = saveJson("yuro-diag-relance", snapshot(recording ? recording.lines.slice() : null));
      if (recording) stop();
      toast(`Yuro Plus : aucun écran de fin repéré pendant l’attente ; enregistrement ${fichier} téléchargé quand même, envoie-le-moi.`);
      return;
    }
    if (guetteFin.etape === "attend" && guetteFin.dejaLa) {
      // un écran de fin était déjà là au lancement : attendre qu'il parte pour guetter le SUIVANT
      if (!fin) guetteFin.dejaLa = false;
      return;
    }
    if (guetteFin.etape === "attend" && fin) {
      guetteFin.etape = "photo";
      guetteFin.vuA = maintenant;
      return;
    }
    if (guetteFin.etape === "photo" && maintenant - guetteFin.vuA >= 150) {
      guetteFin.etape = "relance";
      const fichier = saveJson("yuro-diag-fin", snapshot());
      toast(`Yuro Plus : écran de fin photographié (${fichier}). J’enregistre maintenant la relance…`);
      return;
    }
    if (guetteFin.etape === "relance" && !fin) {
      guetteFin.etape = "apres";
      guetteFin.partiA = maintenant;
      return;
    }
    if (guetteFin.etape === "apres" && maintenant - guetteFin.partiA >= 2e3) {
      guetteFin = null;
      const fichier = saveJson("yuro-diag-relance", snapshot(recording ? recording.lines.slice() : null));
      if (recording) stop();
      toast(`Yuro Plus : relance enregistrée (${fichier}). Envoie-moi les deux fichiers yuro-diag-fin et yuro-diag-relance.`);
    }
  });
  window.yuroDiag.finCombat = (minutes = 10) => {
    menu(minutes * 60 + 30);
    guetteFin = { etape: "attend", dejaLa: Boolean(ecranDeFin()), jusqua: Date.now() + minutes * 6e4 };
    return `j’attends le prochain écran de fin de combat (jusqu’à ${minutes} min) : joue normalement, les deux fichiers se téléchargeront tout seuls`;
  };
  tickOuverture.add(() => {
    if (!reglages.ouverture) return;
    litRecapitulatif();
    checkSource();
    checkLot();
    checkOuvrir();
    finDesGratuits();
    checkDechire();
    checkPasser();
    checkRevele();
    checkPages();
    checkEncore();
  });
  // Le site redessine le bandeau du combat à chaque tour, ce qui efface nos interrupteurs : les remonter dès la
  // mutation, avant le prochain affichage, pour qu'ils ne clignotent pas (le battement ci-dessus reste en secours).
  // Frein : si nos boutons sont recréés plus de remontagesMax fois en une seconde, c'est que le site les retire
  // aussitôt (il ne veut rien d'étranger dans son bandeau) et qu'on joue au ping-pong avec lui, de quoi figer la
  // page : on laisse alors le seul battement les remonter pendant 5 s.
  let fenetreRemontage = 0;
  let creationsAuDebut = 0;
  let freinJusqua = 0;
  new MutationObserver(() => {
    stats.mutations++;
    const maintenant = Date.now();
    if (maintenant < freinJusqua) return;
    if (maintenant - fenetreRemontage > 1e3) {
      fenetreRemontage = maintenant;
      creationsAuDebut = totalCreations;
    }
    mountToggles();
    if (totalCreations - creationsAuDebut > reglages.remontagesMax) freinJusqua = maintenant + 5e3;
  }).observe(document.body, { childList: true, subtree: true });
  window.yuroPlus = {
    version: YURO_VERSION,
    relances: 0,
    suivantes: 0,
    relancesHalloween: 0,
    serieHalloween: hwSerie,
    packs: bilanPacks,
    reglages,
    // yuroPlus.ouvertureAuto(true) : ouvrir les boosters gratuits et de quête en boucle (même effet que le bouton de
    // la boutique). Jamais mémorisé.
    ouvertureAuto(on = true) {
      allumeOuverture(on);
      repaintToggle("pk", reglages.ouverture);
      return reglages.ouverture ? "Ouverture auto activée : boosters gratuits puis de quête, jamais de ki" : "Ouverture auto coupée";
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
    // yuroPlus.ouvertureEclair(false) : rendre leurs animations au dialogue d'ouverture pendant Ouverture auto
    // (mémorisé ; par défaut elles sont raccourcies pour aller plus vite)
    // yuroPlus.doublons(true) : au marché (Vendre), ne montrer que les cartes à 2 exemplaires ou plus (même effet que
    // la puce « Doublons » ; pas mémorisé, éteint à chaque arrivée sur l'onglet Vendre)
    doublons(on = true) {
      reglages.doublons = Boolean(on);
      majDoublons();
      return reglages.doublons ? "marché : seuls les doublons (×2 ou plus) sont affichés" : "marché : toutes les cartes sont affichées";
    },
    // yuroPlus.triPrix(true) : au marché (Vendre), trier par prix en ligne décroissant (même effet que la puce)
    triPrix(on = true) {
      reglages.triPrix = Boolean(on);
      majDoublons();
      trieParPrix();
      return reglages.triPrix ? `marché : tri par prix en ligne (${marche.source ? `${marche.annonces} annonces lues` : "liste du marché pas encore reçue, tri par cote"})` : "marché : ordre du site";
    },
    ouvertureEclair(on = true) {
      reglages.eclair = Boolean(on);
      writeSetting("ouvertureEclair", reglages.eclair);
      majEclair();
      return reglages.eclair ? "mode éclair activé : animations du dialogue raccourcies pendant Ouverture auto" : "mode éclair coupé : le dialogue garde ses animations normales";
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
