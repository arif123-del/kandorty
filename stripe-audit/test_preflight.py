import unittest
from preflight import summarize

class ReportSafety(unittest.TestCase):
    def test_source_and_credentials_never_returned(self):
        source = b'const password="PRIVATE_SENTINEL"; const key="sk_test_PRIVATE_SENTINEL";'
        result = summarize(source)
        self.assertNotIn('PRIVATE_SENTINEL', str(result))
        self.assertNotIn('sk_test_', str(result))
        self.assertFalse(result['live_ready'])
        self.assertFalse(result['payment_tests_run'])

    def test_hints_cannot_approve_live(self):
        source = b'create-checkout-session verify-checkout-session stripe-signature payment_status livemode idempotency commit 2500'
        result = summarize(source)
        self.assertTrue(all(result['review_hints_only'].values()))
        self.assertFalse(result['live_ready'])

    def test_empty_source(self):
        result = summarize(b'')
        self.assertFalse(any(result['review_hints_only'].values()))
        self.assertFalse(result['live_ready'])

if __name__ == '__main__':
    unittest.main()
