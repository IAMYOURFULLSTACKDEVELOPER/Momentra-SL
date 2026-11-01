# Guest Photo Upload Error Fix - Summary

## Root Cause Analysis

The "Could not register upload" error occurred because the upload initialization route (`/api/event/[token]/uploads`) was attempting to insert video support columns (`media_type`, `video_path`, `duration_ms`) into the `photos` table, but these columns may not have been applied to the deployed database. When the database didn't have these columns, the INSERT operation failed with a PostgreSQL error (code 42703 - column does not exist).

## Evidence

1. **Error Location**: Line 79 in `src/app/api/event/[token]/uploads/route.ts`
2. **Failure Point**: Database INSERT operation when registering a new photo row
3. **Missing Columns**: The video support migration (0002_add_video_support.sql) existed but may not have been applied to the production database
4. **Existing Safeguards**: The code already used service-role credentials (correct), validated tokens (correct), and enforced quotas (correct)

## Implementation Details

### 1. Graceful Schema Compatibility
**File**: `src/app/api/event/[token]/uploads/route.ts`

- Modified the photo registration logic to attempt inserting with video columns first
- If the insert fails due to missing columns (error code 42703 or "column does not exist"), automatically retry with a legacy payload that excludes video-specific fields
- This ensures the upload works whether or not the video migration has been applied

### 2. Enhanced Error Logging
**Files**: 
- `src/app/api/event/[token]/uploads/route.ts`
- `src/app/api/event/[token]/uploads/[photoId]/complete/route.ts`

- Added console.error logging for all Supabase errors (code, message, details, hint)
- Logs include operation context without exposing secrets
- Helps diagnose future issues without relying on deployment log access

### 3. Improved Migration Robustness
**File**: `supabase/migrations/0003_ensure_video_support.sql`

- Made the migration fully idempotent with exception handling
- Separated column additions from constraint additions to handle partial states
- Updated the `protect_photo_columns()` trigger to conditionally reference video columns only if they exist
- Improved storage bucket MIME type check to ensure all video types are present

### 4. Better User-Facing Error Messages
**File**: `src/components/GuestUploader.tsx`

- Distinguished between different HTTP status codes (413, 429, 403, 404)
- Provides specific messages for file size limits, quota limits, event status, and not found errors
- Improved storage upload error messages to identify which upload failed (original, thumbnail, or video)

### 5. Finalization Route Safety
**File**: `src/app/api/event/[token]/uploads/[photoId]/complete/route.ts`

- Added similar fallback logic for the update operation to handle missing optional columns
- Improved error handling for storage cleanup operations
- Added logging for session validation failures

## Security Considerations Preserved

✅ **RLS remains enabled** - No policies were disabled
✅ **Photos bucket remains private** - No public access granted
✅ **No anon/auth INSERT policies added** - Inserts still only via service-role
✅ **Service-role credentials not exposed** - Still server-only, never in browser code
✅ **Guest authorization preserved** - Token validation, session checks, quota enforcement all intact
✅ **Path validation preserved** - Server still generates all storage paths
✅ **Abuse protections preserved** - Per-guest limits, file size limits, moderation all work

## Files Changed

1. `src/app/api/event/[token]/uploads/route.ts` - Schema compatibility and error logging
2. `src/app/api/event/[token]/uploads/[photoId]/complete/route.ts` - Update fallback and error handling
3. `supabase/migrations/0003_ensure_video_support.sql` - Improved idempotency
4. `src/components/GuestUploader.tsx` - Better error messages
5. `AGENTS.md` - Updated documentation

## Environment Variables Required

No new environment variables required. Existing variables remain:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only)
- `NEXT_PUBLIC_SITE_URL`
- `CRON_SECRET` (for cleanup job)

## Deployment Steps

1. **Apply the migration** (if not already done):
   ```bash
   npx supabase db push
   ```

2. **Rebuild the application**:
   ```bash
   npm run build
   ```

3. **Deploy to your hosting platform** (Vercel, etc.)

4. **Verify environment variables** are set in production

## Testing Results

✅ **TypeScript compilation**: Passed (no errors)
✅ **Next.js build**: Passed (successful production build)
✅ **Linting**: Passed (only pre-existing image optimization warnings)

## Manual Verification Checklist

After deployment, verify:

- [ ] Guest can upload a small JPEG photo
- [ ] Photo transitions from "uploading" to "ready" state
- [ ] Photo appears in organizer's live dashboard
- [ ] Gallery respects moderation settings
- [ ] Oversized files are rejected with clear message
- [ ] Invalid/expired event tokens are rejected
- [ ] Upload quota limits are enforced
- [ ] Failed uploads can be retried
- [ ] No service-role secrets appear in browser bundles

## Remaining Risks & Limitations

1. **Migration application**: If the database has never had migrations applied, you may need to run `npx supabase db push` to ensure the schema is up to date. The code handles both cases (with and without video columns).

2. **Storage cleanup**: If the cleanup cron job is not configured, failed uploads may accumulate in storage over time. Ensure `CRON_SECRET` is set and the cron endpoint is configured in your hosting platform.

3. **Video uploads**: Video functionality requires the migration to be applied. Without it, videos will fail with a clear error message. Photos will continue to work.

4. **IP rate limiting**: As noted in the original README, IP/edge rate limiting should be added before production launch to prevent abuse from determined attackers who can mint new device IDs.

## Rollback Plan

If issues arise after deployment, the code can be rolled back to the previous commit. The backward-compatible fallback logic ensures that if the video columns don't exist, photo uploads will still work using the legacy schema.
