import { createPool, createOpsUser, getOpsUserByUsername, setOpsUserPassword } from "@norrsken/db";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  const username = process.env.OPS_ADMIN_USERNAME || "admin";
  const password = process.env.OPS_ADMIN_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error("OPS_ADMIN_PASSWORD required (min 12 chars)");
  }
  const display = process.env.OPS_ADMIN_DISPLAY_NAME || "Network Admin";

  const db = createPool(url);
  try {
    const existing = await getOpsUserByUsername(db, username);
    if (existing) {
      await setOpsUserPassword(db, existing.id, password);
      console.log(`Updated password for ${username}`);
    } else {
      await createOpsUser(db, {
        username,
        display_name: display,
        password,
        role: "admin",
      });
      console.log(`Created admin ${username}`);
    }
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
