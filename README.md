# Compo.io

Le jeu tient dans `index.html` : un seul fichier, aucune dépendance à installer.
Pour y jouer en local, ouvre-le dans un navigateur, ou sers le dossier :
```
python -m http.server 8000
```
puis <http://localhost:8000>.

## Mise en ligne (GitHub Pages)

Une seule manipulation, à faire une fois, dans l’onglet **Settings → Pages** du dépôt :
choisir **Source : GitHub Actions**. Ensuite, chaque modification de `index.html`
poussée sur `main` republie le site toute seule, via `.github/workflows/pages.yml`.

L’adresse publique sera `https://muksnuggets.github.io/Compo.io/`.

Le workflow ne met en ligne que `index.html` (copié aussi en `404.html`, pour que
n’importe quelle adresse du site ouvre le jeu). Le pipeline de données et les
migrations Supabase restent dans le dépôt, hors du site publié.

# Compo du jour

Deux compos par jour : une de football, une de rugby. Chacune a son classement
et sa série de jours, et ne jouer qu'un sport ne pénalise pas dans l'autre.

L'ordre de passage vit dans `data/day_order_foot.json` et
`data/day_order_rugby.json`, reconstruits par :
```
python tools/ordre_du_jour.py --html index.html
```
**Une entrée déjà présente garde sa place.** Les finales ajoutées plus tard sont
mises à la fin, jamais mélangées au reste : sinon le numéro du jour ne désigne
plus la même compo et l'historique des joueurs se décale. L'outil s'en charge,
il suffit de ne pas réécrire ces fichiers à la main.

Aujourd'hui : 110 compos de football et 124 de rugby, donc pas de répétition
avant 110 jours côté foot.

L'app ne propose que ces deux compos : il n'y a pas de catalogue à parcourir.
Les 117 finales restent dans les données et alimentent le tirage, mais on n'y
accède pas librement, sinon la compo du jour ne serait qu'un bouton parmi 234.

Le classement est global : un par sport et par jour, tout le monde dedans. Il
n'y a ni compte ni code de groupe, seulement un pseudo gardé sur l'appareil.

## Polices

Barlow et Barlow Condensed sont servies par le site lui-même, depuis
`public/polices/` (110 Ko, licence SIL OFL 1.1 incluse). Plus de requête vers
Google : une dépendance de moins, et surtout **ce qui est testé est exactement
ce qui est livré** — tant que les polices venaient d'ailleurs, les captures de
test mentaient sur la mise en page réelle.

# Les trois onglets

**Compos** — les deux compos du jour, et un bouton vers *Les jours d'avant*,
qui rejoue n'importe quelle journée écoulée. Ces parties-là sont hors
classement : le serveur n'accepte qu'une partie classée par jour et par sport,
celle du jour même.

**Mystère** — un joueur tiré au hasard parmi les 680 qui ont disputé au moins
deux finales de la base. Chaque erreur dévoile un indice de plus : sport et
poste, nombre de finales, la première, l'équipe, les autres, l'initiale, le
prénom. Rien de nouveau n'est stocké : tout sort des 117 finales déjà là.
Filtrable par sport.

**Moi** — pseudo, chiffres par sport, et le **code de reprise**.

## Le code de reprise

Il n'y a ni compte ni mot de passe : le classement est tenu par un identifiant
tiré au hasard à la première visite et gardé sur l'appareil. Le code de reprise
*est* cet identifiant. Le recopier sur un autre téléphone y ramène le profil,
les scores et la série. C'est le prix du zéro inscription, et l'écran le dit.

Conséquence à connaître : qui possède le code possède le profil. Pour un jeu
entre amis c'est le bon compromis ; pour autre chose, il faudrait de vrais
comptes.

## Les noms mal écrits

Trois filets, du plus sûr au plus large : l'écriture exacte, une clé « à
l'oreille » qui écrase ce qui ne s'entend pas (ph/f, qu/k, h muet, lettres
doublées, consonne finale muette…), puis la distance d'édition avec une
tolérance qui suit la longueur de ce qui est tapé. Les deux premiers tournent à
chaque frappe, le troisième attend la touche Entrée.

`tools/test_noms.js` tape le nom de famille puis le nom complet des 3 299
joueurs de la base, chacun dans sa compo : **6 598 saisies, zéro non reconnue,
zéro qui tombe sur un autre joueur**. C'est ce second chiffre qui compte : une
tolérance trop large validerait le mauvais nom et fausserait une partie classée.

# Tests

```
sh tools/site.sh site && (cd site && python3 -m http.server 8123 &)
node tools/test_app.js        # le jeu, le partage, les fichiers de l'app
node tools/test_onglets.js    # onglets, profil, jours d'avant, mystère
node tools/test_noms.js       # la reconnaissance des noms, sur toute la base
```
Chacun sort en erreur si un contrôle échoue ou si la page lève une erreur JS.

# Pipeline de données

## Installation
```
pip install requests mwparserfromhell
```

## Étape 1 : mini-test (environ 2 minutes)
```
python build_compos.py --test
```
Ce test passe sur 3 pages Wikipédia représentatives :
- la finale de Ligue des champions 2023 ;
- la finale de Coupe d’Europe de rugby 2010 ;
- la finale du championnat de France de rugby 1995, sur le wiki français.

Le script affiche les compos lues, enregistre le résultat dans `data/test.json` et le code source brut des pages dans `data/raw/`.

Quand une page échoue, le script le signale dans `data/review.csv`. Il suffit alors de demander à Claude Code d’ouvrir `data/raw/<id>.wiki` et d’adapter le parseur à ce format.

## Étape 2 : lancement par compétition
```
python build_compos.py --only euro,ldc,cdm
python build_compos.py --only rwc,hcup
python build_compos.py --only top14
```
Chaque lancement s’ajoute à `data/compos.json` sans effacer le reste.

## Étape 3 : relecture puis injection dans l’app
1. Ouvre `data/review.csv` et corrige à la main les cas signalés dans `data/compos.json`.
2. Pour ajouter des surnoms, édite `aliases.json`, par exemple `{"Zinedine Zidane": ["zizou"]}`, puis relance.
3. Injecte les données dans l’app :
```
python build_compos.py --only cdm --html index.html
```

## Sources et attribution

L'app n'affiche plus ces mentions : l'attribution exigée par la licence
CC BY-SA 4.0 de la Fjelstul World Cup Database vit donc **ici**. Si le jeu
devait être publié ailleurs que dans ce dépôt, il faudrait l'y emporter.

- Coupe du monde 1990-2022 : Fjelstul World Cup Database (GitHub, CC BY-SA 4.0).
- Ligue des champions (14 finales entre 2004 et 2019), Euro 2020 et 2024 : StatsBomb Open Data (GitHub).
- Tout le reste : Wikipédia, via son API (code source des pages).
