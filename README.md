# WeddingSnap

QR-based wedding photo sharing. Organizers create events and print a QR code; guests scan it and upload photos from their phone browser (no app). Built with **Next.js 15 (App Router), React 19, TypeScript (strict), Tailwind CSS, Supabase** (Postgres, Auth, Storage, Realtime).

> **Status:** code written but **not yet installed, type-checked, built or tested** (it was authored in an environment without network access). Run the checklist under *Verification* before relying on it. RLS policies and storage rules have **not** been verified against a live Supabase project.

## Camera limitation
A website cannot capture photos taken in the phone's native Camera app. Guests use the in-browser camera (HTTPS + permission prompt) or choose from their photo library.

## Architecture
- `supabase/migrations/0001_schema.sql`: tables, constraints, indexes, RLS, helper functions, private `photos` bucket + storage policy.
- **Organizer/admin features** use the user's session, so RLS decides access. Admin = row in `platform_admins` (no client-writable path).
- **Guest uploads** never touch the database or storage directly. Flow: `POST /api/event/[token]/uploads` (server checks token, status, deadline, per-file size, per-guest cap, quota → inserts a pending row → returns single-path signed upload URLs for `original` + `thumb`) → browser uploads → `POST .../complete` (server downloads both objects, checks magic bytes, size, then marks `ready`). Success is shown only after this confirmation. Signed upload URLs are non-upsert and bound to one path, so they can't overwrite other files.
- Service-role key is only used in `src/lib/supabase/admin.ts` (`server-only`).
- Thumbnails (480px JPEG) and 2560px compression are generated in the browser (no paid image transforms).
- Gallery: cursor pagination, lazy images, signed URLs (1h). Organizer page subscribes to Realtime (RLS-filtered).
- Moderation: with moderation on, new photos are `pending`; guest gallery shows only `approved`. A DB trigger writes audit logs.

## Setup
Prerequisites: Node 20+, a Supabase project.
```bash
npm install
cp .env.example .env.local   # fill in values
npx supabase link --project-ref <ref>
npx supabase db push         # applies supabase/migrations
npm run dev
```
Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`, and server-only `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`.

Supabase dashboard: Auth → URL config: add `<site>/auth/callback` as a redirect URL; enable email confirmations as desired. Make an admin: `insert into platform_admins(user_id) values ('<user uuid>');` in the SQL editor.

## Scripts
`npm run dev | build | start | lint | typecheck | test`

## Deployment (Vercel)
Import the repo, set the five env vars (service key and cron secret as server-only), deploy. `vercel.json` schedules `/api/cron/cleanup` daily (Vercel sends `Authorization: Bearer $CRON_SECRET`), which deletes abandoned/failed uploads and their storage objects.

## Verification checklist (not yet done)
1. `npm install && npm run typecheck && npm run lint && npm test && npm run build`
2. Against a real Supabase project, manually/E2E test: register, create event, scan QR, upload, gallery, moderation, closed event, quota, invalid file, cross-event access, admin access, ZIP download.
3. Write RLS tests (e.g. pgTAP) for the policies in the migration. Playwright E2E is not included yet.

## Security notes / threat model summary
- Token = locator only (18 random bytes). Every guest endpoint re-checks status, deadline, visibility, quota server-side. Rotating the token revokes the old QR.
- Storage is private; no insert/update/delete policies for browser roles; reads via short-lived signed URLs.
- Guests are anonymous: abuse is limited by per-device (`localStorage` id) caps, quotas and moderation, but a determined attacker can mint new device ids. **Add IP/edge rate limiting (Vercel Firewall, Upstash) before launch.**
- Signed upload URLs are valid ~2h; the `complete` step rejects non-images.

## Known limitations
- No HEIC support (iOS usually converts to JPEG for browser pickers).
- Per-file byte progress isn't shown (status per photo instead).
- ZIP is built in memory, capped at 60 photos / 250 MB; larger exports need a background job.
- Collaborator invitation UI is not built (table + RLS exist; add members via SQL).
- Admin dashboard is read-only (no suspend/manage UI yet; suspend via SQL by setting `events.status = 'suspended'` as admin).
- Cover image upload, global upload-limit settings UI, Playwright and component tests are not implemented.
- Upload-limit columns are per event (`max_file_bytes`, `max_photos_per_guest`, `storage_quota_bytes`), editable by platform admins only.
