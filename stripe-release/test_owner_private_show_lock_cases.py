"""Synthetic tests ONLY for the owner-only four-lock private terminal viewer."""
import copy
import importlib.util
from pathlib import Path
import unittest

DIR = Path(__file__).resolve().parent

def load(name, filename):
    spec=importlib.util.spec_from_file_location(name,DIR / filename)
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

viewer=load('kandorty_private_lock_viewer','owner-private-show-lock-cases.py')
fixture=load('kandorty_private_lock_fixture','test_owner_private_legacy_triage.py')

class PrivateFourLockViewerTests(unittest.TestCase):
    def test_four_synthetic_lock_order_codes_only(self):
        original=fixture.valid_18()
        before=copy.deepcopy(original)
        items=viewer.find_private_lock_cases(original)
        self.assertEqual(len(items),4)
        self.assertEqual([x['code'] for x in items],['KD-00000000','KD-00000001','KD-00000002','KD-00000003'])
        self.assertTrue(all(set(x)=={'code','statusAtBackup'} for x in items))
        self.assertEqual(original,before)

    def test_duplicate_order_code_fails_closed(self):
        d=fixture.valid_18()
        d['records'][0]['orderCode']=d['records'][1]['orderCode']
        with self.assertRaises(ValueError): viewer.find_private_lock_cases(d)

    def test_unexpected_docket_counts_fail_closed(self):
        d=fixture.valid_18()
        d['riskCategoryCounts']['processing_lock_review']=5
        with self.assertRaises(ValueError): viewer.find_private_lock_cases(d)
        d=fixture.valid_18()
        d['ordersInspected']=100
        with self.assertRaises(ValueError): viewer.find_private_lock_cases(d)

    def test_production_authorization_flags_never_allowed(self):
        d=fixture.valid_18()
        d['cutoverAuthorized']=True
        with self.assertRaises(ValueError): viewer.find_private_lock_cases(d)

    def test_only_opt_in_private_display_and_no_network(self):
        content=(DIR/'owner-private-show-lock-cases.py').read_text()
        self.assertIn("Type YES:",content)
        self.assertIn("getpass.getpass(",content)
        self.assertNotIn("firebase_admin",content)
        self.assertNotIn("https://",content)
        self.assertNotIn("requests.",content)
        self.assertIn("print('PRIVATE_OWNER_ONLY_ORDER:",content)
        self.assertNotIn("customer_phone",content)

if __name__ == '__main__':
    unittest.main()
