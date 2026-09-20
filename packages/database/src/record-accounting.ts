import {pool} from './index.ts';
import {digest, normalize} from './crypto.ts';
import {mac} from './access.ts';
import type {Accounting} from '../../network/src/accounting.ts';
export async function recordAccounting(event: Accounting, nas: string) {
  let code: string, clientMac: string;
  try { code = normalize(event.username); clientMac = mac(event.clientMac); } catch { return; }
  const grant = (await pool.query(`select g.id from wifi.access_grants g join wifi.vouchers v on v.id=g.voucher_id
    where v.code_digest=$1 and g.client_mac=$2 and g.provider='mikrotik-radius'`, [digest(code), clientMac])).rows[0];
  if (!grant) return;
  // Absolute cumulative counters, not deltas: duplicate and reordered UDP reports
  // cannot double-count traffic or reopen a stopped session. Never changes grants.
  await pool.query(`insert into wifi.network_sessions(grant_id,nas,session_id,session_seconds,upload_bytes,download_bytes,stopped_at,terminate_cause)
    values($1,$2,$3,$4,$5,$6,case when $7 then now() else null end,$8)
    on conflict(nas,session_id) do update set
      last_seen_at=case when excluded.session_seconds>=wifi.network_sessions.session_seconds then now() else wifi.network_sessions.last_seen_at end,
      session_seconds=greatest(wifi.network_sessions.session_seconds,excluded.session_seconds),
      upload_bytes=greatest(wifi.network_sessions.upload_bytes,excluded.upload_bytes),
      download_bytes=greatest(wifi.network_sessions.download_bytes,excluded.download_bytes),
      stopped_at=coalesce(wifi.network_sessions.stopped_at,excluded.stopped_at),
      terminate_cause=coalesce(wifi.network_sessions.terminate_cause,excluded.terminate_cause)
    where wifi.network_sessions.grant_id=excluded.grant_id`, [grant.id,nas,event.sessionId,event.seconds,event.upload,event.download,event.status==='Stop',event.terminateCause]);
}
