create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 24),
  emoji text not null default '✨',
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, name),
  unique (id, user_id)
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  category_id uuid not null,
  amount numeric(12, 2) not null check (amount > 0),
  note text,
  spent_at time without time zone not null default ((now() at time zone 'America/Santiago')::time),
  spent_on date not null default current_date,
  created_at timestamptz not null default now(),
  constraint expenses_category_owner_fkey
    foreign key (category_id, user_id)
    references public.categories (id, user_id)
    on delete restrict
);

create index expenses_user_id_spent_on_idx on public.expenses (user_id, spent_on);

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.expenses enable row level security;

create policy "Profiles are readable by their owner"
  on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "Profiles are insertable by their owner"
  on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "Profiles are updatable by their owner"
  on public.profiles for update to authenticated using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
create policy "Profiles are deletable by their owner"
  on public.profiles for delete to authenticated using ((select auth.uid()) = id);

create policy "Categories are readable by their owner"
  on public.categories for select to authenticated using ((select auth.uid()) = user_id);
create policy "Categories are insertable by their owner"
  on public.categories for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Categories are updatable by their owner"
  on public.categories for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Expenses are readable by their owner"
  on public.expenses for select to authenticated using ((select auth.uid()) = user_id);
create policy "Expenses are insertable by their owner"
  on public.expenses for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Expenses are updatable by their owner"
  on public.expenses for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Expenses are deletable by their owner"
  on public.expenses for delete to authenticated using ((select auth.uid()) = user_id);

create function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);

  insert into public.categories (user_id, name, emoji)
  values
    (new.id, 'Pasajes', '🚌'),
    (new.id, 'Comida', '🍊'),
    (new.id, 'Compras súper', '🛒'),
    (new.id, 'Transporte', '🚍'),
    (new.id, 'Hogar', '🏡'),
    (new.id, 'Salud', '💊'),
    (new.id, 'Ocio', '🎈'),
    (new.id, 'Otros', '✳️');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.create_profile_for_new_user();

create function public.keep_profile_creation_date_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.created_at is distinct from old.created_at then
    raise exception 'La fecha de creación de la cuenta no se puede modificar.';
  end if;
  return new;
end;
$$;

create trigger profiles_keep_creation_date
  before update of created_at on public.profiles
  for each row execute procedure public.keep_profile_creation_date_immutable();

create function public.validate_expense_date()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_created_on date;
begin
  if new.spent_on > (now() at time zone 'America/Santiago')::date then
    raise exception 'La fecha del gasto no puede ser futura.';
  end if;

  select (created_at at time zone 'America/Santiago')::date
    into account_created_on
    from public.profiles
    where id = new.user_id;

  if account_created_on is null or new.spent_on < account_created_on then
    raise exception 'La fecha del gasto no puede ser anterior a la fecha de creación de la cuenta.';
  end if;

  return new;
end;
$$;

create trigger expenses_validate_date
  before insert or update of spent_on, user_id on public.expenses
  for each row execute procedure public.validate_expense_date();

create function public.ensure_expense_category_is_active()
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

create trigger expenses_require_active_category
  before insert or update of category_id, user_id on public.expenses
  for each row execute procedure public.ensure_expense_category_is_active();

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update on public.categories to authenticated;
grant select, insert, update, delete on public.expenses to authenticated;
