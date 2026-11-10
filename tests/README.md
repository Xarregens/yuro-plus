# Tests (navigateur simulé)

Mêmes prérequis que le dépôt kyara-plus : Node 18+, `npm install playwright`, `npx playwright install chromium`.

Lancer depuis ce dossier : `node yuro.cjs ../yuroPlus.user.js`

| Script | Ce qu'il vérifie |
| --- | --- |
| `farm.cjs` | Relance du farm : clic immédiat par défaut (sans message), retentatives puis arrêt, mode secours 12 s (`relanceRapide(false)`), rien si toggle OFF ou relance coupée, réglages mémorisés. |
| `tower.cjs` | Château de l'infini : bouton « Suivant auto » monté et mémorisé, chambre suivante à la victoire, rien à la défaite, compteur dédié. |
| `yuro.cjs` | Commandes `yuroDiag` : requêtes notées en continu (masquage des e-mails et clés sensibles), enregistrement des clics et mutations, photo immédiate, WebSocket notée, téléchargement. |
