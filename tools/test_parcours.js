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
    else corps = { day: 2, sport: c.sport, serie: 1, classement: [] };
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
    /^[A-ZÀ-Ü' .-]+ - [A-ZÀ-Ü' .-]+ \d\d$/.test(lignes[0]) && lignes[1] === 'Peux-tu refaire la compo ?', lignes);
  v('le partage ne porte aucun carre', !/[🟩🟥🟨]/u.test(copie), copie);

  // --- 4. retour : la carte a change d'etat
  await p.click('#other'); await p.waitForTimeout(300);
  v('on revient sur les compos', await p.isVisible('#daily'));
  v('la carte de foot propose de rejouer',
    (await p.textContent('[data-jour="foot"]')) === 'Rejouer hors classement');
  v('la carte de rugby attend toujours', (await p.textContent('[data-jour="rugby"]')) === 'Jouer');

  // --- 5. le rugby, abandonne en cours
  await p.click('[data-jour="rugby"]'); await p.waitForTimeout(500);
  v('seize reponses au rugby', (await p.textContent('#count')) === '0/16');
  await p.click('#giveup'); await p.waitForTimeout(400);
  v('abandonner termine la partie', await p.isVisible('#result'));
  v('les manquants sont en rouge', (await p.locator('#pitch .pl.miss').count()) === 15);
  await p.click('#other'); await p.waitForTimeout(300);

  // --- 6. les jours d'avant
  await p.click('#versmoi'); await p.waitForTimeout(300);
  const nbJours = await p.locator('#listepasse .jour').count();
  v('les jours passes sont listes', nbJours > 0, nbJours);
  await p.locator('#listepasse .jour').first().click(); await p.waitForTimeout(400);
  v('un jour passe se joue hors classement', (await p.evaluate(() => RANKED)) === false);
  await p.click('#giveup'); await p.waitForTimeout(400);
  v('la raison est dite au joueur', /Hors classement/.test(await p.textContent('#rtxt')),
    await p.textContent('#rtxt'));
  await p.click('#other'); await p.waitForTimeout(300);
  v('le retour ramene au profil', await p.isVisible('#listepasse'));

  // --- 7. le profil a enregistre la soiree (on y est deja : le retour d'un
  //        jour passe ramene ici, et le portrait est cache avec l'accueil)
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

  console.log('REUSSIS\n  ' + ok.join('\n  '));
  if (ko.length) console.log('ECHECS\n  ' + ko.join('\n  '));
  console.log('ERREURS JS : ' + (err.length ? JSON.stringify(err, null, 1) : 'aucune'));
  await b.close();
  process.exit(ko.length || err.length ? 1 : 0);
})();
