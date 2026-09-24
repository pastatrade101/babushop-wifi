import {afterAll,afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {buildApp} from '../apps/api/src/app.ts';
import {pool,SITE} from '../packages/database/src/index.ts';
import {MockAdapter} from '../packages/omada/src/index.ts';
let app:Awaited<ReturnType<typeof buildApp>>;
beforeAll(async()=>{app=await buildApp({adapter:new MockAdapter(),verifyToken:async token=>token==='admin'||token==='cashier'?token:null});});
afterEach(()=>vi.restoreAllMocks());afterAll(()=>app.close());
function database(rows:any[]=[]){return vi.spyOn(pool,'query').mockImplementation((async(sql:string,params:any[])=>{
 if(sql.includes('wifi.staff_profiles'))return {rows:[{id:params[0],display_name:'Test staff',role:params[0]==='admin'?'ADMIN':'CASHIER',enabled:true}]};
 return {rows};
}) as any);}
const endpoint='/api/v1/reports/revenue?from=2026-09-01&to=2026-09-24';
const request=(url=endpoint,token='admin')=>app.inject({url,headers:{authorization:'Bearer '+token}});
describe('revenue API',()=>{
 it('refuses anonymous access before reading any records',async()=>{const db=database();expect((await app.inject(endpoint)).statusCode).toBe(401);expect(db).not.toHaveBeenCalled();});
 it('refuses a cashier even with a verified, enabled staff account',async()=>{const db=database();expect((await request(endpoint,'cashier')).statusCode).toBe(403);expect(db).toHaveBeenCalledTimes(1);});
 it('returns period, channel net values and a reconciled total to administrators',async()=>{
 const db=database([{channel:'cash',gross_tzs:15000,reversals_tzs:2000,sales_count:10,vouchers_sold:12},{channel:'azampay',gross_tzs:25000,reversals_tzs:5000,sales_count:14,vouchers_sold:14},{channel:'other',gross_tzs:3000,reversals_tzs:0,sales_count:1,vouchers_sold:1}]);
 const response=await request();expect(response.statusCode).toBe(200);expect(response.headers['cache-control']).toBe('no-store');
 const result=response.json();expect(result).toMatchObject({from:'2026-09-01',to:'2026-09-24',gross_tzs:43000,reversals_tzs:7000,net_tzs:36000,cash_net_tzs:13000,azampay_net_tzs:20000,azampay_sales_count:14,other_net_tzs:3000,sales_count:25,vouchers_sold:27});
 expect(result.net_tzs).toBe(result.cash_net_tzs+result.azampay_net_tzs+result.other_net_tzs);
 expect(db.mock.calls[1][1]).toEqual(['2026-09-01','2026-09-24',SITE]);
 });
 it('retains negative net revenue when this period reverses an older sale',async()=>{database([{channel:'azampay',gross_tzs:0,reversals_tzs:7000,sales_count:0,vouchers_sold:0}]);expect((await request()).json()).toMatchObject({gross_tzs:0,reversals_tzs:7000,net_tzs:-7000,azampay_net_tzs:-7000,azampay_sales_count:0});});
 it('returns zeros for a period with no sales or reversals',async()=>{database();expect((await request()).json()).toMatchObject({net_tzs:0,cash_net_tzs:0,azampay_net_tzs:0,other_net_tzs:0,sales_count:0,vouchers_sold:0});});
 it.each(['from=2026-02-30&to=2026-09-24','from=not-a-date','from=2026-09-24&to=2026-09-01','from=2026-09-01&tenant_id=other'])('rejects invalid range or unsupported scope: %s',async query=>{const db=database();expect((await request('/api/v1/reports/revenue?'+query)).statusCode).toBe(400);expect(db).toHaveBeenCalledTimes(1);});
});
