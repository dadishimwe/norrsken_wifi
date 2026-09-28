-- migrate:up
-- Browser is its own column. device_class stays the phone or computer.

alter table report add column if not exists browser text;

alter table report drop constraint if exists report_browser_check;
alter table report
  add constraint report_browser_check
  check (
    browser is null
    or browser in ('chrome', 'safari', 'firefox', 'edge', 'opera', 'samsung', 'unknown')
  );

update report
set browser = device_class
where browser is null
  and device_class in ('chrome', 'safari', 'firefox', 'edge', 'opera', 'samsung');

update report
set device_class = 'unknown'
where device_class in ('chrome', 'safari', 'firefox', 'edge', 'opera', 'samsung');

alter table report drop constraint if exists report_device_class_check;
alter table report
  add constraint report_device_class_check
  check (
    device_class is null
    or device_class in (
      'mobile',
      'desktop',
      'unknown',
      'iphone',
      'ipad',
      'android',
      'windows',
      'mac',
      'linux'
    )
  );

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
  r.browser
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
  r.occurred_at
from report r
join zone z on z.id = r.zone_id;

alter table report drop constraint if exists report_browser_check;
alter table report drop column if exists browser;

alter table report drop constraint if exists report_device_class_check;
alter table report
  add constraint report_device_class_check
  check (
    device_class is null
    or device_class in (
      'mobile',
      'desktop',
      'unknown',
      'iphone',
      'android',
      'windows',
      'mac',
      'linux',
      'chrome',
      'safari',
      'firefox',
      'edge',
      'opera',
      'samsung'
    )
  );
