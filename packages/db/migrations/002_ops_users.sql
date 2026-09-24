-- migrate:up
create table ops_user (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  display_name text not null,
  password_hash text not null,
  role text not null check (role in ('admin', 'viewer')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references ops_user(id),
  last_login_at timestamptz
);

create table ops_session (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references ops_user(id) on delete cascade,
  token_hash bytea not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index ops_session_user_idx on ops_session (user_id);
create index ops_session_expires_idx on ops_session (expires_at) where revoked_at is null;

-- migrate:down
drop table if exists ops_session;
drop table if exists ops_user;
