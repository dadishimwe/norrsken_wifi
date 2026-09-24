import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default("0.0.0.0"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.string().default("info"),
  EDIT_TOKEN_SECRET: z.string().min(32),
  CAMPUS_IPS: z.string().optional(),
  RATE_REPORTS_PER_ZONE_PER_5MIN: z.coerce.number().default(1),
  RATE_REPORTS_PER_DAY: z.coerce.number().default(5),
  MIN_FILL_MS: z.coerce.number().default(1500),
  REPORT_RETENTION_MONTHS: z.coerce.number().default(24),
  SLACK_REMEMBER_LAST_ZONE: z
    .string()
    .optional()
    .transform((v) => v !== "false" && v !== "0"),
  /** @deprecated Prefer ops user accounts; kept for emergency override */
  OPS_TOKEN: z.string().optional(),
  OPS_ADMIN_USERNAME: z.string().optional(),
  OPS_ADMIN_PASSWORD: z.string().optional(),
  OPS_ADMIN_DISPLAY_NAME: z.string().optional(),
  OPS_STATIC_DIR: z.string().optional(),
  QR_STATIC_DIR: z.string().optional(),
  QR_PUBLIC_KEYS_PATH: z.string().optional(),
  QR_PRIVATE_KEY_PATH: z.string().optional(),
  QR_KID: z.string().default("k1"),
  /** Public origin for QR links, e.g. http://192.168.1.10:8080 or https://wifi.example.com */
  PUBLIC_BASE_URL: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(raw: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(raw);
}
