# Tests (navigateur simulé)

Mêmes prérequis que le dépôt kyara-plus : Node 18+, `npm install playwright`, `npx playwright install chromium`.

Lancer depuis ce dossier : `node yuro.cjs ../yuroPlus.user.js`

| Script | Ce qu'il vérifie |
| --- | --- |
| `farm.cjs` | Relance du replay auto : clic « Recommencer » après le délai, rien si toggle OFF / replay normal / relance coupée, arrêt après 3 clics sans effet. |
| `yuro.cjs` | Commandes `yuroDiag` : requêtes notées en continu (masquage des e-mails et clés sensibles), enregistrement des clics et mutations, photo immédiate, WebSocket notée, téléchargement. |
