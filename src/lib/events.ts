import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type Event = {
  id: string;
  owner_id: string;
  title: string;
  bride_name: string;
  groom_name: string;
  event_date: string;
  venue: string;
  description: string;
  cover_image_path: string | null;
  public_token: string;
  visibility: "private" | "guests";
  moderation_enabled: boolean;
  upload_deadline: string | null;
  storage_quota_bytes: number;
  max_file_bytes: number;
  max_photos_per_guest: number;
  status: "draft" | "active" | "completed" | "archived" | "suspended";
  created_at: string;
  updated_at: string;
};

const COLS = "id,owner_id,title,bride_name,groom_name,event_date,venue,description,cover_image_path,public_token,visibility,moderation_enabled,upload_deadline,storage_quota_bytes,max_file_bytes,max_photos_per_guest,status,created_at,updated_at";

/**
 * Get an event by ID (server-side, admin access)
 */
export async function getEventById(eventId: string): Promise<Event | null> {
  const { data } = await createAdminClient().from("events").select(COLS).eq("id", eventId).maybeSingle();
  return data as Event | null;
}

/**
 * Get events owned by a specific user (server-side, admin access)
 */
export async function getEventsByUserId(userId: string): Promise<Event[]> {
  const { data } = await createAdminClient().from("events").select(COLS).eq("owner_id", userId).order("created_at", { ascending: false });
  return (data as Event[]) ?? [];
}

/**
 * Create a new event (server-side, admin access)
 * This bypasses RLS and is used for trusted server operations
 */
export async function createEvent(event: Omit<Event, "id" | "public_token" | "created_at" | "updated_at">): Promise<Event> {
  const { data, error } = await createAdminClient().from("events").insert(event).select(COLS).single();
  if (error) throw new Error(`Failed to create event: ${error.message}`);
  return data as Event;
}

/**
 * Update an event (server-side, admin access)
 */
export async function updateEvent(eventId: string, updates: Partial<Omit<Event, "id" | "owner_id" | "public_token" | "created_at">>): Promise<Event> {
  const { data, error } = await createAdminClient().from("events").update(updates).eq("id", eventId).select(COLS).single();
  if (error) throw new Error(`Failed to update event: ${error.message}`);
  return data as Event;
}

/**
 * Delete an event (server-side, admin access)
 */
export async function deleteEvent(eventId: string): Promise<void> {
  const { error } = await createAdminClient().from("events").delete().eq("id", eventId);
  if (error) throw new Error(`Failed to delete event: ${error.message}`);
}

/**
 * Rotate the public token for an event (for security purposes)
 */
export async function rotateEventToken(eventId: string): Promise<string> {
  const { data, error } = await createAdminClient().rpc("rotate_event_token", { eid: eventId });
  if (error) throw new Error(`Failed to rotate token: ${error.message}`);
  return data as string;
}
