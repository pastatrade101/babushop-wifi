// What each staff role is called and may open. One table, used by the menu,
// the page guards and the Staff page, so they cannot disagree.
//
// ADMIN opens every page. The other two are lists of sidebar paths.

export type Role='ADMIN'|'CASHIER'|'SALES';

export const ROLES:Record<Role,{label:string;summary:string}>={
 ADMIN:{label:'Administrator',summary:'Everything: packages, voucher stock, staff, reports, the network and the router.'},
 CASHIER:{label:'Cashier',summary:'Sells at the counter: Sell internet, Vouchers, Packages, Sales and Mobile payments. Sees only their own sales.'},
 SALES:{label:'Sales',summary:'Sells and follows the money: Sell internet, Vouchers, Sales, Mobile payments, Revenue and Wi-Fi sessions.'},
};

const PAGES:Record<Exclude<Role,'ADMIN'>,readonly string[]>={
 CASHIER:['/','/sell','/vouchers','/packages','/sales','/payments'],
 SALES:['/','/sell','/vouchers','/sales','/payments','/revenue','/sessions'],
};

export const isRole=(value:unknown):value is Role=>value==='ADMIN'||value==='CASHIER'||value==='SALES';
export const canOpen=(role:string,path:string)=>role==='ADMIN'||(PAGES[role as keyof typeof PAGES]??[]).includes(path);
export const roleLabel=(role:string)=>ROLES[role as Role]?.label??role;
