"""Synthetic-only tests for the owner-private 18-case viewer; no real customer data."""
import copy
import importlib.util
from pathlib import Path
import unittest

HERE=Path(__file__).resolve().parent
def load(name,filename):
    spec=importlib.util.spec_from_file_location(name,HERE/filename)
    mod=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod
viewer=load('all_viewer_under_test','owner-private-show-18-test-orders.py')
fixture=load('all_viewer_synthetic_fixture','test_owner_private_legacy_triage.py')

class OwnerOnlyViewerTests(unittest.TestCase):
    def test_returns_only_18_codes_status_payment_labels_flags(self):
        source=fixture.valid_18()
        before=copy.deepcopy(source)
        rows=viewer.owner_case_rows(source)
        self.assertEqual(len(rows),18)
        self.assertEqual(len({r['code'] for r in rows}),18)
        self.assertEqual(sum(len(r['flags']) for r in rows),21)
        self.assertEqual(set(rows[0]),{'code','status','payment_label','flags'})
        self.assertEqual(source,before)
    def test_tampered_docket_is_blocked(self):
        source=fixture.valid_18()
        source['records'][0]['orderCode']=source['records'][1]['orderCode']
        with self.assertRaises(ValueError):
            viewer.owner_case_rows(source)
        source=fixture.valid_18()
        source['cutoverAuthorized']=True
        with self.assertRaises(ValueError):
            viewer.owner_case_rows(source)
    def test_not_network_or_write_capable(self):
        source=(HERE/'owner-private-show-18-test-orders.py').read_text()
        for forbidden in ('firebase_admin','https://','requests.','urlopen(','gcloud ','.delete(','.update(','.set(','FIREBASE_SERVICE_ACCOUNT_JSON'):
            self.assertNotIn(forbidden,source)
        self.assertIn('getpass.getpass(',source)
        self.assertIn('Type YES:',source)
        self.assertIn('DO_NOT_POST_PRIVATE_CODES_TO_CHAT_OR_GITHUB: YES',source)

if __name__=='__main__':unittest.main()
