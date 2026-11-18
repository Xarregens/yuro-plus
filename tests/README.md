# Tests (navigateur simulé)

Mêmes prérequis que le dépôt kyara-plus : Node 18+, `npm install playwright`, `npx playwright install chromium`.

Lancer depuis ce dossier : `node yuro.cjs ../yuroPlus.user.js`

| Script | Ce qu'il vérifie |
| --- | --- |
| `farm.cjs` | Relance du farm : clic immédiat par défaut (sans message), retentatives puis arrêt, mode secours 12 s (`relanceRapide(false)`), rien si toggle OFF ou relance coupée, réglages mémorisés. |
| `tower.cjs` | Château de l'infini : bouton « Suivant auto » monté et mémorisé, chambre suivante à la victoire, rien à la défaite, compteur dédié. |
| `hw.cjs` | Halloween : « Rejouer auto » monté (éteint par défaut), « Affronter à nouveau » cliqué à la victoire une fois allumé, jamais la citrouille / la défaite / le bandeau compact, mémorisé ; bandeau redessiné sans clignotement ; série V · D · bonbons comptée et remise à zéro. |
| `citrouilles.cjs` | Boutique Halloween : « Citrouilles auto » (éteint par défaut, jamais mémorisé) enchaîne Ouvrir ×N → citrouille → « Tout passer » → « Ouvrir encore », tourne la page du récapitulatif quand des rares restent à lire, s'arrête quand le site désactive l'ouverture ; mode éclair posé pendant la séance et retiré après ; journal UR/LR/EX/TRS mémorisé, alimenté aussi en ouverture manuelle, panneau « ✦ Rares » ouvert en fin de séance et vidable ; jamais quantité / « Voir ma collection » / retour. |
| `marche.cjs` | Marché (Vendre) : puce « Doublons » montée après les puces de rareté (éteinte par défaut) ; allumée, masque les cartes à ×1, clique « Afficher plus » jusqu'au bout (300 cartes en moins d'une seconde), compte les doublons, survit au redessin du site sans manquer à une seule image (pas de clignotement), absente de l'onglet Acheter où rien n'est cliqué, mémorisée ; jamais de clic sur une carte ni sur « Publier ». |
| `boite.cjs` | Boîte noire : page figée 11 s pendant un rejeu onglet caché → rapport (rappel en cours, suite des derniers rappels avec leur type, code du rappel long, derniers états, heure de reprise) ; blocage au retour au premier plan hors de notre rejeu : retour daté, fonction, fichier et passage de code nommés par la mesure du navigateur ; code de la fonction en cours connu dès son lancement ; disjoncteur : au 3e blocage de plus d'une seconde onglet caché, arrière-plan en pause avec message (pas au 2e), relançable téléchargé par `yuroDiag.boiteNoire()`, message au chargement suivant une seule fois, aucune fausse alerte ; frein anti ping-pong quand le site retire nos boutons aussitôt ajoutés (contre-épreuve : sans frein, la page se fige). |
| `fond.cjs` | Arrière-plan : onglet vu visible par le site, visibilitychange retenu, minuteries et animations rejouées par le worker, arrierePlan(false) mémorisé. |
| `yuro.cjs` | Commandes `yuroDiag` : requêtes notées en continu (masquage des e-mails et clés sensibles), enregistrement des clics et mutations, photo immédiate, WebSocket notée, téléchargement. |
