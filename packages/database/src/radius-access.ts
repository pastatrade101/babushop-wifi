import {createHash, timingSafeEqual} from 'node:crypto';
import {tx, audit} from './index.ts';
import {decrypt, digest, normalize} from './crypto.ts';
import {mac} from './access.ts';
import type {RadiusConfig, VoucherRequest, VoucherDecision} from '../../network/src/radius.ts';

export async function authorizeRadius(request: VoucherRequest, config: RadiusConfig): Promise<VoucherDecision | null> {
  if (process.env.NETWORK_PROVIDER !== 'mikrotik' || process.env.OMADA_MODE !== 'live' || process.env.MIKROTIK_RADIUS_ENABLED !== 'true') return null;
  let code: string, clientMac: string;
  try { code = normalize(request.username); clientMac = mac(request.clientMac); } catch { return null; }
  return tx(async db => {
    // Serialize against another device, sale reversal and repeated RADIUS requests.
    await db.query("set local lock_timeout='1500ms'");
    await db.query("set local statement_timeout='2000ms'");
    const v = (await db.query('select * from wifi.vouchers where code_digest=$1 for update', [digest(code)])).rows[0];
    if (!v || v.inventory_state !== 'SOLD') return null;
    if (request.chapPassword.length !== 17) return null;
    const proof = createHash('md5').update(request.chapPassword.subarray(0, 1)).update(decrypt(v.code_encrypted)).update(request.challenge).digest();
    if (!timingSafeEqual(proof, request.chapPassword.subarray(1))) return null;
    let grant = (await db.query('select * from wifi.access_grants where voucher_id=$1 for update', [v.id])).rows[0];
    const now: Date = (await db.query('select clock_timestamp() as now')).rows[0].now;
    if (grant) {
      // Simulation/Omada grants never silently become real network entitlements.
      if (grant.provider !== 'mikrotik-radius' || grant.client_mac !== clientMac || grant.state !== 'ACTIVE') return null;
      if (new Date(grant.proposed_expires_at).getTime() <= now.getTime()) {
        await db.query("update wifi.access_grants set state='EXPIRED',updated_at=clock_timestamp() where id=$1", [grant.id]);
        return null;
      }
    } else {
      const expiry = new Date(now.getTime() + v.duration_minutes * 60000);
      grant = (await db.query(`insert into wifi.access_grants(voucher_id,client_mac,state,provider,proposed_expires_at,expires_at,activated_at)
        values($1,$2,'ACTIVE','mikrotik-radius',$3,$3,$4) returning *`, [v.id, clientMac, expiry, now])).rows[0];
      await audit(db, null, 'MIKROTIK_VOUCHER_ACTIVATED', grant.id, {provider: 'mikrotik-radius', expires_at: expiry.toISOString()});
    }
    // Speeds come from immutable voucher terms, never the editable package.
    return {expiresAt: new Date(grant.proposed_expires_at), download: v.download_mbps ?? config.defaultDownload, upload: v.upload_mbps ?? config.defaultUpload};
  });
}
