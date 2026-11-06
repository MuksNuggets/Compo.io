"""Teste si l'ordre des noms dans les archives LNR permet de deduire les numeros.

Hypothese : la LNR ecrit a la mode de la presse francaise, de l'arriere vers les
piliers. Lue a l'envers, la liste donnerait 1,2,3,4,5,6,8,7,9..15 : le numero 8
est au milieu de la troisieme ligne, pas a la fin.

On ne verifie pas l'hypothese sur les finales qu'on veut ajouter (ce serait
circulaire) mais sur les 6 finales presentes a la fois dans data/lnr et dans
data/compos.json, dont les compos ont ete verifiees a la main ailleurs.
"""
import json, re, sys, unicodedata, pathlib

RACINE = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '.')


def sans_accent(s):
    s = unicodedata.normalize('NFD', s)
    return ''.join(c for c in s if unicodedata.category(c) != 'Mn')


def cle(nom):
    """Nom de famille, en minuscules, sans accent ni ponctuation."""
    n = sans_accent(nom).lower()
    n = re.sub(r"[.'’]", ' ', n)
    n = re.sub(r'[^a-z \-]', ' ', n)
    mots = [m for m in n.split() if len(m) > 1]
    return mots[-1] if mots else ''


def bloc_equipes(texte):
    i = texte.lower().find('les equipes')
    if i < 0:
        i = sans_accent(texte).lower().find('les equipes')
    if i < 0:
        return None
    fin = sans_accent(texte[i:]).lower().find('les points')
    return texte[i:i + (fin if fin > 0 else 2000)]


def lignes_equipes(bloc):
    """Rend [(nom d'equipe, ligne de noms)] : le site met l'equipe, puis ':',
    puis la liste sur la ou les lignes suivantes."""
    out, nom, buf = [], None, []
    for brut in bloc.splitlines()[1:]:
        l = brut.strip()
        if not l:
            continue
        if sans_accent(l).lower().startswith(('ent', 'remplac', 'les point', 'arbitr')):
            if nom and buf:
                out.append((nom, ' '.join(buf)))
            nom, buf = None, []
            continue
        if l.endswith(':'):
            if nom and buf:
                out.append((nom, ' '.join(buf)))
            nom, buf = l[:-1].strip(), []
        elif nom is not None:
            buf.append(l)
        else:                      # equipe ecrite seule, en majuscules (2009, 2010)
            if l.isupper() and len(l) < 40:
                nom = l
    if nom and buf:
        out.append((nom, ' '.join(buf)))
    return out


def noms(ligne):
    """Enleve les remplacants, les mentions (cap), les minutes, puis decoupe."""
    l = re.sub(r'\([^)]*\)', ' ', ligne)          # tout ce qui est entre parentheses
    l = re.sub(r'\b\d+\s*e?\b', ' ', l)           # minutes restees dehors
    l = re.sub(r'\bo\s*\)|\bm\s*\)', ' ', l)      # marqueurs d'ouvreur / demi de melee
    l = l.replace('‘', ' ').replace('’', "'")
    l = re.sub(r'\bet\b', ',', l)
    l = re.sub(r'[;–—]', ',', l)                  # tirets longs = separateurs surs
    l = re.sub(r'(?<=[a-zA-Zéèêàçï)])\s+-\s*(?=[A-Z])', ',', l)   # " - " entoure d'espaces
    l = re.sub(r'(?<=[a-zéèêàçï])-(?=[A-Z][a-zéèêàçï])', ',', l)  # "Candelon-Hume" sans espace
    l = l.replace('.', '. ')
    parts = [p.strip(' .,') for p in l.split(',')]
    return [p for p in parts if p and not p.isdigit()]


# -- l'hypothese -------------------------------------------------------------
def numeroter(liste15):
    """Liste ecrite par la LNR (15 -> 1) vers {numero: nom}."""
    env = list(reversed(liste15))                  # 1,2,3,4,5, puis 3e ligne, puis 9..15
    env[6], env[7] = env[7], env[6]                # le n°8 est au milieu de la 3e ligne
    return {i + 1: n for i, n in enumerate(env)}


# -- la confrontation --------------------------------------------------------
reference = {}
for m in json.load(open(RACINE / 'data/compos.json', encoding='utf-8')):
    if m.get('comp') == 'top14':
        reference[m['yr']] = {cle(t['name']): {p[0]: cle(p[3]) for p in t['p']} for t in m['teams']}

total = ok = 0
for f in sorted((RACINE / 'data/lnr').glob('*.txt')):
    an = int(f.stem)
    if an not in reference:
        continue
    bloc = bloc_equipes(f.read_text(encoding='utf-8', errors='replace'))
    if not bloc:
        print(f'{an} : pas de bloc'); continue
    equipes = lignes_equipes(bloc)
    attendu = reference[an]
    for nom, ligne in equipes:
        ns = noms(ligne)
        if len(ns) != 15:
            print(f'{an} {nom:<28} decoupage a {len(ns)} noms -> ecarte  {ns}')
            continue
        # a quelle equipe de compos.json ca correspond ? par recouvrement des noms
        mien = {cle(x) for x in ns}
        best, score = None, 0
        for k, v in attendu.items():
            s = len(mien & set(v.values()))
            if s > score:
                best, score = k, s
        if not best:
            print(f'{an} {nom} : aucune equipe correspondante'); continue
        att = attendu[best]
        num = numeroter(ns)
        bons = [n for n in range(1, 16) if cle(num[n]) == att.get(str(n), att.get(n))]
        total += 15; ok += len(bons)
        faux = [(n, num[n], att.get(str(n), att.get(n))) for n in range(1, 16)
                if cle(num[n]) != att.get(str(n), att.get(n))]
        etat = 'OK ' if not faux else 'ECART'
        print(f'{an} {best:<24} {etat} {len(bons)}/15' + ('' if not faux else f'  {faux}'))

print(f'\nTotal : {ok}/{total} numeros retrouves')
