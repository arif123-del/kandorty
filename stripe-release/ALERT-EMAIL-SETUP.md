# Kandorty operator email notifications — SAFE DRAFT / delivery NOT ACTIVE

**Owner-designated recipient exists privately in the conversation; no address is committed here.** Do not put operator email addresses, SMTP passwords, service tokens, customer contact data, order IDs, payment receipts or API keys in GitHub issue comments, PRs, public source or logs.

## Prepared, not switched on
`stripe-release/operations-email.mjs` converts the authenticated operations runner's *aggregate-only* attention report into a fixed-text email and contains a transport adapter for Resend. It is **NOT imported by the deployed Worker, scheduled handlers, storefront, or admin page**. By default it returns `disabled_no_send` without network traffic. Unit tests use fictitious email addresses and mock transport; they cannot send mail.

This optional design requires **all** of the following before any real notification delivery:
- `ALERT_DELIVERY_ENABLED=true` in a separately controlled private operator process, never in an unreviewed public frontend or CI test.
- `ALERT_EMAIL_TO`: owner-designated verified receiving address, configured privately.
- `ALERT_EMAIL_FROM`: verified sender at a domain the operator controls, accepted by the selected email provider. Do not infer that `kandorty.online` is already verified or that the receiver can be used as a sender.
- `RESEND_API_KEY`: secret issued by the provider and held in the operator's secret store, never source code.
- `STRIPE_MODE`: the correct isolated test/live mode of the authenticated operations runner. This adapter never activates Stripe.
- `ALERT_EVENT_KEY`: a stable unique 16–128-character event/dedup key computed by a **trusted scheduler** for this particular alert occurrence. Do not reuse a static key for unrelated alerts; don't put order/payment/customer identifiers in the key.
- Independent approved scheduler, cooldown/dedup state and alert persistence. Do not email every five-minute reconciliation run blindly. Preserve retries after transport failures while avoiding unlimited duplicates.
- A **real provider acceptance and inbox-delivery test** with the owner (including spam folder check and escalation if no delivery); a provider 2xx only means accepted, not delivered.

The current aggregate operational scanner flags: paid stock shortages, pending cancellation refunds, checkout requests older than 45 minutes, overdue refunds and queue samples at their 50-row limit. It does **not** currently detect every card decline, dispute, undelivered Stripe webhook or Cloudflare scheduled job failure. Configure and separately test Stripe Dashboard failure/dispute notification settings and Cloudflare Worker error alerts for those events; the draft mail adapter alone is insufficient.

## Safe activation gates

1. Owner confirms who will respond to the messages and approves a sender/service provider (suggested example: Resend plus a verified sending domain; the provider is **not yet connected or configured**).
2. Verify sender domain DNS ownership, recipient, secret and webhook/Worker account permissions **privately** without changing the published store or active email routing.
3. Run one explicit recipient-approved test email in an isolated environment; confirm it actually arrived. Validate noisy/repeated failures, duplicate throttling, operational-on-call acknowledgements and alternative backup contact.
4. Review the final schedule/transport connection and independent final Live/site/Rules approval. The 98 historical orders and Ziina remain untouched.

## Security acceptance boundary

No actual email has been sent by these draft files, no provider account created, no sender domain verified, no alert destination deployed, no Stripe Live webhook enabled and no production traffic monitored. **Stage 6 remains incomplete** until operational delivery, coverage and escalation tests pass.

## Manual provider acceptance path (prepared 2026-11-09)

A dedicated `stripe-release/resend-verification.mjs` was added as a **manual-only** verified-provider test tool. Running ordinary CI or importing this module does not send mail. It uses no real orders and its message says **TEST**. The result `provider_accepted_delivery_not_confirmed` is never a substitute for inbox confirmation.

In a trusted **private** Work/Cloud Shell session after Resend domain verification and owner permission:

1. Obtain a limited Resend key through its account UI. Save it through the operator's private environment/secret manager, **never** in GitHub source, workflow YAML, terminal history, chat or screenshots. Set `RESEND_API_KEY`, `ALERT_EMAIL_FROM` and `ALERT_EMAIL_TO` privately; keep the destination that the owner specifically designated.
2. Set `STRIPE_MODE=test`, `ALERT_DELIVERY_ENABLED=false` and a unique `ALERT_EVENT_KEY` (16–128 letters, digits, underscore or dash). Confirm the destination and `from` domain are allowed by the provider.
3. Set `RESEND_TEST_SEND_CONFIRM=SEND_ONE_VERIFICATION_EMAIL` deliberately, then run `node stripe-release/resend-verification.mjs` **once** from the PR branch checked out in that private environment. No production Firebase, Stripe or Cloudflare mutation is necessary.
4. If the tool reports provider acceptance, ask the owner to check the exact inbox and spam folder for the message. Only then record inbox delivery as confirmed. If no email arrives, review Resend's authenticated logs privately; never expose secret-bearing logs.
5. Separately implement a durable, owner-approved schedule, provider error alarms, cooldown/dedup, Stripe failure/dispute and Cloudflare execution alerts. **Do not set `ALERT_DELIVERY_ENABLED=true` in production merely because the one-time test passes.**

No provider key or receiver email is committed. The public domain's existing DNS records, site, Firebase Rules, Stripe Live and Ziina stay unchanged until separately approved.
