create extension if not exists "pgcrypto";
create extension if not exists btree_gist;

create table if not exists orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  season text not null,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists org_memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('org_admin','server_admin','faction_leader','alliance_leader','member','viewer')),
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);

create table if not exists servers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null
);

create table if not exists factions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null,
  color text
);

create table if not exists server_faction_map (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  server_id uuid not null references servers(id) on delete cascade,
  faction_id uuid not null references factions(id) on delete cascade,
  unique (org_id, server_id)
);

create table if not exists alliances (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  server_id uuid not null references servers(id) on delete cascade,
  faction_id uuid not null references factions(id) on delete cascade,
  tag text not null,
  name text not null,
  rank_int int,
  unique (org_id, server_id, tag)
);

create unique index if not exists ux_alliance_rank_per_faction
  on alliances(faction_id, rank_int)
  where rank_int is not null;

create table if not exists alliance_reps (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  alliance_id uuid not null references alliances(id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('alliance_leader','member','viewer')),
  unique (org_id, alliance_id, user_id)
);

create table if not exists declarations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  season text not null,
  declaring_alliance_id uuid not null references alliances(id) on delete restrict,
  target_alliance_id uuid not null references alliances(id) on delete restrict,
  start timestamptz not null,
  "end" timestamptz not null,
  visibility text not null check (visibility in ('faction','public')) default 'faction',
  status text not null check (status in ('proposed','locked','resolved','cancelled')) default 'proposed',
  max_participants int,
  notes text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  locked_bracket_attacker int,
  locked_bracket_target int
);

create table if not exists declaration_participants (
  id uuid primary key default gen_random_uuid(),
  declaration_id uuid not null references declarations(id) on delete cascade,
  alliance_id uuid not null references alliances(id) on delete cascade,
  user_id uuid,
  committed_at timestamptz not null default now(),
  unique (declaration_id, alliance_id)
);

-- Invite tokens (auto-add users to org)
create table if not exists invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  role text not null check (role in ('org_admin','server_admin','faction_leader','alliance_leader','member','viewer')),
  token text not null unique,
  expires_at timestamptz not null
);

create unique index if not exists ux_locked_target
  on declarations (org_id, target_alliance_id, tstzrange(start, "end"))
  where status = 'locked';

create unique index if not exists ux_locked_attacker
  on declarations (org_id, declaring_alliance_id, tstzrange(start, "end"))
  where status = 'locked';

