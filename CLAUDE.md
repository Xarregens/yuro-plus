# Yuro Plus — notes pour Claude Code

Un seul programme : `yuroPlus.user.js`, userscript Tampermonkey pour le jeu yurocollection.fr. Le propriétaire
(Xarregens) n'est pas développeur : parler simplement, livrer des versions complètes, tester avant d'envoyer, ne jamais
toucher au vrai site autrement qu'en lecture. Même façon de travailler que le dépôt frère `kyara-plus` (Kyara Plus).

- Objectif : relancer le « replay auto » du mode farm quand un combat ne repart pas tout seul. Le site n'est pas encore
  connu : tout part des enregistrements `yuroDiag` (page(), menu(), download()) fournis par le propriétaire.
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
- Le script note en permanence (mémoire glissante) les requêtes fetch/XHR du site et sa WebSocket, e-mails et clés
  sensibles masqués ; ne jamais enregistrer de jeton en clair dans un fichier téléchargé.
