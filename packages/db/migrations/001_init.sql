-- migrate:up
create extension if not exists pgcrypto;

create table zone (
  id text primary key,
  label text not null,
  floor text,
  kind text not null default 'area' check (kind in ('area','booth','event','common')),
  active boolean not null default true,
  sort int not null default 0
);

create table incident (
  id uuid primary key default gen_random_uuid(),
  opened_at timestamptz not null default now(),
  acked_at timestamptz,
  resolved_at timestamptz,
  status text not null default 'open' check (status in ('open','investigating','resolved')),
  scope text not null check (scope in ('zone','multi_zone','campus')),
  zones text[] not null,
  apps text[] not null default '{}',
  symptoms text[] not null default '{}',
  suspected_domain text,
  confidence real,
  severity int,
  root_cause text
);

create table report (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  channel text not null check (channel in ('qr','slack','slack_metoo')),
  zone_id text not null references zone(id),
  zone_source text not null check (zone_source in ('qr','selected','remembered','override')),
  symptoms text[] not null check (cardinality(symptoms) between 1 and 3),
  apps text[] not null default '{}',
  when_bucket text not null default 'now' check (when_bucket in ('now','recent','earlier')),
  occurred_at timestamptz,
  wifi_context text not null default 'unknown',
  clarifiers jsonb not null default '{}',
  device_class text check (device_class in ('mobile','desktop','unknown')),
  fill_ms int,
  actor_hash bytea not null,
  weight real not null default 1.0,
  incident_id uuid references incident(id),
  prev_hash bytea,
  row_hash bytea
);

create index report_zone_created_idx on report (zone_id, created_at desc);
create index report_created_idx on report (created_at desc);
create index report_incident_idx on report (incident_id) where incident_id is not null;
create index report_actor_day_idx on report (actor_hash, created_at);

create unlogged table daily_salt (
  day date primary key,
  salt bytea not null
);

create unlogged table rate_bucket (
  key bytea primary key,
  tokens real not null,
  updated_at timestamptz not null default now()
);

create unlogged table session_state (
  actor_hash bytea primary key,
  last_zone_id text,
  last_wifi_context text,
  expires_at timestamptz not null
);

create table hash_anchor (
  day date primary key,
  head bytea not null
);

create table schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);

-- migrate:down
drop table if exists hash_anchor;
drop table if exists session_state;
drop table if exists rate_bucket;
drop table if exists daily_salt;
drop table if exists report;
drop table if exists incident;
drop table if exists zone;
drop table if exists schema_migrations;
