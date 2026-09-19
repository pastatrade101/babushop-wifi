# Business rules

Prices are positive whole TZS integers. Demo prices are not market-price recommendations. A generated voucher snapshots the package name, price, duration and one-device wall-clock policy. Editing a package affects future generation. Archiving a package prevents new stock reservations; existing sold vouchers remain valid.

Inventory is AVAILABLE, SOLD or VOID. Access is separately PENDING, ACTIVE, EXPIRED, REVOKED or NEEDS_REVIEW. No grant on a SOLD voucher means sold, unused. Generating stock never counts as revenue. Selling never starts validity.

A reservation locks selected vouchers for five minutes. Concurrent cashiers use `FOR UPDATE SKIP LOCKED`. Final sale locks the reservation and vouchers, inserts one receipt and historical items, and marks them SOLD atomically. A staff-scoped idempotency key serializes duplicate confirmations. Reusing a key with different details fails. The reservation itself can produce only one sale. Financial idempotency records are retained with sales rather than deleted, preventing late duplicate requests from creating another receipt.

An administrator may reverse only a completely unused sale. Even a definitively rejected activation creates a grant and prevents a financial reversal under the deliberately conservative rule. Reversals preserve the original sale and append an immutable reversal. All affected codes become permanently VOID. This is a manual cash reversal, not a gateway refund or certified fiscal receipt.

Activation locks the voucher, binds the first client MAC and records a stable proposed deadline before queuing a durable job. The period starts at the first activation request, immediately before authorization is attempted; queue and controller latency consume that period. Acceptance confirms that original deadline, never a fresh duration from acknowledgement. A controller rejection preserves binding/deadline and can be retried by the same device within the period. Ambiguous attempts block retry until operator review. Same-device reconnect uses the original deadline; another device is always rejected.

A worker claim is committed before sending. A worker crash after claim or an authorization timeout is treated as unknown, even if the request may never have reached the controller. The recovered job becomes NEEDS_REVIEW without automatically resending. This favors bounded entitlement and prevents duplicate grants. Operators can record controller-verified acceptance or non-acceptance, with evidence; neither decision extends time. If no supported evidence is available, leave the attempt unresolved until expiry.

Revocation immediately blocks future application authorizations. There is no verified disconnect endpoint; network access may continue until controller expiry. In-flight requests may still complete during a revoke, but cannot return the database grant to ACTIVE. Expiry must be enforced by Omada, not the worker or browser. Active entitlement is not proof that the client is online.

MAC binding is not strong hardware identity. Private MAC changes can prevent reconnect; spoofing can impersonate a device. The client needs to retain the same Wi-Fi MAC for the purchased period.

Reports use UTC timestamps with Africa/Dar_es_Salaam calendar boundaries. Gross sales use the sale timestamp, reversals use their own timestamp. Net cash movement may therefore be negative on a day with prior-day reversals.
