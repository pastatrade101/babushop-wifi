import {randomBytes,createHmac,createCipheriv,createDecipheriv,timingSafeEqual} from 'node:crypto';
import {requireValue} from './index.ts';
export const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function key(name:string){const v=process.env[name]||'';requireValue(/^[a-f0-9]{64}$/i.test(v),500,`${name} must contain 32 bytes encoded as hex`);return Buffer.from(v,'hex');}
export function normalize(code:string){const n=code.toUpperCase().replace(/[\s-]/g,'');requireValue(n.length===16&&[...n].every(c=>alphabet.includes(c)),400,'Voucher cannot be used. Check the code or contact the attendant.');return n;}
export function generate(){return [...randomBytes(16)].map(b=>alphabet[b&31]).join('');}
export function present(code:string){return code.match(/.{4}/g)!.join('-');}
export function digest(value:string,secret='VOUCHER_LOOKUP_KEY'){return createHmac('sha256',key(secret)).update(value).digest('hex');}
export function encrypt(value:string){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key('VOUCHER_ENCRYPTION_KEY'),iv);return Buffer.concat([iv,c.update(value),c.final(),c.getAuthTag()]).toString('base64');}
export function decrypt(value:string){const b=Buffer.from(value,'base64'),c=createDecipheriv('aes-256-gcm',key('VOUCHER_ENCRYPTION_KEY'),b.subarray(0,12));c.setAuthTag(b.subarray(-16));return Buffer.concat([c.update(b.subarray(12,-16)),c.final()]).toString();}
export function token(){return randomBytes(32).toString('base64url');}
export function equal(a:string,b:string){return a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));}
export function csvCell(value:unknown){const s=String(value??'');return '"'+(/^[=+@\-\t\r]/.test(s)?"'":'')+s.replaceAll('"','""')+'"';}
