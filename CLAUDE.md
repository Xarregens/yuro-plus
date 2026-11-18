# Yuro Plus — notes pour Claude Code

Un seul programme : `yuroPlus.user.js`, userscript Tampermonkey pour le jeu yurocollection.fr. Le propriétaire
(Xarregens) n'est pas développeur : parler simplement, livrer des versions complètes, tester avant d'envoyer, ne jamais
toucher au vrai site autrement qu'en lecture. Même façon de travailler que le dépôt frère `kyara-plus` (Kyara Plus).

- Ce que fait le script (0.11.x) : relance immédiate du replay auto en farm (`createWatcher`), « Suivant auto » dans le
  Château de l'infini et « Rejouer auto » en Halloween (interrupteurs du script montés dans le bandeau par
  `mountToggle`, remontés sur mutation pour ne pas clignoter), série V · D · bonbons en Halloween, « Ouverture
  auto » des boosters gratuits et de quête + journal des cartes rares (panneau « ✦ Rares » sur le site, ouvert tout
  seul en fin de séance), et maintien du jeu quand l'onglet est caché (`installFond`). Réglages dans l'objet `reglages`,
  mémorisés sous `yuro-plus:settings` (sauf `ouverture`, jamais mémorisé) ; commandes console `yuroPlus.*`
  (relanceAuto, relanceRapide, suivantAuto, halloweenAuto, ouvertureAuto, ouvertureEclair, cartesRares,
  doublons, arrierePlan). Au marché (Vendre), puce « Doublons ».
- Toute connaissance du site vient des enregistrements `yuroDiag` (page(), menu(), download()) fournis par le
  propriétaire : pour un écran inconnu ou un bogue, demander un `yuroDiag.page()` pris au bon moment avant de coder.
  Le script ne clique que les boutons que le joueur cliquerait, jamais ceux qui dépensent, et ne forge aucune requête.
  (Pendant Halloween, « Citrouilles auto » faisait exception — bonbons dépensés à la demande du propriétaire ; depuis
  la 0.11.0, « Ouverture auto » n'ouvre QUE des boosters gratuits ou de quête, jamais payés en ki.)
- Version : `// @version` **et** `var YURO_VERSION`, à incrémenter à chaque publication. Garder `@updateURL` /
  `@downloadURL` vers ce dépôt. Publier = commit sur `main` (Tampermonkey met à jour depuis l'URL Raw).
- Vérifier : `node --check yuroPlus.user.js`, puis `cd tests && node yuro.cjs ../yuroPlus.user.js` (navigateur simulé,
  Playwright ; mêmes prérequis que kyara-plus/tests).
- Mode farm (enregistrements du 10/11/2026) : un combat part par `POST /api/save/story-start` `{mode:"farm", level,
  team, expectedRevision}` ; la sauvegarde `PUT /api/save` renvoie parfois `deferred` avec le combat suivant. Fin de
  combat : `section.story-end-screen.farm-end` avec `button[data-farm-start]` « ↻ Recommencer » et
  `button[data-story-map]` « Retour à la salle » ; toggle `button[data-combat-auto="replay"]`, classe `is-on` quand
  actif. L'écran de fin reste affiché quelques secondes entre deux combats même quand le replay auto fonctionne :
  ne pas relancer trop tôt (réglage `attenteMs`).
- Château de l'infini (enregistrements du 10/11/2026) : combat par `POST /api/tower` `{action:"start"|"finish", …}` ;
  fin de combat `section.story-end-screen` classe `won` ou `lost`, boutons `[data-infinity-replay]` « Rejouer »,
  `[data-infinity-start]` « Suivant » (désactivé par le site à la défaite), `[data-infinity-lobby]` « Retour au
  château » (aussi dans le bandeau : « Quitter le combat »). Le toggle « Suivant auto » est au script, pas au site.
- Halloween (enregistrements du 10/11/2026) : `POST /api/save/story-start` `{mode:"hw26", level:97xxxx, …}`. Replay
  auto du site ALLUMÉ → écran compact `section.story-end-screen.hw-end.hw-end-compact` sans aucun bouton (le site
  enchaîne seul : rien à cliquer, pas de secours possible). ÉTEINT → grand écran `hw-end` won/lost avec
  `[data-hw26-play]` « Affronter à nouveau », `[data-hw26-open]` « Ouvrir une citrouille » (DÉPENSE des bonbons, ne
  jamais cliquer) et `[data-hw26-back]`. Le bandeau du mode se reconnaît à l'eyebrow « HALLOWEEN ».
- Boosters `#boosters` (enregistrements du 18/11/2026 ; l'événement Halloween est fini, sa boutique `#hw26` a
  disparu) : section `#boosterShop` (`data-sel` = pack choisi ; jaquettes `.bv4-pack` « Ouvrir ici » — NE JAMAIS les
  cliquer), quantité `.bv4-seg [data-batch-count]` ×1/×5/×10, bouton `#bv4Open` dont `data-source` (et la classe
  `is-…`) dit ce qu'il dépense : `free` (« Gratuit », réserve qui se recharge toutes les 10 min), `quest` (« Récompense
  de quête »), `ki` (« Ouvrir ×10 · 1 000 ki »). Le site prend seul la source gratuite tant qu'il en reste et ajuste
  le lot à la réserve, puis BASCULE SUR LE KI. Puces `.bv4-pay [data-bv4-pay=free|quest|ki]` (seules les sources
  disponibles). Requête `POST /api/booster {packId, quantity, payment, expectedRevision}`. Gratuits et quêtes ne
  s'ouvrent que dans Multivers (100 ki le pack sinon ; prix des autres packs : Éclipse 1000, Shōnen/Shōjo/Isekai 500,
  Prestige en tokens). La section `#boosterPurchase` se redessine d'après son attribut `data-html` : notre encart
  `#yuro-plus-boosters` est monté JUSTE APRÈS elle, jamais dedans. Dialogue `#packDialog` (le même qu'à Halloween) :
  `#tearPack` → défilé, `#skipPackReview` « Tout passer » → récapitulatif (tuiles `.reveal-card.pack-summary-tile`,
  nom `.summary-card-top strong`, rareté `.summary-card-top span`, numéro `.summary-card-art span`, série
  `.summary-card-series`, étiquette `.summary-copy-tag` ; pastilles `.qol-pack-recap` dans `#revealHint` « 8 boosters
  · 40 cartes » ; 10 tuiles par page, pager `#packSummaryPager [data-summary-page]`) → `#openAnotherPack` « Ouvrir
  encore des boosters ↗ » qui ramène à la boutique ; `#reopenSamePack` « Rouvrir » (jamais cliqué : paiement
  inconnu). Le dialogue refermé perd son attribut `open` (une ouverture n'est « en cours » que si une étape est
  visible). Réponse de `POST /api/booster` : `freeBoosters`, `freeBoosterAt`, `questBoosters`, `referralBoosters`
  (parrainage, 3e source gratuite, jamais vue à l'écran : nom deviné), `ki`, `revision`. NOMS RÉELS (yuroDiag du 18/11
  14:45) : Gratuit = `data-source="free"` + `data-free-booster` ; Quêtes = `data-source="reward"`, classe `is-reward`,
  `data-quest-booster`, puce `data-bv4-pay="reward"` « Quêtes 9 », libellé « Récompense de quête » — alors que la
  requête dit `payment:"quest"` (bogue 0.11.0/0.11.1 : « reward » pas reconnu, le script refusait d'ouvrir) ; ki =
  `data-source="ki"` + `data-buy-booster`. Le site passe seul de Gratuit à Quêtes.
  « Ouverture auto » (`reglages.ouverture`, interrupteur id `pk`) : choisit une puce gratuite (`pucesGratuites`) si le
  bouton propose du ki OU reste grisé sur une source épuisée, choisit ×10, clique `#bv4Open` SEULEMENT si
  `sourceGratuite` (data-source ∈ free/quest(s)/referral(s) ou classe is-free/is-quest/is-referral, et jamais rien
  qui contienne « ki » ; vérifié par la contre-épreuve de `tests/boosters.cjs`), déchire, passe, lit les rares (pages
  tournées si les pastilles en annoncent plus), révèle une meilleure carte face cachée si besoin, revient à la
  boutique ; arrêt (`finDesGratuits`) quand le bouton propose du ki ou reste grisé ET qu'aucune puce gratuite ne
  reste. Le message d'arrêt (et la console) donne `etatBoutique()` : source du bouton, grisé ou non, puces présentes
  — de quoi diagnostiquer une source non reconnue. Journal des
  UR/LR/EX/TRS (`yuro-plus:cartes-rares`, 300 max) alimenté même en ouverture manuelle ; bilan `bilanPacks` /
  `yuroPlus.packs` ; vitesse : le booster `#tearPack` IGNORE les clics pendant son animation d'arrivée (~0,7 s) — un
  clic trop tôt coûtait les 5 s de `reessaiMs` (lenteur signalée le 18/11) ; le surveillant de déchirage a son propre
  délai `dechirerReessaiMs` (0,5 s, pas moins : un clic pendant l'animation pourrait la relancer) et 20 essais
  (`createWatcher` accepte `reessai` / `essais` par surveillant) ; ticker 100 ms (`ouvertureMs`) et « mode éclair » (`eclair`, mémorisé sous
  `ouvertureEclair`) qui raccourcit à 1 ms animations/transitions de `#packDialog` pendant la séance (jamais 0 ms).
  Panneau « ✦ Rares (N) » `#yuro-plus-rares`, ouvert seul en fin de séance s'il y a eu des rares.
- Arrière-plan : les vérifications battent dans un Web Worker (créé depuis un blob ; si le site ajoutait une CSP
  worker-src, retomber sur setInterval). `installFond` masque document.hidden/visibilityState, retient
  visibilitychange, et rejoue rAF + setTimeout/setInterval posés pendant que l'onglet est caché (ids ≥ 2e9 pour ne
  pas croiser les ids natifs). Réglage `fondActif`. Rejeu limité à `budgetMs` (100 ms) par battement, le reste
  attend le suivant.
- Page figée (signalée le 17/11/2026 après des modifs du site : fenêtre réduite pendant les combats auto, F5 sans
  effet, il faut un nouvel onglet = calcul sans fin sur le fil principal). Cause non établie. Garde-fous 0.9.2 :
  (1) boîte noire — la page envoie chaque seconde un petit état (`stats` : mutations, recréations de boutons, durée
  du rejeu, pire rappel, minuteries/animations en attente, dernière requête, mémoire) à un worker dédié, et le nom de
  chaque rappel rejoué onglet caché ; sans nouvelles depuis 8 s (et le worker lui-même pas suspendu), il écrit
  l'incident en IndexedDB `yuro-plus`/`boite-noire`, puis l'heure de reprise ; message au chargement suivant,
  `yuroDiag.boiteNoire()` télécharge le rapport ; (2) frein anti ping-pong : plus de `remontagesMax` (30) boutons
  recréés en 1 s par l'observateur de mutations → remontage sur mutation suspendu 5 s (si le site retire tout élément
  étranger de son bandeau, sans frein la page se fige : vérifié par `tests/boite.cjs`) ; (3) journal des requêtes en un
  seul passage, rien au-delà de 2 Mo.
  Première boîte noire réelle (18/11/2026, 0.10.1, fenêtre réduite en Story auto `#combat`) : page bloquée ~19 s
  (dernier signe de vie 07:10:21, reprise 07:10:40) dans un rappel du SITE nommé `run`, rejoué par notre arrière-plan
  (minuterie ou animation). Avant : tout normal — mémoire 57–70 Mo stable, 0 recréation de bouton (pas de ping-pong),
  notre rejeu ≤ 127 ms, `runStoryAuto` ~100–125 ms toutes les ~7 s (un combat), `scan` ~12–20 ms à chaque battement.
  Le blocage tombe à l'heure du combat suivant. Pistes non tranchées : combat du site qui ne finit pas (« ils se
  regardent ») résolu d'un bloc, ou boucle de rattrapage. 0.10.2 : le rapport joint la suite des 20 derniers rappels
  rejoués (nom, type « animation » / « minuterie N ms » / « intervalle N ms ») et le CODE de tout rappel ayant bloqué
  plus d'une seconde (`rappelsLongs`, code du site, 4000 caractères).
  Précision du propriétaire : le blocage est apparu QUAND IL EST REVENU sur la fenêtre réduite (F5 sans effet tant que
  ça dure, puis la page revient seule). `run` n'était donc peut-être que le dernier rappel rejoué avant le retour ;
  piste privilégiée : rattrapage au retour au premier plan (travail d'affichage ou du site accumulé onglet caché).
  0.10.3 : repère « — retour au premier plan — » / « — passage en arrière-plan — » dans `derniersRappels` avec un état
  immédiat ; états enrichis de `elements` (nœuds de la page) et `animationsCss` (document.getAnimations) pour voir une
  accumulation ; mesure du navigateur (PerformanceObserver « long-animation-frame », sinon « longtask ») de toute
  image/tâche > 1 s, même hors de notre rejeu : scripts en cause (déclencheur, fonction, fichier, position, part de
  mise en page) et passage de code relu dans le fichier du site (lecture seule, cache) ; l'incident tout juste repris
  reste ouvert 30 s dans le worker pour recevoir ces mesures qui arrivent après coup.
  Deuxième boîte noire (18/11 12:45, encore en 0.10.2) : blocage DÉFINITIF (aucune reprise) PENDANT que l'onglet était
  caché, dans `scan` (fonction du site lancée par requestAnimationFrame, rejouée par nous). Page bien plus lourde que
  la 1re fois : mémoire 102–134 Mo (contre 57–70), `scan` 54–109 ms (contre 12–20), `runStoryAuto` 0,6–1,3 s (contre
  0,1), > 1 s cinq fois dans les 3 min d'avant. Code de `runStoryAuto` lu : le site a désormais SA propre pause onglet
  inactif (`globalThis.yuroTabInactive` → return) et un `globalThis.yuroMarketBusy` ; il pilote un coup par appel
  (`performStoryAction`) puis se reprogramme (scheduleStoryAuto). Cause de l'alourdissement non établie (accumulation
  onglet caché ? les `elements`/`animationsCss` de la 0.10.3 le diront).
  0.10.4 : (1) code de chaque fonction rejouée envoyé au worker dès son PREMIER lancement (une fonction qui ne rend
  jamais la main est ainsi décrite : `codeEnCours`, `codesRecents`) ; (2) disjoncteur — `disjoncteurNombre` (3)
  rappels rejoués onglet caché de plus d'1 s en `disjoncteurFenetreMs` (3 min) → `fond.actif = false` pour cette page
  (non mémorisé, le navigateur endort le jeu comme sans script, la page reste en vie), message conseillant F5 au
  retour ; `yuroPlus.arrierePlan(true)` relance. Sur le cas du 18/11 il aurait sauté ~1 min 30 avant la mort.
  CAUSE TROUVÉE (3e boîte noire, 18/11 15:49, 0.10.4) : `elements` ≈ 79 000 et `animationsCss` ≈ 78 000 dans la page,
  +≈170 à chaque combat (à chaque `runStoryAuto`). Un onglet caché ne joue aucune animation CSS, donc jamais
  d'`animationend` ; or le site retire ses effets de combat à la fin de leur animation (écouteurs animationend, dont
  `#document.onanimationend` déjà vu dans une image longue de 4,8 s). Ils s'empilaient tant que notre arrière-plan
  faisait combattre onglet caché, et au retour au premier plan le navigateur terminait les 78 000 d'un coup → page
  figée. Correctif 0.11.4 (`termineAnimations`, dans le battement d'`installFond`, onglet caché + `fond.actif`
  seulement) : toute animation de durée finie (`effect.getComputedTiming().endTime`) écoulée depuis qu'on l'a vue est
  menée à son terme comme le ferait le navigateur visible — `animationend` (CSSAnimation) ou `transitionend`
  (CSSTransition) envoyé à sa cible, puis `cancel()` si le site a retiré l'élément, sinon `finish()` (état final) ;
  chaque animation une seule fois (WeakSet), animations en boucle jamais touchées, budget 2× `budgetMs` par battement ;
  compteur `stats.animationsTerminees` dans la boîte noire. Test `tests/animations.cjs` (la 0.11.3 y échoue : 300
  effets restent). Le site a aussi sa propre pause onglet inactif (`yuroTabInactive`), que notre arrière-plan
  contourne volontairement.
- Marché `#market`, onglet « Vendre » (yuroDiag du 17/11/2026) : `#marketWorkspace`, grille `.mkx-own-grid` de
  `button.mkx-own[data-market-sell=id]` (nom `.mkx-own-copy strong`, pastille `.mkx-own-art em` « ×N » = exemplaires
  possédés, confirmé ; le site réserve le dernier exemplaire, donc doublon = ×2+), puces de rareté `.mkx-chips
  [data-market-sell-rarity]` (Toutes/Commun/Rare/Épique/Légendaire/Mythique/Secret = C…LR), 24 cartes à la fois puis
  « Afficher plus de cartes » `[data-market-more]` (aucune requête : la collection est déjà dans la page), panneau de la
  carte choisie `.mkx-chosen` (« 2 exemplaires · 1 sera réservé »), formulaire `#marketSellForm` (ne jamais y toucher).
  Onglet actif lisible sur `section.market-page[data-mkx="sell"|"buy"|…]` : Acheter / Échanges ont AUSSI des puces
  de rareté et un `[data-market-more]`, n'agir que sous `data-mkx="sell"` (`zoneVente`, bogue de la 0.10.0).
  Puce « 双 Doublons » du script (`majDoublons`, réglage `doublons` mémorisé sous `marcheDoublons`) : masque les ×1 par
  une feuille de style + attribut `data-yuro-filtre-doublons` sur `<html>` (survit aux redessins), et clique « Afficher
  plus » jusqu'au bout (`chargeDoublons` : plusieurs clics d'affilée tant que le site ajoute les cartes aussitôt, 120 ms
  max par battement ; arrêt après 3 clics sans nouvelle carte). Anti-clignotement (0.10.1) : une seule puce gardée
  pour la séance et remise en place telle quelle, sans animation ni transition, chiffres à largeur fixe.
- Combats après les modifs du site (17/11/2026) : apparition de `POST /api/save/combat` `{op:"hold"|"release",
  kind:"raid"}` (verrou de raid). Écrans de fin farm/château/Halloween non recapturés depuis : à vérifier si le
  propriétaire signale un bouton du script qui ne marche plus.
  18/11 : le propriétaire signale qu'en combat le « Replay auto » du site met 1–2 s à relancer — notre relance rapide
  (0,6 s, `checkFarm`) ne se déclenche donc vraisemblablement plus (écran de fin renommé ?). Aucune capture de l'écran
  de fin depuis les modifs ; il ne reste qu'1–2 s, trop court pour `yuroDiag.page()`. 0.11.5 : `yuroDiag.finCombat(min)`
  (diagnostic seul, ne clique rien) attend le PROCHAIN écran de fin (anciens sélecteurs, ou tout bouton
  Recommencer / Rejouer / Affronter à nouveau / Combat suivant / Retour à la salle hors boutons du script ; un écran
  déjà affiché au lancement est ignoré), le photographie 150 ms après son apparition (`yuro-diag-fin-*.json`), puis
  enregistre jusqu'à 2 s après sa disparition (`yuro-diag-relance-*.json`, avec mutations et requêtes). Test
  `tests/fincombat.cjs`. À recoder dès réception : `checkFarm` (et château/Halloween si renommés).
- Le script note en permanence (mémoire glissante) les requêtes fetch/XHR du site et sa WebSocket, e-mails et clés
  sensibles masqués ; ne jamais enregistrer de jeton en clair dans un fichier téléchargé.
