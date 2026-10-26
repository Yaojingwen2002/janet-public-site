-- All fixtures and role/JWT settings are rolled back. Never targets real records.
begin;
do $test$
declare
  edition text := 'janet-security-test-' || gen_random_uuid()::text;
  token_a text := repeat('a', 64);
  token_b text := repeat('b', 64);
  guest_a text := 'guest_' || encode(sha256(convert_to(repeat('a',64),'UTF8')),'hex');
  guest_b text := 'guest_' || encode(sha256(convert_to(repeat('b',64),'UTF8')),'hex');
  comment_a uuid;
  comment_legacy uuid;
  reaction_a uuid;
  comment_user uuid;
  user_a uuid;
  user_b uuid;
  returned_id uuid;
  affected integer;
  denied boolean;
begin
  select id into user_a from auth.users order by id limit 1;
  select id into user_b from auth.users where id <> user_a order by id limit 1;
  if user_a is null or user_b is null then raise exception 'Need two existing users for JWT ownership checks'; end if;
  insert into public.comments(edition_id,guest_id,display_name,content)
    values(edition,'guest_LEGACY_TEST','fixture','legacy credential test comment') returning id into comment_legacy;

  perform set_config('request.headers',jsonb_build_object('x-janet-guest-token',token_a)::text,true);
  perform set_config('request.jwt.claims','{}',true);
  set local role anon;
  if public.janet_request_guest_id() <> guest_a then raise exception 'Guest digest mismatch'; end if;
  insert into public.comments(edition_id,guest_id,display_name,content)
    values(edition,guest_a,'fixture','verified guest test comment') returning id into comment_a;
  insert into public.reactions(edition_id,reaction_type,guest_id)
    values(edition,'like',guest_a) returning id into reaction_a;

  denied := false;
  begin
    insert into public.comments(edition_id,guest_id,display_name,content)
      values(edition,guest_b,'fixture','spoofed guest test comment');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Spoofed guest insert was allowed'; end if;

  denied := false;
  begin
    insert into public.comments(edition_id,user_id,display_name,content)
      values(edition,user_a,'fixture','spoofed user test comment');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Anon forged user insert was allowed'; end if;

  perform set_config('request.headers',jsonb_build_object('x-janet-guest-token',token_b)::text,true);
  update public.comments set is_deleted=true where id=comment_a;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Cross-guest soft delete was allowed'; end if;
  delete from public.reactions where id=reaction_a;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Cross-guest reaction delete was allowed'; end if;

  perform set_config('request.headers',jsonb_build_object('x-janet-guest-token',token_a)::text,true);
  update public.comments set is_deleted=true where id=comment_legacy;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Legacy public ID could be claimed'; end if;

  denied := false;
  begin
    update public.comments set content='tampered owner test comment' where id=comment_a;
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Comment content rewrite was allowed'; end if;
  denied := false;
  begin
    update public.comments set guest_id=guest_b where id=comment_a;
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Comment ownership rewrite was allowed'; end if;

  update public.comments set is_deleted=true where id=comment_a returning id into returned_id;
  if returned_id is distinct from comment_a then raise exception 'Owner soft delete failed'; end if;
  delete from public.reactions where id=reaction_a returning id into returned_id;
  if returned_id is distinct from reaction_a then raise exception 'Owner reaction delete failed'; end if;

  perform set_config('request.headers',jsonb_build_object('x-janet-guest-token',token_b)::text,true);
  if exists(select 1 from public.comments where id=comment_a) then raise exception 'Deleted comment visible to stranger'; end if;
  perform set_config('request.headers','{}',true);
  if public.janet_request_guest_id() is not null then raise exception 'Empty token accepted'; end if;
  denied := false;
  begin
    insert into public.reactions(edition_id,reaction_type,guest_id) values(edition,'like',guest_a);
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Credential-free reaction was allowed'; end if;
  perform set_config('request.headers',jsonb_build_object('x-janet-guest-token',guest_a)::text,true);
  if public.janet_request_guest_id() is not null then raise exception 'Public guest ID accepted as token'; end if;

  reset role;
  perform set_config('request.headers','{}',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',user_a,'role','authenticated')::text,true);
  set local role authenticated;
  insert into public.comments(edition_id,user_id,display_name,content)
    values(edition,user_a,'fixture','verified user test comment') returning id into comment_user;
  denied := false;
  begin
    insert into public.comments(edition_id,user_id,display_name,content)
      values(edition,user_b,'fixture','forged other user test comment');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Authenticated forged user insert was allowed'; end if;

  perform set_config('request.jwt.claims',jsonb_build_object('sub',user_b,'role','authenticated')::text,true);
  update public.comments set is_deleted=true where id=comment_user;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Cross-user soft delete was allowed'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',user_a,'role','authenticated')::text,true);
  update public.comments set is_deleted=true where id=comment_user returning id into returned_id;
  if returned_id is distinct from comment_user then raise exception 'User owner soft delete failed'; end if;
  reset role;
end $test$;
rollback;
select 'PASS: guest ownership, cross-guest denial, legacy ID denial, forged user denial, column restrictions, owner soft-delete, authenticated ownership; all fixtures rolled back' as verification,
  (select count(*) from public.comments) as comments,
  (select count(*) from public.reactions) as reactions;
