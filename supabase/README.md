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

## Barème

Le score est recalculé côté serveur, jamais accepté tel quel. La formule vit en
deux endroits qui doivent rester identiques : `points()` dans
`functions/compo/index.ts` et le calcul de `pts` dans `index.html`.

```
1000 × trouvés / total
+ 360 × restant / durée   (seulement si la compo est complète)
− 50 par indice
```

Le bonus de rapidité est une fraction du temps accordé, pas un nombre de points
par seconde : sinon le rugby (270 s) plafonnerait à 1540 contre 1360 au foot
(180 s) pour la même performance. Les deux culminent maintenant à 1360.

**Après modification de la fonction, il faut la redéployer** (`supabase functions
deploy compo`), sinon le classement continue d'appliquer l'ancienne formule
pendant que l'app en affiche une autre. Passer par le CLI, pas par l'éditeur du
tableau de bord : celui-ci abîme l'UTF-8 au collage.

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
