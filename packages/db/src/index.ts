export { createPool, type Db, type ZoneRow, type ReportRow } from "./client.js";
export {
  getZone,
  listActiveZones,
  listAllZones,
  createZone,
  updateZone,
  countReportsForZone,
  deleteZone,
  zoneHasOpenIncident,
  countRecentReportsInZone,
  insertReport,
  getReport,
  updateReport,
  getLatestRowHash,
  HASH_CHAIN_LOCK,
  type InsertReportInput,
  type PatchReportFields,
} from "./reports.js";
export { getOrCreateDailySalt, computeActorHash, purgeOldSalts } from "./salt.js";
export {
  takeToken,
  rateKey,
  purgeStaleRateBuckets,
  purgeExpiredSessions,
  upsertSession,
  getSession,
} from "./rate.js";
export { canonicalJson, computeRowHash, type HashableReport } from "./hash-chain.js";
export { anchorHashChain } from "./anchor.js";
export { ZONES } from "./zones-data.js";
export {
  hashPassword,
  verifyPassword,
  hashSessionToken,
  countOpsUsers,
  createOpsUser,
  listOpsUsers,
  getOpsUserByUsername,
  getOpsUserById,
  setOpsUserActive,
  setOpsUserPassword,
  createOpsSession,
  revokeOpsSession,
  resolveOpsSession,
  purgeExpiredOpsSessions,
  type OpsUser,
  type OpsRole,
} from "./ops-auth.js";
