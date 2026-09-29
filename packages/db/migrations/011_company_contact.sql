-- Company / place typed on the form, plus optional follow-up contact.

alter table report add column if not exists company text;
alter table report add column if not exists contact_ok boolean not null default false;
alter table report add column if not exists contact_name text;
alter table report add column if not exists contact_phone text;
alter table report add column if not exists contact_email text;

alter table report drop constraint if exists report_company_len;
alter table report
  add constraint report_company_len
  check (company is null or char_length(company) <= 120);

alter table report drop constraint if exists report_contact_name_len;
alter table report
  add constraint report_contact_name_len
  check (contact_name is null or char_length(contact_name) <= 80);

alter table report drop constraint if exists report_contact_phone_len;
alter table report
  add constraint report_contact_phone_len
  check (contact_phone is null or char_length(contact_phone) <= 40);

alter table report drop constraint if exists report_contact_email_len;
alter table report
  add constraint report_contact_email_len
  check (contact_email is null or char_length(contact_email) <= 120);

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
  r.browser
from report r
join zone z on z.id = r.zone_id;

alter table report drop constraint if exists report_contact_email_len;
alter table report drop constraint if exists report_contact_phone_len;
alter table report drop constraint if exists report_contact_name_len;
alter table report drop constraint if exists report_company_len;
alter table report drop column if exists contact_email;
alter table report drop column if exists contact_phone;
alter table report drop column if exists contact_name;
alter table report drop column if exists contact_ok;
alter table report drop column if exists company;
