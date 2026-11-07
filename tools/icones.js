// Fabrique les images de l'app dans public/ : icone d'ecran d'accueil,
// favicon, et la vignette affichee quand on colle le lien dans une messagerie.
//
//   node tools/icones.js
//
// Les polices Barlow viennent de npm (@fontsource), installees sous tools/.
// Elles ne servent qu'ici : le rendu est cuit dans les PNG, donc l'app n'en
// depend pas. Relancer apres toute retouche du dessin.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');

const RACINE = path.join(__dirname, '..');
const PUBLIC = path.join(RACINE, 'public');
const POLICES = path.join(__dirname, 'node_modules/@fontsource');

const VERT = '#2E7D4F', VERTF = '#1D5A37', J = '#F2B705', INK = '#13241A', CLAIR = '#E8EDE5';

// L'icone : un terrain, dix joueurs en place, et celui qu'il reste a trouver.
const PLACES = [[256,92],[112,186],[208,186],[304,186],[400,186],
                [146,300],[256,300],[366,300],[150,408],[362,408]];
const icone = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="${VERT}"/>
  ${[0,1,2,3,4,5].map(i => `<rect y="${i*88}" width="512" height="44" fill="${VERTF}" opacity=".55"/>`).join('')}
  ${PLACES.map(([x,y]) => `<circle cx="${x}" cy="${y}" r="31" fill="#fff" opacity=".95"/>`).join('')}
  <circle cx="256" cy="412" r="46" fill="${J}"/>
  <text x="256" y="434" text-anchor="middle" font-family="Barlow Condensed" font-weight="800"
        font-size="68" fill="${INK}">?</text></svg>`;

// La vignette du lien : meme terrain, en paysage, avec le nom et l'accroche.
const POINTS = [[600,150],[300,250],[500,250],[700,250],[900,250],
                [380,370],[600,370],[820,370],[430,480],[770,480]];
const vignette = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <rect width="1200" height="630" fill="${VERT}"/>
  ${[...Array(8)].map((_, i) => `<rect y="${i*80}" width="1200" height="40" fill="${VERTF}" opacity=".5"/>`).join('')}
  <rect width="1200" height="630" fill="${INK}" opacity=".30"/>
  ${POINTS.map(([x,y]) => `<circle cx="${x}" cy="${y}" r="17" fill="#fff" opacity=".28"/>`).join('')}
  <circle cx="600" cy="560" r="25" fill="${J}" opacity=".5"/>
  <text x="80" y="300" font-family="Barlow Condensed" font-weight="800" font-size="168"
        letter-spacing="-3" fill="${CLAIR}">Compo<tspan fill="${J}">.io</tspan></text>
  <text x="86" y="395" font-family="Barlow" font-weight="600" font-size="40" fill="${CLAIR}" opacity=".9"
    >Retrouve les titulaires des grandes finales.</text>
  <text x="86" y="455" font-family="Barlow" font-weight="400" font-size="34" fill="${CLAIR}" opacity=".66"
    >Deux compos par jour, une par sport. Foot et rugby, 1990–2026.</text></svg>`;

// Les polices sont embarquees en base64 : Chromium refuse de charger un
// file:// depuis une page posee par setContent, et la fonte retombait alors
// en serif sans prevenir.
const b64 = f => fs.readFileSync(path.join(POLICES, f)).toString('base64');
const fonte = (nom, poids, f) =>
  `@font-face{font-family:${nom};font-weight:${poids};src:url(data:font/woff2;base64,${b64(f)}) format("woff2")}`;

const page = (svg, w, h) => `<!doctype html><meta charset="utf-8"><style>
${fonte('"Barlow Condensed"', 800, 'barlow-condensed/files/barlow-condensed-latin-800-normal.woff2')}
${fonte('Barlow', 400, 'barlow/files/barlow-latin-400-normal.woff2')}
${fonte('Barlow', 600, 'barlow/files/barlow-latin-600-normal.woff2')}
html,body{margin:0;padding:0}svg{display:block;width:${w}px;height:${h}px}</style>${svg}`;

(async () => {
  fs.mkdirSync(PUBLIC, { recursive: true });
  const nav = await chromium.launch();
  const sortir = async (svg, w, h, nom) => {
    const p = await nav.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await p.setContent(page(svg, w, h));
    await p.waitForTimeout(350);                       // le temps que la police charge
    await p.screenshot({ path: path.join(PUBLIC, nom), omitBackground: false });
    await p.close();
    console.log(nom, (fs.statSync(path.join(PUBLIC, nom)).size / 1024).toFixed(1) + ' Ko');
  };
  // Uniquement des PNG : un SVG devrait porter le "?" en trace, puisqu'il ne
  // peut pas compter sur la police du lecteur, et ca ne vaut pas le detour.
  for (const t of [32, 180, 192, 512]) await sortir(icone, t, t, `icone-${t}.png`);
  await sortir(vignette, 1200, 630, 'partage.png');
  await nav.close();
})();
