-- Guest IDs are public identifiers, never credentials. Verify a SHA-256 preimage
-- supplied in a private browser header. Legacy IDs remain readable but unclaimable.
create function public.janet_request_guest_id()
returns text language sql stable security invoker set search_path = ''
as $$
  select case when token ~ '^[a-f0-9]{64}$'
    then 'guest_' || pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(token, 'UTF8')), 'hex')
    else null end
  from (select nullif(pg_catalog.current_setting('request.headers', true), '')::jsonb
               ->> 'x-janet-guest-token' as token) headers;
$$;
revoke all on function public.janet_request_guest_id() from public;
grant execute on function public.janet_request_guest_id() to anon, authenticated, service_role;

-- Replace the complete inspected policy set: permissive policies combine with OR.
do $$
declare policy_record record;
begin
  for policy_record in select tablename, policyname from pg_policies
    where schemaname = 'public' and tablename in ('comments', 'reactions')
  loop
    execute format('drop policy %I on public.%I', policy_record.policyname, policy_record.tablename);
  end loop;
end $$;

alter table public.comments enable row level security;
alter table public.reactions enable row level security;

-- Owners may still see their own soft-deleted row so UPDATE ... RETURNING works.
create policy "comments visible or owned" on public.comments for select to anon, authenticated
using (
  not is_deleted or
  (user_id = (select auth.uid()) and guest_id is null) or
  (user_id is null and guest_id = (select public.janet_request_guest_id())) or
  (user_id is null and guest_id = (select auth.uid())::text)
);
create policy "comments verified author insert" on public.comments for insert to anon, authenticated
with check (
  not is_deleted and char_length(content) between 10 and 500
  and length(btrim(edition_id)) > 0 and length(btrim(display_name)) > 0
  and (
    (user_id = (select auth.uid()) and guest_id is null) or
    (user_id is null and guest_id = (select public.janet_request_guest_id())) or
    (user_id is null and guest_id = (select auth.uid())::text)
  )
);
create policy "comments verified author soft delete" on public.comments for update to anon, authenticated
using (
  (user_id = (select auth.uid()) and guest_id is null) or
  (user_id is null and guest_id = (select public.janet_request_guest_id())) or
  (user_id is null and guest_id = (select auth.uid())::text)
)
with check (
  is_deleted and (
    (user_id = (select auth.uid()) and guest_id is null) or
    (user_id is null and guest_id = (select public.janet_request_guest_id())) or
    (user_id is null and guest_id = (select auth.uid())::text)
  )
);
create policy "reactions public read" on public.reactions for select to anon, authenticated using (true);
create policy "reactions verified author insert" on public.reactions for insert to anon, authenticated
with check (
  reaction_type = 'like' and length(btrim(edition_id)) > 0 and (
    (user_id = (select auth.uid()) and guest_id is null) or
    (user_id is null and guest_id = (select public.janet_request_guest_id())) or
    (user_id is null and guest_id = (select auth.uid())::text)
  )
);
create policy "reactions verified author delete" on public.reactions for delete to anon, authenticated
using (
  (user_id = (select auth.uid()) and guest_id is null) or
  (user_id is null and guest_id = (select public.janet_request_guest_id())) or
  (user_id is null and guest_id = (select auth.uid())::text)
);

-- RLS controls rows, not which columns an UPDATE may change.
revoke update on public.comments from anon, authenticated;
grant update (is_deleted) on public.comments to anon, authenticated;
revoke truncate, references, trigger on public.comments, public.reactions from anon, authenticated;
notify pgrst, 'reload schema';
