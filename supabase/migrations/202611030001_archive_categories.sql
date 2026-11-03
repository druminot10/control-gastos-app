begin;

alter table public.categories
  add column if not exists is_archived boolean not null default false;

drop policy if exists "Categories are deletable by their owner" on public.categories;
revoke delete on public.categories from authenticated;

alter table public.expenses
  drop constraint if exists expenses_category_owner_fkey;

alter table public.expenses
  add constraint expenses_category_owner_fkey
  foreign key (category_id, user_id)
  references public.categories (id, user_id)
  on delete restrict;

create or replace function public.ensure_expense_category_is_active()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  category_is_archived boolean;
begin
  select c.is_archived
    into category_is_archived
    from public.categories as c
    where c.id = new.category_id and c.user_id = new.user_id
    for update;

  if category_is_archived then
    raise exception 'No se pueden registrar gastos en secciones archivadas.';
  end if;

  return new;
end;
$$;

drop trigger if exists expenses_require_active_category on public.expenses;

create trigger expenses_require_active_category
  before insert or update of category_id, user_id on public.expenses
  for each row execute procedure public.ensure_expense_category_is_active();

commit;
