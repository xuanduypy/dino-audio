create table if not exists public.curated_audio_lists (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 100),
  description text not null default '' check (char_length(description) <= 500),
  kind text not null check (kind in ('music_album', 'book_album', 'music_chart', 'book_chart')),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.curated_audio_list_items (
  audio_list_id uuid not null references public.curated_audio_lists (id) on delete cascade,
  audio_item_id uuid not null references public.audio_items (id) on delete cascade,
  position integer not null check (position > 0),
  primary key (audio_list_id, audio_item_id),
  unique (audio_list_id, position)
);

alter table public.curated_audio_lists enable row level security;
alter table public.curated_audio_list_items enable row level security;
revoke all on table public.curated_audio_lists, public.curated_audio_list_items from public, anon, authenticated;
grant select on table public.curated_audio_lists, public.curated_audio_list_items to authenticated;

drop policy if exists "Invited users can read curated audio lists" on public.curated_audio_lists;
create policy "Invited users can read curated audio lists"
  on public.curated_audio_lists for select to authenticated
  using (public.is_dino_user());

drop policy if exists "Invited users can read curated audio list items" on public.curated_audio_list_items;
create policy "Invited users can read curated audio list items"
  on public.curated_audio_list_items for select to authenticated
  using (
    public.is_dino_user()
    and exists (
      select 1
      from public.curated_audio_lists as audio_list
      where audio_list.id = audio_list_id
    )
  );

create or replace function public.create_dino_audio_list(
  p_title text,
  p_description text,
  p_kind text,
  p_audio_item_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_list_id uuid;
  required_audio_kind text;
  selected_count integer;
begin
  if not public.is_dino_admin() then
    raise exception 'Only the DiNo administrator can create albums and charts.';
  end if;

  if char_length(trim(coalesce(p_title, ''))) not between 1 and 100 then
    raise exception 'The title must contain between 1 and 100 characters.';
  end if;
  if char_length(coalesce(p_description, '')) > 500 then
    raise exception 'The description cannot exceed 500 characters.';
  end if;
  if p_kind is null or p_kind not in ('music_album', 'book_album', 'music_chart', 'book_chart') then
    raise exception 'Choose a valid album or chart type.';
  end if;
  if p_audio_item_ids is null
    or cardinality(p_audio_item_ids) < 1
    or cardinality(p_audio_item_ids) > 100 then
    raise exception 'Choose between 1 and 100 library items.';
  end if;
  if cardinality(p_audio_item_ids) <> (
    select count(distinct selected.audio_item_id)
    from unnest(p_audio_item_ids) as selected(audio_item_id)
  ) then
    raise exception 'The selected library items must be unique.';
  end if;

  required_audio_kind := case
    when p_kind like 'music_%' then 'music'
    else 'book'
  end;
  select count(*) into selected_count
  from public.audio_items
  where id = any(p_audio_item_ids)
    and kind = required_audio_kind;
  if selected_count <> cardinality(p_audio_item_ids) then
    raise exception 'Every selected item must exist and match the list type.';
  end if;

  insert into public.curated_audio_lists (title, description, kind, created_by)
  values (trim(p_title), trim(coalesce(p_description, '')), p_kind, auth.uid())
  returning id into new_list_id;

  insert into public.curated_audio_list_items (audio_list_id, audio_item_id, position)
  select new_list_id, selected.audio_item_id, selected.position::integer
  from unnest(p_audio_item_ids) with ordinality as selected(audio_item_id, position);

  return new_list_id;
end;
$$;

revoke all on function public.create_dino_audio_list(text, text, text, uuid[]) from public, anon;
grant execute on function public.create_dino_audio_list(text, text, text, uuid[]) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'curated_audio_lists'
  ) then
    alter publication supabase_realtime add table public.curated_audio_lists;
  end if;
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'curated_audio_list_items'
  ) then
    alter publication supabase_realtime add table public.curated_audio_list_items;
  end if;
end
$$;
