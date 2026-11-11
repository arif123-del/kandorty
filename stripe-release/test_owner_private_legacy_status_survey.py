"""Synthetic-only unit tests: private owner survey never contacts live data."""
import copy
import importlib.util
from pathlib import Path
import unittest

HERE=Path(__file__).resolve().parent
def load(name,file):
    spec=importlib.util.spec_from_file_location(name,HERE/file)
    m=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m

survey=load('kandorty_private_visual_survey','owner-private-legacy-status-survey.py')
mock=load('kandorty_private_visual_fixture','test_owner_private_legacy_triage.py')
triage=load('kandorty_private_visual_triage','owner-private-legacy-triage.py')

def plan():
    return triage.build_evidence_plan(mock.valid_18())

class PrivateStatusSurveyTests(unittest.TestCase):
    def test_exact_pending_3_unknown_11_and_expected_separation(self):
        d=plan()
        a=survey.case_rows(d,'PENDING')
        b=survey.case_rows(d,'UNKNOWN')
        self.assertEqual(len(a),3)
        self.assertEqual(len(b),11)
        self.assertFalse({x['orderCode'] for x in a}&{x['orderCode'] for x in b})
        self.assertTrue(all(x['operatorDisposition']=='BLOCKED_PENDING_INDEPENDENT_OWNER_REVIEW' for x in a+b))

    def test_status_comparison_counts_never_authorize_case_resolution(self):
        d=plan()
        before=copy.deepcopy(d)
        cases=survey.case_rows(d,'PENDING')
        answers={r['orderCode']:v for r,v in zip(cases,['new','cancelled','skip'])}
        report=survey.make_survey(d,'PENDING',answers)
        self.assertEqual(report['comparisonTotals'],{
            'matching':1,'changed':1,'missing':0,'skipped':1})
        self.assertEqual(report['expectedCases'],3)
        self.assertEqual(report['independentCaseEvidenceVerified'],0)
        self.assertFalse(report['productionChangeAuthorized'])
        self.assertFalse(report['stage4CutoverAuthorized'])
        self.assertFalse(report['refundAuthorized'])
        self.assertFalse(report['stockRestorationAuthorized'])
        self.assertTrue(all(r['reviewDisposition']=='BLOCKED_PENDING_INDEPENDENT_EVIDENCE' for r in report['rows']))
        self.assertEqual(before,d)

    def test_unknown_origin_all_cancelled_still_requires_independent_proof(self):
        d=plan()
        cases=survey.case_rows(d,'UNKNOWN')
        ans={r['orderCode']:'cancelled' for r in cases}
        report=survey.make_survey(d,'UNKNOWN',ans)
        self.assertEqual(report['comparisonTotals']['matching'],11)
        self.assertEqual(report['independentCaseEvidenceVerified'],0)
        self.assertTrue(all(not x['productionChangeAuthorized'] for x in report['rows']))

    def test_missing_owner_current_status_is_not_equated_with_cancelled(self):
        d=plan()
        cases=survey.case_rows(d,'UNKNOWN')
        ans={r['orderCode']:'missing' for r in cases}
        report=survey.make_survey(d,'UNKNOWN',ans)
        self.assertEqual(report['comparisonTotals']['missing'],11)
        self.assertEqual(report['comparisonTotals']['matching'],0)

    def test_reject_invented_case_codes_and_unsafe_status_values(self):
        d=plan()
        cases=survey.case_rows(d,'PENDING')
        answers={r['orderCode']:'new' for r in cases}
        answers['made-up-case']='new'
        with self.assertRaises(ValueError): survey.make_survey(d,'PENDING',answers)
        del answers['made-up-case']
        answers[cases[0]['orderCode']]='approved'
        with self.assertRaises(ValueError): survey.make_survey(d,'PENDING',answers)
        with self.assertRaises(ValueError): survey.case_rows(d,'ALL')

    def test_reject_tampered_private_baseline(self):
        d=plan()
        d['sourceRiskCategoryCounts']['unknown_cancellation_origin_review']=10
        with self.assertRaises(ValueError): survey.case_rows(d,'UNKNOWN')
        d=plan()
        d['casesApprovedForProductionChange']=1
        with self.assertRaises(ValueError): survey.case_rows(d,'PENDING')

    def test_no_network_ops_or_plaintext_file_in_owner_survey(self):
        src=(HERE/'owner-private-legacy-status-survey.py').read_text()
        self.assertIn("Type YES:",src)
        self.assertIn('getpass.getpass(',src)
        self.assertIn('save_encrypted_docket(',src)
        for forbidden in ('firebase_admin','https://','requests.', 'urlopen(', 'gcloud ', '.delete(','.set('):
            self.assertNotIn(forbidden,src)

if __name__=='__main__':
    unittest.main()
