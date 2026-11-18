"""Synthetic offline tests only: never reads actual Kandorty orders or secrets."""
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location(
    'private_legacy_evidence_triage', HERE / 'owner-private-legacy-triage.py')
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def valid_18():
    counts = {'processing_lock_review': 4,
              'customer_cancellation_request_review': 3,
              'historical_stock_restoration_evidence_review': 3,
              'unknown_cancellation_origin_review': 11}
    records = []
    for i in range(18):
        flags = []
        if i < 4:
            flags.append('processing_lock_review')
        elif i < 7:
            flags.append('customer_cancellation_request_review')
        else:
            flags.append('unknown_cancellation_origin_review')
        if 7 <= i < 10:
            flags.append('historical_stock_restoration_evidence_review')
        records.append({'orderCode': 'KD-'+str(i).zfill(8),
                        'status': ('preparing' if i < 4 else
                                   'new' if i < 7 else 'cancelled'),
                        'paymentType': 'card' if i == 12 else 'cod',
                        'reviewOnlyFlags': flags})
    return {'format':'kandorty-private-legacy-exception-docket-v1',
            'sourceProject':'kandorty-9378a',
            'ordersInspected':99, 'totalDocumentsInspected':254,
            'uniqueOrdersRequiringReview':18,
            'riskCategoryCounts':counts,
            'records':records,
            'cutoverAuthorized':False,
            'automaticStockRestorationAuthorized':False,
            'refundAuthorized':False}


class PrivateLegacyTriageTests(unittest.TestCase):
    def test_exact_18_cases_all_blocked_evidence_checklist_no_customer_data(self):
        original = valid_18()
        prior = json.dumps(original, sort_keys=True)
        plan = mod.build_evidence_plan(original)
        self.assertEqual(plan['casesInspected'], 18)
        self.assertEqual(plan['casesBlocked'], 18)
        self.assertEqual(plan['casesApprovedForProductionChange'], 0)
        self.assertFalse(plan['cutoverAuthorized'])
        self.assertEqual(len(plan['records']), 18)
        self.assertTrue(all(x['operatorDisposition']==mod.BLOCKED for x in plan['records']))
        self.assertTrue(all(x['requiredEvidenceBeforeDecision'] for x in plan['records']))
        self.assertTrue(all(not x['stockRestorationAuthorized'] and
                            not x['refundAuthorized'] and
                            not x['productionChangeAuthorized'] for x in plan['records']))
        self.assertEqual(json.dumps(original, sort_keys=True), prior)
        self.assertNotIn('SYNTHETIC_PRIVATE_PHONE',json.dumps(plan))
        self.assertNotIn('items',json.dumps(plan))

    def test_overlap_is_one_case_with_two_evidence_tracks(self):
        plan = mod.build_evidence_plan(valid_18())
        flags = plan['records'][8]['exceptionFlags']
        self.assertEqual(flags,['historical_stock_restoration_evidence_review',
                                'unknown_cancellation_origin_review'])
        self.assertGreaterEqual(len(plan['records'][8]['requiredEvidenceBeforeDecision']), 4)
        self.assertEqual(sum(plan['sourceRiskCategoryCounts'].values()),21)

    def test_card_label_requires_provider_proof_but_not_a_refund(self):
        plan = mod.build_evidence_plan(valid_18())
        review = next(x for x in plan['records'] if x['paymentLabelAtBackup']=='card')
        self.assertIn('independent_stripe_provider_payment_or_refund_evidence_if_applicable',
                      review['requiredEvidenceBeforeDecision'])
        self.assertFalse(review['refundAuthorized'])

    def test_malformed_docket_and_wrong_project_rejected(self):
        for key,value in [('format','other'),('sourceProject','other'),
                          ('ordersInspected',98),('uniqueOrdersRequiringReview',17),
                          ('cutoverAuthorized',True),('refundAuthorized',True),
                          ('automaticStockRestorationAuthorized',True)]:
            original=valid_18();original[key]=value
            with self.assertRaises(ValueError,msg=key):
                mod.build_evidence_plan(original)

    def test_unknown_flags_missing_rows_and_collisions_fail_closed(self):
        original=valid_18()
        original['records'][0]['orderCode']=original['records'][1]['orderCode']
        with self.assertRaises(ValueError):mod.build_evidence_plan(original)
        original=valid_18();original['records'][0]['reviewOnlyFlags']=['some_other_flag']
        with self.assertRaises(ValueError):mod.build_evidence_plan(original)
        original=valid_18();original['records'][0]['customer_phone']='NO'
        with self.assertRaises(ValueError):mod.build_evidence_plan(original)
        original=valid_18();original['records'][0]['paymentType']='unknown'
        with self.assertRaises(ValueError):mod.build_evidence_plan(original)
        original=valid_18();original['riskCategoryCounts']['processing_lock_review']=5
        with self.assertRaises(ValueError):mod.build_evidence_plan(original)

    @unittest.skipUnless(shutil.which('gpg'),'GPG not on test runner')
    def test_synthetic_encrypted_roundtrip_never_plaintext_file(self):
        source=mod.load_docket_module()
        with tempfile.TemporaryDirectory() as td:
            directory=Path(td)/'private'
            target=directory/'legacy-evidence-plan-SYNTHETIC.json.gpg'
            password='synthetic-only-secret-passphrase-98765'
            plan=mod.build_evidence_plan(valid_18())
            with patch.object(source,'PRIVATE_DIR',directory):
                source.save_encrypted_docket(plan,target,password)
            self.assertTrue(target.exists())
            self.assertEqual(target.stat().st_mode & 0o777,0o600)
            self.assertFalse(target.with_name(target.name+'.partial').exists())
            with self.assertRaises(ValueError):
                with patch.object(source,'PRIVATE_DIR',directory):
                    source.save_encrypted_docket(plan,target,password)
            result=subprocess.run([
                'gpg','--batch','--quiet','--pinentry-mode','loopback',
                '--passphrase-fd','0','--decrypt',str(target)],
                input=(password+'\n').encode(),capture_output=True,timeout=30)
            self.assertEqual(result.returncode,0)
            self.assertEqual(json.loads(result.stdout),plan)


if __name__ == '__main__':
    unittest.main()
