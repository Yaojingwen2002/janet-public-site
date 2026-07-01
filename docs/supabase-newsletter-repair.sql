-- Janet Public Site newsletter/auth repair
-- Run in Supabase SQL Editor for project Janet Public Site.
-- No keys or private credentials belong in this file.

create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  display_name text,
  subscribed boolean not null default false,
  source text not null default 'signup',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_sent_at timestamptz,
  welcome_sent_at timestamptz
);

alter table public.newsletter_subscribers
  add column if not exists display_name text,
  add column if not exists subscribed boolean not null default false,
  add column if not exists source text not null default 'signup',
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists last_sent_at timestamptz,
  add column if not exists welcome_sent_at timestamptz;

create unique index if not exists newsletter_subscribers_email
  on public.newsletter_subscribers (email);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  display_name text,
  email text,
  is_guest boolean default false,
  newsletter_opt_in boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles
  add column if not exists username text,
  add column if not exists display_name text,
  add column if not exists email text,
  add column if not exists is_guest boolean default false,
  add column if not exists newsletter_opt_in boolean default true,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create unique index if not exists profiles_username_ci_unique
  on public.profiles (lower(username))
  where username is not null and is_guest = false;

create or replace function public.handle_new_user()
returns trigger
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    username,
    display_name,
    email,
    is_guest,
    newsletter_opt_in
  )
  values (
    new.id,
    nullif(trim(new.raw_user_meta_data->>'username'), ''),
    nullif(trim(coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'username')), ''),
    new.email,
    coalesce((new.raw_user_meta_data->>'is_guest')::boolean, false),
    coalesce((new.raw_user_meta_data->>'newsletter_opt_in')::boolean, true)
  )
  on conflict (id) do update
    set username = coalesce(excluded.username, public.profiles.username),
        display_name = coalesce(excluded.display_name, public.profiles.display_name),
        email = coalesce(excluded.email, public.profiles.email),
        is_guest = excluded.is_guest,
        newsletter_opt_in = excluded.newsletter_opt_in,
        updated_at = now();

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.newsletter_subscribers enable row level security;

grant usage on schema public to service_role;
grant select, insert, update on public.profiles to service_role;
grant select, insert, update on public.newsletter_subscribers to service_role;

drop policy if exists "Profiles are viewable by owner" on public.profiles;
create policy "Profiles are viewable by owner"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "newsletter signups are allowed" on public.newsletter_subscribers;
create policy "newsletter signups are allowed"
  on public.newsletter_subscribers for insert
  with check (
    auth.role() = 'authenticated'
    and email is not null
    and lower(email) = lower(auth.jwt()->>'email')
  );

drop policy if exists "newsletter preferences can be updated" on public.newsletter_subscribers;
create policy "newsletter preferences can be updated"
  on public.newsletter_subscribers for update
  using (
    auth.role() = 'authenticated'
    and lower(email) = lower(auth.jwt()->>'email')
  )
  with check (
    auth.role() = 'authenticated'
    and email is not null
    and lower(email) = lower(auth.jwt()->>'email')
  );
