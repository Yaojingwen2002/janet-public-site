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

create unique index if not exists profiles_username_ci_unique
  on public.profiles (lower(username))
  where username is not null and is_guest = false;
```

Username rules used by Potato Center:

- Allowed: 3-20 English letters, numbers, and underscores, for example `janet_ai`, `creator2026`, `guest_123`.
- Blocked: Chinese characters, spaces, punctuation, emoji, and system names such as `janet`, `admin`, `administrator`, `system`, `root`, `official`, `support`, `moderator`.
- The `profiles_username_ci_unique` index keeps formal-account usernames unique case-insensitively. Guests can still reuse local nicknames.

For the Potato Center account layer, also install the profile trigger:

```sql
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
    nullif(trim(new.raw_user_meta_data->>'username'), ''),
    new.email,
    coalesce((new.raw_user_meta_data->>'is_guest')::boolean, false),
    coalesce((new.raw_user_meta_data->>'newsletter_opt_in')::boolean, true)
  )
  on conflict (id) do nothing;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
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
alter table public.profiles enable row level security;

create policy "comments are readable"
  on public.comments for select
  using (is_deleted = false);

create policy "any visitor can create comments"
  on public.comments for insert
  with check (
    char_length(content) between 10 and 500
    and (
      auth.uid() = user_id
      or (user_id is null and guest_id = auth.uid()::text)
    )
  );

create policy "authors can soft delete comments"
  on public.comments for update
  using (
    (auth.uid() = user_id and user_id is not null)
    or (user_id is null and guest_id = auth.uid()::text)
  )
  with check (is_deleted = true);

create policy "reactions are readable"
  on public.reactions for select
  using (true);

create policy "any visitor can create reactions"
  on public.reactions for insert
  with check (
    reaction_type in ('like')
    and (
      auth.uid() = user_id
      or (user_id is null and guest_id = auth.uid()::text)
    )
  );

create policy "visitors can remove their reactions"
  on public.reactions for delete
  using (
    (auth.uid() = user_id and user_id is not null)
    or (user_id is null and guest_id = auth.uid()::text)
  );

create policy "newsletter signups are allowed"
  on public.newsletter_subscribers for insert
  with check (email is not null and email <> '');

create policy "newsletter preferences can be updated"
  on public.newsletter_subscribers for update
  using (true)
  with check (email is not null and email <> '');

create policy "Profiles are viewable by owner"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
```

Do not add a public `select` policy for `newsletter_subscribers`; the site only writes or updates the visitor's preference and must not expose the full email list.

## 2.1 Daily briefing email subscribers

Email/password signups are subscribed by default through Supabase Auth `user_metadata.newsletter_opt_in = true`, with best-effort sync into `profiles.newsletter_opt_in` and `newsletter_subscribers.subscribed = true`. The sender includes formal Auth users and formal `profiles` rows with an email address, so older registered users are covered. Users can turn this off from Potato Center; `user_metadata.newsletter_opt_in = false` or `newsletter_subscribers.subscribed = false` is treated as the opt-out block.

The public site must never read the full subscriber list. The daily sender runs in GitHub Actions with a Supabase service-role key stored in GitHub Secrets, sends the latest briefing, then updates `newsletter_subscribers.last_sent_at`.

New subscribers also receive a designed subscription success email. The welcome sender checks `newsletter_subscribers.subscribed = true` rows where `welcome_sent_at is null`, sends the welcome email, then writes `welcome_sent_at`.

If the Potato Center subscription toggle flashes, reverts, or shows `操作失败，请稍后重试`, run the repair SQL:

```text
docs/supabase-newsletter-repair.sql
```

## 3. Configure the site

Replace the placeholders in `scripts/supabase-config.js`:

```js
const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-public-anon-key';
```

Only use the public anon key here. Never paste the service-role key into this repository.

## 4. Configure Auth for Potato Center

Authentication → Providers → Email:

- Enable Email provider: ON
- Confirm email: OFF
- Enable email/password: ON

Authentication → Providers → Anonymous Sign-Ins:

- Enable Anonymous Sign-Ins: ON

Authentication → URL Configuration:

- Site URL: `https://yaojingwen2002.github.io/janet-public-site/`
- Additional Redirect URLs:
  - `https://yaojingwen2002.github.io/janet-public-site/**`
  - `https://yaojingwen2002.github.io/janet-public-site/auth/reset-password.html`
  - `http://localhost:8097/**`
  - `http://127.0.0.1:8097/**`

If local preview uses another port, add that exact port to the allow list before testing password reset.

## 5. Configure daily briefing email workflow

Workflow file:

```text
.github/workflows/send-daily-briefing-email.yml
.github/workflows/send-subscription-welcome-email.yml
```

Schedule:

```text
01:20 UTC / 09:20 Asia/Taipei
subscription welcome: every 15 minutes
```

GitHub Secrets:

```text
SUPABASE_SERVICE_ROLE_KEY
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASS
MAIL_FROM
```

Optional:

```text
SUPABASE_URL
SMTP_SECURE
```

Use the public anon key only in `scripts/supabase-config.js`. Keep the service-role key and SMTP password only in GitHub Secrets.
