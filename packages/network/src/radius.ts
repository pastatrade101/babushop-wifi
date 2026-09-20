import {createHmac, timingSafeEqual} from 'node:crypto';
import {createRequire} from 'node:module';
import {isIPv4} from 'node:net';

// The library handles RADIUS framing/response authenticators. We additionally
// require and verify the raw request Message-Authenticator in constant time.
export const radius = createRequire(import.meta.url)('radius') as {
  decode(args: {packet: Buffer; secret: string}): any;
  encode(args: any): Buffer;
  encode_response(args: any): Buffer;
  verify_response(args: any): boolean;
};
export type RadiusConfig = {
  secret: string; clientIp: string; hotspot: string; group: string;
  defaultDownload: number; defaultUpload: number;
};
export type VoucherRequest = {
  username: string; clientMac: string; chapPassword: Buffer; challenge: Buffer;
};
export type VoucherDecision = {
  expiresAt: Date; download: number; upload: number;
};
export function radiusConfig(env: NodeJS.ProcessEnv = process.env): RadiusConfig {
  if (env.NETWORK_PROVIDER !== 'mikrotik' || env.OMADA_MODE !== 'live' || env.MIKROTIK_RADIUS_ENABLED !== 'true')
    throw new Error('RADIUS requires explicit MikroTik live mode and MIKROTIK_RADIUS_ENABLED=true');
  if (!/^[a-f0-9]{64}$/i.test(env.MIKROTIK_RADIUS_SECRET || '')) throw new Error('RADIUS secret must be 32 random bytes encoded as hex');
  if (!isIPv4(env.MIKROTIK_RADIUS_CLIENT_IP || '')) throw new Error('Set the router WireGuard IPv4 address');
  if (!/^[\w-]{1,64}$/.test(env.MIKROTIK_HOTSPOT_SERVER || '') || !/^[\w-]{1,64}$/.test(env.MIKROTIK_RADIUS_GROUP || '')) throw new Error('Set the HotSpot server and RADIUS user profile');
  const down = Number(env.MIKROTIK_DEFAULT_DOWNLOAD_MBPS), up = Number(env.MIKROTIK_DEFAULT_UPLOAD_MBPS);
  if (![down, up].every(v => Number.isInteger(v) && v > 0 && v <= 10000)) throw new Error('Set both fallback speeds for vouchers without speed terms');
  return {secret: env.MIKROTIK_RADIUS_SECRET!, clientIp: env.MIKROTIK_RADIUS_CLIENT_IP!, hotspot: env.MIKROTIK_HOTSPOT_SERVER!, group: env.MIKROTIK_RADIUS_GROUP!, defaultDownload: down, defaultUpload: up};
}

function validEnvelope(packet: Buffer, secret: string): boolean {
  if (packet.length < 20 || packet.length > 4096 || packet[0] !== 1 || packet.readUInt16BE(2) !== packet.length) return false;
  const singleton = new Set([1, 2, 3, 4, 30, 31, 32, 60, 80]);
  const seen = new Set<number>(); let signatureOffset = -1;
  for (let offset = 20; offset < packet.length;) {
    if (offset + 2 > packet.length) return false;
    const type = packet[offset], length = packet[offset + 1];
    if (length < 2 || offset + length > packet.length || type === 2 || type === 33) return false; // No PAP or proxying.
    if (singleton.has(type) && seen.has(type)) return false;
    seen.add(type);
    if (type === 80) { if (length !== 18) return false; signatureOffset = offset + 2; }
    offset += length;
  }
  if (signatureOffset < 0) return false;
  const zeroed = Buffer.from(packet); zeroed.fill(0, signatureOffset, signatureOffset + 16);
  return timingSafeEqual(packet.subarray(signatureOffset, signatureOffset + 16), createHmac('md5', secret).update(zeroed).digest());
}

export function decodeVoucherRequest(raw: Buffer, sourceIp: string, config: RadiusConfig): {packet: any; request: VoucherRequest} | null {
  if (sourceIp !== config.clientIp || !validEnvelope(raw, config.secret)) return null;
  try {
    const packet = radius.decode({packet: Buffer.from(raw), secret: config.secret});
    const a = packet.attributes;
    if (a['NAS-IP-Address'] !== config.clientIp || a['Called-Station-Id'] !== config.hotspot) return null;
    if (typeof a['User-Name'] !== 'string' || a['User-Name'].length > 40 || typeof a['Calling-Station-Id'] !== 'string') return null;
    const chapPassword = a['CHAP-Password'], challenge = a['CHAP-Challenge'] ?? packet.authenticator;
    if (!Buffer.isBuffer(chapPassword) || chapPassword.length !== 17 || !Buffer.isBuffer(challenge) || challenge.length < 1 || challenge.length > 253) return null;
    return {packet, request: {username: a['User-Name'], clientMac: a['Calling-Station-Id'], chapPassword, challenge}};
  } catch { return null; }
}

export function voucherReply(packet: any, decision: VoucherDecision | null, config: RadiusConfig, now = Date.now()): Buffer {
  // Compute at SEND time, not before waiting for a database lock. Five seconds
  // cover the documented <=3s RADIUS reply window and normal tunnel latency.
  const remaining = decision ? Math.floor((decision.expiresAt.getTime() - now) / 1000) - 5 : 0;
  const accepted = decision !== null && remaining > 0;
  const attributes: any[] = accepted ? [
    ['Session-Timeout', remaining], ['Port-Limit', 1],
    ['Vendor-Specific', 14988, [[3, Buffer.from(config.group)], [8, Buffer.from(`${decision!.upload}M/${decision!.download}M`)]]],
  ] : [['Reply-Message', 'Voucher unavailable. Check the code or ask the attendant.']];
  return radius.encode_response({packet, code: accepted ? 'Access-Accept' : 'Access-Reject', secret: config.secret, attributes});
}

export function makeRadiusHandler(config: RadiusConfig, authorize: (request: VoucherRequest) => Promise<VoucherDecision | null>) {
  let inFlight = 0, window = Date.now(), count = 0;
  const attempts = new Map<string, {start: number; count: number}>();
  return async (raw: Buffer, sourceIp: string): Promise<Buffer | null> => {
    const now = Date.now();
    if (now - window >= 1000) { window = now; count = 0; }
    if (sourceIp !== config.clientIp || ++count > 100 || inFlight >= 20) return null;
    const decoded = decodeVoucherRequest(raw, sourceIp, config); if (!decoded) return null;
    const mac = decoded.request.clientMac.toUpperCase().replaceAll('-', ':');
    for (const [key, value] of attempts) if (now - value.start >= 60000) attempts.delete(key);
    const bucket = attempts.get(mac) || {start: now, count: 0};
    if (++bucket.count > 30 || (!attempts.has(mac) && attempts.size >= 1000)) return voucherReply(decoded.packet, null, config);
    attempts.set(mac, bucket); inFlight++;
    try {
      const decision = await authorize(decoded.request);
      // Do not emit a stale Accept after a NAS retry/timeout. No response caching:
      // each retransmission rechecks the original immutable database deadline.
      if (Date.now() - now > 2500) return null;
      return voucherReply(decoded.packet, decision, config);
    } catch { return voucherReply(decoded.packet, null, config); }
    finally { inFlight--; }
  };
}
