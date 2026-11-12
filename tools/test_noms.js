// Le moteur de reconnaissance des noms, passe au crible des 234 compos.
//
//   sh tools/site.sh site && (cd site && python3 -m http.server 8123 &)
//   node tools/test_noms.js
//
// Deux dangers opposes. Etre trop strict : un nom difficile ne passe pas.
// Etre trop large : une faute de frappe valide le MAUVAIS joueur, et la ca
// fausse une partie classee. Le test mesure les deux en simulant ce qu'un
// joueur tape vraiment, pas en comparant des cles entre elles.
const { chromium } = require('playwright');

// Fautes plausibles, telles qu'un francophone les ecrirait de memoire.
const FAUTES = [
  ['cdm-1998', 0, 'Fabien Barthez',   'barthès'],
  ['cdm-1998', 0, 'Zinedine Zidane',  'zidane'],
  ['cdm-1998', 0, 'Zinedine Zidane',  'zizou'],
  ['cdm-1998', 0, 'Lilian Thuram',    'turam'],
  ['cdm-1998', 0, 'Bixente Lizarazu', 'lizarazou'],
  ['cdm-1998', 0, 'Christian Karembeu','carembeu'],
  ['cdm-1998', 0, "Stéphane Guivarc'h",'guivarch'],
  ['cdm-1998', 0, 'Marcel Desailly',  'dessailly'],
  ['cdm-1998', 0, 'Youri Djorkaeff',  'djorkaef'],
  ['cdm-1998', 0, 'Fabien Barthez',   'barthez fabien'],
  ['cdm-2014', 0, 'Bastian Schweinsteiger', 'chvainstaiguer'],
  ['cdm-2014', 0, 'Bastian Schweinsteiger', 'schweinsteigger'],
  ['cdm-2014', 0, 'Jérôme Boateng',   'boatang'],
  ['cdm-2014', 0, 'Miroslav Klose',   'klosé'],
  ['cdm-2022', 0, 'Emiliano Martínez','dibu'],
  ['cdm-2022', 0, 'Alexis Mac Allister','macallister'],
  ['cdm-2022', 1, 'Aurélien Tchouaméni','tchouameni'],
  ['cdm-2022', 1, 'Dayot Upamecano',  'upamecano'],
  ['rwc-2011', 0, 'Richie McCaw',     'mccaw'],
  ['hcup-2024',0, 'Antoine Dupont',   'dupont'],
  ['hcup-2024',0, 'Emmanuel Meafou',  'meafou'],
  ['ldc-2013', 0, 'Philipp Lahm',     'lam'],
  ['ldc-2013', 0, 'Arjen Robben',     'roben'],
  // Les particules : le prenom ne s'arrete pas toujours au premier mot.
  ['rwc-2023', 0, 'Pieter-Steph du Toit', 'du toit'],
  ['rwc-2023', 0, 'Pieter-Steph du Toit', 'dutoit'],
  ['rwc-2023', 0, 'Pieter-Steph du Toit', 'toit'],
  ['rwc-2019', 0, 'Faf de Klerk',      'de klerk'],
  ['cdm-2010', 1, 'Giovanni van Bronckhorst', 'van bronckhorst'],
  ['cdm-2010', 1, 'Mark van Bommel',   'van bommel'],
  ['hcup-2018', 1, 'Bernard Le Roux',  'le roux'],
  ['hcup-2016', 1, 'François van der Merwe', 'van der merwe'],
];

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto('http://127.0.0.1:8123/', { waitUntil: 'networkidle' });

  // --- 1. on tape le nom de chaque joueur : tombe-t-on sur lui ?
  // Un nom de famille partage par deux coequipiers (les freres Vunipola) est
  // accepte s'il rend l'un des deux : le jeu remplit alors le second a la
  // deuxieme saisie. Ce qui est interdit, c'est de rendre quelqu'un d'autre.
  const r = await p.evaluate(() => {
    const norme = s => norm(s).replace(/ /g, '');
    // On tape ce que l'app affiche sur le terrain, particules comprises :
    // « du toit », pas « steph du toit ».
    const nomDeFamille = n => norme(nomCourt(n));
    const rates = [], faux = [];
    MATCHES.forEach(m => m.teams.forEach((t, ti) => {
      start(m, ti, false);
      const gens = P.map((x, i) => ({ i, nom: x.n }));
      gens.forEach(({ i, nom }) => {
        [nomDeFamille(nom), norme(nom)].forEach(saisie => {
          if (saisie.length < 2) return;
          found.clear();
          const j = cherche(saisie, true, false);
          if (j < 0) { rates.push({ match: m.id, equipe: t.name, nom, saisie }); return; }
          if (j !== i && nomDeFamille(P[j].n) !== nomDeFamille(nom))
            faux.push({ match: m.id, equipe: t.name, saisie, attendu: nom, rendu: P[j].n });
        });
      });
    }));
    return { rates, faux, total: MATCHES.reduce((n, m) => n + m.teams.reduce((k, t) => k + t.p.length + (t.coach ? 1 : 0), 0), 0) };
  });

  // --- 2. les fautes plausibles tombent-elles sur le bon joueur ?
  const mauvais = await p.evaluate(F => F.map(([id, ti, attendu, saisie]) => {
    const m = MATCHES.find(x => x.id === id);
    if (!m) return { id, saisie, erreur: 'match absent' };
    start(m, ti, false); found.clear();
    const i = cherche(saisie, true, false);
    const trouve = i >= 0 ? P[i].n : null;
    return trouve === attendu ? null : { id, saisie, attendu, trouve };
  }).filter(Boolean), FAUTES);

  // --- 3. on ne valide pas un nom sous les doigts
  // « heyman » a la meme cle phonetique que « heymans » : le joueur etait
  // valide a l'avant-derniere lettre, la barre se vidait, et le S tombait
  // dedans. On tape lettre a lettre, pour de vrai, et on verifie que rien ne
  // part avant la fin.
  const trop = await p.evaluate(async () => {
    const m = MATCHES.find(x => x.id === 'hcup-2004');
    const ti = m.teams.findIndex(t => t.p.some(j => j[3].includes('Heymans')));
    if (ti < 0) return ['Heymans introuvable dans hcup-2004'];
    start(m, ti, false);
    const inp = document.getElementById('inp'), ennuis = [];
    const tape = async (txt) => {
      inp.value = '';
      for (let i = 1; i <= txt.length; i++) {
        inp.value = txt.slice(0, i);
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        if (inp.value === '' && i < txt.length)
          ennuis.push(`« ${txt} » valide des « ${txt.slice(0, i)} »`);
        await new Promise(r => setTimeout(r, 30));
      }
    };
    await tape('heymans');
    await new Promise(r => setTimeout(r, 900));          // le temps que l'attente expire
    if (inp.value !== '') ennuis.push('« heymans » tape en entier n’a pas ete valide');
    return ennuis;
  });

  console.log(`Noms testes : ${r.total} joueurs, nom de famille et nom complet.`);
  console.log(`Validation anticipee : ${trop.length ? trop.join(' / ') : 'aucune'}`);
  console.log(`  pas reconnus    : ${r.rates.length}`);
  r.rates.slice(0, 15).forEach(x => console.log('    ', JSON.stringify(x)));
  console.log(`  MAUVAIS joueur  : ${r.faux.length}`);
  r.faux.slice(0, 15).forEach(x => console.log('    ', JSON.stringify(x)));
  console.log(`Fautes plausibles non reconnues : ${mauvais.length} sur ${FAUTES.length}`);
  mauvais.forEach(x => console.log('    ', JSON.stringify(x)));

  await b.close();
  process.exit(r.rates.length || r.faux.length || mauvais.length || trop.length ? 1 : 0);
})();
