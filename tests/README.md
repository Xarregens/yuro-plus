# Tests (navigateur simulé)

Mêmes prérequis que le dépôt kyara-plus : Node 18+, `npm install playwright`, `npx playwright install chromium`.

Lancer depuis ce dossier : `node yuro.cjs ../yuroPlus.user.js`

| Script | Ce qu'il vérifie |
| --- | --- |
| `yuro.cjs` | Commandes `yuroDiag` : requêtes notées en continu (masquage des e-mails et clés sensibles), enregistrement des clics et mutations, photo immédiate, WebSocket notée, téléchargement. |
