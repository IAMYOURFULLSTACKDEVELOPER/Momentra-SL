# Momentra - Agent Notes

## Project Overview
Momentra is a QR-based event photo sharing platform built with Next.js 15, React 19, TypeScript, Tailwind CSS, and Supabase.

## Key Architecture
- Guest uploads flow through API routes that validate and create signed upload URLs
- Storage is private with no direct browser access; uploads use signed URLs
- Database RLS policies control access based on event membership
- Real-time updates via Supabase Realtime

## Common Issues & Fixes

### "Could not register upload" Error
**Cause**: The photos table was missing video support columns (`media_type`, `video_path`, `duration_ms`) that were added in migration 0002 but may not have been applied.

**Fix**: Run migration 0003_ensure_video_support.sql to add these columns idempotently:
```bash
npx supabase db push
```

### Environment Variables
Required variables in `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only)
- `NEXT_PUBLIC_SITE_URL`
- `CRON_SECRET` (for cleanup job)

## Build & Verification Commands
```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run typecheck # TypeScript type checking
npm run lint     # ESLint
npm run test     # Run tests
```

## Key Files
- `supabase/migrations/` - Database schema and migrations
- `src/app/api/event/[token]/uploads/route.ts` - Upload initialization
- `src/app/api/event/[token]/uploads/[photoId]/complete/route.ts` - Upload completion
- `src/components/GuestUploader.tsx` - Guest upload UI
- `src/components/QrDashboard.tsx` - Live dashboard for organizers
- `src/components/QrManager.tsx` - QR code generation
- `src/lib/supabase/admin.ts` - Service-role client (server-only)

## Database Schema Notes
- Events table uses RLS; organizers and members can access
- Photos table: NO insert policy (inserts via trusted server route only)
- Upload sessions: no policies (service role only)
- Storage bucket 'photos' is private with read policy for event members
