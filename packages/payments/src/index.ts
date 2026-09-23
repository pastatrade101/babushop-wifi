import {snippeProvider} from './snippe.provider.ts';
import {azamProvider} from './azam.provider.ts';
import type {PaymentProvider} from './provider.ts';

export type {CheckoutInput,CheckoutResult,NormalizedEvent,PaymentStatus,PaymentProvider,Flow,Network} from './provider.ts';
export {snippeProvider} from './snippe.provider.ts';
export {azamProvider,normalizePhone,AZAM_NETWORKS,callbackShape} from './azam.provider.ts';

const configured:Record<string,()=>boolean>={
 azam:()=>!!(process.env.AZAM_CLIENT_ID&&process.env.AZAM_CLIENT_SECRET&&process.env.AZAM_APP_NAME&&process.env.AZAM_CALLBACK_TOKEN),
 snippe:()=>!!(process.env.SNIPPE_API_KEY&&process.env.SNIPPE_WEBHOOK_SECRET),
};
const providers:Record<string,PaymentProvider>={azam:azamProvider,snippe:snippeProvider};

/**
 * The active provider, or null when none is configured -- in which case
 * self-service purchase is simply unavailable and the cash counter is the only
 * way to buy. Nothing else in the app changes.
 *
 * PAYMENT_PROVIDER names the one to use. It is explicit rather than inferred so
 * that leaving an old provider's credentials in place cannot quietly change who
 * takes the money, and so switching back is one variable.
 */
export function paymentProvider():PaymentProvider|null{
 const chosen=(process.env.PAYMENT_PROVIDER||'').toLowerCase();
 if(chosen){
  const provider=providers[chosen];
  if(!provider)throw new Error(`PAYMENT_PROVIDER must be one of: ${Object.keys(providers).join(', ')}`);
  return configured[chosen]()?provider:null;
 }
 // No explicit choice: use whichever is fully configured, preferring AzamPay.
 for(const name of ['azam','snippe'])if(configured[name]())return providers[name];
 return null;
}

export const paymentsEnabled=()=>paymentProvider()!==null;

/**
 * Public URL the provider POSTs events to, on our own domain.
 *
 * AzamPay does not sign callbacks, so its path carries an unguessable secret
 * segment. Register exactly this URL in the AzamPay portal.
 */
export function webhookUrl(provider=paymentProvider()?.name||''):string{
 const origin=(process.env.PUBLIC_API_URL||process.env.APP_ORIGIN||'').replace(/\/+$/,'');
 const path='/api/v1/portal/payments/webhook/'+provider;
 return provider==='azam'?origin+path+'/'+(process.env.AZAM_CALLBACK_TOKEN||''):origin+path;
}
