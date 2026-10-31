-- Add video support to photos table
-- Apply with: supabase db push

-- Add video-related columns to photos table
alter table photos
  add column if not exists media_type text not null default 'image' check (media_type in ('image', 'video')),
  add column if not exists duration_ms int check (duration_ms is null or duration_ms > 0),
  add column if not exists video_path text unique;

-- Update mime_type check to include video formats
alter table photos
  drop constraint if exists photos_mime_type_check;

alter table photos
  add constraint photos_mime_type_check
  check (mime_type in ('image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime'));

-- Update the protect_photo_columns trigger to handle video_path
create or replace function protect_photo_columns() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then  -- browser callers may only change approval_status
    new.event_id := old.event_id; new.storage_path := old.storage_path; new.thumb_path := old.thumb_path;
    new.file_size_bytes := old.file_size_bytes; new.mime_type := old.mime_type; new.state := old.state;
    new.upload_session_id := old.upload_session_id; new.original_filename := old.original_filename;
    new.width := old.width; new.height := old.height; new.uploaded_by := old.uploaded_by;
    new.media_type := old.media_type; new.video_path := old.video_path; new.duration_ms := old.duration_ms;
  end if;
  if new.approval_status is distinct from old.approval_status then
    insert into audit_logs(actor_id, event_id, action, metadata)
    values (auth.uid(), new.event_id, 'photo.' || new.approval_status, jsonb_build_object('photo_id', new.id));
  end if;
  return new;
end $$;
drop trigger if exists photos_protect on photos;
create trigger photos_protect before update on photos for each row execute function protect_photo_columns();

-- Update storage bucket to allow video types
update storage.buckets
set allowed_mime_types = array['image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime']
where id = 'photos';
