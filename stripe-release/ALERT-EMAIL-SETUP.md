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
