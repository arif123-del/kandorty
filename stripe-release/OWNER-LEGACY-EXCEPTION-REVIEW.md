# Kandorty owner-only legacy exception docket — PRIVATE / READ ONLY

**PREPARATION ONLY. NO PRODUCTION ORDER WRITES, STOCK RESTORATION,
REFUNDS, FIREBASE RULES CHANGE OR STRIPE LIVE RELEASE.**

## Purpose

The owner previously ran a fully private encrypted-backup checker and
reported 99 orders / 254 documents, with 4 processing/delivery lock
exceptions, 3 pending customer-cancellation indicators and 11 cancelled
orders whose original cancelling actor is unknown. Category counts
can **overlap**. Neither the reported historical stock-restoration
markers nor the payment-method labels prove a valid inventory debit,
settlement, refund or cancellation actor.

The offline
[owner-private-legacy-exception-docket.py](owner-private-legacy-exception-docket.py)
generates a *minimised private encrypted GPG review file* based on the
owner's existing encrypted local backup. It contains only:

- legacy order code (so the owner can privately find the case),
- coarse status and payment method ("cod"/"card"/"other"),
- names of review-only exception categories.

It excludes names, phone numbers, delivery addresses, line items,
quantities, stock, payment tokens, cash totals and customer records.
Even the order codes must **not** be posted to ChatGPT, GitHub or logs.
The file is never written to disk in plaintext: the script sends its
JSON to GPG on standard input and uses a private passphrase pipe.
The output is saved at mode 0600 in the owner-only backup directory,
and encryption success is a precondition of the "created" message.

## Private owner-only execution

This is intended **only** for the owner's own Cloud Shell or an offline
machine that already has the private encrypted backup. Keep all
decryption passwords private and do not upload the GPG file.

From a checked-out copy of
\`arif123-del/kandorty\` on the
\`stripe-live-fulfillment-hardening\` branch:

\`\`\`bash
python3 stripe-release/owner-private-legacy-exception-docket.py
\`\`\`

The default input file is
\`~/kandorty-private-backups/kandorty-orders-20261110T103014Z.json.gpg\`.
When needed, provide a different private .json.gpg filename as the first
argument. The script prompts **locally** for the existing backup
password; it is not requested by ChatGPT and is not put on the command
line. It prints aggregate counts and the path of the new encrypted
\`legacy-manual-review-*.json.gpg\`, never individual order IDs.

To inspect the docket, the **owner only** can decrypt the new .gpg
with their private GPG password in their own terminal. Avoid screenshots
of decrypted order-code lists. Do not place the resulting plaintext in
Cloud Shell's repository, GitHub, email or other shared folders.

## Manual decisions that are *not* automated

1. **Processing/delivery lock anomalies:** preserve original status and
   order/tracking pair. Determine why historical locks are missing before
   considering any authenticated server-side change; never auto-backfill.
2. **Pending cancellation requests:** do not let the old admin/customer
   listeners restore stock from untrusted product quantities. Keep
   status untouched pending an authenticated, independently approved
   customer-cancel path.
3. **Unknown cancelled-by:** do not infer customer/admin, resurrect the
   order, increment inventory, issue a refund or mark card settlement.
4. **Historical restock markers:** markers are historical claims only,
   not proof of correct inventory.
5. **Card cancellation:** confirm Stripe provider-side payment evidence
   privately before any separate operator-approved refund workflow.
6. **Old app/browser and strict Rules compatibility:** remain blocked
   until actual nonproduction legacy checkout/tracking/cancellation
   acceptance and coordinated rollback plan, even though Android 2.3.3
   owner-reported offline/online connectivity checks passed.

**The owner must explicitly approve the exact future production change
after review. Generic requests to "finish" this preparation are not
permission to mutate production order status, inventory, refunds,
Rules, public site or Stripe Live.**

## Synthetic verification

The automated [offline owner-backup verification workflow](https://github.com/arif123-del/kandorty/actions/runs/42895639209)
passed **23 tests**: 7 encrypted backup structure tests, 10 aggregate
legacy-risk/overlap tests and 6 new encrypted-exception-docket tests.
The latter include synthetic 99-order fixtures, exactly 4/3/11
representative exception groups, overlap deduplication, wrong-project
rejection, no private customer/stock data and a genuine GPG AES-256
encrypt/decrypt roundtrip. CI does **not** contain the real backup or
customer data. This proves neither actual legacy-case remediation nor
production readiness.

The private GPG docket has **not** yet been generated from the owner's
real encrypted backup by these connected tools. Until the owner runs
the script locally, do not claim a real unique-exception count.
