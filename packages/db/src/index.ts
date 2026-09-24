export { createPool, type Db, type ZoneRow, type ReportRow } from "./client.js";
export {
  getZone,
  listActiveZones,
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
