import {AZAM_NETWORKS} from '../../payments/src/azam.provider.ts';

// The owner's "you just made a sale" email.
//
// Email clients are not browsers: Gmail strips <style> blocks and most phone
// apps ignore modern layout, so this is tables and inline styles on purpose.
// Colours are the portal's blues. The brand blue itself (#487fff) is only
// 3.6:1 against white, so it is the accent rule; anything carrying white text
// uses the deeper hover blue, which clears 4.5:1.
//
// What is left out matters as much as what is in. The voucher code belongs to
// the customer and is never included -- an inbox is not a safe place for a
// working credential. The customer's number is masked before it is even
// queued; the full record is one tap away in the portal, behind a login.

export type SalePaid={
 saleId:string;receipt:string;reference:string;amountTzs:number;
 packageName:string;durationMinutes:number;downloadMbps:number|null;uploadMbps:number|null;
 provider:string;network:string|null;customer:string;paidAt:string;
};
export type SaleContext={brand:string;portalUrl:string;todayCount:number;todayTotalTzs:number};

const BRAND='#487fff',DEEP='#3869dd',BLUE_TEXT='#315fce',SOFT='#edf3ff',INK='#111827',MUTED='#64748b',LINE='#e5e7eb',BG='#f5f6fa';

const esc=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const money=(n:number)=>new Intl.NumberFormat('en-TZ').format(Math.round(n||0));
const when=(iso:string)=>new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Dar_es_Salaam'}).format(new Date(iso));

/**
 * The same wording the portal uses for a package's length. Kept as a copy
 * because a server package should not import from the web app; a test pins the
 * two together so they cannot drift.
 */
export function formatDuration(minutes:number):string{
 if(minutes===1440)return '24 hours';
 const units:[string,number][]=[['months',43200],['weeks',10080],['days',1440],['hours',60],['minutes',1]];
 const [unit,size]=units.find(([,m])=>minutes%m===0)!;
 const amount=minutes/size;
 return `${amount} ${amount===1?unit.slice(0,-1):unit}${unit==='months'?` (${amount*30} days)`:''}`;
}

export function maskPhone(phone:string|null):string{
 const digits=(phone||'').replace(/\D/g,'');
 if(digits.length<7)return 'Not given';
 return `${digits.slice(0,4)} ••• ${digits.slice(-3)}`;
}

const speed=(down:number|null,up:number|null)=>down&&up?`Up to ${down} Mbps down · ${up} Mbps up`:down?`Up to ${down} Mbps`:'Shared line, no cap';
const networkLabel=(network:string|null)=>AZAM_NETWORKS.find(n=>n.value===network)?.label??(network?network:'Mobile money');
const providerLabel=(provider:string)=>({azam:'AzamPay',snippe:'Snippe'} as Record<string,string>)[provider]??provider;

export function renderSalePaid(sale:SalePaid,context:SaleContext){
 const amount='TZS '+money(sale.amountTzs);
 const paidWith=`${networkLabel(sale.network)} through ${providerLabel(sale.provider)}`;
 const subject=`New sale · ${amount} · ${sale.packageName}`;
 const today=`Sale #${context.todayCount} today · ${'TZS '+money(context.todayTotalTzs)} so far`;
 const rows:[string,string][]=[
  ['Package',sale.packageName],
  ['Access',formatDuration(sale.durationMinutes)],
  ['Speed',speed(sale.downloadMbps,sale.uploadMbps)],
  ['Paid with',paidWith],
  ['Customer',sale.customer],
  ['Receipt',sale.receipt],
  ['Reference',sale.reference],
 ];
 const detailRows=rows.map(([label,value],i)=>`<tr>
  <td style="padding:12px 0;${i?`border-top:1px solid ${LINE};`:''}color:${MUTED};font-size:14px;width:34%;vertical-align:top">${esc(label)}</td>
  <td style="padding:12px 0;${i?`border-top:1px solid ${LINE};`:''}color:${INK};font-size:14px;font-weight:600;word-break:break-word">${esc(value)}</td></tr>`).join('');

 const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(`${amount} for ${sale.packageName}, paid with ${paidWith}.`)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG}"><tr><td align="center" style="padding:28px 14px">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid ${LINE}">
  <tr><td style="background:${BRAND};height:4px;line-height:4px;font-size:0">&nbsp;</td></tr>
  <tr><td style="background:${DEEP};padding:20px 28px">
   <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:.3px">${esc(context.brand)}</td>
    <td align="right"><span style="display:inline-block;background:#ffffff;color:${BLUE_TEXT};font-size:11px;font-weight:700;letter-spacing:1.4px;padding:5px 10px;border-radius:999px">NEW SALE</span></td>
   </tr></table>
  </td></tr>
  <tr><td style="padding:28px 28px 8px">
   <div style="color:${MUTED};font-size:13px;font-weight:600;letter-spacing:.4px;text-transform:uppercase">Payment received</div>
   <div style="color:${INK};font-size:38px;line-height:1.15;font-weight:800;letter-spacing:-1px;margin:6px 0 8px">${esc(amount)}</div>
   <div style="color:${MUTED};font-size:14px;line-height:1.5">${esc(paidWith)}<br>${esc(when(sale.paidAt))} · Tanzania time</div>
   <div style="display:inline-block;margin-top:16px;background:${SOFT};color:${BLUE_TEXT};font-size:13px;font-weight:700;padding:7px 12px;border-radius:999px">${esc(today)}</div>
  </td></tr>
  <tr><td style="padding:12px 28px 4px">
   <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${detailRows}</table>
  </td></tr>
  <tr><td style="padding:20px 28px 30px">
   <a href="${esc(context.portalUrl)}" style="display:inline-block;background:${DEEP};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 20px;border-radius:10px">View in the portal &rarr;</a>
  </td></tr>
 </table>
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px"><tr><td style="padding:18px 8px;color:${MUTED};font-size:12px;line-height:1.6;text-align:center">
  Sent automatically when a mobile money purchase is confirmed.<br>Voucher codes are never included in these emails.
 </td></tr></table>
</td></tr></table>
</body></html>`;

 const text=[
  `${context.brand} — new sale`,'',
  `Payment received: ${amount}`,
  `${paidWith}`,
  `${when(sale.paidAt)} (Tanzania time)`,
  today,'',
  ...rows.map(([label,value])=>`${label}: ${value}`),'',
  `View in the portal: ${context.portalUrl}`,'',
  'Voucher codes are never included in these emails.',
 ].join('\n');

 return {subject,html,text};
}
