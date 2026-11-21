-- Rendre leur sport aux parties d'avant.
--
-- Jusqu'à la migration 0003, la table ne portait pas de colonne `sport` : la
-- fonction Edge ne savait pas distinguer les deux. En ajoutant la colonne, 0003
-- lui a donné 'foot' pour défaut — volontairement, pour que l'ancienne fonction
-- continue de tourner le temps d'être redéployée. Toutes les parties
-- antérieures se retrouvent donc étiquetées 'foot', rugby compris.
--
-- Conséquence visible : les classements passés mélangent les deux, et le
-- tableau de bord compte des parties de rugby dans « Football ».
--
-- C'est réparable sans ambiguïté, parce que les tailles de compo ne se
-- recouvrent pas :
--     foot  : 12 réponses (11 joueurs + l'entraîneur), pour les 110 équipes
--     rugby : 15 ou 16    (15 joueurs, l'entraîneur quand il est connu), 124
-- Aucune taille n'est commune aux deux. Une compo de 15 ou plus est donc du
-- rugby, et rien d'autre.
--
-- Rejouable : après le passage, plus aucune ligne 'foot' n'a cette taille.

update scores set sport = 'rugby' where sport = 'foot' and size >= 15;
update rounds set sport = 'rugby' where sport = 'foot' and size >= 15;
