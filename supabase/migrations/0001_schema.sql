-- WeddingSnap schema, RLS, storage. Apply with: supabase db push
create extension if not exists pgcrypto;

create type event_status as enum ('draft','active','completed','archived','suspended');
create type event_visibility as enum ('private','guests');
create type approval_status as enum ('pending','approved','rejected');
create type photo_state as enum ('uploading','ready','failed');
create type member_role as enum ('editor','viewer');

create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- Admins live in their own table: no RLS policies => unreachable from the browser.
-- Grant manually:  insert into platform_admins(user_id) values ('<uuid>');
create table platform_admins (user_id uuid primary key references auth.users(id) on delete cascade, created_at timestamptz not null default now());
alter table platform_admins enable row level security;

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated before update on profiles for each row execute function set_updated_at();

create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles(id, display_name) values (new.id, left(coalesce(new.raw_user_meta_data->>'display_name',''), 80));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

create table events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 120),
  bride_name text not null check (char_length(bride_name) between 1 and 80),
  groom_name text not null check (char_length(groom_name) between 1 and 80),
  event_date date not null,
  venue text not null default '' check (char_length(venue) <= 160),
  description text not null default '' check (char_length(description) <= 1000),
  cover_image_path text,
  public_token text not null unique default translate(encode(gen_random_bytes(18),'base64'),'+/=','-_'),
  visibility event_visibility not null default 'private',
  moderation_enabled boolean not null default false,
  upload_deadline timestamptz,
  storage_quota_bytes bigint not null default 5368709120 check (storage_quota_bytes > 0),
  max_file_bytes int not null default 15728640 check (max_file_bytes between 1 and 26214400),
  max_photos_per_guest int not null default 100 check (max_photos_per_guest > 0),
  status event_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index events_owner_idx on events(owner_id);
create trigger events_updated before update on events for each row execute function set_updated_at();

create table event_members (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role member_role not null default 'viewer',
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);
create index event_members_user_idx on event_members(user_id);

create table upload_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  guest_identifier text not null check (char_length(guest_identifier) between 8 and 64),
  status text not null default 'active' check (status in ('active','blocked')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (event_id, guest_identifier)
);

create table photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  upload_session_id uuid references upload_sessions(id) on delete set null,
  storage_path text not null unique,
  thumb_path text not null unique,
  original_filename text not null default '' check (char_length(original_filename) <= 255),
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  file_size_bytes bigint not null check (file_size_bytes > 0),
  width int check (width between 1 and 20000),
  height int check (height between 1 and 20000),
  uploaded_by uuid references auth.users(id) on delete set null,
  state photo_state not null default 'uploading',
  approval_status approval_status not null default 'pending',
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index photos_gallery_idx on photos(event_id, created_at desc) where state = 'ready';
create index photos_session_idx on photos(upload_session_id);
create index photos_stale_idx on photos(created_at) where state = 'uploading';
create trigger photos_updated before update on photos for each row execute function set_updated_at();

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  event_id uuid references events(id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_event_idx on audit_logs(event_id, created_at desc);

create table content_reports (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references photos(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 500),
  status text not null default 'open' check (status in ('open','dismissed','actioned')),
  created_at timestamptz not null default now()
);

-- ---------- authorization helpers ----------
create or replace function is_platform_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid()) $$;

create or replace function is_event_manager(eid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select is_platform_admin() or exists (select 1 from events e where e.id = eid and e.owner_id = auth.uid())
  or exists (select 1 from event_members m where m.event_id = eid and m.user_id = auth.uid() and m.role = 'editor') $$;

create or replace function is_event_member(eid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select is_event_manager(eid) or exists (select 1 from event_members m where m.event_id = eid and m.user_id = auth.uid()) $$;

create or replace function event_usage_bytes(eid uuid) returns bigint language sql stable security definer set search_path = public as $$
  select coalesce(sum(file_size_bytes),0)::bigint from photos where event_id = eid and state in ('uploading','ready') $$;
revoke all on function event_usage_bytes(uuid) from public, anon, authenticated;

-- ---------- protect sensitive columns ----------
create or replace function protect_event_columns() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not is_platform_admin() then
    new.owner_id := old.owner_id;
    new.public_token := old.public_token;
    new.storage_quota_bytes := old.storage_quota_bytes;
    new.max_file_bytes := old.max_file_bytes;
    new.max_photos_per_guest := old.max_photos_per_guest;
    if old.status = 'suspended' then new.status := 'suspended'; end if;
    if new.status = 'suspended' then new.status := old.status; end if;
  end if;
  return new;
end $$;
create trigger events_protect before update on events for each row execute function protect_event_columns();

create or replace function protect_photo_columns() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then  -- browser callers may only change approval_status
    new.event_id := old.event_id; new.storage_path := old.storage_path; new.thumb_path := old.thumb_path;
    new.file_size_bytes := old.file_size_bytes; new.mime_type := old.mime_type; new.state := old.state;
    new.upload_session_id := old.upload_session_id; new.original_filename := old.original_filename;
    new.width := old.width; new.height := old.height; new.uploaded_by := old.uploaded_by;
  end if;
  if new.approval_status is distinct from old.approval_status then
    insert into audit_logs(actor_id, event_id, action, metadata)
    values (auth.uid(), new.event_id, 'photo.' || new.approval_status, jsonb_build_object('photo_id', new.id));
  end if;
  return new;
end $$;
create trigger photos_protect before update on photos for each row execute function protect_photo_columns();

create or replace function rotate_event_token(eid uuid) returns text language plpgsql security definer set search_path = public as $$
declare t text;
begin
  if not is_event_manager(eid) then raise exception 'not authorized'; end if;
  t := translate(encode(gen_random_bytes(18),'base64'),'+/=','-_');
  update events set public_token = t where id = eid;
  insert into audit_logs(actor_id, event_id, action) values (auth.uid(), eid, 'event.token_rotated');
  return t;
end $$;
revoke all on function rotate_event_token(uuid) from public, anon;

create or replace function admin_stats() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'not authorized'; end if;
  return jsonb_build_object(
    'organizers', (select count(*) from profiles),
    'events', (select count(*) from events),
    'active_events', (select count(*) from events where status = 'active'),
    'archived_events', (select count(*) from events where status = 'archived'),
    'photos', (select count(*) from photos where state = 'ready'),
    'failed_uploads', (select count(*) from photos where state = 'failed'),
    'storage_bytes', (select coalesce(sum(file_size_bytes),0) from photos where state = 'ready'),
    'open_reports', (select count(*) from content_reports where status = 'open'));
end $$;
revoke all on function admin_stats() from public, anon;

-- ---------- RLS ----------
alter table profiles enable row level security;
alter table events enable row level security;
alter table event_members enable row level security;
alter table upload_sessions enable row level security;
alter table photos enable row level security;
alter table audit_logs enable row level security;
alter table content_reports enable row level security;

create policy profiles_select on profiles for select to authenticated using (id = auth.uid() or is_platform_admin());
create policy profiles_update on profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy events_select on events for select to authenticated using (is_event_member(id));
create policy events_insert on events for insert to authenticated with check (owner_id = auth.uid() and status in ('draft','active'));
create policy events_update on events for update to authenticated using (is_event_manager(id)) with check (is_event_manager(id));
create policy events_delete on events for delete to authenticated using (owner_id = auth.uid() or is_platform_admin());

create policy members_select on event_members for select to authenticated using (is_event_member(event_id) or user_id = auth.uid());
create policy members_insert on event_members for insert to authenticated with check (exists (select 1 from events e where e.id = event_id and e.owner_id = auth.uid()));
create policy members_delete on event_members for delete to authenticated using (exists (select 1 from events e where e.id = event_id and e.owner_id = auth.uid()));

-- Photos: NO insert policy (inserts happen only via the trusted server route with the service role).
create policy photos_select on photos for select to authenticated using (is_event_member(event_id));
create policy photos_update on photos for update to authenticated using (is_event_manager(event_id)) with check (is_event_manager(event_id));
create policy photos_delete on photos for delete to authenticated using (is_event_manager(event_id));

create policy audit_select on audit_logs for select to authenticated using (is_platform_admin() or (event_id is not null and is_event_manager(event_id)));
create policy reports_select on content_reports for select to authenticated using (is_platform_admin() or is_event_manager(event_id));
create policy reports_update on content_reports for update to authenticated using (is_platform_admin()) with check (is_platform_admin());
-- upload_sessions: no policies => service role only.

alter publication supabase_realtime add table photos;

-- ---------- storage ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 15728640, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Path layout: events/{eventId}/{photoId}/original.ext | thumb.jpg  => folder[2] is the event id.
-- Read access for organizers/collaborators only. Guests never read storage directly: they get
-- short-lived signed URLs from the server, and upload through single-path signed upload URLs.
create policy photos_bucket_read on storage.objects for select to authenticated
using (bucket_id = 'photos' and (storage.foldername(name))[1] = 'events'
  and is_event_member(((storage.foldername(name))[2])::uuid));
-- No insert/update/delete policies for anon/authenticated on purpose.
