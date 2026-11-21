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
  const dJeu = await p.evaluate(() => {
    const vus = {}, deux = [];
    document.querySelectorAll('#play button').forEach(e => {
      if (!e.getClientRects().length) return;
      const t = e.textContent.trim();
      if (vus[t]) deux.push(t); else vus[t] = 1;
    });
    return deux;
  });
  v('aucun bouton en double pendant la partie', dJeu.length === 0, dJeu);
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

  // Deux boutons « Retour » cohabitaient a la fin d'une partie : celui du
  // bilan et celui de la barre du bas, l'un sous l'autre. On verifie la
  // famille entiere, pas seulement ce cas : sur l'ecran d'une compo, aucun
  // libelle de bouton ne doit apparaitre deux fois.
  const doublons = async () => p.evaluate(() => {
    const vus = {}, deux = [];
    document.querySelectorAll('#play button').forEach(e => {
      if (!e.getClientRects().length) return;
      const t = e.textContent.trim();
      if (vus[t]) deux.push(t + ' (' + vus[t] + ' et ' + e.id + ')'); else vus[t] = e.id || '?';
    });
    return deux;
  });
  const dFin = await doublons();
  v('aucun bouton en double a la fin d’une partie', dFin.length === 0, dFin);
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
    // Les chiffres sont admis : « RACING 92 » est un nom d'equipe. Et la
    // deuxieme ligne dit de quel cote : une finale a deux compos.
    /^[A-ZÀ-Ü0-9' .-]+ - [A-ZÀ-Ü0-9' .-]+ \d\d$/.test(lignes[0])
    && /^Peux-tu refaire la compo \? Côté [A-ZÀ-Ü0-9' .-]+\.$/.test(lignes[1]), lignes);
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
  // Une finale a deux compos : on choisit son cote avant de jouer.
  await p.locator('#arch .fin').first().click(); await p.waitForTimeout(250);
  await p.locator('#arch .cotes [data-cote]').first().click(); await p.waitForTimeout(400);
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

  // --- 10. le clavier s'ouvre au premier appui
  // Au doigt, aucun focus n'est pose au demarrage : sur iOS il placerait le
  // curseur sans ouvrir le clavier, et le premier appui sur un champ deja
  // focalise n'ouvre rien non plus — il n'y a pas de changement de focus a
  // signaler. Le joueur tapait sur une barre qui ne repondait pas.
  const s = await b.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await s.route('**/functions/v1/compo', r => r.fulfill({ status: 200,
    contentType: 'application/json', body: '{"roundId":"11111111-1111-1111-1111-111111111111","day":2}' }));
  await s.goto('http://127.0.0.1:8123/', { waitUntil: 'networkidle' });
  await s.fill('#pseudo', 'leo'); await s.click('#valide'); await s.waitForTimeout(200);
  await s.click('[data-jour="foot"]'); await s.waitForTimeout(500);
  v('au doigt, rien n’a le focus au demarrage',
    (await s.evaluate(() => document.activeElement.id)) !== 'inp',
    await s.evaluate(() => document.activeElement.id));
  await s.tap('#inp'); await s.waitForTimeout(250);
  v('le premier appui donne le focus a la saisie',
    (await s.evaluate(() => document.activeElement.id)) === 'inp');
  v('plus de liste de suggestions', await s.evaluate(() => !document.getElementById('sugg')));

  // L'indice doit se voir. Rendre la main au clavier le faisait remonter,
  // l'ecran se resserrait, et la lettre qu'on vient de payer disparaissait
  // avec les etiquettes.
  // Clavier ouvert, « Indice » est cache : on referme d'abord en touchant le
  // terrain, exactement comme un joueur.
  await s.tap('#pitch'); await s.waitForTimeout(250);
  await s.tap('#hint'); await s.waitForTimeout(250);
  v('l’indice ne rouvre pas le clavier',
    (await s.evaluate(() => document.activeElement.id)) !== 'inp',
    await s.evaluate(() => document.activeElement.id));
  const aide = await s.evaluate(() => {
    // .aide et non .pl.aide : l'indice peut tomber sur l'entraineur, dont la
    // pastille porte la classe « coach ».
    const d = document.querySelector('.aide .nm');
    if (!d) return null;
    const vu = !!d.getClientRects().length;
    document.getElementById('play').classList.add('court');   // comme clavier ouvert
    const autre = document.querySelector('.pl.todo:not(.aide) .nm');
    const r = { texte: d.textContent, vu, serre: !!d.getClientRects().length,
                autres: !!(autre && autre.getClientRects().length) };
    document.getElementById('play').classList.remove('court');
    return r;
  });
  v('la lettre de l’indice s’affiche', aide && aide.vu && /…$/.test(aide.texte), aide);
  v('elle reste visible quand l’ecran se resserre', aide && aide.serre && !aide.autres, aide);
  await s.close();

  // --- 10bis. partager une compo precise
  // Le lien porte le match et le cote a refaire : celui qui le recoit tombe
  // sur la meme compo, pas sur celle du jour.
  const l = await b.newPage({ viewport: { width: 390, height: 844 } });
  await l.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const appelsQui = [];
  await l.route('**/functions/v1/compo', r => {
    const c = JSON.parse(r.request().postData() || '{}');
    if (c.action === 'tableau') {
      appelsQui.push(c);
      // Les deux cotes dans une seule reponse : cote 0 joue par trois
      // personnes et plus, cote 1 par personne.
      return r.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ matchId: c.matchId, team: null, tableau: [
          { rang: 1, playerId: 'z1', team: 0, pseudo: 'marco', found: 12, size: 12 },
          { rang: 2, playerId: 'z2', team: 0, pseudo: 'paul', found: 9, size: 12 },
          { rang: 3, playerId: 'z3', team: 0, pseudo: 'ines', found: 7, size: 12 },
          { rang: 4, playerId: 'z4', team: 0, pseudo: 'jo', found: 5, size: 12 },
          { rang: 5, playerId: 'z5', team: 0, pseudo: 'ana', found: 3, size: 12 }] }) });
    }
    r.fulfill({ status: 200, contentType: 'application/json',
      body: '{"roundId":"11111111-1111-1111-1111-111111111111","day":2}' });
  });
  await l.goto('http://127.0.0.1:8123/', { waitUntil: 'networkidle' });
  await l.fill('#pseudo', 'leo'); await l.click('#valide'); await l.waitForTimeout(200);
  await l.click('#home [data-va="archives"]'); await l.waitForTimeout(250);
  await l.click('#arch .fin'); await l.waitForTimeout(250);

  // Le choix ne fait que choisir : partager se fait sur l'ecran de la compo.
  v('le choix ne propose que les equipes',
    (await l.locator('#arch .cotes button').count()) === 2);

  // Et il dit qui l'a deja refaite, cote par cote : il fallait jusqu'ici
  // l'avoir jouee pour le savoir.
  await l.waitForTimeout(400);
  const qui = (await l.textContent('#arch .qui') || '').replace(/\s+/g, ' ').trim();
  v('le choix dit qui a fait la compo', /marco 12\/12/.test(qui), qui);
  v('il s’arrete a trois noms et compte le reste', /et 2 autres/.test(qui), qui);
  v('et dit quand un cote n’a jamais ete fait', /personne/.test(qui), qui);
  v('il demande les DEUX cotes a la fois',
    appelsQui.some(x => x.matchId && (x.team === undefined || x.team === null)), appelsQui);

  // On prend le DEUXIEME cote : le lien doit le porter, pas retomber sur le
  // premier par defaut.
  await l.locator('#arch .cotes [data-cote]').nth(1).click(); await l.waitForTimeout(400);
  const vise = await l.evaluate(() => ({ id: M.id, ti: TI, nom: M.teams[TI].name }));
  v('on joue bien le cote choisi', vise.ti === 1, vise);

  // Partager depuis l'ecran de la compo, sans l'avoir finie : le message ne
  // livre que l'affiche et le cote, jamais un nom.
  v('l’ecran de la compo porte le partage', await l.isVisible('#defi'));
  await l.click('#defi'); await l.waitForTimeout(300);
  const enCours = (await l.evaluate(() => navigator.clipboard.readText())).split('\n');
  v('on partage une compo en cours',
    /e=1(&|$)/.test(enCours[2] || '') && /Côté/.test(enCours[1] || ''), enCours);
  v('et on reste sur la compo',
    await l.evaluate(() => !document.getElementById('play').classList.contains('hidden')));
  v('le bouton confirme la copie', (await l.textContent('#defi')) === 'Copié !');
  await l.click('#giveup'); await l.waitForTimeout(400);
  v('on peut partager une compo hors classement', await l.isVisible('#share'));
  await l.click('#share'); await l.waitForTimeout(250);
  const lien = (await l.evaluate(() => navigator.clipboard.readText())).split('\n')[2] || '';
  v('le lien designe le match partage', lien.includes('m=' + vise.id), lien);
  v('et le cote choisi', lien.includes('e=1'), lien);
  // Le message doit dire de quel cote : le lien seul ne se lit pas.
  const phrase = (await l.evaluate(() => navigator.clipboard.readText())).split('\n')[1] || '';
  v('le message dit de quel cote',
    phrase.includes('Côté') && phrase.toUpperCase().includes(vise.nom.toUpperCase().slice(0, 6)),
    phrase);
  await l.close();

  // Et le lien ouvre bien cette compo-la, sur le bon cote.
  const d = await b.newPage({ viewport: { width: 390, height: 844 } });
  await d.route('**/functions/v1/compo', r => r.fulfill({ status: 200,
    contentType: 'application/json', body: '{"roundId":"11111111-1111-1111-1111-111111111111","day":2}' }));
  await d.goto('http://127.0.0.1:8123/?m=rwc-2015&e=1', { waitUntil: 'networkidle' });
  await d.waitForTimeout(300);
  v('un lien demande d’abord le pseudo', await d.isVisible('#pseudo'));
  await d.fill('#pseudo', 'leo'); await d.click('#valide'); await d.waitForTimeout(600);
  const ouvert = await d.evaluate(() => ({ id: M && M.id, ti: TI, classe: RANKED, reste: location.search }));
  v('puis il ouvre la compo visee, du bon cote',
    ouvert.id === 'rwc-2015' && ouvert.ti === 1, ouvert);
  v('elle n’est pas classee', ouvert.classe === false, ouvert);
  // L'adresse est nettoyee, sinon un rechargement relancerait la partie en boucle.
  v('l’adresse est nettoyee', ouvert.reste === '', ouvert);
  await d.reload({ waitUntil: 'networkidle' }); await d.waitForTimeout(400);
  v('un rechargement ne relance pas la partie',
    await d.evaluate(() => !document.getElementById('home').classList.contains('hidden')));
  await d.goto('http://127.0.0.1:8123/?m=nimporte-quoi', { waitUntil: 'networkidle' });
  await d.waitForTimeout(400);
  v('un lien casse ramene a l’accueil',
    await d.evaluate(() => !document.getElementById('home').classList.contains('hidden')));
  await d.close();

  // --- 10ter. le tableau d'une compo, hors du jour
  // Le classement restait enferme dans la journee : on pouvait partager une
  // vieille finale sans jamais savoir ce que les autres y avaient fait.
  const t = await b.newPage({ viewport: { width: 390, height: 844 } });
  const appels = [];
  await t.route('**/functions/v1/compo', r => {
    const c = JSON.parse(r.request().postData() || '{}');
    appels.push(c);
    const corps =
      c.action === 'start'   ? { roundId: '11111111-1111-1111-1111-111111111111', day: 3, sport: c.sport, classe: c.classe } :
      c.action === 'submit'  ? { matchId: 'rwc-2015', team: 0, found: 4, size: 16, classe: false } :
      c.action === 'tableau' ? { matchId: c.matchId, team: c.team, tableau: [
          { rang: 1, playerId: 'zz', pseudo: 'marco', found: 14, size: 16 },
          { rang: 2, playerId: c.playerId, pseudo: 'leo', found: 4, size: 16 }] } :
      { day: 3, sport: 'foot', classement: [] };
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(corps) });
  });
  await t.goto('http://127.0.0.1:8123/?m=rwc-2015', { waitUntil: 'networkidle' });
  await t.fill('#pseudo', 'leo'); await t.click('#valide'); await t.waitForTimeout(800);
  const ouv = appels.find(v => v.action === 'start');
  v('une compo hors classement ouvre quand meme une partie',
    !!ouv && ouv.matchId === 'rwc-2015' && ouv.classe === false, ouv);
  v('et la partie reste hors classement', (await t.evaluate(() => RANKED)) === false);

  await t.click('#giveup'); await t.waitForTimeout(900);
  v('le resultat est envoye', !!appels.find(x => x.action === 'submit'));
  const dem = appels.find(x => x.action === 'tableau');
  v('le tableau est demande pour CE match', dem && dem.matchId === 'rwc-2015' && dem.team === 0, dem);
  const vu = (await t.textContent('#board')).replace(/\s+/g, ' ');
  v('il montre ce que les autres ont fait', /marco/.test(vu) && /14\/16/.test(vu), vu.slice(0, 60));
  v('il ne porte ni points ni chrono', !/pts|Score|Temps/.test(vu), vu.slice(0, 60));
  v('le joueur y est surligne', await t.evaluate(() => !!document.querySelector('#board tr.moi')));
  await t.close();

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
