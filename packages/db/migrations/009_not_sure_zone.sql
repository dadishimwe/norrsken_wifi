-- migrate:up
insert into zone (id, label, floor, kind, active, sort)
values ('not-sure', 'Not sure', null, 'common', true, 120)
on conflict (id) do update set
  label = excluded.label,
  kind = excluded.kind,
  sort = excluded.sort,
  active = true;

-- migrate:down
delete from zone z
where z.id = 'not-sure'
  and not exists (select 1 from report r where r.zone_id = z.id);
