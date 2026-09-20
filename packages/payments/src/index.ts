import {snippeProvider} from './snippe.provider.ts';
import type {PaymentProvider} from './provider.ts';

export type {CheckoutInput,CheckoutResult,NormalizedEvent,PaymentStatus,PaymentProvider} from './provider.ts';
export {isFailure} from './snippe.provider.ts';

// The active provider, or null when none is configured -- in which case
// self-service purchase is simply unavailable and the cash counter is the only
// way to buy. Nothing else in the app changes. Add further providers here.
export function paymentProvider():PaymentProvider|null{
 if(process.env.SNIPPE_API_KEY&&process.env.SNIPPE_WEBHOOK_SECRET)return snippeProvider;
 return null;
}

export const paymentsEnabled=()=>paymentProvider()!==null;

/** Public URL the provider POSTs verified events to. */
export const webhookUrl=()=>(process.env.PUBLIC_API_URL||process.env.APP_ORIGIN||'').replace(/\/+$/,'')+'/api/v1/portal/payments/webhook/snippe';
