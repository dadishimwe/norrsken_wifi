-- migrate:up
-- Super admins choose who can be assigned to a report.

alter table ops_user add column if not exists assignable boolean not null default false;

update ops_user
set assignable = true
where role = 'super_admin'
   or (role = 'admin' and company = 'dct');

-- migrate:down
alter table ops_user drop column if exists assignable;
