"""Construit l'ordre de passage des compos du jour, un par sport.

Regle a ne jamais enfreindre : une entree deja presente dans le fichier GARDE sa
place. Les finales ajoutees plus tard sont mises A LA FIN, jamais melangees au
reste. Sinon le numero du jour ne designe plus la meme compo d'un jour a l'autre
et l'historique des joueurs se decale.

    python tools/ordre_du_jour.py              # met a jour les deux fichiers
    python tools/ordre_du_jour.py --html index.html   # et les injecte dans l'app

Les deux fichiers sont nes du decoupage de l'ancien data/day_order.json, qui
melangeait les deux sports : chaque sport a garde l'ordre relatif qu'il y avait.
"""
import argparse, json, pathlib, random, re, sys

RACINE = pathlib.Path(__file__).resolve().parent.parent
SPORTS = ('foot', 'rugby')
GRAINE = 20261106          # fixe : deux executions donnent le meme resultat


def fichier(sport):
    return RACINE / f'data/day_order_{sport}.json'


def entrees_possibles(compos):
    """{sport: ["id:index d'equipe", ...]} pour tout ce qui est jouable."""
    out = {s: [] for s in SPORTS}
    for m in compos:
        if m['sport'] not in out:
            continue
        for i in range(len(m['teams'])):
            out[m['sport']].append(f"{m['id']}:{i}")
    return out


def maj(sport, possibles):
    """Ordre existant, purge de ce qui a disparu, complete a la fin."""
    f = fichier(sport)
    ancien = json.loads(f.read_text(encoding='utf-8')) if f.exists() else []
    connus = set(possibles)
    garde = [e for e in ancien if e in connus]          # l'ordre acquis ne bouge pas
    nouveaux = [e for e in possibles if e not in set(garde)]
    random.Random(GRAINE + len(garde)).shuffle(nouveaux)
    perdus = [e for e in ancien if e not in connus]
    return garde + nouveaux, len(nouveaux), perdus


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--html', default='', help="injecte les ordres dans ce fichier")
    args = ap.parse_args()

    compos = json.loads((RACINE / 'data/compos.json').read_text(encoding='utf-8'))
    possibles = entrees_possibles(compos)

    ordres = {}
    for s in SPORTS:
        ordre, ajoutes, perdus = maj(s, possibles[s])
        ordres[s] = ordre
        fichier(s).write_text(json.dumps(ordre, ensure_ascii=False, indent=0) + '\n', encoding='utf-8')
        print(f"{s:<6} {len(ordre):>3} compos" + (f"  (+{ajoutes} ajoutees en fin)" if ajoutes else "")
              + (f"  (-{len(perdus)} retirees : {perdus})" if perdus else ""))

    if args.html:
        p = pathlib.Path(args.html)
        html = p.read_text(encoding='utf-8')
        neuf = "const DAY_ORDER=" + json.dumps(ordres, ensure_ascii=False) + ";\n"
        html, n = re.subn(r"const DAY_ORDER=\{.*?\};\n", lambda _: neuf, html, count=1, flags=re.S)
        if not n:
            sys.exit("DAY_ORDER introuvable dans " + args.html)
        p.write_text(html, encoding='utf-8')
        print(f"Ordres injectes dans {args.html}")


if __name__ == '__main__':
    main()
