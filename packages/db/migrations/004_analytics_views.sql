-- migrate:up
create or replace view v_reports_full as
select
  r.id,
  r.created_at,
  r.channel,
  r.zone_id,
  z.label as zone_label,
  r.zone_source,
  r.symptoms,
  r.apps,
  r.when_bucket,
  r.wifi_context,
  r.clarifiers,
  r.device_class,
  r.fill_ms,
  r.weight,
  r.incident_id
from report r
join zone z on z.id = r.zone_id;

create or replace view v_reports_per_day as
select date_trunc('day', created_at)::date as day, count(*)::int as reports
from report
where created_at > now() - interval '30 days'
group by 1
order by 1;

create or replace view v_apps_frequency as
select a.app, count(*)::int as n
from report r
cross join lateral unnest(r.apps) as a(app)
where r.created_at > now() - interval '30 days'
group by a.app
order by n desc;

create or replace view v_symptoms_frequency as
select s.symptom, count(*)::int as n
from report r
cross join lateral unnest(r.symptoms) as s(symptom)
where r.created_at > now() - interval '30 days'
group by s.symptom
order by n desc;

create or replace view v_wifi_frequency as
select wifi_context, count(*)::int as n
from report
where created_at > now() - interval '30 days'
group by wifi_context
order by n desc;

create or replace view v_zone_report_totals as
select z.id as zone_id, z.label, count(r.id)::int as report_count
from zone z
left join report r on r.zone_id = z.id
group by z.id, z.label
order by report_count desc;

-- migrate:down
drop view if exists v_zone_report_totals;
drop view if exists v_wifi_frequency;
drop view if exists v_symptoms_frequency;
drop view if exists v_apps_frequency;
drop view if exists v_reports_per_day;
drop view if exists v_reports_full;
