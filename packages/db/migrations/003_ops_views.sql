-- KPI / ops views (k-anonymity: hide cells with n < 3 where applicable)

-- migrate:up
create or replace view v_zone_health as
select
  z.id as zone_id,
  z.label,
  z.floor,
  z.kind,
  count(r.id) filter (where r.created_at > now() - interval '24 hours') as reports_24h,
  count(r.id) filter (where r.created_at > now() - interval '60 minutes') as reports_1h,
  exists (
    select 1 from incident i
    where i.status in ('open', 'investigating') and z.id = any (i.zones)
  ) as has_open_incident
from zone z
left join report r on r.zone_id = z.id
where z.active
group by z.id, z.label, z.floor, z.kind
order by z.sort, z.id;

create or replace view v_recent_reports as
select
  r.id,
  r.created_at,
  r.channel,
  r.zone_id,
  z.label as zone_label,
  r.symptoms,
  r.apps,
  r.when_bucket,
  r.wifi_context,
  r.weight,
  r.incident_id
from report r
join zone z on z.id = r.zone_id
order by r.created_at desc
limit 200;

create or replace view v_open_incidents as
select
  i.id,
  i.opened_at,
  i.acked_at,
  i.status,
  i.scope,
  i.zones,
  i.apps,
  i.symptoms,
  i.suspected_domain,
  i.confidence,
  i.severity,
  (select count(*) from report r where r.incident_id = i.id) as report_count
from incident i
where i.status in ('open', 'investigating')
order by i.opened_at desc;

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

-- migrate:down
drop view if exists v_kpi_daily;
drop view if exists v_open_incidents;
drop view if exists v_recent_reports;
drop view if exists v_zone_health;
