// Les onglets, le profil et les jours d'avant.
//   sh tools/site.sh site && (cd site && python3 -m http.server 8123 &)
//   node tools/test_onglets.js
const { chromium } = require('playwright');
const ok = [], ko = [];
const v = (n, c, d) => (c ? ok : ko).push(n + (c ? '' : '  <-- ' + JSON.stringify(d)));

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const err = [];
  p.on('pageerror', e => err.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/fonts|TUNNEL/.test(m.text())) err.push(m.text()); });
  p.on('dialog', d => d.accept());
  await p.goto('http://127.0.0.1:8123/', { waitUntil: 'networkidle' });
  await p.fill('#pseudo', 'leo'); await p.click('#valide'); await p.waitForTimeout(150);

  const vue = () => p.evaluate(() => SECTIONS.filter(s => !document.getElementById(s).classList.contains('hidden')));

  // --- le profil se range derriere le portrait, en haut a droite
  v('le portrait porte l’initiale du pseudo', (await p.textContent('#versmoi')) === 'L',
    await p.textContent('#versmoi'));
  await p.click('#versmoi'); await p.waitForTimeout(250);
  v('le portrait ouvre le profil', JSON.stringify(await vue()) === JSON.stringify(['moi']), await vue());
  await p.click('#moi .back'); await p.waitForTimeout(250);
  v('le retour ramene a l’accueil', JSON.stringify(await vue()) === JSON.stringify(['home']), await vue());

  // --- un apercu du terrain sur chaque compo du jour
  const mini = await p.evaluate(() => [...document.querySelectorAll('#daily .mini')]
    .map(m => ({ sport: m.className.split(' ')[1], points: m.querySelectorAll('i').length })));
  v('chaque compo montre un petit terrain', mini.length === 2, mini);
  v('un point d’interrogation par joueur',
    mini.every(x => x.points === (x.sport === 'foot' ? 11 : 15)), mini);
  v('aucun point ne se chevauche', await p.evaluate(() =>
    [...document.querySelectorAll('.mini')].every(mini => {
      const el = [...mini.querySelectorAll('i')].map(e => e.getBoundingClientRect());
      for (let i = 0; i < el.length; i++) for (let j = i + 1; j < el.length; j++) {
        const ox = Math.min(el[i].right, el[j].right) - Math.max(el[i].left, el[j].left);
        const oy = Math.min(el[i].bottom, el[j].bottom) - Math.max(el[i].top, el[j].top);
        if (ox > 0 && oy > 0) return false;
      } return true; })));
  v('l’accueil ne porte plus la ligne du pseudo',
    !/changer de pseudo/.test(await p.textContent('#home')));

  // --- chaque compo du jour se partage sans y avoir joue
  const duo = await p.evaluate(() => [...document.querySelectorAll('#daily .duo')]
    .map(d => [...d.querySelectorAll('button')].map(x => x.textContent)));
  v('Jouer et Partager cote a cote sur chaque compo',
    duo.length === 2 && duo.every(x => x[0] === 'Jouer' && x[1] === 'Partager'), duo);
  await p.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await p.click('[data-part="foot"]'); await p.waitForTimeout(200);
  const defi = (await p.evaluate(() => navigator.clipboard.readText())).split('\n');
  v('le defi copie tient en deux lignes et un lien',
    /^[A-ZÀ-Ü' .-]+ - [A-ZÀ-Ü' .-]+ \d\d$/.test(defi[0])
    && defi[1] === 'Peux-tu refaire la compo ?' && defi.length === 3, defi);
  v('le bouton dit qu’il a copie', (await p.textContent('[data-part="foot"]')) === 'Copié !');

  // --- profil : code de reprise
  await p.click('#versmoi'); await p.waitForTimeout(200);
  const avant = await p.evaluate(() => moi().id);
  const codeAffiche = (await p.textContent('#moncode')).trim();
  v('le code affiche est bien l’identifiant', codeAffiche === avant, { codeAffiche, avant });

  await p.fill('#mcode', 'n’importe quoi'); await p.click('#mreprendre'); await p.waitForTimeout(100);
  v('un code invalide est refuse', /bonne forme/.test(await p.textContent('#mdit'))
    && (await p.evaluate(() => moi().id)) === avant);

  const autre = 'AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE'.toLowerCase().replace(/[^0-9a-f-]/g, '1');
  await p.fill('#mcode', autre.toUpperCase()); await p.click('#mreprendre'); await p.waitForTimeout(200);
  v('un code valide remplace le profil', (await p.evaluate(() => moi().id)) === autre,
    { attendu: autre, obtenu: await p.evaluate(() => moi().id) });

  await p.fill('#mcode', avant); await p.click('#mreprendre'); await p.waitForTimeout(200);
  v('on peut revenir a son code', (await p.evaluate(() => moi().id)) === avant);

  // --- pseudo depuis le profil
  await p.fill('#mpseudo', 'leopold'); await p.click('#mvalide'); await p.waitForTimeout(100);
  v('le pseudo se change depuis le profil', (await p.evaluate(() => moi().pseudo)) === 'leopold');

  // --- toutes les finales, dans leur onglet : sport, competition, annees
  await p.click('#moi [data-va="home"]'); await p.waitForTimeout(200);
  await p.click('#home [data-va="archives"]'); await p.waitForTimeout(300);
  v('l’onglet des finales s’ouvre', JSON.stringify(await vue()) === JSON.stringify(['archives']), await vue());
  const arch = await p.evaluate(() => ({
    competitions: [...document.querySelectorAll('#arch .comp summary b')].map(e => e.textContent),
    finales: document.querySelectorAll('#arch .fin').length,
    attendu: MATCHES.filter(m => m.sport === 'foot').length,
  }));
  v('les competitions de foot sont la',
    JSON.stringify(arch.competitions) === JSON.stringify(['Coupe du monde', 'Euro', 'Ligue des champions']),
    arch.competitions);
  v('toutes les finales de foot sont listees', arch.finales === arch.attendu, arch);

  await p.click('#arch [data-sa="rugby"]'); await p.waitForTimeout(250);
  const rug = await p.evaluate(() => ({
    competitions: [...document.querySelectorAll('#arch .comp summary b')].map(e => e.textContent),
    finales: document.querySelectorAll('#arch .fin').length,
    attendu: MATCHES.filter(m => m.sport === 'rugby').length,
  }));
  v('le rugby a ses competitions',
    JSON.stringify(rug.competitions) === JSON.stringify(['Coupe du monde', 'Coupe d’Europe', 'Top 14']),
    rug.competitions);
  v('toutes les finales de rugby sont listees', rug.finales === rug.attendu, rug);

  // --- noms courts et marques d'equipe
  // Pas de blasons de clubs : ce sont des marques deposees. A la place, les
  // couleurs du club ; les nations gardent leur drapeau.
  const eq = await p.evaluate(() => {
    const manque = [];
    MATCHES.forEach(m => m.teams.forEach(t => { if (!EQUIPES[t.name]) manque.push(t.name); }));
    const tlse = MATCHES.find(x => x.id === 'hcup-2024');
    const nz = MATCHES.find(x => x.id === 'rwc-2015');
    return { manque,
      toulouse: tlse ? afficheCourte(tlse) : null,
      allblacks: nz ? afficheCourte(nz) : null,
      drapeau: marque('France'), pastille: marque('Stade toulousain'),
      inconnu: marque('Equipe qui n’existe pas') };
  });
  v('chaque equipe de la base a son entree', eq.manque.length === 0, eq.manque.slice(0, 8));
  v('les clubs portent un nom court', /^Toulouse /.test(eq.toulouse || ''), eq.toulouse);
  v('les nations de rugby portent leur surnom', /All Blacks/.test(eq.allblacks || ''), eq.allblacks);
  // Le rond est peint, pas rempli d'une image ni d'un emoji : un emoji de
  // drapeau est rectangulaire, et sur Windows il ne s'affiche pas du tout.
  v('une nation est un rond peint aux couleurs du drapeau',
    /class="rond"/.test(eq.drapeau) && /linear-gradient/.test(eq.drapeau)
    && !/<img/.test(eq.drapeau) && !/[\u{1F1E6}-\u{1F1FF}]/u.test(eq.drapeau), eq.drapeau);
  // Un club n'a pas de drapeau : on ne lui en invente pas un. Il porte son
  // nom court, qui le designe mieux que deux couleurs — Toulouse et Toulon
  // donnaient le meme rond rouge et noir.
  v('un club n’a pas de rond', eq.pastille === '', eq.pastille);
  v('une equipe inconnue ne casse rien', eq.inconnu === '', eq.inconnu);

  // --- la ligne facon tableau d'affichage
  const lig = await p.evaluate(() => {
    const manque = [];
    MATCHES.forEach(m => m.teams.forEach(t => { if (!SIGLES[t.name]) manque.push(t.name); }));
    const l = document.querySelector('#arch .fin');
    const scores = [...document.querySelectorAll('#arch .fin')].slice(0, 12)
      .map(f => Math.round(f.querySelector('.score').getBoundingClientRect().left));
    return { manque,
      sigles: [...l.querySelectorAll('.cote b')].map(e => e.textContent),
      cases: [...l.querySelectorAll('.score i')].map(e => e.textContent),
      noir: getComputedStyle(l.querySelector('.score i')).backgroundColor,
      texte: l.textContent,
      colonne: new Set(scores).size,
      // Les deux camps doivent se serrer contre le score, pas partir aux bords.
      ecartGauche: Math.round(l.querySelector('.score').getBoundingClientRect().left
        - l.querySelector('.cote b').getBoundingClientRect().right),
      entete: document.querySelector('#arch .comp summary').textContent,
    };
  });
  v('chaque equipe a son sigle', lig.manque.length === 0, lig.manque.slice(0, 8));
  v('la ligne porte deux sigles', lig.sigles.length === 2, lig.sigles);
  v('le score est en deux cases', lig.cases.length === 2 && lig.cases.every(c => /^\d+$/.test(c)), lig.cases);
  v('les cases sont sombres', lig.noir !== 'rgba(0, 0, 0, 0)', lig.noir);
  v('plus de « noms » en bout de ligne', !/noms/.test(lig.texte), lig.texte);
  v('le score reste dans la meme colonne d’une ligne a l’autre', lig.colonne === 1, lig.colonne);
  v('l’entete dit « Finales »', /Finales/.test(lig.entete), lig.entete);
  v('les camps sont serres contre le score', lig.ecartGauche >= 0 && lig.ecartGauche <= 14, lig.ecartGauche);

  // Les drapeaux doivent tomber sur la meme colonne d'une ligne a l'autre :
  // c'est la largeur fixe du sigle qui le garantit.
  const colonnes = await p.evaluate(() => {
    const x = s => [...new Set([...document.querySelectorAll(s)]
      .map(e => Math.round(e.getBoundingClientRect().left)))];
    return { gauche: x('#arch .comp[open] .fin .cote:not(.droite) .rond'),
             droite: x('#arch .comp[open] .fin .cote.droite .rond'),
             clubs: document.querySelectorAll('#arch .fin b.nom .rond').length };
  });
  v('les drapeaux de gauche sont alignes', colonnes.gauche.length === 1, colonnes.gauche);
  v('ceux de droite aussi', colonnes.droite.length === 1, colonnes.droite);

  // Le resultat apparait apres une partie : il ne doit rien decaler.
  const colAvant = await p.evaluate(() =>
    [...document.querySelectorAll('#arch .fin .score')].map(e => Math.round(e.getBoundingClientRect().left)));
  await p.evaluate(() => { const m = MATCHES.find(x => x.sport === 'rugby');
    store.set(bestKey(m, 0), { f: 9, t: 120 }); renderArchives(); });
  await p.waitForTimeout(200);
  const colApres = await p.evaluate(() =>
    [...document.querySelectorAll('#arch .fin .score')].map(e => Math.round(e.getBoundingClientRect().left)));
  v('un resultat affiche ne decale pas la ligne',
    JSON.stringify(colAvant) === JSON.stringify(colApres),
    { avant: colAvant.slice(0, 3), apres: colApres.slice(0, 3) });

  // Rien ne doit se chevaucher, meme avec les sigles les plus longs et un
  // resultat affiche, et meme sur le plus petit ecran.
  for (const large of [430, 390, 360, 320]) {
    await p.setViewportSize({ width: large, height: 820 });
    await p.waitForTimeout(200);
    const chevauche = await p.evaluate(() => {
      const mauvais = [];
      document.querySelectorAll('#arch .fin').forEach(f => {
        const bouts = [f.querySelector('.an'), f.querySelector('.cote .rond'),
                       f.querySelector('.score'), f.querySelector('.cote.droite .rond'),
                       f.querySelector('.nb')].filter(Boolean).map(e => e.getBoundingClientRect());
        for (let i = 1; i < bouts.length; i++)
          if (bouts[i].left < bouts[i - 1].right - 0.5) mauvais.push(f.textContent.trim().slice(0, 18));
      });
      return mauvais;
    });
    v(`rien ne se chevauche a ${large} px`, chevauche.length === 0, chevauche.slice(0, 4));
  }
  await p.setViewportSize({ width: 390, height: 820 });

  // Les annees descendent : on cherche d'abord la derniere.
  const annees = await p.evaluate(() =>
    // firstChild : la cellule porte aussi « a.p. » ou « t.a.b. » en dessous.
    [...document.querySelectorAll('#arch .comp:first-of-type .fin .an')].map(e => +e.firstChild.textContent));
  v('les annees vont de la plus recente a la plus ancienne',
    annees.every((a, i) => i === 0 || annees[i - 1] >= a), annees);

  await p.click('#arch .fin'); await p.waitForTimeout(350);
  v('une finale se joue depuis la liste', JSON.stringify(await vue()) === JSON.stringify(['play']), await vue());
  v('elle n’est pas classee', (await p.evaluate(() => RANKED)) === false);
  await p.click('#back'); await p.waitForTimeout(250);
  v('le retour ramene a la liste', JSON.stringify(await vue()) === JSON.stringify(['archives']), await vue());

  // --- une partie occupe l'ecran, seule
  await p.evaluate(() => { const m = MATCHES.find(x => x.id === 'cdm-1998'); start(m, 0, false); });
  await p.waitForTimeout(200);
  v('la partie est seule a l’ecran', JSON.stringify(await vue()) === JSON.stringify(['play']), await vue());

  // --- rien ne deborde, sur chaque onglet
  for (const o of ['home', 'moi']) {
    await p.evaluate(n => montre(n), o); await p.waitForTimeout(200);
    await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(120);
    const d = await p.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
    v('pas de debordement a 320 px : ' + o, d.s <= d.c, d);
    await p.setViewportSize({ width: 390, height: 844 });
  }

  console.log('REUSSIS\n  ' + ok.join('\n  '));
  if (ko.length) console.log('ECHECS\n  ' + ko.join('\n  '));
  console.log('ERREURS JS : ' + (err.length ? JSON.stringify(err, null, 1) : 'aucune'));
  await b.close();
  process.exit(ko.length || err.length ? 1 : 0);
})();
