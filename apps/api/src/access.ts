// Which roles see the money. ADMIN runs the shop; SALES sells and follows
// revenue, so both read every sale, the revenue reports and Wi-Fi sessions.
// CASHIER sells at the counter and reads only their own sales.
export const MONEY_ROLES=['ADMIN','SALES'];
export const seesAllSales=(role:string|undefined)=>MONEY_ROLES.includes(role??'');
