-- Compo.io — tout le schema, a coller dans le SQL Editor de Supabase.
-- Ce fichier est la concatenation des migrations, dans l'ordre. Il est
-- rejouable : le passer deux fois ne casse rien et ne duplique rien, ce qui
-- evite d'avoir a savoir lesquelles sont deja passees.
-- Genere par tools/tout_le_sql.sh — ne pas editer a la main.

-- ========== 0001_init.sql ==========
-- Compo.io : classement de la compo du jour
-- Rien n'est accessible depuis le navigateur : tout passe par les fonctions Edge,
-- qui seules détiennent la clé secrète. Les tables restent fermées.

create extension if not exists pgcrypto;

create table if not exists players (
  id         uuid primary key,                         -- généré par le navigateur
  pseudo     text not null check (char_length(btrim(pseudo)) between 2 and 20),
  created_at timestamptz not null default now(),
  last_seen  timestamptz not null default now()
);

create table if not exists groups (
  code       text primary key check (code ~ '^[a-z0-9-]{3,24}$'),
  name       text,
  created_at timestamptz not null default now()
);

create table if not exists memberships (
  group_code text not null references groups(code) on delete cascade,
  player_id  uuid not null references players(id)  on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (group_code, player_id)
);

-- Ouverte au début de la partie : c'est l'horloge du serveur qui fait foi,
-- sinon n'importe qui peut annoncer qu'il a fini en deux secondes.
create table if not exists rounds (
  id         uuid primary key default gen_random_uuid(),
  player_id  uuid not null references players(id) on delete cascade,
  day        int  not null,
  size       int  not null check (size between 1 and 30),
  duration   int  not null check (duration between 30 and 1800),
  started_at timestamptz not null default now(),
  submitted  boolean not null default false
);
create index if not exists rounds_player_day on rounds (player_id, day);

create table if not exists scores (
  player_id  uuid not null references players(id) on delete cascade,
  day        int  not null,
  found      int  not null check (found >= 0),
  size       int  not null check (size > 0),
  hints      int  not null default 0 check (hints >= 0),
  time_left  int  not null default 0 check (time_left >= 0),
  seconds    int  not null default 0 check (seconds >= 0),
  points     int  not null check (points >= 0),
  created_at timestamptz not null default now(),
  primary key (player_id, day),                        -- une seule partie classée par jour
  check (found <= size)
);
create index if not exists scores_day on scores (day desc);

alter table players     enable row level security;
alter table groups      enable row level security;
alter table memberships enable row level security;
alter table rounds      enable row level security;
alter table scores      enable row level security;

-- Aucune policy : les rôles du navigateur n'ont donc aucun accès, ni en lecture
-- ni en écriture. La clé publiable ne sert qu'à appeler les fonctions Edge.
revoke all on players, groups, memberships, rounds, scores from anon, authenticated;

-- ========== 0002_grants.sql ==========
-- Les fonctions Edge travaillent sous le rôle service_role. Comme l'exposition
-- automatique des nouvelles tables a été désactivée à la création du projet,
-- ce rôle n'hérite d'aucun droit : il faut les lui donner explicitement.
-- Les rôles du navigateur, eux, restent dehors.

grant usage on schema public to service_role;
grant all privileges on all tables    in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
alter default privileges in schema public grant all on tables    to service_role;
alter default privileges in schema public grant all on sequences to service_role;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- ========== 0003_sport.sql ==========
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

-- ========== 0004_resultats.sql ==========
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

