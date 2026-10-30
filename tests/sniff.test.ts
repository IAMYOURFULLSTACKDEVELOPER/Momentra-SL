import { describe, expect, it } from "vitest";
import { sniffImage } from "../src/lib/imageSniff";
import { eventSchema, uploadInitSchema } from "../src/lib/validation";

const bytes = (...n: number[]) => new Uint8Array(n);
describe("sniffImage", () => {
  it("detects JPEG, PNG, WebP", () => {
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffImage(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(sniffImage(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
  });
  it("rejects non-images even if renamed", () => {
    expect(sniffImage(new TextEncoder().encode("<?php echo 1; ?>"))).toBeNull();
    expect(sniffImage(new TextEncoder().encode("GIF89a"))).toBeNull();
  });
});
describe("validation", () => {
  it("rejects bad mime and oversized batches", () => {
    expect(uploadInitSchema.safeParse({ guestId: "abcdefgh12", files: [{ name: "a.exe", size: 10, mime: "application/x-msdownload" }] }).success).toBe(false);
    expect(uploadInitSchema.safeParse({ guestId: "abcdefgh12", files: Array(21).fill({ name: "a.jpg", size: 10, mime: "image/jpeg" }) }).success).toBe(false);
  });
  it("accepts a valid event", () => {
    expect(eventSchema.safeParse({ title: "Our Day", brideName: "A", groomName: "B", eventDate: "2027-06-01", venue: "", description: "", visibility: "private", moderationEnabled: false, uploadDeadline: "", status: "active" }).success).toBe(true);
  });
});
