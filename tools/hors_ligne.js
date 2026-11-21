// Aucun test ne doit joindre le vrai serveur.
//
// Tant que le reseau du conteneur bloquait supabase.co, les appels echouaient
// d'eux-memes et les suites tournaient « hors ligne » sans qu'on y pense. Le
// jour ou l'acces a ete ouvert, elles se sont mises a interroger la base de
// production : des 403 dans la console, et surtout des ecritures possibles
// dans les donnees des vrais joueurs.
//
// On coupe donc explicitement, page par page. Les suites qui veulent simuler
// une reponse posent leur propre route APRES : la derniere posee gagne.
const BLOQUE = '**/functions/v1/compo';

// Une reponse vide et valide : l'app la lit comme « rien a montrer » et
// n'ecrit aucune erreur dans la console.
async function horsLigne(page) {
  await page.route(BLOQUE, r => r.fulfill({
    status: 200, contentType: 'application/json', body: '{}',
  }));
  return page;
}

// newPage + coupure, en un seul appel.
async function pageHorsLigne(nav, opts) {
  return horsLigne(await nav.newPage(opts));
}

module.exports = { horsLigne, pageHorsLigne };
