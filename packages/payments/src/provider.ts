// Provider-agnostic payment contract, ported from the Pastatrade gateway.
// Voucher issuance must never depend on a specific provider: a provider only
// creates a hosted checkout and reports verified events. Nothing below knows
// what is being sold, so the same contract covers subscriptions later.

export interface CheckoutInput {
 /** Whole units in `currency` -- e.g. 2000 TZS. Never a decimal. */
 amount:number;
 currency:string;
 /** Shown on the hosted page so the buyer recognises the charge. */
 description:string;
 reference:string;
 customer:{name?:string;phone?:string;email?:string};
 /** Where the hosted page returns the buyer. Carries no voucher code. */
 returnUrl:string;
 /** Where the provider POSTs verified events. */
 webhookUrl:string;
}

export interface CheckoutResult {
 provider:string;
 /** Provider session reference, stored for reconciliation. */
 reference:string;
 checkout_url:string;
}

/** A verified webhook payload, normalized across providers. */
export interface NormalizedEvent {
 /** Provider event id -- the idempotency key. Required. */
 id:string;
 type:string;
 status:string;
 reference:string;
 amount:number|null;
 currency:string|null;
 raw:unknown;
}

/** Pull-based status, so a missed or delayed webhook never strands a payer. */
export interface PaymentStatus {
 reference:string;
 status:string;
 paid:boolean;
}

export interface PaymentProvider {
 readonly name:string;
 createCheckout(input:CheckoutInput):Promise<CheckoutResult>;
 /** Verify signature headers against the RAW body. False when invalid. */
 verifyWebhook(rawBody:Buffer|string,headers:Record<string,string|undefined>):boolean;
 /** Parse an already-verified payload. Throws when it cannot be understood. */
 parseEvent(body:unknown):NormalizedEvent;
 /** True when this provider considers `status` settled and paid. */
 isPaid(status:string):boolean;
 /** Reconciliation fallback. Null on any error -- callers must tolerate it. */
 fetchStatus(reference:string):Promise<PaymentStatus|null>;
}
