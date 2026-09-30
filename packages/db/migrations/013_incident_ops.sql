-- migrate:up
-- Staff company and incident assignment. Kept off the report hash chain.
-- The reports CSV stays the raw guest fields and does not include these columns.

alter table ops_user add column if not exists company text not null default 'norrsken';

alter table ops_user drop constraint if exists ops_user_company_chk;
alter table ops_user
  add constraint ops_user_company_chk
  check (company in ('norrsken', 'zuba', 'dct'));

alter table ops_user drop constraint if exists ops_user_role_check;
update ops_user set role = 'super_admin' where role = 'admin';
alter table ops_user drop constraint if exists ops_user_role_chk;
alter table ops_user
  add constraint ops_user_role_chk
  check (role in ('super_admin', 'admin', 'viewer'));

alter table incident add column if not exists assigned_to uuid references ops_user(id) on delete set null;

alter table report add column if not exists alert_channel text;
alter table report add column if not exists alert_ts text;

create table if not exists incident_comment (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references incident(id) on delete cascade,
  author_id uuid references ops_user(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now(),
  posted_to_slack boolean not null default false,
  constraint incident_comment_body_len check (char_length(body) between 1 and 2000)
);

create index if not exists incident_comment_incident_idx on incident_comment (incident_id, created_at);

-- migrate:down
drop index if exists incident_comment_incident_idx;
drop table if exists incident_comment;

alter table incident drop column if exists assigned_to;
alter table report drop column if exists alert_ts;
alter table report drop column if exists alert_channel;

update ops_user set role = 'admin' where role = 'super_admin';
alter table ops_user drop constraint if exists ops_user_role_chk;
alter table ops_user
  add constraint ops_user_role_check
  check (role in ('admin', 'viewer'));

alter table ops_user drop constraint if exists ops_user_company_chk;
alter table ops_user drop column if exists company;
