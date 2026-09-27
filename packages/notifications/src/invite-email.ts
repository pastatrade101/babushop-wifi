import {esc} from './sale-email.ts';

// The email a new staff member gets: who invited them, what they will be able
// to do, and one button that opens the page where they choose a password.
//
// The link carries a one-time token from Supabase. It is the only secret in
// the email and it is the person's own; nothing else here is sensitive.

export type StaffInvite={name:string;email:string;role:'ADMIN'|'CASHIER'|'SALES';invitedBy:string;link:string};
export type InviteContext={brand:string;portalOrigin:string};

export const ROLE_COPY:Record<StaffInvite['role'],{label:string;does:string}>={
 ADMIN:{label:'Administrator',does:'everything: packages, voucher stock, staff, reports, the network and the router.'},
 CASHIER:{label:'Cashier',does:'selling at the counter: Sell internet, Vouchers, Packages, Sales and Mobile payments.'},
 SALES:{label:'Sales',does:'selling and following the money: Sell internet, Vouchers, Sales, Mobile payments, Revenue and Wi-Fi sessions.'},
};

const BRAND='#487fff',DEEP='#3869dd',BLUE_TEXT='#315fce',SOFT='#edf3ff',INK='#111827',MUTED='#64748b',LINE='#e5e7eb',BG='#f5f6fa';

export function renderStaffInvite(invite:StaffInvite,context:InviteContext){
 const role=ROLE_COPY[invite.role];
 const subject=`${invite.invitedBy} invited you to ${context.brand}`;
 const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(`Set up your ${context.brand} staff account as ${role.label}.`)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG}"><tr><td align="center" style="padding:28px 14px">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid ${LINE}">
  <tr><td style="background:${BRAND};height:4px;line-height:4px;font-size:0">&nbsp;</td></tr>
  <tr><td style="background:${DEEP};padding:20px 28px;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:.3px">${esc(context.brand)}</td></tr>
  <tr><td style="padding:28px 28px 8px">
   <div style="color:${MUTED};font-size:13px;font-weight:600;letter-spacing:.4px;text-transform:uppercase">Staff invitation</div>
   <div style="color:${INK};font-size:26px;line-height:1.2;font-weight:800;letter-spacing:-.5px;margin:6px 0 14px">Hi ${esc(invite.name)}, you're in.</div>
   <div style="color:${INK};font-size:15px;line-height:1.6"><strong>${esc(invite.invitedBy)}</strong> has set up a staff account for you on ${esc(context.brand)}, the shop's Wi-Fi portal.</div>
   <table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0 4px;background:${SOFT};border-radius:12px"><tr><td style="padding:14px 16px">
    <div style="color:${BLUE_TEXT};font-size:12px;font-weight:700;letter-spacing:.6px;text-transform:uppercase">Your role</div>
    <div style="color:${INK};font-size:16px;font-weight:700;margin:4px 0 2px">${esc(role.label)}</div>
    <div style="color:${MUTED};font-size:13px;line-height:1.5">You'll handle ${esc(role.does)}</div>
   </td></tr></table>
  </td></tr>
  <tr><td style="padding:16px 28px 8px">
   <a href="${esc(invite.link)}" style="display:inline-block;background:${DEEP};color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:13px 22px;border-radius:10px">Set up my account &rarr;</a>
   <div style="color:${MUTED};font-size:13px;line-height:1.6;margin-top:14px">You'll choose your own password and sign in as <strong style="color:${INK}">${esc(invite.email)}</strong>. The link is yours alone and works once; if it has expired, ask ${esc(invite.invitedBy)} to send a new one.</div>
  </td></tr>
  <tr><td style="padding:18px 28px 28px;color:${MUTED};font-size:12px;line-height:1.6;border-top:1px solid ${LINE}">
   Not expecting this? You can ignore it. Nothing happens until the link is used.<br>
   Portal: <a href="${esc(context.portalOrigin)}" style="color:${BLUE_TEXT}">${esc(context.portalOrigin.replace(/^https?:\/\//,''))}</a>
  </td></tr>
 </table>
</td></tr></table>
</body></html>`;
 const text=[
  `${context.brand} — staff invitation`,'',
  `Hi ${invite.name},`,'',
  `${invite.invitedBy} has set up a staff account for you on ${context.brand}, the shop's Wi-Fi portal.`,'',
  `Your role: ${role.label}. You'll handle ${role.does}`,'',
  'Set up your account here (choose your own password):',invite.link,'',
  `You'll sign in as ${invite.email}. The link is yours alone and works once; if it has expired, ask ${invite.invitedBy} to send a new one.`,'',
  'Not expecting this? You can ignore it. Nothing happens until the link is used.',
  `Portal: ${context.portalOrigin}`,
 ].join('\n');
 return {subject,html,text};
}
