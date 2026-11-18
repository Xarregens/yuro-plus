# Yuro Plus — notes pour Claude Code

Un seul programme : `yuroPlus.user.js`, userscript Tampermonkey pour le jeu yurocollection.fr. Le propriétaire
(Xarregens) n'est pas développeur : parler simplement, livrer des versions complètes, tester avant d'envoyer, ne jamais
toucher au vrai site autrement qu'en lecture. Même façon de travailler que le dépôt frère `kyara-plus` (Kyara Plus).

- Ce que fait le script (0.10.x) : relance immédiate du replay auto en farm (`createWatcher`), « Suivant auto » dans le
  Château de l'infini et « Rejouer auto » en Halloween (interrupteurs du script montés dans le bandeau par
  `mountToggle`, remontés sur mutation pour ne pas clignoter), série V · D · bonbons en Halloween, « Citrouilles
  auto » + journal des cartes rares dans la boutique Halloween (panneau « ✦ Rares » sur le site, ouvert tout seul en
  fin de séance), et maintien du jeu quand l'onglet est caché (`installFond`). Réglages dans l'objet `reglages`,
  mémorisés sous `yuro-plus:settings` (sauf `citrouilles`, jamais mémorisé) ; commandes console `yuroPlus.*`
  (relanceAuto, relanceRapide, suivantAuto, halloweenAuto, citrouillesAuto, citrouillesEclair, cartesRares,
  doublons, arrierePlan). Au marché (Vendre), puce « Doublons ».
- Toute connaissance du site vient des enregistrements `yuroDiag` (page(), menu(), download()) fournis par le
  propriétaire : pour un écran inconnu ou un bogue, demander un `yuroDiag.page()` pris au bon moment avant de coder.
  Le script ne clique que les boutons que le joueur cliquerait, jamais ceux qui dépensent, et ne forge aucune requête.
  Unique exception, demandée par le propriétaire : « Citrouilles auto » (boutique Halloween) clique les boutons
  d'ouverture qui dépensent des bonbons — c'est son objet même ; en contrepartie il est toujours éteint au chargement.
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
- Boutique Halloween `#hw26` (enregistrements du 10/11/2026) : quantité `[data-hw26-qty]` ×1/×5/×10 (plafond du site :
  10) + stepper `[data-hw26-step]`, « Ouvrir ×N » `button.hw26-open-main` (débite N × 100 bonbons, le tirage se joue
  côté client : pas de requête dédiée, c'est `PUT /api/save` qui enregistre). S'ouvre alors `dialog#packDialog`
  (partagé avec les boosters classiques : n'agir que si `#tearPack` porte la classe `hw26-pack` ; ATTENTION, refermé
  il garde son attribut `open` en restant caché — une ouverture n'est « en cours » que si une étape est réellement
  visible, sinon le démarrage depuis la boutique ne part jamais, bogue de la 0.9.0) : citrouille
  `#tearPack` « OUVRE ! » → défilé carte par carte, sauté par `#skipPackReview` « Tout passer » → récapitulatif :
  tuiles `.reveal-card.pack-summary-tile` dans `#packCards` (nom `.summary-card-top strong`, code de rareté
  `.summary-card-top span` : C/R/SR/SSR/UR/LR/TRS, numéro `.summary-card-art span`, série `.summary-card-series`,
  étiquette `.summary-copy-tag` ; triées plus rares en premier, 10 par page, pager `#packSummaryPager
  [data-summary-page]`), pastilles de comptage `.qol-pack-recap` dans `#revealHint` (« 10 citrouilles · 50 cartes »),
  barre `.pack-actions` avec `#openAnotherPack` « Ouvrir encore ×N » qui reboucle sur la citrouille. La meilleure
  carte (tuile `big-pull-hidden`, classe `revealed` une fois retournée) doit être révélée d'un clic — le joueur le
  fait à chaque fois, le script aussi, et c'est là que nom et rareté deviennent sûrs dans la page. « Citrouilles
  auto » enchaîne ces clics ; le journal des UR/LR/EX/TRS (`yuro-plus:cartes-rares`, plafonné à 300) est alimenté même
  en ouverture manuelle ; arrêt automatique quand le site laisse l'ouverture désactivée plus de `patienceMs` (8 s :
  une désactivation brève pendant une animation ne compte pas). Vitesse : la chaîne
  bat sur son propre ticker 100 ms avec le délai `citrouillesMs` (100 ms, au lieu de `rapideMs`), et le « mode
  éclair » (`eclair`, mémorisé sous `citrouillesEclair`) raccourcit à 1 ms animations/transitions dans `#packDialog`
  seulement, pendant la séance seulement (jamais 0 ms : animationend/transitionend doivent continuer d'arriver au
  site). La lecture des rares reste garantie : `litRecapitulatif` attend que compte et tuiles soient affichés, et
  `recapLu` relit la page avant d'autoriser « Ouvrir encore ». Historique visible sur le site : bouton « ✦ Rares (N) »
  à côté de l'interrupteur, panneau `#yuro-plus-rares` (liste, vidage), ouvert automatiquement en fin de séance s'il y
  a eu des rares.
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
  reste ouvert 30 s dans le worker pour recevoir ces mesures qui arrivent après coup. Attendre ce rapport avant de
  corriger.
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
- Le script note en permanence (mémoire glissante) les requêtes fetch/XHR du site et sa WebSocket, e-mails et clés
  sensibles masqués ; ne jamais enregistrer de jeton en clair dans un fichier téléchargé.
