# Revenue workspace

The admin-only `/revenue` page contains the financial cards and charts previously on Overview. Overview now shows voucher inventory, quick actions and network status. Revenue is linked from the sidebar and the Overview header; cashier navigation excludes it, the page loader checks the role, and the API independently requires administrator permission.

## Period cards

`GET /api/v1/reports/revenue?from=YYYY-MM-DD&to=YYYY-MM-DD` returns gross sales, reversals, net revenue, sale and voucher counts, and cash/AzamPay/other payment breakdowns. The page defaults to the latest 30 calendar days and offers Today, 7 days, 30 days and custom dates. API calls without dates default to today. Boundaries are inclusive calendar dates in Africa/Dar_es_Salaam, implemented as a half-open timestamp range from local midnight to midnight after the final date.

- Sales receipts are the revenue ledger. Payment intent amounts are never added again.
- Cash is a COUNTER sale with payment method CASH.
- AzamPay requires a linked payment intent with provider `azam`, status `PAID`, and the same site. Its unique sale link prevents multiplication of ledger receipts.
- Pending, failed and refund-due intents do not create AzamPay revenue. Other providers remain in a separate channel.
- Reversals are deducted on their recorded date, even if the original sale was earlier. Net revenue can be negative.
- Values are in TZS before payment-provider fees; they are not gateway settlement balances.

The existing trend and package charts always show the latest 30 days and are labeled separately from the date-filtered summary. Package ranking shows gross voucher sales before reversals. A failed chart request shows an unavailable message rather than a false zero.

## Presentation

The top navbar stays at the top while scrolling on desktop and mobile, uses an opaque theme surface, and remains hidden when printing. Revenue uses the shared Inter font and light/dark palette. Theme controls wait for client initialization before accepting changes.

## Verification

`pnpm test` includes revenue API permission, schema/date validation, channel aggregation, empty-period and negative-net tests using mocked database results, plus shared theme tests. SQL uses the existing normalized ledger and payment tables; no migration is required. Browser checks use isolated fixture loaders and do not write business records. Live database reporting should be checked against known receipts during deployment.
