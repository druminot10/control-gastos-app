begin;

alter table public.expenses
  add column if not exists spent_at time without time zone;

update public.expenses
set spent_at = (now() at time zone 'America/Santiago')::time
where spent_at is null;

alter table public.expenses
  alter column spent_at
  set default ((now() at time zone 'America/Santiago')::time);

alter table public.expenses
  alter column spent_at set not null;

commit;
