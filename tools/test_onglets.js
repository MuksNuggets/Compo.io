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

  // --- les jours d'avant, ranges dans le profil
  v('les jours d’avant sont dans le profil', await p.isVisible('#moi #listepasse'));
  const jours = await p.evaluate(() => ({
    jourN: DAYN,
    lignes: document.querySelectorAll('#listepasse .jour').length,
    attendu: Math.max(0, (DAYN - 1) * 2),
  }));
  v('une ligne par sport et par jour passe', jours.lignes === jours.attendu, jours);

  if (jours.lignes) {
    await p.click('#listepasse .jour'); await p.waitForTimeout(300);
    v('on peut jouer un jour passe', JSON.stringify(await vue()) === JSON.stringify(['play']), await vue());
    v('la partie n’est pas classee', (await p.evaluate(() => RANKED)) === false);
    await p.click('#back'); await p.waitForTimeout(200);
    v('le retour ramene au profil', JSON.stringify(await vue()) === JSON.stringify(['moi']), await vue());
  }

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
