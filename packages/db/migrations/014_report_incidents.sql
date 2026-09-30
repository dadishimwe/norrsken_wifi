-- migrate:up
-- A single report is an incident. Grouped outages still use zone and campus.

alter table incident drop constraint if exists incident_scope_check;
alter table incident
  add constraint incident_scope_check
  check (scope in ('zone', 'multi_zone', 'campus', 'report'));

alter table incident add column if not exists source_report_id uuid;

insert into incident (opened_at, status, scope, zones, apps, symptoms, severity, source_report_id)
select r.created_at, 'open', 'report', array[r.zone_id], r.apps, r.symptoms, 1, r.id
from report r
where r.incident_id is null;

update report r
set incident_id = i.id
from incident i
where i.source_report_id = r.id
  and r.incident_id is null;

alter table incident drop column if exists source_report_id;

-- migrate:down
alter table incident add column if not exists source_report_id uuid;

update report
set incident_id = null
where incident_id in (select id from incident where scope = 'report');

delete from incident_comment
where incident_id in (select id from incident where scope = 'report');

delete from incident where scope = 'report';

alter table incident drop column if exists source_report_id;

alter table incident drop constraint if exists incident_scope_check;
alter table incident
  add constraint incident_scope_check
  check (scope in ('zone', 'multi_zone', 'campus'));
