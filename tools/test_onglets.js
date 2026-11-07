// Les onglets, le profil, les jours d'avant et le joueur mystere.
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

  // --- onglets
  for (const [onglet, attendu] of [['mystere','mystere'],['moi','moi'],['home','home']]) {
    await p.click(`[data-onglet="${onglet}"]`); await p.waitForTimeout(250);
    v('onglet ' + onglet, JSON.stringify(await vue()) === JSON.stringify([attendu]), await vue());
  }

  // --- profil : code de reprise
  await p.click('[data-onglet="moi"]'); await p.waitForTimeout(200);
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

  // --- jours d'avant
  await p.click('[data-onglet="home"]'); await p.waitForTimeout(150);
  await p.click('#versjours'); await p.waitForTimeout(250);
  v('la section des jours d’avant s’ouvre', JSON.stringify(await vue()) === JSON.stringify(['passe']));
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
    v('le retour ramene aux jours d’avant', JSON.stringify(await vue()) === JSON.stringify(['passe']), await vue());
  }

  // --- joueur mystere
  await p.click('[data-onglet="mystere"]'); await p.waitForTimeout(300);
  const m1 = await p.evaluate(() => ({ nom: MYST.g.nom, ind: MYST.ind.length, vus: MYST.vus,
                                       finales: MYST.g.finales.length }));
  v('un joueur est tire, avec au moins deux finales', m1.finales >= 2, m1);
  v('un seul indice au depart', m1.vus === 1, m1);
  v('plusieurs indices en reserve', m1.ind >= 5, m1);

  await p.fill('#qmyst', 'nimportequi'); await p.click('#vmyst'); await p.waitForTimeout(200);
  v('une erreur devoile un indice', (await p.evaluate(() => MYST.vus)) === 2);

  await p.fill('#qmyst', m1.nom); await p.click('#vmyst'); await p.waitForTimeout(200);
  const g = await p.evaluate(() => ({ fini: MYST.fini, gagne: MYST.gagne, b: store.get('compo:mystere') }));
  v('le bon nom gagne', g.fini && g.gagne, g);
  v('le compteur retient la partie', g.b && g.b.joues === 1 && g.b.trouves === 1, g);

  await p.click('#nmyst'); await p.waitForTimeout(200);
  v('on peut enchainer', (await p.evaluate(() => MYST.fini)) === false);

  // --- la barre d'onglets disparait pendant une partie
  await p.click('[data-onglet="home"]'); await p.waitForTimeout(150);
  await p.evaluate(() => { const m = MATCHES.find(x => x.id === 'cdm-1998'); start(m, 0, false); });
  await p.waitForTimeout(200);
  // on verifie qu'elle est vraiment invisible, pas seulement marquee hidden :
  // un display:flex l'emporte sur l'attribut, et la barre restait affichee.
  v('la barre s’efface pendant la partie',
    await p.evaluate(() => getComputedStyle(document.getElementById('onglets')).display === 'none'));

  // --- rien ne deborde, sur chaque onglet
  for (const o of ['home', 'mystere', 'moi', 'passe']) {
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
