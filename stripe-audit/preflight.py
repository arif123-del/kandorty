"""Read-only Cloudflare preflight. Never prints or persists source or bindings."""
import hashlib
import json
import os
import re
import urllib.request
import urllib.error

WORKER = 'kandorty-stripe'

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def summarize(source):
    # Presence is only a review hint, never evidence of correct implementation.
    return {
        'source_sha256': hashlib.sha256(source).hexdigest(),
        'source_bytes': len(source),
        'review_hints_only': {
            name: bool(re.search(pattern, source.decode('utf-8', errors='replace'), re.I))
            for name, pattern in {
                'checkout_creation': r'create-checkout-session',
                'session_verification': r'verify-checkout-session',
                'webhook_signature': r'stripe-signature|constructEvent',
                'payment_status': r'payment_status',
                'livemode_check': r'livemode',
                'idempotency': r'idempotency',
                'database_write': r'commit|runTransaction|batchWrite|setDoc|addDoc',
                'delivery_2500_fils': r'2500',
            }.items()
        },
        'live_ready': False,
        'payment_tests_run': False,
    }

def main():
    account = os.environ.get('CLOUDFLARE_ACCOUNT_ID', '')
    token = os.environ.get('CLOUDFLARE_API_TOKEN', '')
    if not re.fullmatch(r'[a-fA-F0-9]{32}', account) or not token:
        print('BLOCKED: missing token or valid account ID. No changes made.')
        return 1
    # Fixed destination, fixed Worker, GET only. Reject redirects to prevent token forwarding.
    url = f'https://api.cloudflare.com/client/v4/accounts/{account}/workers/scripts/{WORKER}'
    req = urllib.request.Request(url, headers={'Authorization': 'Bearer ' + token}, method='GET')
    try:
        with urllib.request.build_opener(NoRedirect).open(req, timeout=30) as response:
            source = response.read(5_000_001)
            if len(source) > 5_000_000:
                print('BLOCKED: source exceeds review size limit. No changes made.')
                return 1
            report = summarize(source)
    except urllib.error.HTTPError as exc:
        # Do not print exception bodies, headers, request URLs, credentials or source.
        print(f'BLOCKED: Cloudflare source read returned HTTP {exc.code}. No changes made.')
        return 1
    except Exception:
        print('BLOCKED: Cloudflare source read failed. No changes made.')
        return 1
    print(json.dumps(report, indent=2))
    print('READ ONLY: no deployment, no payment, no database write, no Ziina access.')
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
