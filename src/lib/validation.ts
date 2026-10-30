import { z } from "zod";

export const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedMime = (typeof ALLOWED_MIME)[number];

export const eventSchema = z.object({
  title: z.string().trim().min(2, "Title must be at least 2 characters").max(120),
  brideName: z.string().trim().min(1, "Required").max(80),
  groomName: z.string().trim().min(1, "Required").max(80),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"),
  venue: z.string().trim().max(160),
  description: z.string().trim().max(1000),
  visibility: z.enum(["private", "guests"]),
  moderationEnabled: z.boolean(),
  uploadDeadline: z.string().refine((v) => v === "" || !Number.isNaN(Date.parse(v)), "Invalid date"),
  status: z.enum(["draft", "active", "completed", "archived"]),
});
export type EventInput = z.infer<typeof eventSchema>;

export const authSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(8, "At least 8 characters").max(128),
});
export const registerSchema = authSchema.extend({ displayName: z.string().trim().min(1, "Required").max(80) });

export const uploadInitSchema = z.object({
  guestId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
  files: z.array(z.object({
    name: z.string().max(255),
    size: z.number().int().positive(),
    mime: z.enum(ALLOWED_MIME),
  })).min(1).max(20),
});
export const uploadCompleteSchema = z.object({
  guestId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
  photoId: z.string().uuid(),
  width: z.number().int().min(1).max(20000),
  height: z.number().int().min(1).max(20000),
});
export const moderateSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  approvalStatus: z.enum(["approved", "rejected", "pending"]),
});
export const idsSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(200) });
