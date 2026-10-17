import {it,expect,vi,beforeEach} from 'vitest';

const STAFF='3e02f3b2-e854-481a-8a93-2c7a1461d002';
let staffRow:any={id:STAFF,display_name:'Shop owner',role:'ADMIN',enabled:true};
const session=(email='owner@example.com')=>({access_token:'access-1',refresh_token:'refresh-1',expires_in:3600,expires_at:1900000000,user:{id:STAFF,email}});

vi.mock('@supabase/supabase-js',()=>({createClient:()=>({auth:{
 signInWithPassword:async({email,password}:{email:string;password:string})=>password==='right'?{data:{session:session(email)},error:null}:{data:{session:null},error:{message:'Invalid login credentials'}},
 refreshSession:async({refresh_token}:{refresh_token:string})=>refresh_token==='refresh-1'?{data:{session:{...session(),access_token:'access-2'}},error:null}:{data:{session:null},error:{message:'expired'}},
}})}));
vi.mock('../packages/database/src/index.ts',async(original)=>({...(await original() as object),pool:{query:async()=>({rows:staffRow?[staffRow]:[]})},audit:async()=>{}}));

beforeEach(()=>{process.env.SUPABASE_URL='https://project.supabase.test';process.env.SUPABASE_PUBLISHABLE_KEY='publishable';staffRow={id:STAFF,display_name:'Shop owner',role:'ADMIN',enabled:true};});

it('signs an enabled staff member in, with the access and refresh tokens and who they are',async()=>{
 const {mobileLogin}=await import('../apps/api/src/mobile-auth.ts');
 const out=await mobileLogin(' Owner@Example.com ','right');
 expect(out).toMatchObject({access_token:'access-1',refresh_token:'refresh-1',expires_at:1900000000,staff:{id:STAFF,name:'Shop owner',email:'owner@example.com',role:'ADMIN'}});
});

it('says the same thing for a wrong password as for an unknown email',async()=>{
 const {mobileLogin}=await import('../apps/api/src/mobile-auth.ts');
 await expect(mobileLogin('owner@example.com','wrong')).rejects.toMatchObject({status:401,message:'Wrong email or password.'});
});

it('refuses a Supabase account that is not, or no longer, enabled staff',async()=>{
 const {mobileLogin,mobileRefresh}=await import('../apps/api/src/mobile-auth.ts');
 staffRow={...staffRow,enabled:false};
 await expect(mobileLogin('owner@example.com','right')).rejects.toMatchObject({status:403});
 await expect(mobileRefresh('refresh-1')).rejects.toMatchObject({status:403});
 staffRow=null;
 await expect(mobileLogin('owner@example.com','right')).rejects.toMatchObject({status:403});
});

it('renews a session from its refresh token, and asks for a new sign-in when that is gone',async()=>{
 const {mobileRefresh}=await import('../apps/api/src/mobile-auth.ts');
 expect((await mobileRefresh('refresh-1')).access_token).toBe('access-2');
 await expect(mobileRefresh('refresh-old-and-gone')).rejects.toMatchObject({status:401});
});
