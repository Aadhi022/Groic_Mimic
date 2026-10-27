-- ============================================================================
-- GROIC — Social Music Listening Platform
-- Supabase PostgreSQL Schema, Functions, and Row Level Security (RLS)
-- ============================================================================

-- 1. Enable Required Extensions
create extension if not exists "uuid-ossp";

-- ----------------------------------------------------------------------------
-- 2. User Profiles Table
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  display_name text not null,
  avatar_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.profiles enable row level security;

create policy "Public profiles are viewable by all authenticated users"
  on public.profiles for select
  using (true);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Trigger to automatically create a profile on user sign up
create or replace function public.handle_new_user()
returns trigger as $$
declare
  v_name text;
begin
  v_name := coalesce(
    new.raw_user_meta_data->>'display_name',
    new.raw_user_meta_data->>'full_name',
    split_part(new.email, '@', 1),
    'Groic Listener'
  );

  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    v_name,
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update set
    display_name = excluded.display_name,
    updated_at = now();

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 3. Rooms Table
-- ----------------------------------------------------------------------------
create table if not exists public.rooms (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  description text default '',
  privacy text not null default 'public' check (privacy in ('public', 'private')),
  host_id uuid references auth.users on delete cascade not null,
  max_capacity integer not null default 6 check (max_capacity in (2, 4, 6, 8, 10)),
  status text not null default 'active' check (status in ('active', 'ended', 'closed')),
  settings jsonb not null default '{
    "member_can_add_songs": true,
    "member_can_control": false,
    "member_can_skip": false,
    "member_can_invite": true
  }'::jsonb,
  theme text default 'default',
  invite_code text unique, -- Secret 8-character token for private rooms
  
  -- Shared Playback State
  current_video_id text default 'jfKfPfyJRdk',
  current_title text default 'lofi hip hop radio 📚 - beats to relax/study to',
  current_channel text default 'Lofi Girl',
  current_thumbnail text default 'https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg',
  current_queue_id uuid,
  playback_state text not null default 'paused' check (playback_state in ('playing', 'paused', 'buffering', 'ended')),
  playback_position float not null default 0.0,
  playback_rate float not null default 1.0,
  playback_updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_by uuid references auth.users on delete set null,
  state_version bigint not null default 1,

  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  ended_at timestamp with time zone
);

create index if not exists idx_rooms_status_privacy on public.rooms (status, privacy, created_at desc);
create index if not exists idx_rooms_host_id on public.rooms (host_id);
create index if not exists idx_rooms_invite_code on public.rooms (invite_code);

alter table public.rooms enable row level security;

-- Room RLS Policies
-- Anyone can view active public rooms.
-- For private rooms, only the host or active members can select.
create policy "Select public rooms or user's joined rooms"
  on public.rooms for select
  using (
    privacy = 'public'
    or host_id = auth.uid()
    or exists (
      select 1 from public.room_memberships rm
      where rm.room_id = rooms.id
        and rm.user_id = auth.uid()
        and rm.status = 'active'
    )
  );

-- Only authenticated users can insert rooms
create policy "Authenticated users can create rooms"
  on public.rooms for insert
  with check (auth.uid() = host_id);

-- Only host can update general room metadata, or members if setting permits playback
create policy "Host or authorized members can update room"
  on public.rooms for update
  using (
    host_id = auth.uid()
    or (
      exists (
        select 1 from public.room_memberships rm
        where rm.room_id = rooms.id
          and rm.user_id = auth.uid()
          and rm.status = 'active'
      )
      and (settings->>'member_can_control')::boolean = true
    )
  );

-- ----------------------------------------------------------------------------
-- 4. Room Memberships Table
-- ----------------------------------------------------------------------------
create table if not exists public.room_memberships (
  id uuid default uuid_generate_v4() primary key,
  room_id uuid references public.rooms on delete cascade not null,
  user_id uuid references auth.users on delete cascade not null,
  role text not null default 'member' check (role in ('host', 'member')),
  status text not null default 'active' check (status in ('active', 'left')),
  joined_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (room_id, user_id)
);

create index if not exists idx_room_memberships_room_active on public.room_memberships (room_id, status);
create index if not exists idx_room_memberships_user on public.room_memberships (user_id);

alter table public.room_memberships enable row level security;

create policy "View memberships of accessible rooms"
  on public.room_memberships for select
  using (
    exists (
      select 1 from public.rooms r
      where r.id = room_memberships.room_id
        and (
          r.privacy = 'public'
          or r.host_id = auth.uid()
          or exists (
            select 1 from public.room_memberships self_rm
            where self_rm.room_id = r.id
              and self_rm.user_id = auth.uid()
              and self_rm.status = 'active'
          )
        )
    )
  );

create policy "Users can update own membership status"
  on public.room_memberships for update
  using (auth.uid() = user_id or exists (
    select 1 from public.rooms r where r.id = room_memberships.room_id and r.host_id = auth.uid()
  ));

create policy "Users can insert own membership"
  on public.room_memberships for insert
  with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 5. Room Queue Table
-- ----------------------------------------------------------------------------
create table if not exists public.room_queue (
  id uuid default uuid_generate_v4() primary key,
  room_id uuid references public.rooms on delete cascade not null,
  video_id text not null,
  title text not null,
  thumbnail text default '',
  channel text default '',
  added_by uuid references auth.users on delete cascade not null,
  added_by_name text default 'Listener',
  position integer not null default 0,
  status text not null default 'queued' check (status in ('queued', 'playing', 'played', 'removed')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_room_queue_room_pos on public.room_queue (room_id, status, position);

alter table public.room_queue enable row level security;

create policy "View queue of accessible rooms"
  on public.room_queue for select
  using (
    exists (
      select 1 from public.rooms r
      where r.id = room_queue.room_id
        and (
          r.privacy = 'public'
          or r.host_id = auth.uid()
          or exists (
            select 1 from public.room_memberships rm
            where rm.room_id = r.id
              and rm.user_id = auth.uid()
              and rm.status = 'active'
          )
        )
    )
  );

create policy "Members can add songs to queue if permitted"
  on public.room_queue for insert
  with check (
    auth.uid() = added_by
    and exists (
      select 1 from public.rooms r
      where r.id = room_queue.room_id
        and (
          r.host_id = auth.uid()
          or (
            (r.settings->>'member_can_add_songs')::boolean = true
            and exists (
              select 1 from public.room_memberships rm
              where rm.room_id = r.id
                and rm.user_id = auth.uid()
                and rm.status = 'active'
            )
          )
        )
    )
  );

create policy "Host or adder can update queue item"
  on public.room_queue for update
  using (
    auth.uid() = added_by
    or exists (
      select 1 from public.rooms r
      where r.id = room_queue.room_id and r.host_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- 6. Room Activity Table (For Trending & Realtime Signals)
-- ----------------------------------------------------------------------------
create table if not exists public.room_activity (
  id uuid default uuid_generate_v4() primary key,
  room_id uuid references public.rooms on delete cascade not null,
  user_id uuid references auth.users on delete set null,
  activity_type text not null check (activity_type in ('create', 'join', 'leave', 'play', 'queue_add', 'skip')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_room_activity_recent on public.room_activity (room_id, created_at desc);

alter table public.room_activity enable row level security;

create policy "Anyone can insert room activity"
  on public.room_activity for insert
  with check (true);

create policy "View activity of accessible rooms"
  on public.room_activity for select
  using (true);

-- ----------------------------------------------------------------------------
-- 7. Personal Saved Songs Table (Cloud Sync with RLS)
-- ----------------------------------------------------------------------------
create table if not exists public.saved_songs (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  video_id text not null,
  title text not null,
  channel text default '',
  thumbnail_url text default '',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (user_id, video_id)
);

create index if not exists idx_saved_songs_user on public.saved_songs (user_id, created_at desc);

alter table public.saved_songs enable row level security;

create policy "Users can manage own saved songs"
  on public.saved_songs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 8. Personal Playlists & Items Tables (Cloud Sync with RLS)
-- ----------------------------------------------------------------------------
create table if not exists public.playlists (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  name text not null,
  description text default '',
  is_public boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_playlists_user on public.playlists (user_id, updated_at desc);

alter table public.playlists enable row level security;

create policy "Users can manage own playlists"
  on public.playlists for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.playlist_items (
  id uuid default uuid_generate_v4() primary key,
  playlist_id uuid references public.playlists on delete cascade not null,
  video_id text not null,
  title text not null,
  channel text default '',
  thumbnail_url text default '',
  position integer default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (playlist_id, video_id)
);

create index if not exists idx_playlist_items_playlist on public.playlist_items (playlist_id, position);

alter table public.playlist_items enable row level security;

create policy "Users can manage items in own playlists"
  on public.playlist_items for all
  using (
    exists (
      select 1 from public.playlists p 
      where p.id = playlist_items.playlist_id and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.playlists p 
      where p.id = playlist_items.playlist_id and p.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 9. ATOMIC SECURE FUNCTIONS & STORED PROCEDURES
-- ============================================================================

-- A. Join Room Atomic (Prevents exceeding capacity under concurrent joins)
create or replace function public.join_room_atomic(
  p_room_id uuid,
  p_invite_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid;
  v_room record;
  v_current_count integer;
  v_is_existing boolean;
  v_membership record;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return jsonb_build_object('success', false, 'error', 'Authentication required to join room');
  end if;

  -- 1. Lock room row for update to prevent concurrent race condition on capacity
  select * into v_room
  from public.rooms
  where id = p_room_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Room not found');
  end if;

  if v_room.status != 'active' then
    return jsonb_build_object('success', false, 'error', 'This room has ended or is no longer active');
  end if;

  -- 2. Validate private invite code if room is private and user is not host
  if v_room.privacy = 'private' and v_room.host_id != v_user_id then
    if v_room.invite_code is not null and (p_invite_code is null or v_room.invite_code != trim(p_invite_code)) then
      -- Check if user already has an active membership from a previous invitation
      select exists (
        select 1 from public.room_memberships
        where room_id = p_room_id and user_id = v_user_id and status = 'active'
      ) into v_is_existing;

      if not v_is_existing then
        return jsonb_build_object('success', false, 'error', 'Invalid or missing invitation code for this private room');
      end if;
    end if;
  end if;

  -- 3. Check if user is already an active member
  select exists (
    select 1 from public.room_memberships
    where room_id = p_room_id and user_id = v_user_id and status = 'active'
  ) into v_is_existing;

  if v_is_existing then
    -- Return existing membership safely
    return jsonb_build_object(
      'success', true,
      'message', 'Rejoined room',
      'room', row_to_json(v_room),
      'is_host', (v_room.host_id = v_user_id)
    );
  end if;

  -- 4. Count current active participants
  select count(*) into v_current_count
  from public.room_memberships
  where room_id = p_room_id and status = 'active';

  -- 5. Enforce Room Capacity strictly
  if v_current_count >= v_room.max_capacity then
    return jsonb_build_object(
      'success', false,
      'error', format('Room is full (maximum capacity of %s reached)', v_room.max_capacity),
      'capacity', v_room.max_capacity,
      'current', v_current_count
    );
  end if;

  -- 6. Insert or update membership
  insert into public.room_memberships (room_id, user_id, role, status, joined_at, updated_at)
  values (
    p_room_id,
    v_user_id,
    case when v_room.host_id = v_user_id then 'host' else 'member' end,
    'active',
    now(),
    now()
  )
  on conflict (room_id, user_id) do update set
    status = 'active',
    updated_at = now();

  -- 7. Log Activity
  insert into public.room_activity (room_id, user_id, activity_type)
  values (p_room_id, v_user_id, 'join');

  return jsonb_build_object(
    'success', true,
    'message', 'Joined room successfully',
    'room', row_to_json(v_room),
    'is_host', (v_room.host_id = v_user_id)
  );
end;
$$;

-- B. Advance Room Queue Atomic (Prevents multiple clients skipping concurrently)
create or replace function public.advance_room_queue_atomic(
  p_room_id uuid,
  p_current_queue_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid;
  v_room record;
  v_next_item record;
begin
  v_user_id := auth.uid();

  select * into v_room from public.rooms where id = p_room_id for update;
  if not found or v_room.status != 'active' then
    return jsonb_build_object('success', false, 'error', 'Room not found or inactive');
  end if;

  -- Mark previous item as played
  if p_current_queue_id is not null then
    update public.room_queue
    set status = 'played'
    where id = p_current_queue_id and room_id = p_room_id;
  elsif v_room.current_queue_id is not null then
    update public.room_queue
    set status = 'played'
    where id = v_room.current_queue_id and room_id = p_room_id;
  end if;

  -- Find next item in queue
  select * into v_next_item
  from public.room_queue
  where room_id = p_room_id and status = 'queued'
  order by position asc, created_at asc
  limit 1
  for update;

  if not found then
    -- Queue is now empty, stop playback
    update public.rooms set
      playback_state = 'ended',
      current_queue_id = null,
      playback_updated_at = now(),
      state_version = state_version + 1,
      updated_at = now()
    where id = p_room_id;

    return jsonb_build_object('success', true, 'queue_empty', true);
  end if;

  -- Mark next item as playing
  update public.room_queue set status = 'playing' where id = v_next_item.id;

  -- Update room playback state
  update public.rooms set
    current_video_id = v_next_item.video_id,
    current_title = v_next_item.title,
    current_channel = v_next_item.channel,
    current_thumbnail = v_next_item.thumbnail,
    current_queue_id = v_next_item.id,
    playback_state = 'playing',
    playback_position = 0.0,
    playback_rate = 1.0,
    playback_updated_at = now(),
    updated_by = v_user_id,
    state_version = state_version + 1,
    updated_at = now()
  where id = p_room_id;

  -- Log activity
  insert into public.room_activity (room_id, user_id, activity_type)
  values (p_room_id, v_user_id, 'skip');

  return jsonb_build_object(
    'success', true,
    'next_track', row_to_json(v_next_item)
  );
end;
$$;

-- C. Leave Room Atomic
create or replace function public.leave_room_atomic(
  p_room_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid;
  v_room record;
  v_remaining_count integer;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return jsonb_build_object('success', false, 'error', 'Authentication required');
  end if;

  select * into v_room from public.rooms where id = p_room_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Room not found');
  end if;

  update public.room_memberships
  set status = 'left', updated_at = now()
  where room_id = p_room_id and user_id = v_user_id;

  insert into public.room_activity (room_id, user_id, activity_type)
  values (p_room_id, v_user_id, 'leave');

  return jsonb_build_object('success', true, 'message', 'Left room');
end;
$$;

-- D. Get Trending Rooms (Ranked by active participants, recent activity & occupancy)
create or replace function public.get_trending_rooms(
  p_limit integer default 10
)
returns table (
  id uuid,
  name text,
  description text,
  privacy text,
  host_id uuid,
  host_name text,
  max_capacity integer,
  participant_count bigint,
  current_video_id text,
  current_title text,
  current_channel text,
  current_thumbnail text,
  playback_state text,
  theme text,
  trending_score numeric,
  created_at timestamp with time zone
)
language sql
security definer
set search_path = public, auth
as $$
  select
    r.id,
    r.name,
    r.description,
    r.privacy,
    r.host_id,
    coalesce(p.display_name, 'Host') as host_name,
    r.max_capacity,
    coalesce(members.cnt, 0) as participant_count,
    r.current_video_id,
    r.current_title,
    r.current_channel,
    r.current_thumbnail,
    r.playback_state,
    r.theme,
    -- Ranking Formula:
    -- (Active Participants * 15) + (Recent Activities past 3h * 5) + (Occupancy Ratio * 20) - (Hours since creation * 0.4)
    round(
      (coalesce(members.cnt, 0) * 15.0) +
      (coalesce(act.recent_cnt, 0) * 5.0) +
      (case when r.max_capacity > 0 then (coalesce(members.cnt, 0)::numeric / r.max_capacity::numeric) * 20.0 else 0 end) -
      (extract(epoch from (now() - r.created_at)) / 3600.0 * 0.4)
    , 2) as trending_score,
    r.created_at
  from public.rooms r
  left join public.profiles p on p.id = r.host_id
  left join (
    select room_id, count(*) as cnt
    from public.room_memberships
    where status = 'active'
    group by room_id
  ) members on members.room_id = r.id
  left join (
    select room_id, count(*) as recent_cnt
    from public.room_activity
    where created_at > now() - interval '3 hours'
    group by room_id
  ) act on act.room_id = r.id
  where r.status = 'active'
    and r.privacy = 'public'
  order by trending_score desc, members.cnt desc
  limit p_limit;
$$;

-- ----------------------------------------------------------------------------
-- 10. Enable Supabase Realtime for Rooms, Queue, and Memberships
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and tablename = 'rooms'
  ) then
    alter publication supabase_realtime add table public.rooms;
  end if;

  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and tablename = 'room_queue'
  ) then
    alter publication supabase_realtime add table public.room_queue;
  end if;

  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and tablename = 'room_memberships'
  ) then
    alter publication supabase_realtime add table public.room_memberships;
  end if;
end;
$$;
