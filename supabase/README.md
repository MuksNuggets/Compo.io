# Supabase — classement de Compo.io

Projet : `compo-io` (organisation Compo.io, plan gratuit, région Londres).

- URL : `https://raqseqflxmjfseyarlpx.supabase.co`
- Clé publiable : `sb_publishable_PTB-6n0TJfrBc09e8cWERQ_3wF7Hz-4`

Ces deux valeurs sont publiques par nature : la clé publiable ne donne accès à
rien. Les tables n'ont **aucune policy**, donc elles sont injoignables depuis un
navigateur — vérifié, une lecture directe de `scores` renvoie
`permission denied`. Seule la fonction Edge écrit, sous le rôle `service_role`.

**La clé secrète n'est pas dans ce dépôt et ne doit jamais y être.** La fonction
la reçoit de Supabase à l'exécution.

## Fichiers

- `migrations/0001_init.sql` — les 5 tables, RLS activée partout.
- `migrations/0002_grants.sql` — droits du rôle `service_role`. Nécessaire parce
  que l'option « exposition automatique des nouvelles tables » est désactivée
  sur le projet : sans ce fichier, la fonction échoue avec « erreur serveur ».
- `functions/compo/index.ts` — `start`, `submit`, `board`.

## Ce qui est vérifié

| Tentative | Résultat |
|---|---|
| Deuxième partie classée le même jour | refusée |
| Renvoyer une partie déjà close | refusée |
| Annoncer 999 trouvés | ramené à la taille de la compo |
| Ouvrir et rendre aussitôt | refusée, plancher d'une seconde par réponse |
| Lire la table `scores` depuis le navigateur | `permission denied` |

Le plancher de temps est une heuristique, pas une preuve : il ferme l'attaque
triviale, pas un script patient. Sans comptes, on ne peut pas faire mieux.
