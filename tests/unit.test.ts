import {describe,it,expect} from 'vitest';
import {generate,normalize,present,encrypt,decrypt,digest,csvCell,alphabet} from '../packages/database/src/crypto.ts';
import {MockAdapter,LiveAdapter,adapterFromEnv} from '../packages/omada/src/index.ts';
import {validateContext} from '../packages/database/src/access.ts';
const context={clientMac:'AA:00:00:00:00:01',apMac:'AA:BB:CC:DD:EE:01',site:'babu-shop',ssidName:'BABU-SHOP WIFI',radioId:'0'};
describe('voucher protection',()=>{
 it('uses a 32-symbol alphabet and 80 random bits',()=>{expect(new Set(alphabet).size).toBe(32);const codes=Array.from({length:1000},generate);expect(new Set(codes).size).toBe(1000);expect(codes.every(c=>c.length===16)).toBe(true);});
 it('normalizes only permitted characters',()=>{const code=generate();expect(normalize(present(code).toLowerCase())).toBe(code);expect(()=>normalize('O000-AAAA-AAAA-AAAA')).toThrow();});
 it('encrypts recoverably and rejects tampering',()=>{const c=generate(),e=encrypt(c);expect(e).not.toContain(c);expect(decrypt(e)).toBe(c);const b=Buffer.from(e,'base64');b[15]^=1;expect(()=>decrypt(b.toString('base64'))).toThrow();expect(digest(c)).toHaveLength(64);});
 it('escapes spreadsheet formulas and quotes',()=>{expect(csvCell('=SUM(A1)')).toBe('"\'=SUM(A1)"');expect(csvCell('a"b')).toBe('"a""b"');});
});
describe('network boundary',()=>{
 it('rejects unknown APs/sites and malformed addresses',()=>{expect(validateContext(context)).toEqual(context);expect(()=>validateContext({...context,site:'other'})).toThrow();expect(()=>validateContext({...context,apMac:'AA:BB:CC:DD:EE:02'})).toThrow();expect(()=>validateContext({...context,clientIp:'not-ip'})).toThrow();});
 it('exercises all mock outcomes',async()=>{for(const [scenario,status]of [['success','accepted'],['rejection','rejected'],['timeout','unknown'],['expired-session','accepted']]){const a=new MockAdapter(scenario);expect((await a.authorize(context,new Date(Date.now()+60000))).status).toBe(status);if(scenario==='expired-session')expect(a.calls).toBe(2);}});
 it('live mode fails safely without verified expiry',()=>{expect(()=>new LiveAdapter({baseUrl:'https://controller.internal:8043',controllerId:'id',username:'operator',password:'secret',profile:'modern',timeUnit:'milliseconds',timeMeaning:'timestamp',fieldType:'number',expiryVerified:false})).toThrow('commissioned');});
 it('never silently chooses mock mode',()=>{const old=process.env.OMADA_MODE;process.env.OMADA_MODE='typo';expect(()=>adapterFromEnv()).toThrow();process.env.OMADA_MODE=old;});
});
