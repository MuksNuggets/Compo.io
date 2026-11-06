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
