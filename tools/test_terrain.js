// La mise en page du terrain, balayee sur dix compos et six largeurs.
//
//   sh tools/site.sh site && (cd site && python3 -m http.server 8123 &)
//   node tools/test_terrain.js
//
// Deux choses a tenir, qui se contredisent : resserrer l'ecran au maximum, et
// garder les noms lisibles. Les etiquettes ne doivent ni sortir du terrain ni
// se chevaucher de plus de quelques pixels, a toutes les largeurs et pour
// toutes les formations — un 1-4-3-3 de foot et une melee de rugby n'ont pas
// du tout la meme densite.
const { chromium } = require('playwright');

const COMPOS = ['rwc-2011', 'hcup-2024', 'cdm-1998', 'cdm-2026', 'top14-1993',
                'euro-1992', 'ldc-2013', 'cdm-1990', 'hcup-1997', 'rwc-1995'];
const LARGEURS = [320, 360, 390, 430, 500, 600];
const CHEVAUCHEMENT_MAX = 8;   // px ; au-dela ca se voit

(async () => {
  const b = await chromium.launch();
  const ennuis = [];
  let pire = 0, nb = 0;

  for (const id of COMPOS) for (const w of LARGEURS) {
    // Sans ca on mesure pendant l'animation d'apparition, qui part a scale(.6) :
    // les boites rendues sont alors fausses, et le test ment.
    const p = await b.newPage({ viewport: { width: w, height: 1000 }, reducedMotion: 'reduce' });
    await p.goto('http://127.0.0.1:8123/', { waitUntil: 'networkidle' });
    await p.waitForTimeout(200);
    const existe = await p.evaluate(m => !!MATCHES.find(x => x.id === m), id);
    if (!existe) { ennuis.push(`${id} : compo absente de la base`); await p.close(); continue; }
    await p.evaluate(m => { const x = MATCHES.find(y => y.id === m); start(x, 0, false);
                            P.forEach((_, i) => { if (!P[i].coach) hit(i); }); }, id);
    await p.waitForTimeout(170);

    const r = await p.evaluate(() => {
      const pl = [...document.querySelectorAll('.pl')].map(e => e.getBoundingClientRect());
      const nm = [...document.querySelectorAll('.pl .nm')].map(e => e.getBoundingClientRect());
      const pit = document.getElementById('pitch').getBoundingClientRect();
      let n = 0, pr = 0, dehors = 0;
      pl.forEach(e => { if (e.top < pit.top - 1 || e.bottom > pit.bottom + 1) dehors++; });
      for (let i = 0; i < nm.length; i++) for (let j = i + 1; j < nm.length; j++) {
        const ox = Math.min(nm[i].right, nm[j].right) - Math.max(nm[i].left, nm[j].left);
        const oy = Math.min(nm[i].bottom, nm[j].bottom) - Math.max(nm[i].top, nm[j].top);
        if (ox > 1 && oy > 1) { n++; pr = Math.max(pr, Math.min(ox, oy)); }
      }
      return { n, pr: Math.round(pr), dehors,
               titre: Math.round(document.getElementById('ptitle').getBoundingClientRect().top),
               deborde: document.documentElement.scrollWidth > document.documentElement.clientWidth };
    });

    nb += r.n; pire = Math.max(pire, r.pr);
    if (r.dehors)  ennuis.push(`${id} ${w}px : ${r.dehors} element(s) hors du terrain`);
    if (r.pr > CHEVAUCHEMENT_MAX) ennuis.push(`${id} ${w}px : chevauchement de ${r.pr}px`);
    if (r.deborde) ennuis.push(`${id} ${w}px : la page deborde en largeur`);
    if (r.titre > 40) ennuis.push(`${id} ${w}px : le titre commence a ${r.titre}px, trop bas`);
    await p.close();
  }

  // --- le clavier ne doit pas emporter le terrain hors de vue
  // On simule le clavier en retrecissant la fenetre : pendant une partie,
  // l'ecran doit tenir dedans, terrain entier et saisie visible, sans defilement.
  const q = await b.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce',
                              hasTouch: true });
  await q.goto('http://127.0.0.1:8123/', { waitUntil: 'networkidle' });
  await q.waitForTimeout(300);
  await q.evaluate(() => { const m = MATCHES.find(x => x.id === 'cdm-1998'); start(m, 0, false); });
  await q.waitForTimeout(250);
  for (const hauteur of [844, 700, 540, 460, 400]) {
    await q.setViewportSize({ width: 390, height: hauteur });
    await q.waitForTimeout(250);
    const r = await q.evaluate(() => {
      const pit = document.getElementById('pitch').getBoundingClientRect();
      const inp = document.getElementById('inp').getBoundingClientRect();
      return { terrainEntier: pit.top >= -1 && pit.bottom <= innerHeight + 1,
               saisieVisible: inp.bottom <= innerHeight + 1,
               defile: document.documentElement.scrollHeight > innerHeight + 1,
               terrain: Math.round(pit.height) };
    });
    if (!r.terrainEntier) ennuis.push(`fenetre ${hauteur}px : le terrain sort de l'ecran`);
    if (!r.saisieVisible) ennuis.push(`fenetre ${hauteur}px : la saisie n'est pas visible`);
    if (r.defile)         ennuis.push(`fenetre ${hauteur}px : la page defile pendant la partie`);
  }

  // Pendant la partie la page est bloquee : rien ne doit pouvoir defiler
  // sous le panneau, sinon le terrain part sous le clavier.
  const bloque = await q.evaluate(() => getComputedStyle(document.body).overflow === 'hidden'
    && getComputedStyle(document.getElementById('play')).position === 'fixed');
  if (!bloque) ennuis.push('en partie : la page n’est pas bloquee');

  // Et il faut une sortie : quand la place manque, « Abandonner » et « Retour »
  // disparaissent ; toucher le terrain doit rendre la main.
  await q.focus('#inp');
  await q.waitForTimeout(150);
  if (await q.evaluate(() => document.activeElement.id !== 'inp'))
    ennuis.push('la saisie ne prend pas le focus');
  await q.tap('#pitch');
  await q.waitForTimeout(200);
  if (await q.evaluate(() => document.activeElement.id === 'inp'))
    ennuis.push('toucher le terrain ne ferme pas le clavier : on est pris au piege');

  // Une fois la partie finie, la page redevient normale.
  await q.click('#giveup');
  await q.waitForTimeout(500);
  if (await q.evaluate(() => getComputedStyle(document.body).overflow === 'hidden'))
    ennuis.push('apres la partie : la page reste bloquee');
  await q.close();

  console.log(`${COMPOS.length * LARGEURS.length} combinaisons : ${nb} chevauchement(s), pire ${pire}px`);
  if (ennuis.length) { console.log('ENNUIS'); ennuis.forEach(x => console.log('  ' + x)); }
  else console.log('Rien ne sort du terrain, rien ne deborde, le titre est en haut.');
  await b.close();
  process.exit(ennuis.length ? 1 : 0);
})();
