# Tests (navigateur simulé)

Mêmes prérequis que le dépôt kyara-plus : Node 18+, `npm install playwright`, `npx playwright install chromium`.

Lancer depuis ce dossier : `node yuro.cjs ../yuroPlus.user.js`

| Script | Ce qu'il vérifie |
| --- | --- |
| `farm.cjs` | Relance du farm : clic immédiat par défaut (sans message), retentatives puis arrêt, mode secours 12 s (`relanceRapide(false)`), rien si toggle OFF ou relance coupée, réglages mémorisés. |
| `tower.cjs` | Château de l'infini : bouton « Suivant auto » monté et mémorisé, chambre suivante à la victoire, rien à la défaite, compteur dédié. |
| `hw.cjs` | Halloween : « Rejouer auto » monté (éteint par défaut), « Affronter à nouveau » cliqué à la victoire une fois allumé, jamais la citrouille / la défaite / le bandeau compact, mémorisé ; bandeau redessiné sans clignotement ; série V · D · bonbons comptée et remise à zéro. |
| `citrouilles.cjs` | Boutique Halloween : « Citrouilles auto » (éteint par défaut, jamais mémorisé) enchaîne Ouvrir ×N → citrouille → « Tout passer » → « Ouvrir encore », tourne la page du récapitulatif quand des rares restent à lire, s'arrête quand le site désactive l'ouverture ; mode éclair posé pendant la séance et retiré après ; journal UR/LR/EX/TRS mémorisé, alimenté aussi en ouverture manuelle, panneau « ✦ Rares » ouvert en fin de séance et vidable ; jamais quantité / « Voir ma collection » / retour. |
| `fond.cjs` | Arrière-plan : onglet vu visible par le site, visibilitychange retenu, minuteries et animations rejouées par le worker, arrierePlan(false) mémorisé. |
| `yuro.cjs` | Commandes `yuroDiag` : requêtes notées en continu (masquage des e-mails et clés sensibles), enregistrement des clics et mutations, photo immédiate, WebSocket notée, téléchargement. |
