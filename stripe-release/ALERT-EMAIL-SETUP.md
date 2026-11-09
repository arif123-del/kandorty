# Kandorty operator email notifications — SAFE DRAFT / delivery NOT ACTIVE

**Owner-designated recipient exists privately in the conversation; no address is committed here.** As reported by the owner on 2026-11-09, `kandorty.online` was verified in Resend and its existing DNS records were preserved. The manual TEST email was subsequently confirmed in the recipient's Gmail inbox by owner-provided screenshot on 2026-11-09. This proves one delivery, not operational alert automation. Do not put operator email addresses, SMTP passwords, service tokens, customer contact data, order IDs, payment receipts or API keys in GitHub issue comments, PRs, public source or logs.

## Prepared, not switched on
`stripe-release/operations-email.mjs` converts the authenticated operations runner's *aggregate-only* attention report into a fixed-text email and contains a transport adapter for Resend. It is **NOT imported by the deployed Worker, scheduled handlers, storefront, or admin page**. By default it returns `disabled_no_send` without network traffic. Unit tests use fictitious email addresses and mock transport; they cannot send mail.

This optional design requires **all** of the following before any real notification delivery:
- `ALERT_DELIVERY_ENABLED=true` in a separately controlled private operator process, never in an unreviewed public frontend or CI test.
- `ALERT_EMAIL_TO`: owner-designated verified receiving address, configured privately.
- `ALERT_EMAIL_FROM`: verified sender at a domain the operator controls, accepted by the selected email provider. The sending identity and actual permission were demonstrated by one manually triggered Resend verification email, confirmed in the designated recipient's Gmail inbox on 2026-11-09. This does not establish credential persistence or automatic alert operation. Never use the receiver as a sender by inference.
- `RESEND_API_KEY`: secret issued by the provider and held in the operator's secret store, never source code.
- `STRIPE_MODE`: the correct isolated test/live mode of the authenticated operations runner. This adapter never activates Stripe.
- `ALERT_EVENT_KEY`: a stable unique 16–128-character event/dedup key computed by a **trusted scheduler** for this particular alert occurrence. Do not reuse a static key for unrelated alerts; don't put order/payment/customer identifiers in the key.
- Independent approved scheduler, cooldown/dedup state and alert persistence. Do not email every five-minute reconciliation run blindly. Preserve retries after transport failures while avoiding unlimited duplicates.
- A **real provider acceptance and inbox-delivery test** with the owner (including spam folder check and escalation if no delivery); a provider 2xx only means accepted, not delivered.

The current aggregate operational scanner flags: paid stock shortages, pending cancellation refunds, checkout requests older than 45 minutes, overdue refunds and queue samples at their 50-row limit. It does **not** currently detect every card decline, dispute, undelivered Stripe webhook or Cloudflare scheduled job failure. Configure and separately test Stripe Dashboard failure/dispute notification settings and Cloudflare Worker error alerts for those events; the draft mail adapter alone is insufficient.

## Safe activation gates

1. Owner selected Resend, reported its domain verified, and confirmed one manually triggered test message in the recipient's Gmail inbox on 2026-11-09. Persistent private alert credentials and monitored operator ownership remain **not yet complete**.
2. Verify sender domain DNS ownership, recipient, secret and webhook/Worker account permissions **privately** without changing the published store or active email routing.
3. Run one explicit recipient-approved test email in an isolated environment; confirm it actually arrived. Validate noisy/repeated failures, duplicate throttling, operational-on-call acknowledgements and alternative backup contact.
4. Review the final schedule/transport connection and independent final Live/site/Rules approval. The 98 historical orders and Ziina remain untouched.

## Security acceptance boundary

One manual verification email was successfully delivered to the owner-designated Gmail inbox on 2026-11-09, as evidenced by an owner-provided screenshot displaying the exact verification subject/body. No API key or recipient address was committed; this screenshot is not independently corroborated provider telemetry. No automated alert destination has been deployed, no Stripe Live webhook enabled and no production traffic monitored. **Stage 6 remains incomplete** until operational delivery, coverage, throttling and escalation tests pass.

## Manual provider acceptance path (prepared 2026-11-09)

A dedicated `stripe-release/resend-verification.mjs` was added as a **manual-only** verified-provider test tool. Running ordinary CI or importing this module does not send mail. It uses no real orders and its message says **TEST**. The result `provider_accepted_delivery_not_confirmed` is never a substitute for inbox confirmation.

In a trusted **private** Work/Cloud Shell session after Resend domain verification and owner permission:

1. Obtain a limited Resend key through its account UI. Save it through the operator's private environment/secret manager, **never** in GitHub source, workflow YAML, terminal history, chat or screenshots. Set `RESEND_API_KEY`, `ALERT_EMAIL_FROM` and `ALERT_EMAIL_TO` privately; keep the destination that the owner specifically designated.
2. Set `STRIPE_MODE=test`, `ALERT_DELIVERY_ENABLED=false` and a unique `ALERT_EVENT_KEY` (16–128 letters, digits, underscore or dash). Confirm the destination and `from` domain are allowed by the provider.
3. Set `RESEND_TEST_SEND_CONFIRM=SEND_ONE_VERIFICATION_EMAIL` deliberately, then run `node stripe-release/resend-verification.mjs` **once** from the PR branch checked out in that private environment. No production Firebase, Stripe or Cloudflare mutation is necessary.
4. If the tool reports provider acceptance, ask the owner to check the exact inbox and spam folder for the message. Only then record inbox delivery as confirmed. If no email arrives, review Resend's authenticated logs privately; never expose secret-bearing logs.
5. Separately implement a durable, owner-approved schedule, provider error alarms, cooldown/dedup, Stripe failure/dispute and Cloudflare execution alerts. **Do not set `ALERT_DELIVERY_ENABLED=true` in production merely because the one-time test passes.**

## Staged opt-in automatic incident alerts (implemented but DISABLED)

`alert-scheduler.mjs` is now called by the Stripe/COD release Worker's scheduled reconciliation **only when** `ALERT_DELIVERY_ENABLED=true`; the variable is absent from the default test and disabled Live templates. There is no enabled production alert deployment or Resend credential installed by this source change. The isolated Sandbox CI runs automated tests; it does not need or transmit the owner's Resend key.

The scheduler reads *aggregate-only* pending/review/refund queues through `operations.mjs`. If nothing requires attention, it sends nothing. If attention is present, it claims a private Firestore `stripe_operator_alerts` record with an optimistic write precondition, then sends one fixed-content notification through Resend. Its **stable idempotency key per hour and Stripe mode** avoids duplicate provider requests on retry. Accepted notifications are recorded separately from delivery confirmation. Competing schedulers share a 90-second lease, a failed send gets a 2-minute retry cooldown, and an uncertain acceptance can retry under the same provider idempotency key. Only aggregate metadata is written. At most one accepted notification per mode per hour is intended; repeated/recurrent problems in that hour are intentionally coalesced.

Production mode requires an additional private `ALERT_PRODUCTION_APPROVAL=KANDORTY_ALERTS_APPROVED` gate **as well as** the separate Stripe Live release gate. Do **not** set either gate to true as part of these preparations. The alert scheduler cannot send if required private parameters are missing and reports a failure instead of silently claiming success.

To activate in an owner-controlled staging environment *after owner approval*, separately install `RESEND_API_KEY`, `ALERT_EMAIL_FROM` and `ALERT_EMAIL_TO` as encrypted Worker secrets, and set `ALERT_DELIVERY_ENABLED=true` **only for the isolated TEST Worker** after reviewing the sender, recipient, test project and frequency. Never put these values in public GitHub source, browser scripts or ChatGPT messages. Run a TEST-only simulated queue incident, confirm exactly one email arrives and confirm the cooldown and retries; do not use a real payment/order to induce an incident.

**Still outstanding:** privately installing the limited key and routing to the operator, verifying the automatic (not just manual) end-to-end email, owner-approved frequency and backup escalation, and separate Stripe Dashboard dispute/webhook-delivery and Cloudflare execution-failure alarms. These external operations cannot be certified by passing unit tests; stage 6 remains partial.

## Owner-only interactive shortcut (prepared 2026-11-09)

From a trusted private owner terminal with this PR branch checked out, run
`bash stripe-release/owner-resend-verification.sh`. This wrapper requires a
real interactive terminal, prompts for the verified sender and designated
recipient, reads the Resend sending-only key with hidden input, and requires
typing `SEND_ONE_VERIFICATION_EMAIL` before a single isolated test send. It
generates a fresh idempotency key, does not write credentials to disk or
command history, and invokes the manual verification module in test mode with
automatic alert delivery disabled. It never changes Stripe, DNS, Firebase,
Cloudflare, GitHub secrets or the public site. It intentionally **does not run
inside GitHub Actions**. The operator must verify the actual arrival (including
spam) before any assertion of delivery. Do not paste the API key or terminal
secret output into chat.

No provider key or receiver email is committed. The public domain's existing DNS records, site, Firebase Rules, Stripe Live and Ziina stay unchanged until separately approved.
