import {createHash, timingSafeEqual} from 'node:crypto';
import {radius, type RadiusConfig} from './radius.ts';
export type Accounting = {username: string; clientMac: string; sessionId: string; status: 'Start'|'Stop'|'Interim-Update'; seconds: number; upload: string; download: string; terminateCause: string | null};
export function decodeAccounting(raw: Buffer, source: string, config: RadiusConfig): {packet: any; event: Accounting} | null {
  if (source !== config.clientIp || raw.length < 20 || raw.length > 4096 || raw[0] !== 4 || raw.readUInt16BE(2) !== raw.length) return null;
  const seen = new Set<number>();
  for (let offset = 20; offset < raw.length;) {
    if (offset + 2 > raw.length) return null;
    const type = raw[offset], len = raw[offset + 1];
    if (len < 2 || offset + len > raw.length || (type !== 26 && seen.has(type))) return null;
    seen.add(type); offset += len;
  }
  const signed = Buffer.from(raw); signed.fill(0, 4, 20);
  if (!timingSafeEqual(raw.subarray(4, 20), createHash('md5').update(signed).update(config.secret).digest())) return null;
  try {
    const packet = radius.decode({packet: Buffer.from(raw), secret: config.secret}), a = packet.attributes;
    if (a['NAS-IP-Address'] !== config.clientIp || a['Called-Station-Id'] !== config.hotspot) return null;
    if (!['Start','Stop','Interim-Update'].includes(a['Acct-Status-Type']) || typeof a['User-Name'] !== 'string' || typeof a['Calling-Station-Id'] !== 'string' || typeof a['Acct-Session-Id'] !== 'string' || a['Acct-Session-Id'].length > 128) return null;
    const n = (name: string) => { const value = a[name] ?? 0; if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new Error('Invalid counter'); return value as number; };
    const total = (direction: string) => ((BigInt(n(`Acct-${direction}-Gigawords`)) << 32n) + BigInt(n(`Acct-${direction}-Octets`))).toString();
    return {packet, event: {username: a['User-Name'], clientMac: a['Calling-Station-Id'], sessionId: a['Acct-Session-Id'], status: a['Acct-Status-Type'], seconds: n('Acct-Session-Time'), upload: total('Input'), download: total('Output'), terminateCause: typeof a['Acct-Terminate-Cause'] === 'string' ? a['Acct-Terminate-Cause'] : null}};
  } catch { return null; }
}
export function makeAccountingHandler(config: RadiusConfig, record: (event: Accounting) => Promise<void>) {
  let active = 0;
  return async(raw: Buffer, source: string): Promise<Buffer | null> => {
    if (active >= 20) return null;
    const decoded = decodeAccounting(raw, source, config); if (!decoded) return null;
    active++;
    try { await record(decoded.event); return radius.encode_response({packet: decoded.packet, code: 'Accounting-Response', secret: config.secret}); }
    catch { return null; } // No ACK on DB failure; allow router retry.
    finally { active--; }
  };
}
