// Un parcours complet, a la souris et au clavier : rien n'est appele de
// l'interieur. C'est ce qui attrape les erreurs de branchement que les autres
// tests, qui parlent directement aux fonctions, laissent passer.
//
//   sh tools/site.sh site && (cd site && python3 -m http.server 8123 &)
//   node tools/test_parcours.js
//
// Le serveur du classement est simule par une interception de requete, donc
// rien ne part vers Supabase et le test marche hors ligne.
const { chromium } = require('playwright');
const ok = [], ko = [];
const v = (n, c, d) => (c ? ok : ko).push(n + (c ? '' : '  <-- ' + JSON.stringify(d)));

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const err = [];
  p.on('pageerror', e => err.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') err.push('console: ' + m.text()); });
  p.on('dialog', d => d.accept());
  await p.context().grantPermissions(['clipboard-read', 'clipboard-write']);

  // --- le serveur du classement, simule
  let dernierSubmit = null;
  await p.route('**/functions/v1/compo', async route => {
    const c = JSON.parse(route.request().postData() || '{}');
    let corps;
    if (c.action === 'start') corps = { roundId: '11111111-1111-1111-1111-111111111111', day: 2, sport: c.sport };
    else if (c.action === 'submit') { dernierSubmit = c;
      corps = { day: 2, sport: 'foot', found: c.found, size: 12, hints: c.hints, timeLeft: 150, points: 1300 }; }
    else corps = { day: 2, sport: c.sport, serie: 1, classement: [
      { rang: 1, playerId: 'zz', pseudo: 'marco', points: 1350, found: 12, size: 12, seconds: 70, hints: 0 },
      { rang: 2, playerId: c.playerId, pseudo: 'leo', points: 1300, found: 12, size: 12, seconds: 90, hints: 0 }] };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(corps) });
  });

  await p.goto('http://127.0.0.1:8123/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(300);

  // --- 1. le pseudo, puis les deux cartes
  v('on demande un pseudo en arrivant', await p.isVisible('#pseudo'));
  await p.fill('#pseudo', 'leo'); await p.click('#valide'); await p.waitForTimeout(250);
  v('deux compos proposees', (await p.locator('#daily .daily').count()) === 2);

  // --- 2. on joue celle de foot, pour de vrai
  await p.click('[data-jour="foot"]'); await p.waitForTimeout(500);
  v('la partie est lancee', await p.isVisible('#pitch'));
  v('elle est classee', await p.evaluate(() => RANKED === true && ROUND !== null));
  v('le clavier a sa place sous le terrain', await p.isVisible('#inp'));

  // l'indice devoile une initiale
  const avantIndice = await p.evaluate(() => hinted.size);
  await p.click('#hint'); await p.waitForTimeout(150);
  v('l’indice marque un joueur', (await p.evaluate(() => hinted.size)) === avantIndice + 1);
  v('l’indice se voit a l’ecran', /en [A-Z]/.test(await p.textContent('#flash')));

  // on tape tous les noms, comme un joueur
  const noms = await p.evaluate(() => P.map(x => x.n));
  for (const n of noms) { await p.fill('#inp', n); await p.keyboard.press('Enter'); }
  await p.waitForTimeout(600);
  v('la compo est complete', (await p.textContent('#count')) === '12/12');
  v('le panneau de fin s’affiche', await p.isVisible('#result'));
  v('le champ disparait a la fin',
    await p.evaluate(() => getComputedStyle(document.getElementById('inp')).display === 'none'));
  v('le serveur a bien ete appele', dernierSubmit && dernierSubmit.found === 12, dernierSubmit);
  v('le score vient du serveur', (await p.textContent('#rbig')).replace(/\s| | /g, '') === '1300pts',
    await p.textContent('#rbig'));

  // --- 3. le partage
  await p.click('#share'); await p.waitForTimeout(300);
  const copie = await p.evaluate(() => navigator.clipboard.readText());
  const lignes = copie.split('\n');
  v('le partage annonce le match en deux lignes',
    // Les chiffres sont admis : « RACING 92 » est un nom d'equipe.
    /^[A-ZÀ-Ü0-9' .-]+ - [A-ZÀ-Ü0-9' .-]+ \d\d$/.test(lignes[0]) && lignes[1] === 'Peux-tu refaire la compo ?', lignes);
  v('le partage ne porte aucun carre', !/[🟩🟥🟨]/u.test(copie), copie);

  // --- 3bis. de retour a l'accueil, la compo jouee porte son classement
  await p.click('#other'); await p.waitForTimeout(600);
  const cl = await p.evaluate(() => ({
    surCarteJouee: document.querySelectorAll('[data-cl="foot"] table tbody tr').length,
    surCarteNonJouee: document.querySelectorAll('[data-cl="rugby"]').length,
    moiSurligne: !!document.querySelector('#daily .classement tr.moi'),
  }));
  v('la compo jouee affiche son classement', cl.surCarteJouee > 0, cl);
  v('la compo pas encore jouee n’en a pas', cl.surCarteNonJouee === 0, cl);
  v('le joueur est surligne dedans', cl.moiSurligne, cl);
  v('le tableau tient dans la carte', await p.evaluate(() => {
    const t = document.querySelector('#daily table'), c = t.closest('.daily');
    const cs = getComputedStyle(c), rc = c.getBoundingClientRect();
    return t.getBoundingClientRect().right <= rc.right - parseFloat(cs.paddingRight) + 1; }));

  // --- 4. retour : la carte a change d'etat
  v('on revient sur les compos', await p.isVisible('#daily'));
  v('la carte de foot propose de rejouer',
    (await p.textContent('[data-jour="foot"]')) === 'Rejouer');
  v('la carte de rugby attend toujours', (await p.textContent('[data-jour="rugby"]')) === 'Jouer');

  // --- 5. le rugby, abandonne en cours
  await p.click('[data-jour="rugby"]'); await p.waitForTimeout(500);
  v('seize reponses au rugby', (await p.textContent('#count')) === '0/16');
  await p.click('#giveup'); await p.waitForTimeout(400);
  v('abandonner termine la partie', await p.isVisible('#result'));
  v('les manquants sont en rouge', (await p.locator('#pitch .pl.miss').count()) === 15);
  await p.click('#other'); await p.waitForTimeout(300);

  // --- 6. toutes les finales
  await p.click('#home [data-va="archives"]'); await p.waitForTimeout(300);
  const nbFinales = await p.locator('#arch .fin').count();
  v('les finales sont listees', nbFinales > 0, nbFinales);
  await p.locator('#arch .fin').first().click(); await p.waitForTimeout(400);
  v('une finale se joue hors classement', (await p.evaluate(() => RANKED)) === false);
  await p.click('#giveup'); await p.waitForTimeout(400);
  v('la raison est dite au joueur', /Hors classement/.test(await p.textContent('#rtxt')),
    await p.textContent('#rtxt'));
  await p.click('#other'); await p.waitForTimeout(300);
  v('le retour ramene a la liste', await p.isVisible('#arch'));
  await p.click('#archives [data-va="home"]'); await p.waitForTimeout(200);
  await p.click('#versmoi'); await p.waitForTimeout(300);

  // --- 7. le profil a enregistre la soiree
  const txt = await p.textContent('#profil');
  v('le profil compte les compos jouees', /compos jouées/.test(txt));
  v('le code de reprise est affiche', /[0-9a-f]{8}-[0-9a-f]{4}/.test(await p.textContent('#moncode')));

  // --- 8. ce que raconte le panneau du classement, selon ce que repond le
  //         serveur. Un blanc se confond avec une panne : il doit parler.
  for (const [cas, rep, attendu] of [
    ['serveur pas a jour', { code: 'groupe', erreur: 'code de groupe invalide' }, /indisponible/],
    ['classement vide',    { day: 2, sport: 'foot', serie: 1, classement: [] }, /Personne d’autre/],
    ['classement rempli',  { day: 2, sport: 'foot', serie: 1, classement: [
        { rang: 1, playerId: 'x', pseudo: 'ami', points: 1300, found: 12, size: 12, seconds: 80, hints: 0 }] }, /ami/],
  ]) {
    const q = await b.newPage({ viewport: { width: 390, height: 844 } });
    await q.route('**/functions/v1/compo', async r => {
      const c = JSON.parse(r.request().postData() || '{}');
      const corps = c.action === 'start' ? { roundId: '11111111-1111-1111-1111-111111111111', day: 2, sport: c.sport }
        : c.action === 'submit' ? { day: 2, sport: 'foot', found: 12, size: 12, hints: 0, timeLeft: 150, points: 1300 }
        : rep;
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(corps) });
    });
    await q.goto('http://127.0.0.1:8123/', { waitUntil: 'networkidle' });
    await q.fill('#pseudo', 'leo'); await q.click('#valide'); await q.waitForTimeout(200);
    await q.click('[data-jour="foot"]'); await q.waitForTimeout(400);
    for (const n of await q.evaluate(() => P.map(x => x.n))) { await q.fill('#inp', n); await q.keyboard.press('Enter'); }
    await q.waitForTimeout(600);
    const dit = (await q.textContent('#board')).trim();
    v('le classement se raconte : ' + cas, attendu.test(dit), dit.slice(0, 80));
    await q.close();
  }

  // --- 9. navigation privee : localStorage leve a chaque acces. L'app doit
  //          rester jouable, et surtout garder la meme identite d'un appel a
  //          l'autre, sinon le classement interroge quelqu'un d'autre.
  const w = await b.newPage({ viewport: { width: 390, height: 844 } });
  await w.addInitScript(() => { Object.defineProperty(window, 'localStorage',
    { get() { throw new Error('bloque'); } }); });
  const errPrive = [];
  w.on('pageerror', e => errPrive.push(e.message));
  await w.goto('http://127.0.0.1:8123/', { waitUntil: 'networkidle' });
  await w.waitForTimeout(300);
  v('en navigation privee, l’identite ne bouge pas',
    await w.evaluate(() => moi().id === moi().id));
  await w.fill('#pseudo', 'leo'); await w.click('#valide'); await w.waitForTimeout(250);
  v('en navigation privee, le pseudo tient', await w.evaluate(() => moi().pseudo === 'leo'));
  v('en navigation privee, les compos s’affichent',
    (await w.locator('#daily .daily').count()) === 2);
  v('en navigation privee, rien ne casse', errPrive.length === 0, errPrive);
  await w.close();

  // --- 10. l'aide a l'orthographe
  // Le point sensible : la liste ne doit rien dire de la compo du jour. On la
  // compare donc sur deux compos differentes, et hors partie : si elle change,
  // c'est qu'elle regarde le terrain.
  const s = await b.newPage({ viewport: { width: 390, height: 844 } });
  await s.goto('http://127.0.0.1:8123/', { waitUntil: 'networkidle' });
  await s.waitForTimeout(300);
  v('elle puise dans toute la base', (await s.evaluate(() => tousLesNoms().length)) > 1000);

  await s.fill('#pseudo', 'leo'); await s.click('#valide'); await s.waitForTimeout(200);
  await s.click('[data-jour="foot"]'); await s.waitForTimeout(400);
  const nom1 = await s.evaluate(() => nomCourt(P[0].n));
  await s.fill('#inp', 'bar'); await s.waitForTimeout(150);
  v('trois lettres ne proposent rien', await s.evaluate(() => document.getElementById('sugg').hidden));

  // Ce qu'on propose doit avoir un rapport avec ce qui est tape. « cle »
  // proposait Poitrenaud, parce qu'il s'appelle Clement : on cherchait aussi
  // dans le prenom, alors que la pastille n'affiche que le nom de famille.
  const pertinence = await s.evaluate(() => ({
    cler: suggere('cler').map(x => x.f),
    dech: suggere('dech').map(x => x.f),     // faute d'orthographe : l'oreille rattrape
  }));
  v('une suggestion a un rapport avec ce qui est tape',
    pertinence.cler.every(f => /^cler/i.test(f.replace(/[^a-z]/gi, ''))), pertinence.cler);
  v('l’oreille rattrape une faute de debut',
    pertinence.dech.length > 0, pertinence.dech);
  await s.fill('#inp', nom1.slice(0, 4).toLowerCase()); await s.waitForTimeout(200);
  const chips = await s.locator('#sugg button').allTextContents();
  v('quatre lettres proposent des noms', chips.length > 0, chips);
  v('la ligne de retour laisse la place',
    await s.evaluate(() => document.getElementById('flash').hidden));
  const avant = await s.textContent('#count');
  await s.locator('#sugg button', { hasText: nom1 }).first().click();
  await s.waitForTimeout(300);
  v('toucher une suggestion valide le joueur',
    (await s.textContent('#count')) !== avant, { avant, apres: await s.textContent('#count') });
  v('la liste se referme ensuite', await s.evaluate(() => document.getElementById('sugg').hidden));

  // un nom de la base qui n'est pas dans cette compo : refuse, sans rien devoiler
  const absent = await s.evaluate(() => {
    const ici = new Set(P.map(x => nomCourt(x.n)));
    const p = tousLesNoms().find(x => !ici.has(x.f) && x.cf.length > 5);
    return p ? p.f : null;
  });
  if (absent) {
    await s.fill('#inp', absent.slice(0, 5)); await s.waitForTimeout(200);
    const b2 = s.locator('#sugg button', { hasText: absent }).first();
    if (await b2.count()) {
      await b2.click(); await s.waitForTimeout(250);
      v('un joueur hors compo est refuse', /Pas dans cette compo/.test(await s.textContent('#flash')),
        await s.textContent('#flash'));
    }
  }

  // Le point sensible, garde pour la fin parce qu'il change de compo : la liste
  // ne doit rien dire du terrain. Si elle change d'une compo a l'autre, c'est
  // qu'elle le regarde.
  const memes = await s.evaluate(() => {
    const dit = () => suggere('ro').concat(suggere('bar')).map(x => x.f).join('|');
    start(MATCHES.find(x => x.id === 'cdm-1998'), 0, false); const a = dit();
    start(MATCHES.find(x => x.id === 'rwc-1995'), 0, false); const c = dit();
    P.forEach((_, i) => hit(i));                      // compo entierement trouvee
    const d = dit();
    return { a, c, d };
  });
  v('la liste ne depend pas de la compo jouee',
    memes.a === memes.c && memes.c === memes.d, memes);
  await s.close();

  // --- 11. la mesure d'audience
  // Deux choses : qu'elle ne parte vers personne tant qu'aucun code n'est
  // renseigne, et que les chemins comptes disent bien ce qui se passe —
  // l'app ne rechargeant jamais la page, sans eux on ne verrait qu'une vue
  // par visiteur.
  const g = await b.newPage({ viewport: { width: 390, height: 844 } });
  // Supabase est notre propre serveur, et il est simule ici : ce qu'on
  // surveille, c'est qu'aucune mesure ne parte chez un tiers.
  const dehors = [];
  g.on('request', r => { const u = r.url();
    if (/goatcounter|zgo\.at/.test(u)) dehors.push(u); });
  await g.route('**/functions/v1/compo', r => r.fulfill({ status: 200,
    contentType: 'application/json', body: '{"roundId":"11111111-1111-1111-1111-111111111111","day":2}' }));
  await g.addInitScript(() => { window.__vu = [];
    window.goatcounter = { count: o => window.__vu.push(o.path) }; });
  await g.goto('http://127.0.0.1:8123/', { waitUntil: 'networkidle' });
  await g.fill('#pseudo', 'leo'); await g.click('#valide'); await g.waitForTimeout(200);
  await g.click('[data-jour="foot"]'); await g.waitForTimeout(400);
  await g.click('#giveup'); await g.waitForTimeout(400);
  await g.click('#other'); await g.waitForTimeout(200);
  await g.click('#versmoi'); await g.waitForTimeout(300);
  const vus = await g.evaluate(() => window.__vu);
  v('la partie est comptee', vus.includes('/partie/foot'), vus);
  v('la fin de partie est comptee', vus.some(x => /^\/fini\/foot\//.test(x)), vus);
  v('le profil est compte', vus.includes('/profil'), vus);
  v('aucun chemin ne porte de donnee du joueur',
    vus.every(x => /^\/(profil|partage|partie|fini)(\/(foot|rugby|passee|complet|partiel))*$/.test(x)), vus);
  v('aucune mesure ne part chez un tiers sans code', dehors.length === 0, dehors);
  await g.close();

  // --- 12. le tableau de bord du proprietaire
  // La porte est au serveur, pas dans le navigateur : on verifie qu'un joueur
  // ordinaire ne voit rien, et que le bloc n'apparait que sur reponse du
  // serveur. Le faux serveur tient le secret cote Node, comme le vrai.
  const a = await b.newPage({ viewport: { width: 390, height: 844 } });
  let ADMIN = null, demandes = 0;
  await a.route('**/functions/v1/compo', async r => {
    const c = JSON.parse(r.request().postData() || '{}');
    if (c.action !== 'stats') return r.fulfill({ status: 200, contentType: 'application/json',
      body: '{"day":2,"sport":"foot","classement":[]}' });
    demandes++;
    const bon = ADMIN && c.playerId === ADMIN;
    await r.fulfill({ status: bon ? 200 : 403, contentType: 'application/json',
      body: bon ? JSON.stringify({ jour: 3, joueurs: 12, parties: 30, fideles: 4,
          sports: { foot: { n: 20, complets: 5, indices: 3, secondes: 1800, trouves: 180, total: 240 },
                    rugby: { n: 10, complets: 1, indices: 6, secondes: 1500, trouves: 100, total: 160 } },
          jours: [{ day: 3, foot: 8, rugby: 4, joueurs: 9 }] })
        : JSON.stringify({ code: 'refuse', erreur: 'reserve' }) });
  });
  await a.goto('http://127.0.0.1:8123/', { waitUntil: 'networkidle' });
  await a.fill('#pseudo', 'leo'); await a.click('#valide'); await a.waitForTimeout(200);
  await a.click('#versmoi'); await a.waitForTimeout(400);
  v('un joueur ordinaire ne voit aucun tableau de bord',
    await a.evaluate(() => !document.getElementById('admin').innerHTML));
  v('le refus ne casse rien', demandes > 0, demandes);

  ADMIN = await a.evaluate(() => moi().id);
  await a.click('#moi [data-va="home"]'); await a.waitForTimeout(200);
  await a.click('#versmoi'); await a.waitForTimeout(500);
  const bord = await a.textContent('#admin');
  v('le proprietaire voit le tableau de bord', /Tableau de bord/.test(bord || ''), (bord || '').slice(0, 60));
  v('il porte les chiffres du serveur', /12/.test(bord) && /30/.test(bord), (bord || '').slice(0, 120));
  await a.close();

  console.log('REUSSIS\n  ' + ok.join('\n  '));
  if (ko.length) console.log('ECHECS\n  ' + ko.join('\n  '));
  console.log('ERREURS JS : ' + (err.length ? JSON.stringify(err, null, 1) : 'aucune'));
  await b.close();
  process.exit(ko.length || err.length ? 1 : 0);
})();
