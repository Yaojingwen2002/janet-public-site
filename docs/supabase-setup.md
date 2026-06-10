# Janet Supabase setup

This file is public and must not contain service-role keys or private tokens.

## 1. Create tables

Run this SQL in the Supabase SQL editor.

```sql
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  edition_id text not null,
  user_id uuid references auth.users(id) on delete set null,
  guest_id text,
  display_name text not null default '游客',
  content text not null check (char_length(content) between 10 and 500),
  is_deleted boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.reactions (
  id uuid primary key default gen_random_uuid(),
  edition_id text not null,
  reaction_type text not null check (reaction_type in ('like', 'insightful', 'trending')),
  user_id uuid references auth.users(id) on delete cascade,
  guest_id text,
  created_at timestamptz not null default now(),
  check (user_id is not null or guest_id is not null)
);

create unique index if not exists reactions_user_once
  on public.reactions (edition_id, reaction_type, user_id)
  where user_id is not null;

create unique index if not exists reactions_guest_once
  on public.reactions (edition_id, reaction_type, guest_id)
  where guest_id is not null;

create index if not exists comments_edition_created
  on public.comments (edition_id, created_at desc);

create index if not exists reactions_edition_type
  on public.reactions (edition_id, reaction_type);
```

## 2. Enable RLS

```sql
alter table public.comments enable row level security;
alter table public.reactions enable row level security;

create policy "comments are readable"
  on public.comments for select
  using (is_deleted = false);

create policy "any visitor can create comments"
  on public.comments for insert
  with check (
    char_length(content) between 10 and 500
    and (auth.uid() = user_id or user_id is null)
    and (user_id is not null or guest_id is not null)
  );

create policy "authors can soft delete comments"
  on public.comments for update
  using (auth.uid() = user_id and user_id is not null)
  with check (is_deleted = true);

create policy "reactions are readable"
  on public.reactions for select
  using (true);

create policy "any visitor can create reactions"
  on public.reactions for insert
  with check (
    reaction_type in ('like', 'insightful', 'trending')
    and (auth.uid() = user_id or user_id is null)
    and (user_id is not null or guest_id is not null)
  );

create policy "visitors can remove their reactions"
  on public.reactions for delete
  using (
    (auth.uid() = user_id and user_id is not null)
    or (user_id is null and guest_id is not null)
  );
```

## 3. Configure the site

Replace the placeholders in `scripts/supabase-config.js`:

```js
const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-public-anon-key';
```

Only use the public anon key here. Never paste the service-role key into this repository.
