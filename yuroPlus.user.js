// ==UserScript==
// @name         Yuro Plus
// @namespace    https://github.com/xarregens/yuro-plus
// @version      0.7.0
// @description  Compagnon pour yurocollection.fr : relance immédiate du replay auto en farm, « Suivant auto » dans le Château de l'infini (chambre suivante lancée à la victoire) ; commandes d'enregistrement yuroDiag.
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
  const YURO_VERSION = "0.7.0";

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
    halloween: readSettings().halloweenAuto === true
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
  function createWatcher({ trouve, nomAction, raisonLente, compte }) {
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
      const due = attempts === 0 ? since + (reglages.rapide ? reglages.rapideMs : reglages.attenteMs) : lastClickAt + reglages.reessaiMs;
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
  // nos interrupteurs dans le bandeau du combat, même habillage que le « Replay auto » du site
  function repaintToggle(id, on) {
    const button = document.querySelector(`[data-yuro-auto="${id}"]`);
    if (!button) return;
    button.className = `btn ghost small combat-auto-btn${on ? " is-on" : ""}`;
    button.setAttribute("aria-pressed", String(on));
    button.querySelector("em").textContent = on ? "ON" : "OFF";
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
    tick.add(() => {
      if (!fond.actif || !isHidden()) return;
      if (rafQueue.size) {
        const callbacks = [...rafQueue.values()];
        rafQueue.clear();
        const stamp = performance.now();
        for (const callback of callbacks) {
          try {
            callback(stamp);
          } catch {}
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
    mountToggles();
    checkFarm();
    checkTower();
    checkHalloween();
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
    reglages,
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
