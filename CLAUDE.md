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
- Le script note en permanence (mémoire glissante) les requêtes fetch/XHR du site et sa WebSocket, e-mails et clés
  sensibles masqués ; ne jamais enregistrer de jeton en clair dans un fichier téléchargé.
