#!/usr/bin/env python3
"""
Compo.io : construit compos.json (titulaires des grandes finales) et l’injecte dans l’app.

Sources, de la plus propre à la moins propre :
  1. Fjelstul World Cup Database (GitHub)  -> Coupe du monde 1990-2022
  2. StatsBomb Open Data (GitHub)          -> 15 finales de LdC (2000-2019), Euro 2020 et 2024
  3. API Wikipédia (code source wikitext)  -> tout le reste

Usage :
  pip install requests mwparserfromhell
  python build_compos.py --test                 # 3 pages Wikipédia difficiles, détail + dumps
  python build_compos.py --only cdm,euro,ldc    # lancement par compétitions
  python build_compos.py                        # tout
  python build_compos.py --html index.html     # injecte les données dans l’app

Sorties : data/compos.json, data/review.csv (cas à relire), data/raw/*.wiki (sources brutes).
"""
import argparse, collections, csv, io, json, os, re, sys, time, unicodedata
import requests
import mwparserfromhell as mw

UA = {"User-Agent": "compo-io-builder/1.0 (projet perso, usage non commercial)"}
GH_FJ = "https://raw.githubusercontent.com/jfjelstul/worldcup/master/data-csv/"
GH_SB = "https://raw.githubusercontent.com/statsbomb/open-data/master/data/"
OUT = "data"

# ---------------------------------------------------------------- placement
# poste -> (libellé FR, groupe, x, y) ; y = 0 attaque, 100 but
POS = {'GK':('G','gk',50,90),'SW':('LIB','sw',50,83),'RB':('DD','rb',85,72),'RWB':('PD','rb',87,62),'CB':('DC','cb',50,77),
 'DF':('DEF','cb',50,77),'LB':('DG','lb',15,72),'LWB':('PG','lb',13,62),'DM':('MDC','dm',50,61),'CM':('MC','cm',50,52),
 'MF':('MIL','cm',50,52),'RM':('MD','rm',85,48),'LM':('MG','lm',15,48),'AM':('MOC','am',50,37),'SS':('SA','ss',50,30),
 'RW':('AD','rw',82,27),'RF':('AD','rw',78,24),'LW':('AG','lw',18,27),'LF':('AG','lw',22,24),'CF':('BU','cf',50,18),
 'ST':('BU','cf',50,18),'FW':('ATT','cf',50,18)}
SPREAD = {1:[0],2:[13,-13],3:[22,0,-22],4:[30,10,-10,-30]}   # 1er listé = côté droit
SB = {'Goalkeeper':('G',50,90),'Right Back':('DD',85,72),'Right Center Back':('DC',63,77),'Center Back':('DC',50,78),
 'Left Center Back':('DC',37,77),'Left Back':('DG',15,72),'Right Wing Back':('PD',87,62),'Left Wing Back':('PG',13,62),
 'Right Defensive Midfield':('MDC',63,61),'Center Defensive Midfield':('MDC',50,61),'Left Defensive Midfield':('MDC',37,61),
 'Right Midfield':('MD',85,48),'Right Center Midfield':('MC',64,52),'Center Midfield':('MC',50,52),'Left Center Midfield':('MC',36,52),
 'Left Midfield':('MG',15,48),'Right Wing':('AD',82,27),'Left Wing':('AG',18,27),'Right Attacking Midfield':('MOC',66,37),
 'Center Attacking Midfield':('MOC',50,37),'Left Attacking Midfield':('MOC',34,37),'Right Center Forward':('BU',62,19),
 'Center Forward':('BU',50,18),'Left Center Forward':('BU',38,19),'Secondary Striker':('SA',50,30)}
RPOS = [[30,18],[50,18],[70,18],[40,28],[60,28],[22,38],[78,38],[50,38],[50,49],[50,58],[12,73],[30,65],[70,65],[88,73],[50,82]]

def place_foot(rows):
    """rows : [(code, nom)] dans l’ordre de la feuille de match -> joueurs placés."""
    groups = collections.defaultdict(list)
    for code, name in rows:
        groups[POS.get(code, POS['MF'])[1]].append((code, name))
    out = []
    for g, rs in groups.items():
        offs = SPREAD.get(len(rs)) or [36 - 72*i/(len(rs)-1) for i in range(len(rs))]
        for (code, name), o in zip(rs, offs):
            lab, _, x, y = POS.get(code, POS['MF'])
            out.append([lab, round(x+o), y, name, []])
    return sorted(out, key=lambda p: -p[2])

def place_rugby(by_num):
    """by_num : {1..15: nom}"""
    return [[str(n), RPOS[n-1][0], RPOS[n-1][1], by_num[n], []] for n in range(1, 16)]

# ---------------------------------------------------------------- noms d’équipes
FR = {'West Germany':'RFA','Germany':'Allemagne','Argentina':'Argentine','Brazil':'Brésil','Italy':'Italie','France':'France',
 'Netherlands':'Pays-Bas','Spain':'Espagne','Croatia':'Croatie','England':'Angleterre','Portugal':'Portugal','Denmark':'Danemark',
 'Czech Republic':'Tchéquie','Greece':'Grèce','Belgium':'Belgique','Sweden':'Suède','South Africa':'Afrique du Sud',
 'New Zealand':'Nouvelle-Zélande','Australia':'Australie','Wales':'Pays de Galles','Ireland':'Irlande','Scotland':'Écosse',
 'Bayern Munich':'Bayern Munich','Inter Milan':'Inter Milan','AC Milan':'Milan','Barcelona':'FC Barcelone','Juventus':'Juventus'}
CODES = {'GER':'Germany','FRG':'West Germany','ARG':'Argentina','BRA':'Brazil','ITA':'Italy','FRA':'France','NED':'Netherlands',
 'ESP':'Spain','CRO':'Croatia','ENG':'England','POR':'Portugal','DEN':'Denmark','CZE':'Czech Republic','GRE':'Greece',
 'RSA':'South Africa','NZL':'New Zealand','AUS':'Australia','WAL':'Wales','IRL':'Ireland','SCO':'Scotland'}
fr = lambda n: FR.get(n, n)

# ---------------------------------------------------------------- manifeste
def manifest():
    M = []
    add = lambda **k: M.append(k)
    for y in range(1990, 2023, 4): add(id=f"cdm-{y}", comp='cdm', sport='foot', yr=y, src='fjelstul')
    add(id="cdm-2026", comp='cdm', sport='foot', yr=2026, src='wiki', lang='en', title="2026 FIFA World Cup final")
    for y in range(1992, 2017, 4): add(id=f"euro-{y}", comp='euro', sport='foot', yr=y, src='wiki', lang='en', title=f"UEFA Euro {y} final")
    add(id="euro-2020", comp='euro', sport='foot', yr=2021, src='statsbomb', comp_id=55, season=43)
    add(id="euro-2024", comp='euro', sport='foot', yr=2024, src='statsbomb', comp_id=55, season=282)
    sb_cl = {2000:76,2004:44,2005:37,2007:39,2009:41,2010:21,2011:22,2012:23,2013:24,2014:25,2015:26,2016:27,2017:2,2018:1,2019:4}
    for y in range(1991, 2027):
        if y in sb_cl: add(id=f"ldc-{y}", comp='ldc', sport='foot', yr=y, src='statsbomb', comp_id=16, season=sb_cl[y],
                             lang='en', title=f"{y} UEFA Champions League final")
        else: add(id=f"ldc-{y}", comp='ldc', sport='foot', yr=y, src='wiki', lang='en',
                  title=f"{y} European Cup final" if y <= 1992 else f"{y} UEFA Champions League final")
    for y in range(1991, 2024, 4): add(id=f"rwc-{y}", comp='rwc', sport='rugby', yr=y, src='wiki', lang='en', title=f"{y} Rugby World Cup final")
    for y in range(1996, 2027):
        add(id=f"hcup-{y}", comp='hcup', sport='rugby', yr=y, src='wiki', lang='en',
            title=f"{y} Heineken Cup final" if y <= 2014 else f"{y} European Rugby Champions Cup final")
    for y in range(1990, 2027):
        if y == 2020: continue   # saison arrêtée (Covid), pas de finale
        add(id=f"top14-{y}", comp='top14', sport='rugby', yr=y, src='wiki', lang='fr',
            title=f"Championnat de France de rugby à XV {y-1}-{y}", section='Finale')
    return M

COMP_LABEL = {'cdm':'Finale de la Coupe du monde','euro':'Finale de l’Euro','ldc':'Finale de la Ligue des champions',
              'rwc':'Finale de la Coupe du monde','hcup':'Finale de la Coupe d’Europe','top14':'Finale du championnat de France'}

# ---------------------------------------------------------------- utilitaires
REVIEW = []
def flag(mid, msg): REVIEW.append((mid, msg)); print(f"  ⚠ {mid}: {msg}")
_cache = {}
PAUSE = 1.0                      # Wikipédia limite le débit : une requête par seconde suffit
def get(url, **params):
    key = url + json.dumps(params, sort_keys=True)
    if key in _cache: return _cache[key]
    for essai in range(6):
        r = requests.get(url, params=params or None, headers=UA, timeout=30)
        if r.status_code in (429, 503):          # trop de requêtes : on attend et on réessaie
            attente = float(r.headers.get('Retry-After') or 0) or min(60, 3 * 2 ** essai)
            print(f"  … {r.status_code}, nouvelle tentative dans {attente:.0f} s")
            time.sleep(attente); continue
        r.raise_for_status()
        _cache[key] = r; time.sleep(PAUSE)
        return r
    r.raise_for_status()
    return r

def score_str(a, b, aet=False, pens=None):
    s = f"{a}–{b}"
    if pens: s += f" ({pens[0]}–{pens[1]} t.a.b.)"
    elif aet: s += " (a.p.)"
    return s

# ---------------------------------------------------------------- source 1 : Fjelstul
def from_fjelstul(items):
    ms = list(csv.DictReader(io.StringIO(get(GH_FJ + "matches.csv").text)))
    pa = list(csv.DictReader(io.StringIO(get(GH_FJ + "player_appearances.csv").text)))
    ma = list(csv.DictReader(io.StringIO(get(GH_FJ + "manager_appearances.csv").text)))
    out = []
    for it in items:
        m = next((m for m in ms if m['stage_name'] == 'final' and "Men's" in m['tournament_name'] and m['match_date'][:4] == str(it['yr'])), None)
        if not m: flag(it['id'], "finale introuvable dans Fjelstul"); continue
        h, a = m['home_team_name'], m['away_team_name']; hs, as_ = int(m['home_team_score']), int(m['away_team_score'])
        pens = None; home_win = m['home_team_win'] == '1'
        if m['penalty_shootout'] == '1':
            ph, pa_ = int(m['home_team_score_penalties']), int(m['away_team_score_penalties']); home_win = ph > pa_
            pens = (max(ph, pa_), min(ph, pa_))
        order = [(h, hs), (a, as_)] if home_win else [(a, as_), (h, hs)]
        teams = []
        for tn, _ in order:
            rows = sorted([r for r in pa if r['match_id'] == m['match_id'] and r['team_name'] == tn and r['starter'] == '1'],
                          key=lambda r: int(r['shirt_number']))
            names = [(r['position_code'], r['family_name'] if r['given_name'] == 'not applicable' else f"{r['given_name']} {r['family_name']}") for r in rows]
            eq = {'name': fr(tn), 'p': place_foot(names)}
            mg = next((g for g in ma if g['match_id'] == m['match_id'] and g['team_name'] == tn), None)
            if mg:
                eq['coach'] = (mg['family_name'] if mg['given_name'] == 'not applicable'
                               else f"{mg['given_name']} {mg['family_name']}", [])
            else: flag(it['id'], f"{tn} : selectionneur absent de Fjelstul")
            teams.append(eq)
        out.append(dict(it, a=fr(order[0][0]), b=fr(order[1][0]), score=score_str(order[0][1], order[1][1], m['extra_time'] == '1', pens), teams=teams))
    return out

# ---------------------------------------------------------------- source 2 : StatsBomb
def from_statsbomb(it):
    ms = get(GH_SB + f"matches/{it['comp_id']}/{it['season']}.json").json()
    m = next((m for m in ms if m['competition_stage']['name'] == 'Final'), None)
    if not m: flag(it['id'], "pas de finale dans cette saison StatsBomb"); return None
    ev = get(GH_SB + f"events/{m['match_id']}.json").json()
    lu = get(GH_SB + f"lineups/{m['match_id']}.json").json()
    nick = {p['player_id']: (p.get('player_nickname') or p['player_name']) for t in lu for p in t['lineup']}
    xi = {e['team']['name']: e['tactics']['lineup'] for e in ev if e['type']['name'] == 'Starting XI'}
    hs, as_ = m['home_score'], m['away_score']; h, a = m['home_team']['home_team_name'], m['away_team']['away_team_name']
    # tirs au but : déduits des événements de la période 5
    pk = collections.Counter(e['team']['name'] for e in ev if e.get('period') == 5 and e['type']['name'] == 'Shot'
                             and e['shot']['outcome']['name'] == 'Goal')
    aet = any(e.get('period') in (3, 4) for e in ev)
    home_win = hs > as_ or (hs == as_ and pk[h] > pk[a])
    order = [(h, hs), (a, as_)] if home_win else [(a, as_), (h, hs)]
    pens = (max(pk[h], pk[a]), min(pk[h], pk[a])) if pk else None
    coachs = {}
    for cote in ('home_team', 'away_team'):
        g = (m[cote].get('managers') or [None])[0]
        if g: coachs[m[cote][cote + '_name']] = g.get('nickname') or g['name']
    teams = []
    for tn, _ in order:
        pl = []
        for p in xi[tn]:
            lab, x, y = SB.get(p['position']['name'], ('MC', 50, 52))
            if p['position']['name'] not in SB: flag(it['id'], f"poste StatsBomb inconnu : {p['position']['name']}")
            pl.append([lab, x, y, nick[p['player']['id']], []])
        eq = {'name': fr(tn), 'p': sorted(pl, key=lambda q: -q[2])}
        if coachs.get(tn): eq['coach'] = (coachs[tn], [])
        else: flag(it['id'], f"{tn} : entraineur absent de StatsBomb")
        teams.append(eq)
    return dict(it, a=fr(order[0][0]), b=fr(order[1][0]), score=score_str(order[0][1], order[1][1], aet, pens), teams=teams)

# ---------------------------------------------------------------- source 3 : Wikipédia
def wiki_text(lang, title, mid):
    api = f"https://{lang}.wikipedia.org/w/api.php"
    j = get(api, action='parse', page=title, prop='wikitext', redirects=1, format='json', formatversion=2).json()
    if 'error' in j:
        s = get(api, action='query', list='search', srsearch=title, srlimit=1, format='json').json()['query']['search']
        if not s: flag(mid, f"page introuvable : {title}"); return None, None
        flag(mid, f"titre corrigé par recherche : {title} -> {s[0]['title']}")
        title = s[0]['title']
        j = get(api, action='parse', page=title, prop='wikitext', redirects=1, format='json', formatversion=2).json()
    os.makedirs(f"{OUT}/raw", exist_ok=True)
    open(f"{OUT}/raw/{mid}.wiki", 'w', encoding='utf-8').write(j['parse']['wikitext'])
    return j['parse']['wikitext'], title

def name_of(cell):
    """Extrait le nom d’un joueur d’une cellule wikitext."""
    code = mw.parse(cell)
    for t in code.filter_templates():
        tn = str(t.name).strip().lower()
        if tn in ('sortname', 'sort name'):
            first = str(t.get(1).value).strip() if t.has(1) else ''
            last = str(t.get(2).value).strip() if t.has(2) else ''
            return (f"{first} {last}").strip()
    for l in code.filter_wikilinks():
        tgt = str(l.title)
        if tgt.lower().startswith(('file:', 'fichier:', 'image:')): continue
        txt = str(l.text) if l.text else re.sub(r"\s*\(.*?\)\s*$", "", tgt)
        return txt.strip()
    t = code.strip_code().strip()
    return re.sub(r"\(c\)|\(capt?\.?\)|\(captain\)", "", t).strip()

ROW = re.compile(r"^\|\s*([A-Z0-9]{1,4})\s*\|\|\s*'*\s*([0-9]{1,2}|[A-O])\s*'*\s*\|\|(.*)$")
MARK = re.compile(r"^[|!]")                                   # repère = ligne de tableau, pas de prose
SUBS = re.compile(r"substitut|replacement|remplaçant", re.I)
STAFF = re.compile(r"manager|coach|entraîneur", re.I)
CELL = re.compile(r"^\|\s*colspan\s*=\s*\"?\d+\"?\s*\|(.*)$", re.I)
EFN = re.compile(r"\{\{\s*(?:efn|ref|refn|note|sfn)[^{}]*(?:\{\{[^{}]*\}\}[^{}]*)*\}\}", re.I)
REFTAG = re.compile(r"<ref[^>]*>.*?</ref>|<ref[^>]*/>", re.I | re.S)
# poste imprimé sur la ligne -> numéro de maillot correspondant
RUGBY_NUM = {'LP': 1, 'HK': 2, 'TP': 3, 'LL': 4, 'RL': 5, 'BF': 6, 'OF': 7, 'N8': 8,
             'SH': 9, 'FH': 10, 'LW': 11, 'IC': 12, 'OC': 13, 'RW': 14, 'FB': 15}

def row_number(code, cell):
    """Numéro de maillot. Leicester portait des lettres, et pas dans l'ordre de l'alphabet
    (Dean Richards, n° 8, portait un G) : le numéro vient alors du poste imprimé sur la
    même ligne, jamais de la place de la lettre."""
    if cell.isdigit(): return int(cell)
    return RUGBY_NUM.get(code.upper())

def parse_en_sheets(text):
    """Feuilles de match des articles anglais : titulaires + entraîneur, dans l'ordre des colonnes."""
    sheets, cur, skip, attend, lettres = [], [], False, False, False
    for raw in text.splitlines():
        line = REFTAG.sub('', EFN.sub('', raw.strip()))
        if attend:                                            # la ligne qui suit « Manager: »
            if line and line != '|-':
                c = CELL.match(line)
                nom = name_of(c.group(1).split('||')[0]) if c else ''
                if sheets and not sheets[-1]['coach']: sheets[-1]['coach'] = nom or None
                attend = False
            continue
        if line.startswith('{|') or line.startswith('|}'):    # nouveau tableau : fin du saut
            skip = False; continue
        marker = bool(MARK.match(line)) and len(line) < 120
        if marker and SUBS.search(line):
            if cur: sheets.append({'p': cur, 'coach': None, 'lettres': lettres}); cur = []
            lettres = False; skip = True; continue
        if marker and STAFF.search(line):
            # certaines pages n'ont pas de ligne « Replacements » : la feuille se clôt ici
            if cur: sheets.append({'p': cur, 'coach': None, 'lettres': lettres}); cur = []
            lettres = False; skip = False; attend = True; continue
        m = ROW.match(line)
        if m and not skip:
            num = row_number(m.group(1), m.group(2))
            if num is not None:
                if not m.group(2).isdigit(): lettres = True
                cur.append((m.group(1), num, name_of(m.group(3).split('||')[0])))
    if cur: sheets.append({'p': cur, 'coach': None, 'lettres': lettres})
    return sheets

def pick_window(b, need, sport):
    """Un tableau de classement précède parfois la composition : on retient la fenêtre
    de `need` lignes qui forme une vraie feuille de match."""
    if len(b) <= need: return b
    for i in range(len(b) - need + 1):
        w = b[i:i + need]
        if sport == 'rugby':
            if sorted(x[1] for x in w) == list(range(1, need + 1)): return w
        elif sum(c == 'GK' for c, _, _ in w) == 1 and len({x[2] for x in w}) == need:
            return w
    return b[:need]

# ---------------------------------------------------------------- noms, équipes, scores
def _norm(s):
    s = unicodedata.normalize('NFKD', str(s).lower()).encode('ascii', 'ignore').decode()
    return re.sub(r"[^a-z0-9]", "", s)

def _match(a, b):
    a, b = _norm(a), _norm(b)
    if not a or not b: return 0
    return 2 if a == b else (1 if a in b or b in a else 0)

def clean_team(s):
    s = re.sub(r"\s*\((?:rugby|football|club|soccer)[^)]*\)\s*$", "", str(s)).strip()
    s = re.sub(r"\s+(?:F\.?C\.?|A\.?F\.?C\.?|C\.?F\.?)$", "", s)
    return s.strip(" '\u2019-–—\n\t")

def team_name(v):
    """Nom d'équipe depuis une valeur de paramètre : lien d'abord, code pays ensuite."""
    code = mw.parse(str(v))
    for l in code.filter_wikilinks():
        tgt = str(l.title)
        if tgt.lower().startswith(('file:', 'fichier:', 'image:')): continue
        return clean_team(str(l.text) if l.text else tgt)
    for t in code.filter_templates():                          # {{fb|ITA}}, {{nat fs|GER}}…
        for i in (1, 2, 3):
            if t.has(i):
                a = str(t.get(i).value).strip().upper()
                if a in CODES: return CODES[a]
    return clean_team(code.strip_code().strip())

SCORE_RE = re.compile(r"\d{1,3}\s*[–\-—]\s*\d{1,3}")
def score_text(v):
    """Le score est souvent emballé dans un modèle ({{score link}}), que strip_code efface."""
    if v is None: return ''
    s = v.strip_code().strip()
    if SCORE_RE.search(s): return s
    for t in mw.parse(str(v)).filter_templates():
        for i in range(1, 6):
            if t.has(i):
                a = str(t.get(i).value).strip()
                if SCORE_RE.search(a): return a
    return s

def extras(raw, pen_v):
    """Prolongation et tirs au but, lus dans la valeur brute du paramètre score."""
    pen = score_text(pen_v)
    if not pen:
        m = re.search(r"\{\{\s*pso\s*\|\s*([^}|]+)", raw, re.I)
        if m: pen = m.group(1).strip()
    aet = bool(re.search(r"\baet\b|extra\s*time|golden\s*goal|silver\s*goal|a\.e\.t", raw, re.I))
    return pen, aet

def _param(t, *keys):
    for k in keys:
        if t.has(k):
            v = t.get(k).value
            if str(v).strip(): return v
    return None

MBOX = ('football box', 'footballbox', 'rugbybox', 'rugby box')
def parse_matchbox(text):
    """Boîte de résultat : équipes dans l'ordre des feuilles de match, score, prolongation, t.a.b."""
    for t in mw.parse(text).filter_templates():
        n = str(t.name).strip().lower().replace('#invoke:', '')
        if not any(k in n for k in MBOX): continue
        v1, v2 = _param(t, 'team1', 'home'), _param(t, 'team2', 'away')
        if not (v1 and v2): continue
        sc_v, aet_v = _param(t, 'score'), _param(t, 'aet')
        pen, aet = extras(str(sc_v or ''), _param(t, 'penaltyscore', 'penalties'))
        aet = aet or (bool(aet_v) and str(aet_v).strip().lower() not in ('no', 'non', 'n'))
        return team_name(v1), team_name(v2), score_text(sc_v), pen, aet
    return None

def parse_infobox(text):
    """Repli : infobox de l'article (score dans « score » ou dans team1score/team2score)."""
    for t in mw.parse(text).filter_templates():
        if 'infobox' not in str(t.name).lower(): continue
        v1, v2 = _param(t, 'team1'), _param(t, 'team2')
        if not (v1 and v2): continue
        sc_v = _param(t, 'score')
        s = score_text(sc_v)
        if not SCORE_RE.search(s):
            s1, s2 = _param(t, 'team1score'), _param(t, 'team2score')
            if s1 is not None and s2 is not None:
                s = f"{s1.strip_code().strip()}–{s2.strip_code().strip()}"
        aet_v = _param(t, 'aet')
        pen, aet = extras(str(sc_v or '') + str(_param(t, 'details') or ''),
                          _param(t, 'penaltyscore', 'penalties'))
        aet = aet or (bool(aet_v) and str(aet_v).strip().lower() not in ('no', 'non', 'n'))
        return team_name(v1), team_name(v2), s, pen, aet
    return None

def kit_titles(text):
    """Titres des maillots : ils précèdent chaque colonne de composition, donc donnent l'ordre réel."""
    out = []
    for t in mw.parse(text).filter_templates():
        if str(t.name).strip().lower().startswith('football kit') and t.has('title'):
            v = t.get('title').value.strip_code().strip()
            if v: out.append(v)
    return out

# ---------------------------------------------------------------- Wikipédia français (rugby)
FR_NA = re.compile(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]\s*(?:\{\{[^{}]*\}\}\s*)*(\d{1,2})(?!\d)")
FR_AN = re.compile(r"(?<!\d)(\d{1,2})\s*(?:\{\{[^{}]*\}\}\s*)*\[\[([^\]|]+)(?:\|([^\]]+))?\]\]")

def _fr_entry(e):
    """Une ligne de composition : « 15 [[Nom]] » ou « [[Nom]] 15 », notes et modèles compris,
    et le nom en clair quand le joueur n'a pas d'article."""
    txt = re.sub(r"<[^>]+>", " ", e).strip()
    if not txt: return None
    tete = re.match(r"(?:\s*\{\{[^{}]*\}\})*[\s:;'’*.-]*(\d{1,2})(?!\d)", txt)
    queue = re.search(r"(?<!\d)(\d{1,2})(?:\s*\{\{[^{}]*\}\})*\s*'*\s*$", txt)
    if not (tete or queue): return None
    num = int(tete.group(1)) if tete else int(queue.group(1))
    if not 1 <= num <= 15: return None
    reste = txt[tete.end():] if tete else txt[:queue.start()]
    code = mw.parse(reste)
    for l in code.filter_wikilinks():
        t = str(l.title)
        if t.lower().startswith(('file:', 'fichier:', 'image:')): continue
        return num, clean_team(str(l.text) if l.text else t)
    brut = re.sub(r"\s+", " ", re.sub(r"\([^()]*\)", " ", code.strip_code())).strip(" .,;:'’-")
    return (num, brut) if len(brut.split()) >= 2 else None

def _fr_players(seg):
    """Les titulaires d'une cellule, une ligne par joueur. Refuse si les 15 numéros n'y sont pas."""
    out = {}
    for e in re.split(r"<br\s*/?>|\n|,|\s+-\s+", seg):   # certaines pages alignent les 15 sur une ligne
        r = _fr_entry(e)
        if r and r[0] not in out: out[r[0]] = r[1]
    return out if sorted(out) == list(range(1, 16)) else None

def parse_fr_box(sec):
    """Encadré du match : {{Match rugby}} (équipe1/équipe2/score) ou l'ancien « [[A]] 31 – 16 [[B]] »."""
    for t in mw.parse(sec).filter_templates():
        if 'match rugby' not in str(t.name).strip().lower(): continue
        e1, e2, sc = _param(t, 'équipe1', 'equipe1'), _param(t, 'équipe2', 'equipe2'), _param(t, 'score')
        if not (e1 and e2 and sc): continue
        m = re.search(r"(\d{1,3})\s*[–\-—]\s*(\d{1,3})", sc.strip_code())
        if m: return team_name(e1), int(m.group(1)), int(m.group(2)), team_name(e2)
    lien = r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]"
    # tableau à libellés « Équipes » / « Score » (pages des années 2006-2010)
    def ligne(lib):
        m = re.search(r"'''" + lib + r"'''\s*\n\|[^|\n]*\|(.*)", sec)
        return m.group(1) if m else None
    v, vs = ligne('Équipes'), ligne('Score')
    if v and vs:
        ls, ms = re.findall(lien, v), re.search(r"(\d{1,3})\s*[–\-—]\s*(\d{1,3})", vs)
        if len(ls) >= 2 and ms:
            return (clean_team(ls[0][1] or ls[0][0]), int(ms.group(1)),
                    int(ms.group(2)), clean_team(ls[1][1] or ls[1][0]))
    m = re.search(lien + r"'*\s*(\d{1,3})\s*'*\s*[–\-—]\s*'*\s*(\d{1,3})\s*'*\s*" + lien, sec)
    if m: return (clean_team(m.group(2) or m.group(1)), int(m.group(3)),
                  int(m.group(4)), clean_team(m.group(6) or m.group(5)))
    return None

def parse_fr_final(text, section):
    """Page de championnat du wiki français : encadré de match + tableau « Composition des équipes »."""
    code = mw.parse(text)
    secs = code.get_sections(matches=r"^\s*%s\s*$" % re.escape(section), flat=False)
    sec = str(secs[0]) if secs else str(code)
    link = r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]"
    score = parse_fr_box(sec)
    teams = []
    for m in re.finditer(r"Titulaires", sec):
        before, after = sec[max(0, m.start() - 500):m.start()], sec[m.end():]
        cell = before[before.rfind(chr(10) + chr(124)):] if (chr(10) + chr(124)) in before else before
        gras = re.findall(r"'''\s*" + link + r"\s*'''", cell)
        nm = clean_team(gras[-1][1] or gras[-1][0]) if gras else None
        stop = re.search(r"Remplaçants|Entraîneurs|\n\|\}", after)
        pl = _fr_players(after[:stop.start()] if stop else after[:2500])
        if not pl: continue
        coach, autres = None, []
        em = re.search(r"Entraîneurs?", after)                 # souvent deux noms en rugby français
        if em:
            tail = after[em.end():]
            fin = re.search(r"\n\s*\|", tail)
            noms = [clean_team(d or t) for t, d in re.findall(link, tail[:fin.start()] if fin else tail[:400])]
            if noms: coach, autres = noms[0], noms[1:]
        teams.append((nm, pl, coach, autres))
    return sec, score, teams

def from_wiki(it, verbose=False):
    text, title = wiki_text(it['lang'], it['title'], it['id'])
    if not text: return None
    need = 11 if it['sport'] == 'foot' else 15

    if it['lang'] == 'fr':
        sec, score, teams = parse_fr_final(text, it.get('section', 'Finale'))
        if verbose:
            print(f"    section : {len(sec)} caracteres, {len(teams)} composition(s), score {score}")
        if len(teams) < 2:
            flag(it['id'], f"composition rugby FR non reconnue ({len(teams)} equipe(s) lue(s)) - voir data/raw/{it['id']}.wiki")
            return None
        (n1, p1, c1, a1), (n2, p2, c2, a2) = teams[:2]
        if score:
            sa, xa, xb, sb = score
            # les cellules de composition ne portent pas toujours le nom de l'equipe :
            # on s'oriente sur celui qui est connu, et l'encadre fournit les deux noms
            conn = n1 or n2
            if conn:
                ref = (sa, sb) if n1 else (sb, sa)
                if _match(conn, ref[0]) < _match(conn, ref[1]):
                    xa, xb, sa, sb = xb, xa, sb, sa
            n1, n2 = n1 or sa, n2 or sb
            if xb > xa:                                        # vainqueur en premier
                (n1, p1, c1, a1), (n2, p2, c2, a2) = (n2, p2, c2, a2), (n1, p1, c1, a1)
                xa, xb = xb, xa
            a, b, sc = fr(n1), fr(n2), score_str(xa, xb)
        else:
            flag(it['id'], "score introuvable dans l'encadre de match (wiki FR)")
            a, b, sc = fr(n1), fr(n2), '?'
        eqs = [{'name': a, 'p': place_rugby(p1)}, {'name': b, 'p': place_rugby(p2)}]
        for eq, c, al in zip(eqs, (c1, c2), (a1, a2)):
            if c: eq['coach'] = (c, al)
            else: flag(it['id'], f"{eq['name']} : entraineur introuvable")
        return dict(it, a=a, b=b, score=sc, source_title=title, teams=eqs)

    mb, ib = parse_matchbox(text), parse_infobox(text)
    box = mb or ib
    if not box:
        flag(it['id'], "ni boite de match ni infobox exploitable"); return None
    t1, t2, sc, pen, aet = box
    if mb and ib:            # la prolongation (but en or) n'est souvent notee que dans l'infobox
        aet, pen = aet or ib[4], pen or ib[3]
    sheets = [sh for sh in parse_en_sheets(text) if len(sh['p']) >= need]
    if len(sheets) == 1 and len(sheets[0]['p']) >= 2 * need:    # les deux equipes dans un seul tableau
        tout, c0 = sheets[0]['p'], sheets[0]['coach']
        sheets = [{'p': tout[:need], 'coach': c0, 'lettres': sheets[0].get('lettres')},
                  {'p': tout[need:2 * need], 'coach': None, 'lettres': sheets[0].get('lettres')}]
    for sh in sheets: sh['p'] = pick_window(sh['p'], need, it['sport'])
    if verbose:
        print(f"    boite : {t1} | {sc}{' + ' + pen if pen else ''}{' a.p.' if aet else ''} | {t2}")
        for sh in sheets[:2]:
            print("    ", " - ".join(f"{c}{n} {nm}" for c, n, nm in sh['p']), "| entr. :", sh['coach'])
    if len(sheets) < 2:
        flag(it['id'], f"feuilles de match incompletes ({[len(sh['p']) for sh in sheets]})"); return None
    # l'ordre des colonnes suit les maillots, pas toujours celui de la boite de match
    kits = kit_titles(text)
    if len(kits) >= 2 and _match(kits[0], t2) + _match(kits[1], t1) > _match(kits[0], t1) + _match(kits[1], t2):
        sheets = [sheets[1], sheets[0]]
    teams = []
    for nm, sh in zip((t1, t2), sheets[:2]):
        b = sh['p'][:need]
        if it['sport'] == 'foot':
            if sum(c == 'GK' for c, _, _ in b) != 1: flag(it['id'], f"{nm} : nombre de gardiens anormal")
            eq = {'name': fr(nm or '?'), 'p': place_foot([(c, n) for c, _, n in b])}
        else:
            by = {num: n for _, num, n in b}
            if sorted(by) != list(range(1, 16)):
                flag(it['id'], f"{nm} : numeros 1-15 incomplets"); return None
            eq = {'name': fr(nm or '?'), 'p': place_rugby(by)}
        if sh.get('lettres'): flag(it['id'], f"{nm} : maillots lettres, numeros deduits des postes")
        if sh['coach']: eq['coach'] = (sh['coach'], [])
        else: flag(it['id'], f"{nm} : entraineur introuvable")
        teams.append(eq)
    m = re.match(r"(\d+)\s*[\u2013\-\u2014]\s*(\d+)", sc or '')
    if not m:
        flag(it['id'], f"score illisible : < {sc} >"); a, b, s = teams[0]['name'], teams[1]['name'], sc or '?'
    else:
        x, y = int(m.group(1)), int(m.group(2)); rest = sc[m.end():]
        pm = (re.search(r"(\d+)\s*[\u2013\-\u2014]\s*(\d+)", pen or '')
              or re.search(r"(\d+)\s*[\u2013\-\u2014]\s*(\d+)\s*(?:p|pen|t\.a\.b)", rest))
        aet = aet or bool(re.search(r"a\.?e\.?t|extra|a\.p", rest, re.I))
        pens = (int(pm.group(1)), int(pm.group(2))) if pm else None
        if y > x or (x == y and pens and pens[1] > pens[0]):
            teams.reverse(); x, y = y, x; pens = pens and (pens[1], pens[0])
        a, b, s = teams[0]['name'], teams[1]['name'], score_str(x, y, aet, pens)
    return dict(it, a=a, b=b, score=s, teams=teams, source_title=title)

# ---------------------------------------------------------------- assemblage
def fx(r):
    m = re.match(r"(\S+)\s*(.*)", r['score'])
    return f"{r['a']} {m.group(1)} {r['b']}" + (f" {m.group(2)}" if m.group(2) else "")

def finalize(r):
    aliases = json.load(open('aliases.json', encoding='utf-8')) if os.path.exists('aliases.json') else {}
    for t in r['teams']:
        for p in t['p']: p[4] = aliases.get(p[3], [])
        if len({p[3] for p in t['p']}) != len(t['p']): flag(r['id'], f"{t['name']} : doublon de joueur")
        c = t.get('coach')
        if c: t['coach'] = [c[0], sorted(set(aliases.get(c[0], []) + list(c[1])))]
    return {'id': r['id'], 'sport': r['sport'], 'comp': r['comp'], 'yr': r['yr'],
            'fx': fx(r), 'where': COMP_LABEL[r['comp']], 'teams': r['teams']}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--test', action='store_true'); ap.add_argument('--only', default='')
    ap.add_argument('--html', default='')
    ap.add_argument('--maj', action='store_true',
                    help="ne requête que les finales absentes de compos.json")
    args = ap.parse_args()
    items = manifest()
    if args.test:
        items = [i for i in items if i['id'] in ('ldc-2023', 'hcup-2010', 'top14-1995')]
    elif args.only:
        keep = set(args.only.split(',')); items = [i for i in items if i['comp'] in keep]
    if args.maj and not args.test:
        p = f"{OUT}/compos.json"
        deja = {m['id'] for m in json.load(open(p, encoding='utf-8'))} if os.path.exists(p) else set()
        avant = len(items)
        items = [i for i in items if i['id'] not in deja]
        print(f"{avant - len(items)} finale(s) déjà en base, {len(items)} à chercher")
    os.makedirs(OUT, exist_ok=True)
    results = []
    fj = [i for i in items if i['src'] == 'fjelstul']
    if fj: print("Fjelstul…"); results += from_fjelstul(fj)
    for it in items:
        if it['src'] == 'fjelstul': continue
        print(f"{it['id']} ({it['src']})…")
        try:
            r = from_statsbomb(it) if it['src'] == 'statsbomb' else from_wiki(it, verbose=args.test)
            if r is None and it['src'] == 'statsbomb' and it.get('title'):
                print("  -> repli sur Wikipédia"); r = from_wiki(it, verbose=args.test)
        except Exception as e: flag(it['id'], f"erreur : {e}"); r = None
        if r: results.append(r)
    data = [finalize(r) for r in results]
    # fusion avec un compos.json existant (lancements par étapes)
    path = f"{OUT}/compos.json"
    old = {m['id']: m for m in json.load(open(path, encoding='utf-8'))} if os.path.exists(path) and not args.test else {}
    old.update({m['id']: m for m in data})
    merged = sorted(old.values(), key=lambda m: (m['comp'], -m['yr']))
    if not args.test: json.dump(merged, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    else: json.dump(data, open(f"{OUT}/test.json", 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    with open(f"{OUT}/review.csv", 'w', encoding='utf-8', newline='') as f:
        csv.writer(f).writerows([('id', 'probleme')] + REVIEW)
    print(f"\n{len(data)}/{len(items)} finales extraites, {len(REVIEW)} point(s) à relire (data/review.csv).")
    if args.html and not args.test:
        html = open(args.html, encoding='utf-8').read()
        html = re.sub(r"const MATCHES=\[.*?\];\n", lambda _: "const MATCHES=" + json.dumps(merged, ensure_ascii=False) + ";\n", html, count=1, flags=re.S)
        open(args.html, 'w', encoding='utf-8').write(html); print(f"Données injectées dans {args.html}")

if __name__ == '__main__':
    main()
