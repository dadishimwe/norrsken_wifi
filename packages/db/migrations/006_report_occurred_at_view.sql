-- migrate:up
-- Expose the optional exact time on the ops reports feed.
-- New columns must be appended; replace cannot reorder existing ones.
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
  r.incident_id,
  r.occurred_at
from report r
join zone z on z.id = r.zone_id;

-- migrate:down
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
