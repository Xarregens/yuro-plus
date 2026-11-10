# Yuro Plus

Userscript pour [yurocollection.fr](https://yurocollection.fr) (Tampermonkey / Violentmonkey), par Xarregens.
En mode farm, quand « Replay auto » est activé, le script clique « ↻ Recommencer » dès la fin du combat, comme tu
l'aurais fait, au lieu d'attendre la relance plus lente du site, et rattrape ainsi aussi les combats qui ne repartent
pas tout seuls. Il ne touche à rien d'autre : toggle éteint ou combat en cours, il ne fait rien.

Dans le **Château de l'infini**, un bouton « ⟳ Suivant auto » (ajouté par le script dans le bandeau du combat) lance la
chambre suivante dès la victoire ; jamais après une défaite.

En **Halloween**, un bouton « ⟳ Rejouer auto » (éteint par défaut) relance le combat dès la victoire quand le
« Replay auto » du site est éteint ; il ne touche jamais à la citrouille ni aux défaites. Une « Série V · D ·
bonbons » maison s'affiche dans le bandeau pendant l'enchaînement, remise à zéro à chaque allumage.

## Installation

1. Installer l'extension Tampermonkey.
2. Cliquer ici : **[Installer yuroPlus.user.js](https://raw.githubusercontent.com/xarregens/yuro-plus/main/yuroPlus.user.js)** —
   Tampermonkey ouvre sa fenêtre d'installation.
3. Recharger yurocollection.fr.

Les mises à jour sont automatiques (menu Tampermonkey → *Vérifier les mises à jour* pour forcer).

## Commandes console (F12 → Console)

| Commande | Effet |
| --- | --- |
| `yuroDiag.page()` | Photographie la page et les derniers échanges avec le serveur, à l'instant même (à lancer pendant un blocage). |
| `yuroDiag.menu(60)` | Enregistre en plus les clics et changements de page pendant 60 s. |
| `yuroDiag.download()` | Sauvegarde le tout dans un fichier (e-mails et clés sensibles masqués). |
| `yuroPlus.relanceAuto(false)` | Coupe la relance automatique (mémorisé) ; `yuroPlus.relanceAuto(true)` la remet. |
| `yuroPlus.relanceRapide(false)` | Plus de clic immédiat : le site relance lui-même, le script n'intervient qu'après 12 s de blocage (mémorisé). |
| `yuroPlus.suivantAuto(false)` | Château de l'infini : ne plus lancer la chambre suivante (même effet que le bouton du bandeau). |
| `yuroPlus.halloweenAuto(true)` | Halloween : relancer le combat à la victoire (même effet que le bouton du bandeau). |
| `yuroPlus.relances` | Nombre de combats relancés depuis le chargement de la page. |

## Historique des versions

Voir `CHANGELOG.md`.
