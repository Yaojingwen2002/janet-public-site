-- Emergency rollback only: restores the PREVIOUS INSECURE policies.
-- Requires explicit operator decision; prefer a forward fix.
begin;
do $$ declare p record; begin for p in select tablename,policyname from pg_policies where schemaname='public' and tablename in ('comments','reactions') loop execute format('drop policy %I on public.%I',p.policyname,p.tablename); end loop; end $$;
create policy "any visitor can create comments" on public."comments" as PERMISSIVE for INSERT to "public" with check ((((char_length(content) >= 10) AND (char_length(content) <= 500)) AND ((auth.uid() = user_id) OR (user_id IS NULL)) AND ((user_id IS NOT NULL) OR (guest_id IS NOT NULL))));
create policy "authors can soft delete comments" on public."comments" as PERMISSIVE for UPDATE to "public" using (((auth.uid() = user_id) AND (user_id IS NOT NULL))) with check ((is_deleted = true));
create policy "comments are readable" on public."comments" as PERMISSIVE for SELECT to "public" using ((is_deleted = false));
create policy "comments owner soft delete" on public."comments" as PERMISSIVE for UPDATE to "anon", "authenticated" using ((((auth.uid() IS NOT NULL) AND (user_id = auth.uid())) OR (guest_id IS NOT NULL))) with check ((is_deleted = true));
create policy "comments public insert" on public."comments" as PERMISSIVE for INSERT to "anon", "authenticated" with check (((content IS NOT NULL) AND (char_length(content) >= 10) AND (char_length(content) <= 500) AND (edition_id IS NOT NULL) AND (display_name IS NOT NULL) AND ((user_id IS NOT NULL) OR (guest_id IS NOT NULL))));
create policy "comments public read" on public."comments" as PERMISSIVE for SELECT to "public" using (true);
create policy "comments public select" on public."comments" as PERMISSIVE for SELECT to "anon", "authenticated" using ((is_deleted = false));
create policy "any visitor can create reactions" on public."reactions" as PERMISSIVE for INSERT to "public" with check (((reaction_type = ANY (ARRAY['like'::text, 'insightful'::text, 'trending'::text])) AND ((auth.uid() = user_id) OR (user_id IS NULL)) AND ((user_id IS NOT NULL) OR (guest_id IS NOT NULL))));
create policy "reactions are readable" on public."reactions" as PERMISSIVE for SELECT to "public" using (true);
create policy "reactions owner delete like" on public."reactions" as PERMISSIVE for DELETE to "anon", "authenticated" using (((reaction_type = 'like'::text) AND (((auth.uid() IS NOT NULL) AND (user_id = auth.uid())) OR (guest_id IS NOT NULL))));
create policy "reactions public insert like" on public."reactions" as PERMISSIVE for INSERT to "anon", "authenticated" with check (((reaction_type = 'like'::text) AND (edition_id IS NOT NULL) AND ((user_id IS NOT NULL) OR (guest_id IS NOT NULL))));
create policy "reactions public insert like only" on public."reactions" as PERMISSIVE for INSERT to "public" with check ((reaction_type = 'like'::text));
create policy "reactions public read" on public."reactions" as PERMISSIVE for SELECT to "public" using (true);
create policy "reactions public select" on public."reactions" as PERMISSIVE for SELECT to "anon", "authenticated" using ((reaction_type = 'like'::text));
create policy "visitors can remove their reactions" on public."reactions" as PERMISSIVE for DELETE to "public" using ((((auth.uid() = user_id) AND (user_id IS NOT NULL)) OR ((user_id IS NULL) AND (guest_id IS NOT NULL))));
revoke update (is_deleted) on public.comments from anon, authenticated;
grant update on public.comments to anon, authenticated;
grant truncate,references,trigger on public.comments,public.reactions to anon, authenticated;
drop function public.janet_request_guest_id();
notify pgrst, 'reload schema';
commit;
