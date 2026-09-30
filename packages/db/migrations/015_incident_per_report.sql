-- migrate:up
-- Split any place-shaped incident so each report has its own.

alter table incident add column if not exists source_report_id uuid;

insert into incident (
  opened_at, status, scope, zones, apps, symptoms, severity,
  source_report_id, assigned_to, acked_at, resolved_at
)
select
  r.created_at,
  i.status,
  'report',
  array[r.zone_id],
  r.apps,
  r.symptoms,
  1,
  r.id,
  case when cnt.n = 1 then i.assigned_to else null end,
  case when cnt.n = 1 then i.acked_at else null end,
  case when i.status = 'resolved' then coalesce(i.resolved_at, now()) else null end
from report r
join incident i on i.id = r.incident_id
join (
  select incident_id, count(*)::int as n
  from report
  group by incident_id
) cnt on cnt.incident_id = i.id
where i.scope in ('zone', 'multi_zone', 'campus');

update report r
set incident_id = n.id
from incident n
where n.source_report_id = r.id
  and r.incident_id is distinct from n.id;

update incident i
set status = 'resolved', resolved_at = coalesce(i.resolved_at, now())
where i.scope in ('zone', 'multi_zone', 'campus')
  and i.status in ('open', 'investigating')
  and not exists (select 1 from report r where r.incident_id = i.id);

alter table incident drop column if exists source_report_id;

-- migrate:down
-- Report incidents created here are not reversed. Place incidents stay resolved.
