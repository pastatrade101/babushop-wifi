# Omada external-portal integration

Official references consulted:
- [v5.0.15–v6.2.0 external portal](https://support.omadanetworks.com/ph/document/13080/)
- [v6.2.10+ external portal](https://support.omadanetworks.com/ph/document/132060/)

Use a dedicated Hotspot Operator. The adapter follows the written endpoints, not contradictory PHP sample URL assignments:
`POST /<controllerId>/api/v2/hotspot/login`, then
`POST /<controllerId>/api/v2/hotspot/extPortal/auth`.

A successful login supplies `result.token`. Authorization includes `Csrf-Token` and the operator session cookie. `legacy-pre511` expects TPEAP_SESSIONID; `legacy` and `modern` expect TPOMADA_SESSIONID. The adapter retains only the controller's designated session cookie, scoped to the one configured HTTPS origin; it follows no redirects and never accepts a browser-supplied host. It refreshes once after a definite HTTP 401/403. It does not invent undocumented error codes for session expiration. A nonzero numeric authorization error is a rejection; malformed/HTTP error/timeout is unknown. The default request timeout is 8 seconds; the worker lease is 45 seconds.

Configure all live fields explicitly: OMADA_BASE_URL, CONTROLLER_ID, OPERATOR_USERNAME/PASSWORD, PROFILE, TIME_UNIT, TIME_MEANING, FIELD_TYPE, EXPIRY_VERIFIED. `FIELD_TYPE` applies to time, radioId and authType; only controllers commissioned with that compatible combination are supported. Other field combinations require an adapter change and new commissioning; do not guess. `legacy` context uses configured site name; `modern` uses configured site ID and requires clientIp. Modern auth adds clientIp and empty originUrl. No arbitrary origin redirect is followed.

Legacy documentation contains conflicting time wording/sample naming. Modern documentation describes milliseconds. The operator must still verify timestamp versus remaining duration and numeric versus string fields on their actual controller. Absolute timestamps are preferable. Relative-duration mode subtracts one second when computing the remaining period, but request transit latency remains a limitation: do not commission this mode unless the measured controller expiry stays within the purchased deadline tolerance. Time-only packages are supported. Per-voucher rates, quotas, client lookup, disconnect and reconciliation are explicitly unsupported.

Set OMADA_MODE=mock for development. Scenarios: success, rejection, timeout, expired-session. The last simulates a definite expired session followed by a successful refresh. Mock uses real inventory/sales/grant records but no network authorization. Never use it for paying customers. Live mode fails at startup if critical configuration or the explicit expiry verification flag is missing; it never falls back to mock.

Portal context validates client/AP MAC format, optional IP, radio ID and configured AP/site/SSID membership. A short-lived opaque token references server-stored context; HMAC digests are stored, not bearer tokens. A separate opaque status token lasts twenty minutes. Incoming redirect query parameters remain untrusted: a token does not prove Omada sent them. There is no verified compatible client-lookup endpoint in this adapter. Restrict the portal entry and API to the intended hotspot ingress where possible; use private controller connectivity and a narrow pre-auth allowlist. Do not advertise this as cryptographically authenticated client identity.

TLS verification is mandatory. Install a valid certificate or use OMADA_CA_PATH for your private CA. Never set NODE_TLS_REJECT_UNAUTHORIZED=0. Keep management private/VPN-only and do not enable MikroTik Hotspot for the same clients.
