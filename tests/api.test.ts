import {it,expect,afterAll} from 'vitest';
import {buildApp} from '../apps/api/src/app.ts';
import {MockAdapter} from '../packages/omada/src/index.ts';
const app=await buildApp({adapter:new MockAdapter(),verifyToken:async()=>null});afterAll(()=>app.close());
it('has a lightweight liveness endpoint',async()=>{const r=await app.inject('/health/live');expect(r.statusCode).toBe(200);expect(r.json()).toEqual({ok:true});});
it('requires independently verified staff access',async()=>{const r=await app.inject({url:'/api/v1/me',headers:{authorization:'Bearer invalid'}});expect(r.statusCode).toBe(401);expect(r.headers['cache-control']).toBe('no-store');});
it('protects docs and OpenAPI',async()=>{expect((await app.inject('/docs/')).statusCode).toBe(401);expect((await app.inject('/api/v1/openapi.json')).statusCode).toBe(401);});
it('validates public portal request bodies',async()=>{const r=await app.inject({method:'POST',url:'/api/v1/portal/context',payload:{controllerUrl:'https://attacker.example'}});expect(r.statusCode).toBe(400);});
it('rejects cross-origin mutations',async()=>{const r=await app.inject({method:'POST',url:'/api/v1/portal/context',headers:{origin:'https://attacker.example'},payload:{}});expect(r.statusCode).toBe(403);});
