# Changelog — Yuro Plus

## 0.5.0
- Halloween : nouveau bouton « ⟳ Rejouer auto » dans le bandeau (ajouté par le script, **éteint par défaut**, mémorisé).
  Allumé, il clique « ↻ Affronter à nouveau » dès la victoire — jamais « Ouvrir une citrouille », jamais après une
  défaite. À utiliser avec le « Replay auto » du site éteint : quand celui du site est allumé, son bandeau compact n'a
  aucun bouton et c'est lui qui enchaîne, le script ne touche à rien. `yuroPlus.halloweenAuto(true/false)` en console.

## 0.4.0
- Château de l'infini : nouveau bouton « ⟳ Suivant auto » dans le bandeau du combat (ajouté par le script, mémorisé,
  activé par défaut). À la victoire, la chambre suivante se lance toute seule ; jamais après une défaite (l'écran
  doit dire victoire et le bouton « Suivant » du site être actif). Mêmes garde-fous que le farm : nouvel essai si un
  clic reste sans effet, arrêt après 3 essais. `yuroPlus.suivantAuto(false)` en console a le même effet que le bouton,
  `yuroPlus.suivantes` compte les chambres lancées.

## 0.3.0
- Relance rapide, activée par défaut : quand « Replay auto » est sur ON, « ↻ Recommencer » est cliqué dès la fin du
  combat (0,6 s), sans attendre la relance plus lente du site, et sans message à chaque fois. Un clic resté sans effet
  est retenté, puis le script s'arrête après 3 essais en le disant. `yuroPlus.relanceRapide(false)` revient au
  comportement d'avant : le site relance lui-même, le script n'intervient qu'après 12 s de blocage (mémorisé).

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
