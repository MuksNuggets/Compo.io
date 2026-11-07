// Tests de bout en bout de l'app, au vrai navigateur, sur le site assemble :
// la page seule ne trouverait ni ses icones ni son manifest.
//   sh tools/site.sh site && (cd site && python3 -m http.server 8123 &)
//   node tools/test_app.js
// Sort en erreur si un controle echoue ou si la page leve une erreur JS.
const { chromium } = require('playwright');
const ok = [], ko = [];
const verifie = (nom, cond, detail) => (cond ? ok : ko).push(nom + (cond ? '' : '  <-- ' + JSON.stringify(detail)));

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const erreurs = [];
  p.on('pageerror', e => erreurs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/fonts\.googleapis|ERR_TUNNEL/.test(m.text())) erreurs.push('console: ' + m.text()); });
  p.on('dialog', d => d.accept());

  await p.goto('http://127.0.0.1:8123/', { waitUntil: 'networkidle' });

  // --- 1. on demande un pseudo, et rien d'autre
  const avant = await p.evaluate(() => ({
    cartes: document.querySelectorAll('#daily .daily').length,
    champs: [...document.querySelectorAll('#daily input')].map(i => i.id),
  }));
  verifie('avant pseudo : une seule carte', avant.cartes === 1, avant);
  verifie('un seul champ, le pseudo', JSON.stringify(avant.champs) === '["pseudo"]', avant);

  await p.fill('#pseudo', 'leo');
  await p.click('#valide');
  await p.waitForTimeout(200);

  // --- 2. deux cartes, une par sport
  const cartes = await p.evaluate(() => [...document.querySelectorAll('#daily .daily')]
    .map(c => ({ tag: c.querySelector('.tag').textContent, bouton: c.querySelector('button').dataset.jour })));
  verifie('deux cartes, foot puis rugby',
    cartes.length === 2 && cartes[0].bouton === 'foot' && cartes[1].bouton === 'rugby', cartes);

  // --- 3. plus de catalogue, plus de groupe
  const disparus = await p.evaluate(() => ({
    archive: !!document.getElementById('archive'),
    liste: !!document.getElementById('list'),
    filtres: !!document.getElementById('filters'),
    voirtout: !!document.getElementById('voirtout'),
    groupe: /groupe/i.test(document.getElementById('daily').textContent),
    moi: Object.keys(moi()).sort().join(','),
  }));
  verifie('plus de liste de finales',
    !disparus.archive && !disparus.liste && !disparus.filtres && !disparus.voirtout, disparus);
  verifie('plus un mot de groupe a l’ecran', !disparus.groupe, disparus);
  verifie('identite reduite a id + pseudo', disparus.moi === 'id,pseudo', disparus);

  // --- 4. jouer le foot : seul le foot est enregistre, et le classement est global
  const appels = await p.evaluate(async () => {
    const vus = [], vrai = window.fetch;
    window.fetch = async (u, o) => {
      const c = JSON.parse(o.body); vus.push(c);
      if (c.action === 'start') return { json: async () => ({ roundId: '11111111-1111-1111-1111-111111111111', day: DAYN, sport: c.sport }) };
      if (c.action === 'submit') return { json: async () => ({ day: DAYN, sport: 'foot', found: 12, size: 12, hints: 0, timeLeft: 100, points: 1200 }) };
      return { json: async () => ({ day: DAYN, sport: 'foot', serie: 1, classement: [
        { rang: 1, playerId: moi().id, pseudo: 'leo', points: 1200, found: 12, size: 12, seconds: 80, hints: 0 }] }) };
    };
    document.querySelector('[data-jour="foot"]').click();
    await new Promise(r => setTimeout(r, 120));
    P.forEach((_, i) => found.add(i)); left = 100; end();
    await new Promise(r => setTimeout(r, 200));
    window.fetch = vrai;
    return vus;
  });
  const board = appels.find(a => a.action === 'board');
  verifie('le classement est demande sans code de groupe',
    !!board && !('groupCode' in board) && board.sport === 'foot', board);
  verifie('l’ouverture de partie n’envoie plus de groupe',
    !('groupCode' in appels.find(a => a.action === 'start')), appels[0]);

  const apres = await p.evaluate(() => ({
    foot: !!store.get(dailyKey(DAYN, 'foot')),
    rugby: !!store.get(dailyKey(DAYN, 'rugby')),
    gros: document.getElementById('rbig').textContent.replace(/\s| | /g, ''),
    tableau: document.querySelectorAll('#board tbody tr').length,
  }));
  verifie('foot enregistre', apres.foot, apres);
  verifie('rugby toujours pas joue', !apres.rugby, apres);
  verifie('score serveur affiche', apres.gros === '1200pts', apres);
  verifie('classement affiche', apres.tableau === 1, apres);

  // --- 5. de retour a l'accueil : carte foot faite, carte rugby a jouer
  await p.evaluate(() => home());
  await p.waitForTimeout(150);
  const cartes2 = await p.evaluate(() => [...document.querySelectorAll('#daily .daily')]
    .map(c => c.querySelector('button').textContent));
  verifie('carte foot passee en rejouer', cartes2[0] === 'Rejouer hors classement', cartes2);
  verifie('carte rugby encore a jouer', cartes2[1] === 'Jouer', cartes2);

  // --- 6. vieux serveur : deja_joue SANS sport -> hors classement, pas de zero
  const vieux = await p.evaluate(async () => {
    const vrai = window.fetch;
    window.fetch = async () => ({ json: async () => ({ code: 'deja_joue', erreur: 'deja joue', day: DAYN }) });
    document.querySelector('[data-jour="rugby"]').click();
    await new Promise(r => setTimeout(r, 150));
    window.fetch = vrai;
    const classe = RANKED;
    P.forEach((_, i) => found.add(i)); left = 100; end();
    await new Promise(r => setTimeout(r, 100));
    return { classe, enregistre: !!store.get(dailyKey(DAYN, 'rugby')),
             phrase: document.getElementById('rtxt').textContent };
  });
  verifie('vieux serveur : partie non classee', vieux.classe === false, vieux);
  verifie('vieux serveur : aucun zero enregistre', !vieux.enregistre, vieux);
  verifie('vieux serveur : la raison est dite', /non class/.test(vieux.phrase), vieux);

  // --- 7. nouveau serveur : deja_joue AVEC sport -> on enregistre
  await p.evaluate(() => { localStorage.removeItem(dailyKey(DAYN, 'rugby')); home(); });
  await p.waitForTimeout(150);
  const neuf = await p.evaluate(async () => {
    const vrai = window.fetch;
    window.fetch = async () => ({ json: async () => ({ code: 'deja_joue', day: DAYN, sport: 'rugby' }) });
    document.querySelector('[data-jour="rugby"]').click();
    await new Promise(r => setTimeout(r, 200));
    window.fetch = vrai;
    return { enregistre: !!store.get(dailyKey(DAYN, 'rugby')) };
  });
  verifie('nouveau serveur : le refus est enregistre', neuf.enregistre, neuf);

  // --- 8. les fichiers de l'app repondent vraiment (icones, manifest, vignette)
  const liens = await p.evaluate(() => [
    ...[...document.querySelectorAll('link[rel="icon"],link[rel="apple-touch-icon"],link[rel="manifest"]')].map(l => l.getAttribute('href')),
    document.querySelector('meta[property="og:image"]').content.replace(/^https:\/\/[^/]+\/Compo\.io\//, ''),
  ]);
  const codes = {};
  for (const l of liens) codes[l] = (await p.request.get(new URL(l, p.url()).href)).status();
  verifie('icones, manifest et vignette servis', Object.values(codes).every(c => c === 200), codes);
  verifie('les quatre fichiers sont references', liens.length === 4, liens);

  // --- 9. le partage annonce le match, sans carres de couleur
  const partage = await p.evaluate(() => {
    const m = MATCHES.find(x => x.id === 'cdm-1998');
    return affiche(m) + "\nPeux-tu refaire la compo ?\n" + location.origin + location.pathname;
  });
  verifie('le partage est exactement les trois lignes voulues',
    partage.split('\n')[0] === 'FRANCE - BRÉSIL 98'
    && partage.split('\n')[1] === 'Peux-tu refaire la compo ?'
    && partage.split('\n').length === 3, partage);
  verifie('ni carre, ni score, ni emoji', !/[🟩🟥🟨⚽🏉🔥]|pts|\d\/\d/u.test(partage), partage);

  // --- 10. pas de debordement horizontal sur un petit telephone
  await p.setViewportSize({ width: 320, height: 700 });
  await p.waitForTimeout(100);
  const large = await p.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
  verifie('pas de debordement a 320 px', large.s <= large.c, large);

  console.log('REUSSIS\n  ' + ok.join('\n  '));
  if (ko.length) console.log('ECHECS\n  ' + ko.join('\n  '));
  console.log('ERREURS JS : ' + (erreurs.length ? JSON.stringify(erreurs, null, 1) : 'aucune'));
  await b.close();
  process.exit(ko.length || erreurs.length ? 1 : 0);
})();
