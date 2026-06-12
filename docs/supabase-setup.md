# Janet Supabase setup

This file is public and must not contain service-role keys or private tokens.

## 1. Create tables

Run this SQL in the Supabase SQL editor.

```sql
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  edition_id text not null,
  parent_comment_id uuid references public.comments(id) on delete cascade,
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
  reaction_type text not null check (reaction_type in ('like')),
  user_id uuid references auth.users(id) on delete cascade,
  guest_id text,
  created_at timestamptz not null default now(),
  check (user_id is not null or guest_id is not null)
);

create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  display_name text,
  subscribed boolean not null default false,
  source text not null default 'signup',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_sent_at timestamptz
);

create unique index if not exists reactions_user_once
  on public.reactions (edition_id, reaction_type, user_id)
  where user_id is not null;

create unique index if not exists reactions_guest_once
  on public.reactions (edition_id, reaction_type, guest_id)
  where guest_id is not null;

create index if not exists comments_edition_created
  on public.comments (edition_id, created_at desc);

create index if not exists comments_parent_created
  on public.comments (parent_comment_id, created_at asc);

create index if not exists reactions_edition_type
  on public.reactions (edition_id, reaction_type);

create index if not exists newsletter_subscribers_email
  on public.newsletter_subscribers (email);
```

For an existing Supabase project, run this migration before deploying reply UI:

```sql
alter table public.comments
  add column if not exists parent_comment_id uuid references public.comments(id) on delete cascade;

create index if not exists comments_parent_created
  on public.comments (parent_comment_id, created_at asc);

alter table public.reactions
  drop constraint if exists reactions_reaction_type_check;

alter table public.reactions
  add constraint reactions_reaction_type_check
  check (reaction_type in ('like'));

create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  display_name text,
  subscribed boolean not null default false,
  source text not null default 'signup',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_sent_at timestamptz
);

alter table public.newsletter_subscribers
  add column if not exists display_name text,
  add column if not exists subscribed boolean not null default false,
  add column if not exists source text not null default 'signup',
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists last_sent_at timestamptz;

create unique index if not exists newsletter_subscribers_email
  on public.newsletter_subscribers (email);
```

## 2. Enable RLS

```sql
alter table public.comments enable row level security;
alter table public.reactions enable row level security;
alter table public.newsletter_subscribers enable row level security;

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
    reaction_type in ('like')
    and (auth.uid() = user_id or user_id is null)
    and (user_id is not null or guest_id is not null)
  );

create policy "visitors can remove their reactions"
  on public.reactions for delete
  using (
    (auth.uid() = user_id and user_id is not null)
    or (user_id is null and guest_id is not null)
  );

create policy "newsletter signups are allowed"
  on public.newsletter_subscribers for insert
  with check (email is not null and email <> '');

create policy "newsletter preferences can be updated"
  on public.newsletter_subscribers for update
  using (true)
  with check (email is not null and email <> '');
```

Do not add a public `select` policy for `newsletter_subscribers`; the site only writes or updates the visitor's preference and must not expose the full email list.

## 3. Configure the site

Replace the placeholders in `scripts/supabase-config.js`:

```js
const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-public-anon-key';
```

Only use the public anon key here. Never paste the service-role key into this repository.
