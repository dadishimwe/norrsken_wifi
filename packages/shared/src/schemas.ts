import { z } from "zod";
import { APPS, CHANNELS, DEVICE_CLASSES, SYMPTOMS, WHEN_BUCKETS, ZONE_SOURCES } from "./enums.js";

export const symptomSchema = z.enum(SYMPTOMS);
export const appSchema = z.enum(APPS);
export const whenBucketSchema = z.enum(WHEN_BUCKETS);
export const channelSchema = z.enum(CHANNELS);
export const zoneSourceSchema = z.enum(ZONE_SOURCES);
export const deviceClassSchema = z.enum(DEVICE_CLASSES);

export const clarifiersSchema = z
  .object({
    same_as_incident: z.enum(["yes", "no"]).optional(),
    choppy_type: z.enum(["video", "audio", "both", "screen"]).optional(),
    wifi_dropped: z.enum(["wifi_dropped", "only_app", "not_sure"]).optional(),
    connect_detail: z
      .enum(["cant_join", "joined_no_internet", "login_again", "not_sure"])
      .optional(),
    slow_scope: z.enum(["everything", "one_app", "uploads_downloads"]).optional(),
    /** Free-text when apps includes "other" */
    other_app: z.string().trim().max(80).optional(),
    /** Optional note from the one-page guest form */
    note: z.string().trim().max(400).optional(),
  })
  .strict();

export type Clarifiers = z.infer<typeof clarifiersSchema>;

export const createReportSchema = z
  .object({
    zone_id: z.string().min(1).max(64),
    zone_source: zoneSourceSchema,
    channel: channelSchema.default("qr"),
    symptoms: z.array(symptomSchema).min(1).max(3),
    apps: z.array(appSchema).max(5).default([]),
    when_bucket: whenBucketSchema.default("now"),
    /** Guest-chosen clock time. Omitted when they only picked a bucket. */
    occurred_at: z
      .string()
      .refine((s) => !Number.isNaN(Date.parse(s)), "Invalid datetime")
      .optional(),
    wifi_context: z.string().min(1).max(64).default("unknown"),
    clarifiers: clarifiersSchema.default({}),
    device_class: deviceClassSchema.default("unknown"),
    /** Company, or the place they are working from. */
    company: z.string().trim().min(1).max(120),
    contact_ok: z.boolean().default(false),
    contact_name: z.string().trim().max(80).optional(),
    contact_phone: z.string().trim().max(40).optional(),
    contact_email: z
      .string()
      .trim()
      .max(120)
      .optional()
      .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Enter a valid email"),
    fill_ms: z.number().int().nonnegative().optional(),
    /** Honeypot — must be empty/absent */
    website: z.string().max(0).optional(),
    session_token: z.string().min(16).max(128),
  })
  .strict();

export type CreateReportInput = z.infer<typeof createReportSchema>;

export const patchReportSchema = z
  .object({
    symptoms: z.array(symptomSchema).min(1).max(3).optional(),
    apps: z.array(appSchema).max(5).optional(),
    when_bucket: whenBucketSchema.optional(),
    wifi_context: z.string().min(1).max(64).optional(),
    clarifiers: clarifiersSchema.optional(),
    fill_ms: z.number().int().nonnegative().optional(),
    website: z.string().max(0).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).some((k) => k !== "website" && v[k as keyof typeof v] !== undefined), {
    message: "At least one field required",
  });

export type PatchReportInput = z.infer<typeof patchReportSchema>;
