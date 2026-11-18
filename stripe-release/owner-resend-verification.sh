#!/usr/bin/env bash
# Owner-only, manual Resend delivery check. Never run from GitHub Actions.
# Secret is read with terminal echo disabled and never passed on command line.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
if [[ ! -t 0 ]]; then
  printf 'Interactive owner terminal required; no email sent.\n' >&2
  exit 2
fi
if [[ ! -f stripe-release/resend-verification.mjs ]]; then
  printf 'Verification code not found; no email sent.\n' >&2
  exit 2
fi
printf 'Kandorty: one TEST email via Resend (no Stripe or Firebase changes).\n'
read -r -p 'Verified sender email (e.g. alerts@your-domain): ' ALERT_EMAIL_FROM
read -r -p 'Recipient inbox email: ' ALERT_EMAIL_TO
read -r -s -p 'Resend sending-only API key (input hidden): ' RESEND_API_KEY
printf '\n'
read -r -p 'Type SEND_ONE_VERIFICATION_EMAIL to send exactly one TEST: ' confirmation
if [[ "$confirmation" != "SEND_ONE_VERIFICATION_EMAIL" ]]; then
  printf 'Cancelled; no email sent.\n'
  unset RESEND_API_KEY
  exit 2
fi
export ALERT_EMAIL_FROM ALERT_EMAIL_TO RESEND_API_KEY
export STRIPE_MODE=test
export ALERT_DELIVERY_ENABLED=false
export RESEND_TEST_SEND_CONFIRM=SEND_ONE_VERIFICATION_EMAIL
ALERT_EVENT_KEY="verification-$(node -e "process.stdout.write(require('node:crypto').randomBytes(16).toString('hex'))")"
export ALERT_EVENT_KEY
trap 'unset RESEND_API_KEY ALERT_EMAIL_FROM ALERT_EMAIL_TO ALERT_EVENT_KEY RESEND_TEST_SEND_CONFIRM' EXIT
node stripe-release/resend-verification.mjs
printf 'If provider accepted, check the recipient inbox and spam; acceptance is NOT proof of delivery.\n'
