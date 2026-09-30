-- migrate:up
-- Assignment and status live on the report. They stay off the hash chain and the CSV.

alter table report add column if not exists work_status text not null default 'open';
alter table report drop constraint if exists report_work_status_chk;
alter table report
  add constraint report_work_status_chk
  check (work_status in ('open', 'investigating', 'resolved'));

alter table report add column if not exists assigned_to uuid references ops_user(id) on delete set null;
alter table report add column if not exists acked_at timestamptz;
alter table report add column if not exists resolved_at timestamptz;

update report r
set
  work_status = i.status,
  assigned_to = i.assigned_to,
  acked_at = i.acked_at,
  resolved_at = i.resolved_at
from incident i
where r.incident_id = i.id
  and i.status in ('open', 'investigating', 'resolved');

create index if not exists report_assigned_idx on report (assigned_to) where assigned_to is not null;
create index if not exists report_work_status_idx on report (work_status, created_at desc);

create or replace view v_kpi_daily as
select
  current_date as day,
  (select count(*) from report where created_at::date = current_date) as reports_today,
  (select count(*) from report where work_status in ('open', 'investigating')) as open_incidents,
  (select count(*) from report where work_status in ('open', 'investigating') and created_at::date = current_date) as incidents_opened_today,
  (
    select coalesce(
      avg(extract(epoch from (acked_at - created_at)) / 60.0),
      null
    )
    from report
    where acked_at is not null and created_at > now() - interval '30 days'
  ) as mtta_minutes_30d,
  (
    select coalesce(
      avg(extract(epoch from (resolved_at - created_at)) / 60.0),
      null
    )
    from report
    where resolved_at is not null and created_at > now() - interval '30 days'
  ) as mttr_minutes_30d;

-- migrate:down
create or replace view v_kpi_daily as
select
  current_date as day,
  (select count(*) from report where created_at::date = current_date) as reports_today,
  (select count(*) from incident where status in ('open', 'investigating')) as open_incidents,
  (select count(*) from incident where opened_at::date = current_date) as incidents_opened_today,
  (
    select coalesce(
      avg(extract(epoch from (acked_at - opened_at)) / 60.0),
      null
    )
    from incident
    where acked_at is not null and opened_at > now() - interval '30 days'
  ) as mtta_minutes_30d,
  (
    select coalesce(
      avg(extract(epoch from (resolved_at - opened_at)) / 60.0),
      null
    )
    from incident
    where resolved_at is not null and opened_at > now() - interval '30 days'
  ) as mttr_minutes_30d;

drop index if exists report_work_status_idx;
drop index if exists report_assigned_idx;
alter table report drop constraint if exists report_work_status_chk;
alter table report drop column if exists resolved_at;
alter table report drop column if exists acked_at;
alter table report drop column if exists assigned_to;
alter table report drop column if exists work_status;
