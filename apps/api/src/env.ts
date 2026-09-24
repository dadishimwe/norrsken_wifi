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
  OPS_TOKEN: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(raw: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(raw);
}
