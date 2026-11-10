# Yuro Plus

Userscript pour [yurocollection.fr](https://yurocollection.fr) (Tampermonkey / Violentmonkey), par Xarregens.
En mode farm, quand « Replay auto » est activé mais que le combat ne repart pas tout seul, le script clique
« ↻ Recommencer » au bout de 12 secondes, comme tu l'aurais fait. Il ne touche à rien d'autre : toggle éteint,
replay normal ou combat en cours, il ne fait rien.

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
| `yuroPlus.relances` | Nombre de combats relancés depuis le chargement de la page. |

## Historique des versions

Voir `CHANGELOG.md`.
