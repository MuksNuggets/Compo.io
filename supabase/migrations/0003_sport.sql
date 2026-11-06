-- Une compo du jour par sport, donc deux parties classées par jour et par
-- joueur. La clé unique du classement doit porter le sport : sinon jouer le
-- foot ferme la porte au rugby pour la journée.

alter table rounds add column if not exists sport text not null default 'foot';
alter table scores add column if not exists sport text not null default 'foot';

-- Le défaut 'foot' est gardé volontairement. Il sert deux fois :
--   1. les lignes écrites avant cette migration sont des parties de test, dont
--      on ne peut plus retrouver le sport ; elles sont étiquetées 'foot' faute
--      de mieux, et c'est sans conséquence ;
--   2. il laisse l'ancienne fonction Edge continuer de tourner entre le moment
--      où cette migration passe et le moment où la fonction est redéployée.
--      Sans lui, toute partie ouverte dans cet intervalle échouerait.
-- À retirer une fois la nouvelle fonction en place, si on veut que l'oubli du
-- sport devienne une erreur franche plutôt qu'un 'foot' silencieux.

alter table rounds drop constraint if exists rounds_sport_check;
alter table rounds add  constraint rounds_sport_check check (sport in ('foot','rugby'));
alter table scores drop constraint if exists scores_sport_check;
alter table scores add  constraint scores_sport_check check (sport in ('foot','rugby'));

-- (player_id, day) devient (player_id, day, sport).
alter table scores drop constraint if exists scores_pkey;
alter table scores add primary key (player_id, day, sport);

create index if not exists rounds_player_day_sport on rounds (player_id, day, sport);
create index if not exists scores_day_sport on scores (day desc, sport);
