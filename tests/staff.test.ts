import {it,expect} from 'vitest';
import {canOpen,roleLabel,isRole,ROLES} from '../apps/web/src/lib/roles.ts';
import {seesAllSales,MONEY_ROLES} from '../apps/api/src/access.ts';
import {renderStaffInvite,mailerConfig,emailConfig,ROLE_COPY} from '../packages/notifications/src/index.ts';

const EVERY_PAGE=['/','/sell','/vouchers','/voucher-batches','/packages','/sales','/payments','/revenue','/reports','/access-grants','/sessions','/network','/router','/settings','/staff'];

it('gives Sales exactly the money pages, and nothing that changes the shop',()=>{
 const sales=EVERY_PAGE.filter(p=>canOpen('SALES',p));
 expect(sales.sort()).toEqual(['/','/payments','/revenue','/sales','/sell','/sessions','/vouchers'].sort());
 for(const closed of ['/packages','/voucher-batches','/reports','/access-grants','/network','/router','/settings','/staff'])expect(canOpen('SALES',closed),closed).toBe(false);
});

it('keeps the cashier where they were, and the administrator everywhere',()=>{
 expect(EVERY_PAGE.filter(p=>canOpen('CASHIER',p)).sort()).toEqual(['/','/packages','/payments','/sales','/sell','/vouchers'].sort());
 for(const page of EVERY_PAGE)expect(canOpen('ADMIN',page),page).toBe(true);
 // An unknown role opens nothing.
 for(const page of EVERY_PAGE)expect(canOpen('OWNER',page),page).toBe(false);
});

it('names roles for people and knows which are real',()=>{
 expect(roleLabel('SALES')).toBe('Sales');
 expect(roleLabel('ADMIN')).toBe('Administrator');
 expect(roleLabel('WHATEVER')).toBe('WHATEVER');
 expect(isRole('SALES')).toBe(true);
 expect(isRole('sales')).toBe(false);
 expect(Object.keys(ROLES).sort()).toEqual(Object.keys(ROLE_COPY).sort());
});

it('lets the roles that follow the money read every sale',()=>{
 expect(seesAllSales('ADMIN')).toBe(true);
 expect(seesAllSales('SALES')).toBe(true);
 expect(seesAllSales('CASHIER')).toBe(false);
 expect(seesAllSales(undefined)).toBe(false);
 expect(MONEY_ROLES).toEqual(['ADMIN','SALES']);
});

it('writes the invite the way the person will read it, and escapes what people typed',()=>{
 const link='https://jiachie-wifi.com/welcome?token_hash=abc123&type=invite';
 const {subject,html,text}=renderStaffInvite({name:'Amina <script>',email:'amina@example.com',role:'SALES',invitedBy:'Pastory & Co',link},{brand:'JIACHIE WIFI',portalOrigin:'https://jiachie-wifi.com'});
 expect(subject).toBe('Pastory & Co invited you to JIACHIE WIFI');
 expect(html).toContain('Hi Amina &lt;script&gt;');
 expect(html).not.toContain('<script>');
 expect(html).toContain('Pastory &amp; Co');
 expect(html).toContain(`href="${link.replace('&','&amp;')}"`);
 expect(html).toContain('Sales');
 expect(html).toContain('Revenue and Wi-Fi sessions');
 expect(text).toContain(link);
 expect(text).toContain('amina@example.com');
 // No password of any kind travels in the email.
 expect(html+text).not.toMatch(/password:\s*\S/i);
});

it('needs only a Resend key to mail an invite, but a recipient too for sale alerts',()=>{
 expect(mailerConfig({})).toBeNull();
 expect(mailerConfig({RESEND_API_KEY:'re_x'})).toEqual({apiKey:'re_x',from:'JIACHIE WIFI <onboarding@resend.dev>'});
 expect(mailerConfig({RESEND_API_KEY:'re_x',RESEND_FROM:'Sales <sales@jiachie-wifi.com>'})?.from).toBe('Sales <sales@jiachie-wifi.com>');
 expect(emailConfig({RESEND_API_KEY:'re_x'})).toBeNull();
 expect(emailConfig({RESEND_API_KEY:'re_x',SALE_ALERT_EMAIL:'a@b.co'})?.to).toEqual(['a@b.co']);
});
