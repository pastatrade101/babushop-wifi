# Live commissioning — required separately

Not yet performed. Mock success does not demonstrate AP enforcement.

Before enabling live mode, an operator must confirm the exact controller/AP versions, site representation, allowed AP MACs, SSID, trusted TLS CA, Hotspot Operator privileges, numeric field types, time unit and timestamp/duration semantics. Configure the external portal URL and pre-auth allowlist manually; this app never changes network configuration. Allow only this app's HTTPS origin and its locally hosted assets, plus the documented network prerequisites. Keep controller management off the public internet.

Use a **two-minute test package** (duration_minutes=2) and a designated test device. The complete outage/reconnect matrix takes longer than two minutes; the expiry trial itself is two minutes.

1. Generate stock, record a test cash sale, and enter the sold voucher from an actual AP redirect. Confirm unsold stock fails.
2. Record UTC request time, the app's fixed deadline and controller-observed expiry. Confirm authorization is accepted and real browsing works. Set `OMADA_EXPIRY_VERIFIED=true` only for the validated profile; use a controlled isolated test deployment to establish this evidence, never a paying-customer deployment.
3. Disconnect and reconnect the same MAC before expiry. Confirm the deadline did not move. Attempt the code on a different MAC: it must fail.
4. At the original two-minute deadline, verify the AP denies traffic, including when the app/worker is stopped. A browser countdown or database EXPIRED label is not evidence.
5. Test controller unavailability before login, explicit authorization rejection, and network interruption after sending. Check that ambiguous outcomes remain NEEDS_REVIEW and never return the voucher to stock. Restart the worker after a claimed request and confirm the same conservative behavior.
6. Verify a definite operator-session expiry permits only one login refresh. Confirm TLS failures do not authorize.
7. Revoke an active grant. Confirm application reconnect is denied. Unless a new verified disconnect capability is implemented, access may continue until controller expiry; label it accurately.
8. No per-voucher rates are advertised by this release. If a common SSID rate policy is manually configured, test it independently and record that it applies to the SSID rather than individual packages.
9. Record controller/AP firmware versions, field values, observed deadlines, outage evidence, private networking and certificate setup in the deployment runbook. Repeat after relevant upgrades.

For an ambiguous attempt: locate the same client in the controller, record observed authorization and its expiry. Select confirmed acceptance only if it corresponds to this attempt and does not extend the stable deadline. Select confirmed rejection only with positive evidence of non-authorization. Missing logs are not proof of rejection. Otherwise leave the attempt unresolved and let the original deadline pass. Do not resell or move its code to another device.
