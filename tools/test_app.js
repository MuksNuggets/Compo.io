// Tests de bout en bout de l'app, au vrai navigateur.
//   python3 -m http.server 8123 --bind 127.0.0.1 &
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
  p.on('console', m => { if (m.type() === 'error') erreurs.push('console: ' + m.text()); });
  p.on('dialog', d => d.accept());

  await p.goto('http://127.0.0.1:8123/', { waitUntil: 'networkidle' });

  // --- 1. pseudo demandé d'abord, une seule carte
  let n = await p.evaluate(() => document.querySelectorAll('#daily .daily').length);
  verifie('avant pseudo : une seule carte', n === 1, n);

  await p.fill('#pseudo', 'leo');
  await p.click('#valide');
  await p.waitForTimeout(200);

  // --- 2. deux cartes, une par sport
  const cartes = await p.evaluate(() => [...document.querySelectorAll('#daily .daily')]
    .map(c => ({ tag: c.querySelector('.tag').textContent, bouton: c.querySelector('button').dataset.jour })));
  verifie('deux cartes, foot puis rugby',
    cartes.length === 2 && cartes[0].bouton === 'foot' && cartes[1].bouton === 'rugby', cartes);

  // --- 3. l'archive est fermée au départ
  verifie('archive fermée au départ', await p.evaluate(() => document.getElementById('archive').hidden));

  // --- 4. les deux compos du jour sont hors de l'archive
  await p.click('#voirtout');
  await p.waitForTimeout(150);
  const etat = await p.evaluate(() => {
    const picks = picksDuJour();
    const cle = pk => pk.m.id + ':' + pk.ti;
    const dans = k => !!document.querySelector('#list .pick[data-compo="' + k + '"]');
    return {
      ouverte: !document.getElementById('archive').hidden,
      foot: cle(picks.foot), rugby: cle(picks.rugby),
      footVisible: dans(cle(picks.foot)),
      rugbyVisible: dans(cle(picks.rugby)),
      boutons: document.querySelectorAll('#list .pick').length,
      total: MATCHES.reduce((n, m) => n + m.teams.length, 0),
    };
  });
  verifie('archive ouverte au clic', etat.ouverte);
  verifie('exactement deux compos retirées', etat.boutons === etat.total - 2, etat);
  verifie('compo du jour foot absente de l’archive', !etat.footVisible, etat);
  verifie('compo du jour rugby absente de l’archive', !etat.rugbyVisible, etat);
  await p.click('#voirtout');

  // --- 5. jouer le foot : seul le foot est enregistré
  await p.evaluate(async () => {
    const vrai = window.fetch;
    window.fetch = async (u, o) => {
      const c = JSON.parse(o.body);
      if (c.action === 'start') return { json: async () => ({ roundId: '11111111-1111-1111-1111-111111111111', day: DAYN, sport: c.sport }) };
      return { json: async () => ({ day: DAYN, sport: 'foot', found: 12, size: 12, hints: 0, timeLeft: 100, points: 1200 }) };
    };
    const btn = document.querySelector('[data-jour="foot"]');
    btn.click();
    await new Promise(r => setTimeout(r, 120));
    P.forEach((_, i) => found.add(i)); left = 100; end();
    await new Promise(r => setTimeout(r, 150));
    window.fetch = vrai;
  });
  const apres = await p.evaluate(() => ({
    foot: !!store.get(dailyKey(DAYN, 'foot')),
    rugby: !!store.get(dailyKey(DAYN, 'rugby')),
    gros: document.getElementById('rbig').textContent,
    partage: document.getElementById('share').hidden,
  }));
  verifie('foot enregistré', apres.foot, apres);
  verifie('rugby toujours pas joué', !apres.rugby, apres);
  verifie('score serveur affiché', apres.gros.replace(/\s|\u202f|\u00a0/g, '') === '1200pts', apres);

  // --- 6. de retour à l'accueil : carte foot faite, carte rugby à jouer
  await p.evaluate(() => home());
  await p.waitForTimeout(150);
  const cartes2 = await p.evaluate(() => [...document.querySelectorAll('#daily .daily')]
    .map(c => c.querySelector('button').textContent));
  verifie('carte foot passée en rejouer', cartes2[0] === 'Rejouer hors classement', cartes2);
  verifie('carte rugby encore à jouer', cartes2[1] === 'Jouer', cartes2);

  // --- 7. la compo du jour jouée réapparaît dans l'archive
  await p.click('#voirtout'); await p.waitForTimeout(150);
  const revient = await p.evaluate(() => {
    const pk = picksDuJour().foot;
    return !!document.querySelector('#list .pick[data-compo="' + pk.m.id + ':' + pk.ti + '"]');
  });
  verifie('compo foot revenue dans l’archive une fois jouée', revient);
  await p.click('#voirtout');

  // --- 8. vieux serveur : deja_joue SANS sport -> on joue hors classement, pas de zéro
  const vieux = await p.evaluate(async () => {
    const vrai = window.fetch;
    window.fetch = async () => ({ json: async () => ({ code: 'deja_joue', erreur: 'deja joue', day: DAYN }) });
    document.querySelector('[data-jour="rugby"]').click();
    await new Promise(r => setTimeout(r, 150));
    window.fetch = vrai;
    const classe = RANKED, note = NOTE_FIN;
    P.forEach((_, i) => found.add(i)); left = 100; end();
    await new Promise(r => setTimeout(r, 100));
    return { classe, note, enregistre: !!store.get(dailyKey(DAYN, 'rugby')),
             phrase: document.getElementById('rtxt').textContent };
  });
  verifie('vieux serveur : partie non classée', vieux.classe === false, vieux);
  verifie('vieux serveur : aucun zéro enregistré', !vieux.enregistre, vieux);
  verifie('vieux serveur : la raison est dite', /non class/.test(vieux.phrase), vieux);

  // --- 9. nouveau serveur : deja_joue AVEC sport -> on enregistre
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
  verifie('nouveau serveur : le refus est enregistré', neuf.enregistre, neuf);

  console.log('REUSSIS\n  ' + ok.join('\n  '));
  if (ko.length) console.log('ECHECS\n  ' + ko.join('\n  '));
  console.log('ERREURS JS : ' + (erreurs.length ? JSON.stringify(erreurs, null, 1) : 'aucune'));
  await b.close();
  process.exit(ko.length || erreurs.length ? 1 : 0);
})();
