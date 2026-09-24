import type { Pool } from "pg";
import { countOpsUsers, createOpsUser } from "@norrsken/db";
import type { Env } from "./env.js";

/**
 * Bootstrap the first admin from env if no ops users exist.
 * Ops accounts are staff-only and unrelated to anonymous reporters.
 */
export async function ensureBootstrapAdmin(db: Pool, env: Env): Promise<void> {
  const n = await countOpsUsers(db);
  if (n > 0) return;

  if (!env.OPS_ADMIN_USERNAME || !env.OPS_ADMIN_PASSWORD) {
    console.warn(
      "[ops] No ops users yet. Set OPS_ADMIN_USERNAME and OPS_ADMIN_PASSWORD to create the first admin on startup.",
    );
    return;
  }

  if (env.OPS_ADMIN_PASSWORD.length < 12) {
    throw new Error("OPS_ADMIN_PASSWORD must be at least 12 characters");
  }

  await createOpsUser(db, {
    username: env.OPS_ADMIN_USERNAME,
    display_name: env.OPS_ADMIN_DISPLAY_NAME || "Network Admin",
    password: env.OPS_ADMIN_PASSWORD,
    role: "admin",
  });
  console.log(`[ops] Bootstrap admin created: ${env.OPS_ADMIN_USERNAME}`);
}
