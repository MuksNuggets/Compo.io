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

Cette règle a été enfreinte **une fois, volontairement**, au jour 2 : la
première semaine de rugby ouvrait sur le XV du Leinster 2026 et celui de
Clermont 2017, injouables pour commencer. Elle ouvre maintenant sur Toulouse
2024, la France de 2011 et Toulouse 2026. C'était possible sans dégât parce
qu'il n'y avait presque pas d'historique ; passé quelques semaines, ça ne le
sera plus.

Au passage, deux jours de suite ne tombent plus sur la même équipe — sauf un
cas en football, aux jours 108 et 109, que l'échange ne pouvait pas dénouer.

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

# Les deux onglets

**Aujourd'hui** — les deux compos du jour, une par sport. Chaque carte tient en
trois niveaux de lecture et pas un de plus : le sport, l'affiche du match, puis
ce qu'il y a à faire. L'ancienne carte disait trois fois la même chose —
« jour n° 7 », « Finale de la Coupe du monde, 1998 », « compo à retrouver » —
et se lisait d'autant moins bien.

**Toutes les finales** — rangées par sport, puis par compétition (Coupe du
monde, Euro, Ligue des champions ; Coupe du monde, Coupe d'Europe, Top 14),
puis par année, de la plus récente à la plus ancienne. On vient y chercher un
match précis, pas « ce qui est tombé le 12 » : c'est pour ça que la liste
chronologique des jours passés a disparu, elle rangeait les mêmes finales dans
un ordre dont personne n'a l'usage. Ces parties sont hors classement — le
serveur n'accepte qu'une partie classée par jour et par sport, celle du jour
même.

Le profil reste derrière le portrait, en haut à droite : pseudo, chiffres par
sport, **code de reprise**, et le tableau de bord pour le propriétaire.

## Les équipes : noms courts, drapeaux, couleurs

**Pas de blasons de clubs.** Ce sont des marques déposées, et les poser sur un
site publié n'est pas une question technique.

**Un drapeau ne se dessine que là où il en existe un.** Une nation porte le
sien, peint en CSS — ni image, ni emoji : un emoji de drapeau est
rectangulaire, se recadre mal en rond, et sur Windows ne s'affiche pas du tout.
Un dégradé coûte une ligne et s'affiche partout pareil. Quelques-uns sont des
simplifications assumées : l'Afrique du Sud est en vert et or, ses couleurs de
maillot, plutôt qu'en six couleurs illisibles dans 22 pixels.

Un club, lui, n'a pas de drapeau et n'en reçoit pas d'inventé : il porte son
**nom court**, qui le désigne mieux que deux couleurs — Toulouse et Toulon
donnaient le même rond rouge et noir.

Les noms courts sont choisis pour tenir : *Stade français* est devenu
**Paris**, parce que ses quatorze signes se coupaient sur un petit écran — et
un nom court coupé ne sert plus à rien. `tools/test_onglets.js` vérifie
qu'aucun nom n'est tronqué, de 320 à 430 px.

Le sigle d'une nation occupe une largeur fixe. C'est ce qui met tous les
drapeaux sur la même colonne d'une ligne à l'autre, à gauche comme à droite ;
`tools/test_onglets.js` le vérifie.

Chaque équipe a un **nom court** : *Stade toulousain* → Toulouse, *Paris
Saint-Germain* → PSG, *Étoile rouge de Belgrade* → Étoile rouge. Et les
surnoms là où ils sont plus courts **et** plus parlants que le nom du pays :
All Blacks, Springboks, Wallabies. Pas *XV de France*, qui est plus long que
*France* et n'apporte rien.

Dans la liste des finales, chaque ligne se lit comme un **tableau
d'affichage** : l'année, puis les deux camps de part et d'autre du score, en
sigles — `1998 · FRA [3] [0] BRA`. Les deux côtés pèsent le même espace, et la
mention de prolongation se range sous l'année, et la colonne du résultat est
réservée même vide : les deux colonnes de bord sont de largeur fixe, sinon la
ligne se décalait dès qu'un résultat apparaissait, ce qui se voyait aussitôt à
côté des lignes voisines. Les nations portent les codes
internationaux, ceux des écrans de télé ; les clubs leur abréviation usuelle.

Les cartes du jour, elles, gardent les noms en toutes lettres : c'est la
proposition d'entrée, elle doit se lire sans décoder.

C'est ce qui fait tenir l'affiche sur une ligne — « Munster 16–13 Toulouse »
plutôt que « Munster 16–13 Stade toulousain » — et donc des cartes de 180 px
au lieu de 230. `tools/test_onglets.js` vérifie que les 67 équipes de la base
ont toutes leur entrée, sans quoi certaines garderaient leur nom long en
silence.

Un troisième onglet « joueur mystère » a existé une nuit : deviner un joueur
à partir d'indices dévoilés un à un. Retiré, pas assez bon. Il est dans
l'historique git si l'idée revient.

## Le code de reprise

Il n'y a ni compte ni mot de passe : le classement est tenu par un identifiant
tiré au hasard à la première visite et gardé sur l'appareil. Le code de reprise
*est* cet identifiant. Le recopier sur un autre téléphone y ramène le profil,
les scores et la série. C'est le prix du zéro inscription, et l'écran le dit.

Conséquence à connaître : qui possède le code possède le profil. Pour un jeu
entre amis c'est le bon compromis ; pour autre chose, il faudrait de vrais
comptes.

## Le tableau de bord du propriétaire

En haut du profil, et pour lui seul : nombre de joueurs, de parties, combien
sont revenus trois jours ou plus, puis par sport le taux de compos finies, la
part de noms trouvés, la durée moyenne et les indices consommés, et enfin les
quatorze derniers jours.

**La porte est au serveur, pas dans le navigateur.** Le code de reprise du
propriétaire est posé en secret Supabase, et c'est la fonction `compo` qui
compare :

```
supabase secrets set ADMIN_PLAYER_ID=<le code de reprise, vu dans le profil>
```

Tant que ce secret n'existe pas, l'action `stats` est fermée à tout le monde.
Pour un joueur ordinaire, la réponse est un 403 et le bloc reste vide : il n'y
a rien à cacher dans le navigateur, donc rien à contourner. `tools/test_parcours.js`
vérifie les deux côtés.

L'appel part à chaque ouverture du profil. C'est une requête de plus par visite
du profil, et elle se solde par un refus pour tout le monde sauf un.

## Mesure d'audience

GoatCounter, gratuit pour un usage non commercial, sans cookie — donc pas de
bandeau à afficher — et sans conservation d'adresse IP.

**Tant que la constante `GOATCOUNTER` est vide, rien n'est chargé et rien n'est
envoyé.** C'est ce qui garde les tests hors ligne. Pour activer : y mettre le
code du compte, par exemple `compoio`.

L'app ne recharge jamais la page : sans appels manuels, on ne verrait qu'une
seule vue par visiteur et rien de ce qu'il fait. On compte donc `/partie/foot`,
`/partie/rugby`, `/partie/<sport>/passee`, `/fini/<sport>/complet` ou
`/partiel`, `/profil` et `/partage`. Ces chemins sont en nombre fini et ne
portent jamais le pseudo ni quoi que ce soit qui vienne du joueur —
`tools/test_parcours.js` le vérifie, et vérifie aussi qu'aucune mesure ne part
chez un tiers tant que le code est vide.

`/fini/<sport>/complet` contre `/partiel` est le chiffre qui dit si le jeu est
trop dur.

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

Un nom à moitié tapé ne doit pas être validé sous les doigts : « heyman » a
déjà la clé phonétique de « heymans », et le S finissait dans une barre vide.
Tant que ce qui est tapé peut encore devenir un autre nom de la compo, on
attend — 700 ms sans frappe, ou Entrée.

## L'aide à l'orthographe

À partir de quatre lettres, une rangée de noms s'affiche au-dessus de la
saisie. Ils viennent de **toute la base** (1 683 noms de famille, toutes
finales confondues), **jamais de la compo du jour** : une suggestion ne dit
donc pas que le joueur est sur le terrain. Celui qui sait qui il cherche mais
pas comment ça s'écrit s'en sort ; celui qui ne sait pas reste devant la même
page blanche.

Trois nets, dans cet ordre : le nom de famille qui commence par ce qui est
tapé, puis celui qui le contient (« toit » → du Toit), puis — en dernier
recours seulement — la clé « à l'oreille », qui rattrape une faute dès le
début : « dech » → Deschamps, « sidan » → Zidane, « canté » → Kanté. En dernier
recours parce que cette clé est courte et ratisserait large si elle passait
avant.

On ne cherche **que** dans le nom de famille. Chercher aussi dans le prénom
donnait des résultats qui semblaient sortis de nulle part : « cle » proposait
Poitrenaud, parce qu'il s'appelle Clément — et la pastille, elle, n'affiche que
« Poitrenaud ».

C'est le point que `tools/test_parcours.js` surveille : la liste doit être
identique d'une compo à l'autre, et identique une fois la compo entièrement
trouvée. Si elle change, c'est qu'elle regarde le terrain.

# Tests

```
sh tools/site.sh site && (cd site && python3 -m http.server 8123 &)
node tools/test_app.js        # le jeu, le partage, les fichiers de l'app
node tools/test_onglets.js    # onglets, profil, toutes les finales
node tools/test_noms.js       # la reconnaissance des noms, sur toute la base
node tools/test_parcours.js   # une soirée entière, à la souris et au clavier
node tools/test_terrain.js    # la mise en page du terrain, 10 compos × 6 largeurs
```
`test_parcours.js` est le plus utile des quatre : il n'appelle aucune fonction
de l'intérieur, il clique et il tape. C'est lui qui attrape les erreurs de
branchement que les autres laissent passer. Le serveur du classement y est
simulé par interception de requête, donc rien ne part vers Supabase.
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
