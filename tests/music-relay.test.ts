import {createHmac,createSign,generateKeyPairSync} from 'node:crypto';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {pool} from '../packages/database/src/index.ts';
import {captureMusicCallback,deliverMusicCallbackOne,musicRelayConfig,normalizeMusicEvent,relayHeaders} from '../packages/database/src/music-relay.ts';
const key='b'.repeat(64),token='test-upstream-secret-not-real';
const keys=generateKeyPairSync('rsa',{modulusLength:2048});
const reference='PTM-11111111-1111-4111-8111-111111111111';
function callback(status='success'){
 const body={utilityref:reference,externalreference:'provider-123',transactionstatus:status,operator:'Mpesa',amount:'2000',currency:'TZS',signature:''};
 body.signature=createSign('RSA-SHA256').update(body.utilityref+body.externalreference+status+body.operator).end().sign(keys.privateKey,'base64');
 return body;
}
beforeEach(()=>{
 vi.stubEnv('MUSIC_RELAY_UPSTREAM_AUTH','rsa');vi.stubEnv('MUSIC_RELAY_SETTLEMENT_CURRENCY','');
 vi.stubEnv('MUSIC_RELAY_ENABLED','true');vi.stubEnv('MUSIC_RELAY_URL','https://music.example/api/billing/relay');vi.stubEnv('MUSIC_RELAY_SECRET',key);
 vi.stubEnv('AZAM_SOURCE','pastory');vi.stubEnv('AZAM_CALLBACK_TOKEN',token);
 vi.stubEnv('AZAM_CALLBACK_PUBLIC_KEY',keys.publicKey.export({type:'spki',format:'pem'}).toString());
});
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});

describe('trusted music relay',()=>{
 it('does not intercept Wi-Fi callbacks or touch their DB records',async()=>{
  const db=vi.spyOn(pool,'query');
  expect(await captureMusicCallback(JSON.stringify({utilityref:'ONE-123'}),{},'azam')).toBe(false);
  expect(await captureMusicCallback(JSON.stringify(callback()),{},'snippe')).toBe(false);
  expect(db).not.toHaveBeenCalled();
 });
 it('queues a verified music callback durably without customer data',async()=>{
  const db=vi.spyOn(pool,'query').mockResolvedValue({rows:[]} as never);
  expect(await captureMusicCallback(JSON.stringify({...callback(),msisdn:'do-not-forward'}),{'x-callback-token':token},'azam')).toBe(true);
  const [sql,args]=db.mock.calls[0] as unknown as [string,unknown[]];
  expect(sql).toContain('on conflict(event_id) do nothing');
  expect(JSON.stringify(args)).not.toContain('do-not-forward');
  expect(args[1]).toMatchObject({source:'pastory',reference,status:'paid',providerReference:'provider-123'});
 });
 it('does not convert the legacy unsigned allowance into Premium',async()=>{
  vi.stubEnv('AZAM_CALLBACK_PUBLIC_KEY','');vi.stubEnv('AZAM_ALLOW_UNSIGNED_CALLBACKS','true');
  const db=vi.spyOn(pool,'query');
  await expect(captureMusicCallback(JSON.stringify(callback()),{'x-callback-token':token},'azam')).rejects.toMatchObject({status:401});
  expect(db).not.toHaveBeenCalled();
 });
 it('accepts the explicit strong callback-token mode without forwarding secrets',async()=>{
  vi.stubEnv('MUSIC_RELAY_UPSTREAM_AUTH','callback-token');
  vi.stubEnv('AZAM_CALLBACK_PUBLIC_KEY','');vi.stubEnv('AZAM_ALLOW_UNSIGNED_CALLBACKS','true');
  vi.stubEnv('AZAM_CALLBACK_TOKEN','c'.repeat(64));vi.stubEnv('MUSIC_RELAY_SETTLEMENT_CURRENCY','TZS');
  const db=vi.spyOn(pool,'query').mockResolvedValue({rows:[]} as never);
  const {currency,signature,...body}=callback();
  expect(await captureMusicCallback(JSON.stringify({...body,password:'private'}),{'x-callback-token':'c'.repeat(64)},'azam')).toBe(true);
  const event=(db.mock.calls[0][1] as unknown as unknown[])[1];
  expect(event).toMatchObject({amount:2000,currency:'TZS',reference,providerReference:'provider-123'});
  expect(JSON.stringify(event)).not.toContain('private');
 });
 it.each(['','wrong'])('rejects a missing or wrong token in explicit token mode: %s',async(presented)=>{
  vi.stubEnv('MUSIC_RELAY_UPSTREAM_AUTH','callback-token');vi.stubEnv('AZAM_CALLBACK_PUBLIC_KEY','');
  vi.stubEnv('AZAM_ALLOW_UNSIGNED_CALLBACKS','true');vi.stubEnv('AZAM_CALLBACK_TOKEN','c'.repeat(64));
  const db=vi.spyOn(pool,'query');
  await expect(captureMusicCallback(JSON.stringify(callback()),{'x-callback-token':presented},'azam')).rejects.toMatchObject({status:401});
  expect(db).not.toHaveBeenCalled();
 });
 it('rejects a weak token even with explicit token mode',async()=>{
  vi.stubEnv('MUSIC_RELAY_UPSTREAM_AUTH','callback-token');vi.stubEnv('AZAM_CALLBACK_PUBLIC_KEY','');vi.stubEnv('AZAM_ALLOW_UNSIGNED_CALLBACKS','true');
  await expect(captureMusicCallback(JSON.stringify(callback()),{'x-callback-token':token},'azam')).rejects.toMatchObject({status:401});
 });
 it('pins only omitted currency; explicit mismatches and missing amount remain visible',()=>{
  const {currency,...body}=callback();
  expect(normalizeMusicEvent(body)?.currency).toBeNull();
  expect(normalizeMusicEvent(body,'TZS')?.currency).toBe('TZS');
  expect(normalizeMusicEvent({...body,currency:'USD'},'TZS')?.currency).toBe('USD');
  expect(normalizeMusicEvent({...body,amount:undefined},'TZS')?.amount).toBeNull();
  expect(normalizeMusicEvent({...body,amount:'1'},'TZS')?.eventId).not.toBe(normalizeMusicEvent(body,'TZS')?.eventId);
 });
 it('rejects tampered signatures and does not route by unsigned metadata',async()=>{
  const db=vi.spyOn(pool,'query');
  await expect(captureMusicCallback(JSON.stringify({...callback(),transactionstatus:'paid'}),{'x-callback-token':token},'azam')).rejects.toMatchObject({status:401});
  expect(normalizeMusicEvent({...callback(),utilityref:'other',additionalProperties:{property2:reference}})).toBeNull();
  expect(db).not.toHaveBeenCalled();
 });
 it.each(['unpaid','unsuccessful','not paid','successfully initiated'])('never grants on %s',status=>{
  expect(normalizeMusicEvent(callback(status))?.status).toBe('review');
 });
 it('refuses redirects/plaintext/query-secret targets and weak shared keys',()=>{
  const env={MUSIC_RELAY_ENABLED:'true',MUSIC_RELAY_URL:'https://music.example/api/billing/relay',MUSIC_RELAY_SECRET:key};
  for(const url of ['http://music.example/api/billing/relay','https://user:pass@music.example/api/billing/relay','https://music.example/api/billing/relay?token=secret'])
   expect(()=>musicRelayConfig({...env,MUSIC_RELAY_URL:url})).toThrow();
  expect(()=>musicRelayConfig({...env,MUSIC_RELAY_SECRET:'weak'})).toThrow();
  expect(musicRelayConfig({...env,MUSIC_RELAY_ENABLED:'false'})).toBeNull();
 });
 it('signs the exact payload with method, path and timestamp',()=>{
  const body=JSON.stringify(normalizeMusicEvent(callback()));
  const headers=relayHeaders(body,key,1800000000000);
  expect(headers['x-pastatrade-relay-signature']).toBe(createHmac('sha256',Buffer.from(key,'hex')).update('v1\nPOST\n/api/billing/relay\n1800000000\n'+body).digest('hex'));
 });
 it.each([false,true])('leases an outbox row and persists delivery=%s',async(success)=>{
  const payload=normalizeMusicEvent(callback())!;
  const db=vi.spyOn(pool,'query').mockResolvedValueOnce({rows:[{event_id:payload.eventId,payload,attempts:1}]} as never).mockResolvedValue({rows:[]} as never);
  const send=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(success?JSON.stringify({received:payload.eventId}):'down',{status:success?200:503}));
  await expect(deliverMusicCallbackOne()).resolves.toBe(true);
  expect(String(db.mock.calls[0][0])).toContain('skip locked');
  expect(send.mock.calls[0][1]).toMatchObject({redirect:'error'});
  const args=db.mock.calls[1][1] as unknown as unknown[];
  expect(args[2]).toBe(success);expect(args[4]).toBe(10);
 });
 it('does not accept a proxy 200 HTML page as acknowledgment',async()=>{
  const payload=normalizeMusicEvent(callback())!;
  const db=vi.spyOn(pool,'query').mockResolvedValueOnce({rows:[{event_id:payload.eventId,payload,attempts:2}]} as never).mockResolvedValue({rows:[]} as never);
  vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response('<html>Maintenance</html>'));
  await deliverMusicCallbackOne();
  expect((db.mock.calls[1][1] as unknown as unknown[])[2]).toBe(false);
 });
 it('retains the queue on network failure and retries later',async()=>{
  const payload=normalizeMusicEvent(callback())!;
  const db=vi.spyOn(pool,'query').mockResolvedValueOnce({rows:[{event_id:payload.eventId,payload,attempts:20}]} as never).mockResolvedValue({rows:[]} as never);
  vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('Network unavailable'));
  await deliverMusicCallbackOne();
  expect((db.mock.calls[1][1] as unknown as unknown[]).slice(2)).toEqual([false,0,3600]);
 });
});
