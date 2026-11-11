"""Synthetic-only unit tests: private owner survey never contacts live data."""
import copy
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
from io import StringIO
from pathlib import Path

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

class PrivateSurveyInteractiveFlowTests(unittest.TestCase):
    def simulate(self,group,answers,fail_at=None):
        expected=mock.valid_18()
        stored=[]
        class Viewer:
            def select_private_docket(self):
                if fail_at=='locate': raise ValueError('SYNTHETIC_PRIVATE_VALUE')
                return Path('/fake-local-private/legacy-manual-review-SYNTHETIC.json.gpg')
            def build_evidence_plan(self,data):
                if fail_at=='validate': raise ValueError('SYNTHETIC_PRIVATE_VALUE')
                return triage.build_evidence_plan(data)
        class Source:
            PRIVATE_DIR=Path('/fake-local-private')
            def decrypt_private_backup(self,path,password):
                self.outer.assertEqual(password,'only-synthetic-password-123')
                if fail_at=='decrypt': raise ValueError('SYNTHETIC_PRIVATE_VALUE')
                return expected
            def save_encrypted_docket(self,docket,out,password):
                stored.append((docket,out,password))
        src=Source()
        src.outer=self
        stdout,stderr=StringIO(),StringIO()
        user_input=[group,'YES',*answers]
        with patch.object(survey.sys,'argv',['owner-private-legacy-status-survey.py']), patch.object(survey,'load',side_effect=[Viewer(),src]), patch.object(survey.getpass,'getpass',return_value='only-synthetic-password-123'), patch('builtins.input',side_effect=user_input), patch('sys.stdout',stdout), patch('sys.stderr',stderr):
            if fail_at:
                with self.assertRaises(ValueError): survey.main()
            else:
                survey.main()
        return stored,stdout.getvalue(),stderr.getvalue()

    def test_interactive_pending_end_to_end_synthetic_no_production(self):
        stored,out,err=self.simulate('PENDING',['new','new','new'])
        self.assertEqual(err,'')
        self.assertEqual(len(stored),1)
        self.assertEqual(stored[0][0]['comparisonTotals']['matching'],3)
        self.assertIn('PRIVATE_DOCKET_DECRYPTION: PASS',out)
        self.assertIn('PRIVATE_CASE_BASELINE: PASS',out)
        self.assertIn('PRIVATE_ENCRYPTED_STATUS_SURVEY_CREATED: YES',out)
        self.assertIn('STAGE4_RELEASE_AUTHORIZED: NO',out)
        self.assertNotIn('only-synthetic-password-123',out)

    def test_interactive_unknown_end_to_end_synthetic_no_production(self):
        stored,out,err=self.simulate('UNKNOWN',['cancelled']*11)
        self.assertEqual(len(stored),1)
        self.assertEqual(stored[0][0]['comparisonTotals']['matching'],11)
        self.assertIn('CASES_SURVEYED: 11',out)
        self.assertIn('STAGE4_RELEASE_AUTHORIZED: NO',out)
        self.assertEqual(err,'')

    def test_local_failure_stages_do_not_leak_any_error_content(self):
        for failed, expected in [('locate','LOCATE_DOCKET'),('decrypt','DECRYPT_DOCKET'),('validate','VALIDATE_CASES')]:
            with self.subTest(failed=failed):
                stored,out,err=self.simulate('PENDING',[],fail_at=failed)
                self.assertEqual(stored,[])
                self.assertIn('PRIVATE_SURVEY_FAILED_AT_STAGE: '+expected,err)
                self.assertNotIn('SYNTHETIC_PRIVATE_VALUE',err)
                self.assertNotIn('SYNTHETIC_PRIVATE_VALUE',out)

if __name__=='__main__':
    unittest.main()
