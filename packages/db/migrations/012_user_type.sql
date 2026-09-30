-- migrate:up
-- Who submitted the report. Kept out of the hash chain so older hashes stay valid.

alter table report add column if not exists user_type text;
alter table report add column if not exists user_type_other text;

alter table report drop constraint if exists report_user_type_chk;
alter table report
  add constraint report_user_type_chk
  check (user_type is null or user_type in ('member', 'visitor', 'event', 'other'));

alter table report drop constraint if exists report_user_type_other_len;
alter table report
  add constraint report_user_type_other_len
  check (user_type_other is null or char_length(user_type_other) <= 80);

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
  r.occurred_at,
  r.browser,
  r.company,
  r.contact_ok,
  r.contact_name,
  r.contact_phone,
  r.contact_email,
  r.user_type,
  r.user_type_other
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
  r.incident_id,
  r.occurred_at,
  r.browser,
  r.company,
  r.contact_ok,
  r.contact_name,
  r.contact_phone,
  r.contact_email
from report r
join zone z on z.id = r.zone_id;

alter table report drop constraint if exists report_user_type_other_len;
alter table report drop constraint if exists report_user_type_chk;
alter table report drop column if exists user_type_other;
alter table report drop column if exists user_type;
