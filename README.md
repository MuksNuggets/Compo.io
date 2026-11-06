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

Les deux compos du jour restent hors de l'archive tant qu'elles n'ont pas été
jouées, pour qu'on ne puisse pas les répéter avant de les jouer pour de bon.

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

## Sources
- Coupe du monde 1990-2022 : Fjelstul World Cup Database (GitHub, CC BY-SA 4.0).
- Ligue des champions (14 finales entre 2004 et 2019), Euro 2020 et 2024 : StatsBomb Open Data (GitHub).
- Tout le reste : Wikipédia, via son API (code source des pages).
