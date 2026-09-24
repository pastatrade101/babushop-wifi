import {it,expect} from 'vitest';
import {durationSw,speedSw,tsh,messageSw} from '../apps/web/src/lib/sw.ts';

it('says a package length the way customers say it',()=>{
 expect(durationSw(30)).toBe('Dakika 30');
 expect(durationSw(60)).toBe('Saa 1');
 expect(durationSw(180)).toBe('Saa 3');
 expect(durationSw(1440)).toBe('Saa 24');
 expect(durationSw(2880)).toBe('Siku 2');
 expect(durationSw(10080)).toBe('Wiki 1');
 expect(durationSw(43200)).toBe('Mwezi 1 (siku 30)');
 expect(durationSw(86400)).toBe('Miezi 2 (siku 60)');
 expect(speedSw(4)).toBe('Kasi hadi Mbps 4');
 expect(tsh(10000)).toBe('TSh 10,000');
});

// Every message the purchase API can put in front of a customer.
const API_MESSAGES=[
 'Choose your mobile money network.','Enter the number that will pay.','Enter a valid Tanzanian mobile number, for example 0712 345 678.',
 'That package is sold out. Choose another or ask the attendant.','This package cannot be paid for by phone. Please pay the attendant.',
 'This package is priced below the 500 TZS minimum for mobile payment. Please pay the attendant instead.',
 'Mobile payment is unavailable right now. Please pay the attendant.','Mobile payment is not configured.','Mobile payment is not configured correctly.','Payments are not configured',
 'Could not reach the payment service. Please try again or pay the attendant.','The payment service could not be reached. Please try again or pay the attendant.',
 'The payment service could not start this purchase. Please try again or pay the attendant.','The payment service rejected this request. Please try again or pay the attendant.',
 'Payment received. Please ask the attendant for your code.','Purchase not found. Check the link or ask the attendant.','Purchase not found',
 'Waiting for your payment.','This purchase did not complete. No money was taken; you can try again.',
 'Your payment arrived after the voucher was released. Show this screen to the attendant for a refund.',
];

it('never shows a customer English from the payment flow',()=>{
 for(const message of API_MESSAGES){
  const sw=messageSw(message,'FALLBACK');
  expect(sw,message).not.toBe('FALLBACK');
  expect(sw,message).not.toMatch(/\b(the|please|payment|your|attendant|try again)\b/i);
 }
 // Anything unexpected -- a provider's raw error, say -- gets the Swahili fallback, not English.
 expect(messageSw('ECONNRESET upstream 502 from gateway','Jaribu tena.')).toBe('Jaribu tena.');
 expect(messageSw('Too Many Requests','x')).toContain('Subiri');
 expect(messageSw('',"x")).toBe('x');
 expect(messageSw(null,'x')).toBe('x');
});
