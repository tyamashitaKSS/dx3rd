create extension if not exists pgcrypto with schema extensions;

create table if not exists public.dx3rd_rooms (
  room_id text primary key check (length(room_id) between 8 and 64),
  secret_hash text not null check (length(secret_hash) = 64),
  board_state jsonb not null,
  revision bigint not null default 1,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.dx3rd_rooms enable row level security;
revoke all on table public.dx3rd_rooms from anon, authenticated;

create or replace function public.dx3rd_load_board(
  p_room_id text,
  p_room_secret text
)
returns table (
  board_state jsonb,
  revision bigint,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select room.board_state, room.revision, room.updated_at
  from public.dx3rd_rooms as room
  where room.room_id = p_room_id
    and room.secret_hash = encode(extensions.digest(p_room_secret, 'sha256'), 'hex')
  limit 1;
$$;

create or replace function public.dx3rd_save_board(
  p_room_id text,
  p_room_secret text,
  p_board_state jsonb
)
returns table (
  saved_revision bigint,
  saved_updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_secret_hash text;
  v_revision bigint;
  v_updated_at timestamptz;
begin
  if length(p_room_id) not between 8 and 64
    or length(p_room_secret) not between 8 and 64 then
    raise exception 'invalid room credentials' using errcode = '22023';
  end if;

  if pg_column_size(p_board_state) > 1048576 then
    raise exception 'board state is too large' using errcode = '22001';
  end if;

  v_secret_hash := encode(extensions.digest(p_room_secret, 'sha256'), 'hex');

  insert into public.dx3rd_rooms as room (
    room_id,
    secret_hash,
    board_state,
    revision,
    updated_at
  )
  values (
    p_room_id,
    v_secret_hash,
    p_board_state,
    1,
    timezone('utc', now())
  )
  on conflict (room_id) do update
  set board_state = excluded.board_state,
      revision = room.revision + 1,
      updated_at = timezone('utc', now())
  where room.secret_hash = excluded.secret_hash
  returning room.revision, room.updated_at
  into v_revision, v_updated_at;

  if not found then
    raise exception 'invalid room secret' using errcode = '42501';
  end if;

  return query select v_revision, v_updated_at;
end;
$$;

create or replace function public.dx3rd_compare_and_save_board(
  p_room_id text,
  p_room_secret text,
  p_board_state jsonb,
  p_expected_revision bigint
)
returns table (
  saved boolean,
  board_state jsonb,
  revision bigint,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_secret_hash text;
  v_saved boolean := false;
  v_board_state jsonb;
  v_revision bigint;
  v_updated_at timestamptz;
begin
  if length(p_room_id) not between 8 and 64
    or length(p_room_secret) not between 8 and 64
    or p_expected_revision < 0 then
    raise exception 'invalid room credentials or revision' using errcode = '22023';
  end if;

  if pg_column_size(p_board_state) > 1048576 then
    raise exception 'board state is too large' using errcode = '22001';
  end if;

  v_secret_hash := encode(extensions.digest(p_room_secret, 'sha256'), 'hex');

  if p_expected_revision = 0 then
    insert into public.dx3rd_rooms as room (
      room_id,
      secret_hash,
      board_state,
      revision,
      updated_at
    )
    values (
      p_room_id,
      v_secret_hash,
      p_board_state,
      1,
      timezone('utc', now())
    )
    on conflict (room_id) do nothing
    returning true, room.board_state, room.revision, room.updated_at
    into v_saved, v_board_state, v_revision, v_updated_at;

    if found then
      return query
      select v_saved, v_board_state, v_revision, v_updated_at;
      return;
    end if;
  end if;

  update public.dx3rd_rooms as room
  set board_state = p_board_state,
      revision = room.revision + 1,
      updated_at = timezone('utc', now())
  where room.room_id = p_room_id
    and room.secret_hash = v_secret_hash
    and room.revision = p_expected_revision
  returning true, room.board_state, room.revision, room.updated_at
  into v_saved, v_board_state, v_revision, v_updated_at;

  if found then
    return query
    select v_saved, v_board_state, v_revision, v_updated_at;
    return;
  end if;

  select room.board_state, room.revision, room.updated_at
  into v_board_state, v_revision, v_updated_at
  from public.dx3rd_rooms as room
  where room.room_id = p_room_id
    and room.secret_hash = v_secret_hash;

  if not found then
    raise exception 'invalid room secret' using errcode = '42501';
  end if;

  return query
  select false, v_board_state, v_revision, v_updated_at;
end;
$$;

create or replace function public.dx3rd_apply_board_patch(
  p_room_id text,
  p_room_secret text,
  p_patch jsonb,
  p_initial_state jsonb
)
returns table (
  board_state jsonb,
  revision bigint,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_secret_hash text;
  v_state jsonb;
  v_revision bigint;
  v_updated_at timestamptz;
  v_collection text;
  v_items jsonb;
  v_operation jsonb;
begin
  if length(p_room_id) not between 8 and 64
    or length(p_room_secret) not between 8 and 64 then
    raise exception 'invalid room credentials' using errcode = '22023';
  end if;

  if pg_column_size(p_patch) > 1048576
    or pg_column_size(p_initial_state) > 1048576 then
    raise exception 'board state is too large' using errcode = '22001';
  end if;

  v_secret_hash := encode(extensions.digest(p_room_secret, 'sha256'), 'hex');

  insert into public.dx3rd_rooms (
    room_id,
    secret_hash,
    board_state,
    revision,
    updated_at
  )
  values (
    p_room_id,
    v_secret_hash,
    p_initial_state,
    1,
    timezone('utc', now())
  )
  on conflict (room_id) do nothing;

  select room.board_state, room.revision
  into v_state, v_revision
  from public.dx3rd_rooms as room
  where room.room_id = p_room_id
    and room.secret_hash = v_secret_hash
  for update;

  if not found then
    raise exception 'invalid room secret' using errcode = '42501';
  end if;

  v_state := v_state || coalesce(p_patch->'scalars', '{}'::jsonb);

  foreach v_collection in array array['engages', 'tokens', 'shapes']
  loop
    v_items := coalesce(v_state->v_collection, '[]'::jsonb);

    select coalesce(jsonb_agg(item), '[]'::jsonb)
    into v_items
    from jsonb_array_elements(v_items) as item
    where not exists (
      select 1
      from jsonb_array_elements_text(
        coalesce(
          p_patch->'collections'->v_collection->'deletes',
          '[]'::jsonb
        )
      ) as deleted(id)
      where deleted.id = item->>'id'
    );

    for v_operation in
      select upsert_item
      from jsonb_array_elements(
        coalesce(
          p_patch->'collections'->v_collection->'upserts',
          '[]'::jsonb
        )
      ) as upserts(upsert_item)
    loop
      if exists (
        select 1
        from jsonb_array_elements(v_items) as item
        where item->>'id' = v_operation->>'id'
      ) then
        select jsonb_agg(
          case
            when item->>'id' = v_operation->>'id'
              then item || coalesce(v_operation->'changes', '{}'::jsonb)
            else item
          end
        )
        into v_items
        from jsonb_array_elements(v_items) as item;
      else
        v_items := v_items || jsonb_build_array(
          coalesce(v_operation->'changes', '{}'::jsonb)
          || jsonb_build_object('id', v_operation->>'id')
        );
      end if;
    end loop;

    v_state := jsonb_set(v_state, array[v_collection], v_items, true);
  end loop;

  update public.dx3rd_rooms as room
  set board_state = v_state,
      revision = room.revision + 1,
      updated_at = timezone('utc', now())
  where room.room_id = p_room_id
    and room.secret_hash = v_secret_hash
  returning room.board_state, room.revision, room.updated_at
  into v_state, v_revision, v_updated_at;

  return query
  select v_state, v_revision, v_updated_at;
end;
$$;

revoke all on function public.dx3rd_load_board(text, text) from public;
revoke all on function public.dx3rd_save_board(text, text, jsonb) from public, anon, authenticated;
revoke all on function public.dx3rd_compare_and_save_board(text, text, jsonb, bigint) from public;
revoke all on function public.dx3rd_apply_board_patch(text, text, jsonb, jsonb) from public;
grant execute on function public.dx3rd_load_board(text, text) to anon, authenticated;
grant execute on function public.dx3rd_compare_and_save_board(text, text, jsonb, bigint) to anon, authenticated;
grant execute on function public.dx3rd_apply_board_patch(text, text, jsonb, jsonb) to anon, authenticated;
