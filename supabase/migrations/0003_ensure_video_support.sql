-- Ensure video support columns exist (idempotent migration)
-- Apply with: supabase db push

-- Add video-related columns to photos table if they don't exist
DO $$
BEGIN
    -- Add media_type column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'photos' AND column_name = 'media_type'
    ) THEN
        ALTER TABLE photos
        ADD COLUMN media_type text NOT NULL DEFAULT 'image'
        CHECK (media_type in ('image', 'video'));
    END IF;

    -- Add duration_ms column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'photos' AND column_name = 'duration_ms'
    ) THEN
        ALTER TABLE photos
        ADD COLUMN duration_ms int
        CHECK (duration_ms is null or duration_ms > 0);
    END IF;

    -- Add video_path column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'photos' AND column_name = 'video_path'
    ) THEN
        ALTER TABLE photos
        ADD COLUMN video_path text UNIQUE;
    END IF;
END $$;

-- Update mime_type check to include video formats if not already updated
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'photos_mime_type_check'
    ) THEN
        ALTER TABLE photos DROP CONSTRAINT photos_mime_type_check;
    END IF;

    ALTER TABLE photos
    ADD CONSTRAINT photos_mime_type_check
    CHECK (mime_type in ('image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime'));
END $$;

-- Update the protect_photo_columns trigger to handle video_path if not already updated
CREATE OR REPLACE FUNCTION protect_photo_columns() returns trigger language plpgsql security definer set search_path = public as $$
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
DROP TRIGGER IF EXISTS photos_protect ON photos;
CREATE TRIGGER photos_protect BEFORE UPDATE ON photos FOR EACH ROW EXECUTE FUNCTION protect_photo_columns();

-- Update storage bucket to allow video types if not already updated
UPDATE storage.buckets
SET allowed_mime_types = array['image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime']
WHERE id = 'photos'
AND NOT (allowed_mime_types @> array['video/mp4']);
