/**
 * Transient campus-IP check. The IP is used for this decision only and must not be stored.
 * Returns weight multiplier (1.0 on-campus / unknown, 0.3 off-campus when list is set).
 */
export function campusWeight(remoteIp: string | undefined, campusCidrs: string[]): number {
  if (!campusCidrs.length || !remoteIp) return 1.0;
  const ip = normalizeIp(remoteIp);
  if (!ip) return 1.0;
  for (const cidr of campusCidrs) {
    if (ipInCidr(ip, cidr.trim())) return 1.0;
  }
  return 0.3;
}

function normalizeIp(ip: string): string | null {
  // Strip IPv6-mapped IPv4
  if (ip.startsWith("::ffff:")) return ip.slice(7);
  // Skip pure IPv6 for MVP CIDR list (IPv4 only)
  if (ip.includes(":") && !ip.includes(".")) return null;
  return ip;
}

function ipToInt(ip: string): number | null {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    return null;
  }
  return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
}

function ipInCidr(ip: string, cidr: string): boolean {
  const [base, bitsStr] = cidr.split("/");
  if (!base) return false;
  const bits = bitsStr === undefined ? 32 : Number(bitsStr);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const ipN = ipToInt(ip);
  const baseN = ipToInt(base);
  if (ipN === null || baseN === null) return false;
  if (bits === 0) return true;
  const mask = bits === 32 ? 0xffffffff : (~0 << (32 - bits)) >>> 0;
  return (ipN & mask) === (baseN & mask);
}

export function parseCampusIps(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}
