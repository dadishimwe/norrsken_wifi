-- migrate:up
-- Expand device_class for user-selected phone / laptop OS
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
      'linux'
    )
  );

-- migrate:down
alter table report drop constraint if exists report_device_class_check;

alter table report
  add constraint report_device_class_check
  check (device_class is null or device_class in ('mobile', 'desktop', 'unknown'));
