# Changelog — Yuro Plus

## 0.2.0
- La relance est là : en mode farm, si l'écran de fin de combat reste affiché plus de 12 s alors que « Replay auto »
  est activé, le script clique « ↻ Recommencer » à ta place, avec un petit message. Il réessaie au besoin, puis
  s'arrête après 3 clics sans effet en te demandant un `yuroDiag.page()`. Rien ne se passe si le toggle est éteint,
  si le replay normal fonctionne, ou pendant un combat. `yuroPlus.relanceAuto(false)` dans la console coupe la
  relance (mémorisé), `yuroPlus.relances` compte les combats relancés.

## 0.1.0
- Première version : pas encore de relance, uniquement les outils pour la construire. Le script note en permanence
  les derniers échanges avec le serveur (e-mails et clés sensibles masqués) et la connexion continue du jeu.
  Commandes console : `yuroDiag.page()` photographie la page et ces échanges à l'instant même (à lancer pendant un
  blocage), `yuroDiag.menu(60)` enregistre en plus les clics et changements de page pendant 60 s, `yuroDiag.download()`
  sauvegarde le tout.
