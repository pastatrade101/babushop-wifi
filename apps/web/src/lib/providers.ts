// How the mobile-money networks AzamPay takes appear on the checkout tiles:
// the wordmark customers know, and a small second line where one exists.
// Azam and Halo are tested first, because "azampesa" and "halopesa" both
// contain "pesa" and only Vodacom's is M-Pesa.
export type ProviderTile='mpesa'|'airtel'|'mixx'|'halo'|'azam'|'plain';
export const providerClass=(value:string):ProviderTile=>/azam/i.test(value)?'azam':/halo/i.test(value)?'halo':/voda|m-?pesa/i.test(value)?'mpesa':/airtel/i.test(value)?'airtel':/tigo|mixx|yas/i.test(value)?'mixx':'plain';
export const providerText=(value:string,label:string)=>({mpesa:'M-PESA',airtel:'airtel',mixx:'mixx',halo:'Halo',azam:'Azam',plain:label} as Record<ProviderTile,string>)[providerClass(value)];
export const providerSmall=(value:string)=>({airtel:'money',mixx:'by Yas',halo:'Pesa',azam:'Pesa'} as Partial<Record<ProviderTile,string>>)[providerClass(value)]||'';
