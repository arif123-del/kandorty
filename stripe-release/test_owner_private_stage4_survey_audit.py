"""Synthetic-only Stage 4 survey consistency tests. No Firebase or cloud data."""
import copy
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

HERE=Path(__file__).resolve().parent
def load(name, filename):
    spec=importlib.util.spec_from_file_location(name,HERE/filename)
    m=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m
audit=load('owner_stage4_audit_test','owner-private-stage4-survey-audit.py')
survey=load('owner_stage4_survey_test','owner-private-legacy-status-survey.py')
triage=load('owner_stage4_triage_test','owner-private-legacy-triage.py')
fixtures=load('owner_stage4_fixture_test','test_owner_private_legacy_triage.py')

def plan():
    return triage.build_evidence_plan(fixtures.valid_18())
def report(group):
    p=plan()
    rows=survey.case_rows(p,group)
    return survey.make_survey(p,group,{row['orderCode']:row['statusAtBackup'] for row in rows})

class PrivateStage4AuditTests(unittest.TestCase):
    def test_expected_3_and_11_valid_and_still_not_a_release(self):
        for group,expected in [('PENDING',3),('UNKNOWN',11)]:
            with self.subTest(group=group):
                self.assertEqual(audit.verify_survey(plan(),group,report(group),survey),
                                 {'matching':expected,'changed':0,'missing':0,'skipped':0})
        self.assertIn('STAGE4_RELEASE_AUTHORIZED: NO',(HERE/'owner-private-stage4-survey-audit.py').read_text())
    def test_reject_tampering_in_status_flag_and_authorization(self):
        for key,value in [('stage4CutoverAuthorized',True),
                          ('independentCaseEvidenceVerified',1),
                          ('sourceBackupOrders',98)]:
            with self.subTest(key=key):
                r=report('UNKNOWN')
                r[key]=value
                with self.assertRaises(ValueError):
                    audit.verify_survey(plan(),'UNKNOWN',r,survey)
    def test_reject_duplicate_or_mismatched_or_invalid_case(self):
        for change in ('duplicate','foreign','missing','altered'):
            with self.subTest(change=change):
                r=report('PENDING')
                if change=='duplicate':r['rows'][1]['orderCode']=r['rows'][0]['orderCode']
                if change=='foreign':r['rows'][0]['orderCode']='KD-FAKE9999'
                if change=='missing':r['rows'].pop()
                if change=='altered':r['rows'][0]['statusComparison']='changed'
                with self.assertRaises(ValueError):
                    audit.verify_survey(plan(),'PENDING',r,survey)
    def test_choose_local_private_file_without_symlinks_and_missing_safe(self):
        with tempfile.TemporaryDirectory() as td:
            d=Path(td)
            self.assertIsNone(audit.latest_survey(d,'UNKNOWN'))
            good=d/'legacy-visual-status-survey-unknown-SYNTHETIC.json.gpg'
            good.write_bytes(b'SYNTHETIC-ENCRYPTED-PLACEHOLDER')
            self.assertEqual(audit.latest_survey(d,'UNKNOWN'),good)
            symlink=d/'legacy-visual-status-survey-unknown-LINK.json.gpg'
            symlink.symlink_to(good)
            self.assertEqual(audit.latest_survey(d,'UNKNOWN'),good)
    def test_stays_offline_and_never_prints_private_data(self):
        s=(HERE/'owner-private-stage4-survey-audit.py').read_text()
        for forbidden in ('firebase_admin','https://','requests.','urlopen(', 'gcloud ','.delete(','.set(','google.cloud'):
            self.assertNotIn(forbidden,s)
        self.assertNotIn("print('PRIVATE_OUTPUT:',",s)
        self.assertIn('getpass.getpass(',s)

if __name__=='__main__':unittest.main()
