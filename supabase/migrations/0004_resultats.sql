-- Un classement par MATCH, et plus seulement par jour.
--
-- Le classement du jour restait enfermé dans la journée : on pouvait partager
-- une vieille finale sans jamais savoir ce que les autres y avaient fait. Ici,
-- chaque compo garde la trace de qui l'a refaite.
--
-- Ni chrono ni points, volontairement : seulement le nombre de noms retrouvés.
-- On veut savoir qui a fait mieux sur CETTE compo, pas départager à la
-- seconde — et il y a d'autant moins à surveiller côté triche.

-- Le round porte désormais le match qu'il ouvre, et le côté joué.
alter table rounds add column if not exists match_id text;
alter table rounds add column if not exists team int not null default 0;
alter table rounds drop constraint if exists rounds_team_check;
alter table rounds add  constraint rounds_team_check check (team in (0, 1));

-- « classe » distingue la compo du jour des autres. Sans ce drapeau, submit
-- ne saurait pas s'il doit écrire dans scores : le jour seul ne le dit pas,
-- puisqu'une vieille finale se joue elle aussi aujourd'hui.
-- Le défaut à true laisse l'ancienne fonction Edge tourner sans changement
-- entre cette migration et son redéploiement.
alter table rounds add column if not exists classe boolean not null default true;

create table if not exists resultats (
  player_id  uuid not null references players(id) on delete cascade,
  match_id   text not null check (char_length(match_id) between 3 and 40),
  team       int  not null default 0 check (team in (0, 1)),
  found      int  not null check (found >= 0),
  size       int  not null check (size > 0),
  hints      int  not null default 0 check (hints >= 0),
  updated_at timestamptz not null default now(),
  -- Une ligne par joueur et par compo : on garde le meilleur essai, pas le
  -- dernier. Rejouer ne doit pas pouvoir faire baisser sa marque.
  primary key (player_id, match_id, team),
  check (found <= size)
);
create index if not exists resultats_match on resultats (match_id, team, found desc);

alter table resultats enable row level security;

-- Comme les autres tables : aucune policy, donc rien n'est lisible ni
-- inscriptible depuis le navigateur. Seules les fonctions Edge y touchent.
revoke all on resultats from anon, authenticated;
grant all privileges on resultats to service_role;
