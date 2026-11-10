# Yuro Plus

Userscript pour [yurocollection.fr](https://yurocollection.fr) (Tampermonkey / Violentmonkey), par Xarregens.
Objectif : relancer le « replay auto » du mode farm quand un combat ne repart pas tout seul.

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

## Historique des versions

Voir `CHANGELOG.md`.
