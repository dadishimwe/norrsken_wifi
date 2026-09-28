-- migrate:up
-- Places: Reception, Ground, classrooms C1–C5. Classroom 2 has levels L1–L5.

alter table zone drop constraint if exists zone_kind_check;

alter table zone
  add constraint zone_kind_check
  check (kind in ('area', 'booth', 'event', 'common', 'classroom'));

insert into zone (id, label, floor, kind, active, sort) values
  ('reception', 'Reception', null, 'common', true, 10),
  ('ground', 'Ground', null, 'common', true, 20),
  ('c1', 'C1', null, 'classroom', true, 30),
  ('c2l1', 'C2L1', null, 'classroom', true, 40),
  ('c2l2', 'C2L2', null, 'classroom', true, 50),
  ('c2l3', 'C2L3', null, 'classroom', true, 60),
  ('c2l4', 'C2L4', null, 'classroom', true, 70),
  ('c2l5', 'C2L5', null, 'classroom', true, 80),
  ('c3', 'C3', null, 'classroom', true, 90),
  ('c4', 'C4', null, 'classroom', true, 100),
  ('c5', 'C5', null, 'classroom', true, 110)
on conflict (id) do update set
  label = excluded.label,
  floor = excluded.floor,
  kind = excluded.kind,
  sort = excluded.sort,
  active = true;

delete from zone z
where z.id in (
  'l1-reception',
  'l1-cafe',
  'l1-event',
  'l2-west-desks',
  'l2-east-desks',
  'l2-booth-01',
  'l2-booth-02',
  'l2-booth-03',
  'l3-north-desks',
  'l3-south-desks'
)
and not exists (select 1 from report r where r.zone_id = z.id);

update zone
set active = false
where id in (
  'l1-reception',
  'l1-cafe',
  'l1-event',
  'l2-west-desks',
  'l2-east-desks',
  'l2-booth-01',
  'l2-booth-02',
  'l2-booth-03',
  'l3-north-desks',
  'l3-south-desks'
);

-- migrate:down
update zone set active = true where id in (
  'l1-reception',
  'l1-cafe',
  'l1-event',
  'l2-west-desks',
  'l2-east-desks',
  'l2-booth-01',
  'l2-booth-02',
  'l2-booth-03',
  'l3-north-desks',
  'l3-south-desks'
);

update zone
set kind = 'area'
where kind = 'classroom';

alter table zone drop constraint if exists zone_kind_check;

alter table zone
  add constraint zone_kind_check
  check (kind in ('area', 'booth', 'event', 'common'));
