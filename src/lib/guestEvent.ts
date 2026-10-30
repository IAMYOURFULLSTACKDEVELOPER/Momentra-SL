import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type GuestEvent = {
  id: string; title: string; bride_name: string; groom_name: string; event_date: string; venue: string;
  description: string; visibility: "private" | "guests"; moderation_enabled: boolean; upload_deadline: string | null;
  status: string; storage_quota_bytes: number; max_file_bytes: number; max_photos_per_guest: number;
};
const COLS = "id,title,bride_name,groom_name,event_date,venue,description,visibility,moderation_enabled,upload_deadline,status,storage_quota_bytes,max_file_bytes,max_photos_per_guest";

/** The token is only a locator. Callers must still enforce status/deadline/visibility. */
export async function getEventByToken(token: string): Promise<GuestEvent | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const { data } = await createAdminClient().from("events").select(COLS).eq("public_token", token).maybeSingle();
  if (!data || data.status === "suspended" || data.status === "draft") return null;
  return data as GuestEvent;
}
export function uploadsOpen(e: GuestEvent): { open: boolean; reason?: string } {
  if (e.status !== "active") return { open: false, reason: "This event is no longer accepting photos." };
  if (e.upload_deadline && new Date(e.upload_deadline) < new Date()) return { open: false, reason: "The upload window for this event has closed." };
  return { open: true };
}
