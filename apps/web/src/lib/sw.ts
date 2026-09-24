// Swahili for the customer's buying screens.
//
// The API speaks English to staff and to logs; customers buying Wi-Fi at the
// shop read Swahili. Every message the purchase flow can show a customer is
// translated here, and anything unexpected falls back to a plain Swahili line
// rather than surfacing English (or a provider's raw error) on a phone.

/** A package's length as a customer says it: "Saa 24", "Wiki 1", "Mwezi 1 (siku 30)". */
export function durationSw(minutes:number):string{
 if(minutes===1440)return 'Saa 24';
 const units:[string,number][]=[['months',43200],['weeks',10080],['days',1440],['hours',60],['minutes',1]];
 const [unit,size]=units.find(([,m])=>minutes%m===0)!;
 const n=minutes/size;
 if(unit==='months')return `${n===1?'Mwezi':'Miezi'} ${n} (siku ${n*30})`;
 if(unit==='weeks')return `Wiki ${n}`;
 if(unit==='days')return `Siku ${n}`;
 if(unit==='hours')return `Saa ${n}`;
 return `Dakika ${n}`;
}

export const speedSw=(mbps:number)=>`Kasi hadi Mbps ${mbps}`;
export const tsh=(amount:number)=>'TSh '+new Intl.NumberFormat('en-TZ').format(amount);

const TRY_AGAIN='Jaribu tena au lipa kwa muhudumu.';
const MESSAGES:Record<string,string>={
 'Choose your mobile money network.':'Chagua mtandao wako wa malipo.',
 'Enter the number that will pay.':'Weka namba ya simu itakayolipa.',
 'Enter a valid Tanzanian mobile number, for example 0712 345 678.':'Weka namba sahihi ya simu ya Tanzania, mfano 0712 345 678.',
 'That package is sold out. Choose another or ask the attendant.':'Kifurushi hiki kimeisha. Chagua kingine au muulize muhudumu.',
 'This package cannot be paid for by phone. Please pay the attendant.':'Kifurushi hiki hakiwezi kulipiwa kwa simu. Tafadhali lipa kwa muhudumu.',
 'This package is priced below the 500 TZS minimum for mobile payment. Please pay the attendant instead.':'Bei ya kifurushi hiki iko chini ya TSh 500, kiwango cha chini cha malipo kwa simu. Tafadhali lipa kwa muhudumu.',
 'Mobile payment is unavailable right now. Please pay the attendant.':'Malipo kwa simu hayapatikani kwa sasa. Tafadhali lipa kwa muhudumu.',
 'Mobile payment is not configured.':'Malipo kwa simu hayapatikani kwa sasa. Tafadhali lipa kwa muhudumu.',
 'Mobile payment is not configured correctly.':'Malipo kwa simu hayapatikani kwa sasa. Tafadhali lipa kwa muhudumu.',
 'Payments are not configured':'Malipo kwa simu hayapatikani kwa sasa. Tafadhali lipa kwa muhudumu.',
 'Could not reach the payment service. Please try again or pay the attendant.':'Tumeshindwa kufikia huduma ya malipo. '+TRY_AGAIN,
 'The payment service could not be reached. Please try again or pay the attendant.':'Tumeshindwa kufikia huduma ya malipo. '+TRY_AGAIN,
 'The payment service could not start this purchase. Please try again or pay the attendant.':'Huduma ya malipo imeshindwa kuanzisha ununuzi huu. '+TRY_AGAIN,
 'The payment service rejected this request. Please try again or pay the attendant.':'Huduma ya malipo imekataa ombi hili. '+TRY_AGAIN,
 'Payment received. Please ask the attendant for your code.':'Malipo yamepokelewa. Tafadhali muulize muhudumu akupe vocha yako.',
 'Purchase not found. Check the link or ask the attendant.':'Hatukupata ununuzi huu. Angalia kiungo au muulize muhudumu.',
 'Purchase not found':'Hatukupata ununuzi huu. Angalia kiungo au muulize muhudumu.',
 'Waiting for your payment.':'Tunasubiri malipo yako.',
 'This purchase did not complete. No money was taken; you can try again.':'Ununuzi huu haukukamilika. Hakuna pesa iliyokatwa; unaweza kujaribu tena.',
 'Your payment arrived after the voucher was released. Show this screen to the attendant for a refund.':'Malipo yako yamefika baada ya muda wa kukushikilia vocha kuisha. Mwonyeshe muhudumu skrini hii urudishiwe pesa au upewe vocha.',
};

/** The Swahili for a message from the purchase API, or the fallback when there is none. */
export function messageSw(message:string|null|undefined,fallback:string):string{
 const text=(message??'').trim();
 if(!text)return fallback;
 if(MESSAGES[text])return MESSAGES[text];
 if(/too many|rate limit/i.test(text))return 'Maombi ni mengi mno kwa sasa. Subiri kidogo kisha ujaribu tena.';
 return fallback;
}
