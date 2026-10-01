-- migrate:up
-- Report workflow: New, In Progress, Waiting on Vendor, Resolved.
-- Ticket number, priority, and internal notes stay off the hash chain and the CSV.

alter table report drop constraint if exists report_work_status_chk;
update report
set work_status = case
  when work_status = 'investigating' then 'in_progress'
  when work_status = 'resolved' then 'resolved'
  else 'new'
end;
alter table report
  add constraint report_work_status_chk
  check (work_status in ('new', 'in_progress', 'waiting_vendor', 'resolved'));
alter table report alter column work_status set default 'new';

alter table report add column if not exists priority text not null default 'normal';
alter table report drop constraint if exists report_priority_chk;
alter table report
  add constraint report_priority_chk
  check (priority in ('normal', 'high', 'urgent'));

create sequence if not exists report_ticket_seq;
alter table report add column if not exists ticket_no integer;
update report
set ticket_no = nextval('report_ticket_seq')
where ticket_no is null;
alter table report alter column ticket_no set not null;
alter table report alter column ticket_no set default nextval('report_ticket_seq');
alter sequence report_ticket_seq owned by report.ticket_no;
create unique index if not exists report_ticket_no_idx on report (ticket_no);

create table if not exists report_note (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references report(id) on delete cascade,
  author_id uuid references ops_user(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now(),
  posted_to_slack boolean not null default false,
  constraint report_note_body_len check (char_length(body) between 1 and 2000)
);
create index if not exists report_note_report_idx on report_note (report_id, created_at);

create or replace view v_kpi_daily as
select
  current_date as day,
  (select count(*) from report where created_at::date = current_date) as reports_today,
  (select count(*) from report where work_status <> 'resolved') as open_incidents,
  (select count(*) from report where work_status <> 'resolved' and created_at::date = current_date) as incidents_opened_today,
  (
    select coalesce(avg(extract(epoch from (acked_at - created_at)) / 60.0), null)
    from report
    where acked_at is not null and created_at > now() - interval '30 days'
  ) as mtta_minutes_30d,
  (
    select coalesce(avg(extract(epoch from (resolved_at - created_at)) / 60.0), null)
    from report
    where resolved_at is not null and created_at > now() - interval '30 days'
  ) as mttr_minutes_30d;

-- migrate:down
drop view if exists v_kpi_daily;
create or replace view v_kpi_daily as
select
  current_date as day,
  (select count(*) from report where created_at::date = current_date) as reports_today,
  (select count(*) from report where work_status in ('open', 'investigating')) as open_incidents,
  (select count(*) from report where created_at::date = current_date) as incidents_opened_today,
  (
    select coalesce(avg(extract(epoch from (acked_at - created_at)) / 60.0), null)
    from report
    where acked_at is not null and created_at > now() - interval '30 days'
  ) as mtta_minutes_30d,
  (
    select coalesce(avg(extract(epoch from (resolved_at - created_at)) / 60.0), null)
    from report
    where resolved_at is not null and created_at > now() - interval '30 days'
  ) as mttr_minutes_30d;

drop index if exists report_note_report_idx;
drop table if exists report_note;
drop index if exists report_ticket_no_idx;
alter table report alter column ticket_no drop default;
alter table report drop column if exists ticket_no;
drop sequence if exists report_ticket_seq;
alter table report drop constraint if exists report_priority_chk;
alter table report drop column if exists priority;

alter table report drop constraint if exists report_work_status_chk;
update report
set work_status = case
  when work_status = 'in_progress' then 'investigating'
  when work_status = 'waiting_vendor' then 'investigating'
  when work_status = 'resolved' then 'resolved'
  else 'open'
end;
alter table report
  add constraint report_work_status_chk
  check (work_status in ('open', 'investigating', 'resolved'));
alter table report alter column work_status set default 'open';
