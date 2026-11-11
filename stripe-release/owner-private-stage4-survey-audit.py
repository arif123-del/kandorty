#!/usr/bin/env python3
"""Owner-only Stage 4 visual-survey integrity check. OFFLINE, NO PRODUCTION ACCESS.

Decrypt the owner's existing encrypted exception docket and optional PENDING /
UNKNOWN visual surveys in RAM; fail closed on altered or mismatched surveys.
Visual status matches are NOT independent stock/payment/cancellation evidence,
and never authorize a Firestore import, migration, release, or refund.
"""
import getpass
import importlib.util
from pathlib import Path
import subprocess
import sys
import json

HERE=Path(__file__).resolve().parent
SPECS={'PENDING':('pending',3),'UNKNOWN':('unknown',11)}

def load(name, filename):
    spec=importlib.util.spec_from_file_location(name,HERE / filename)
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def verify_survey(plan, group, report, survey):
    """Exact canonical reconstruction; never print or return case identities."""
    if not isinstance(report,dict) or not isinstance(report.get('rows'),list):
        raise ValueError('invalid_private_survey')
    rows=report['rows']
    if len(rows)!=SPECS[group][1]:
        raise ValueError('wrong_private_survey_count')
    answers={}
    for row in rows:
        if not isinstance(row,dict) or not isinstance(row.get('orderCode'),str):
            raise ValueError('invalid_private_survey_row')
        code=row['orderCode']
        if code in answers:
            raise ValueError('duplicate_private_survey_case')
        answers[code]=row.get('ownerObservedCurrentStatus')
    expected=survey.make_survey(plan,group,answers)
    if expected!=report:
        raise ValueError('private_survey_tampered_or_stale')
    return dict(expected['comparisonTotals'])

def latest_survey(directory, group):
    if not directory.is_dir() or directory.is_symlink():
        raise ValueError('private_directory_unavailable')
    stem=SPECS[group][0]
    candidates=[p for p in directory.glob('legacy-visual-status-survey-'+stem+'-*.json.gpg')
                if p.is_file() and not p.is_symlink() and 0<p.stat().st_size<=200*1024*1024]
    return max(candidates,key=lambda p:p.stat().st_mtime) if candidates else None

def audit_private(directory, password, triage, source, survey):
    docket=source.decrypt_private_backup(triage.select_private_docket(),password)
    plan=triage.build_evidence_plan(docket)
    result={}
    for group in SPECS:
        path=latest_survey(directory,group)
        result[group]=None if path is None else verify_survey(
            plan,group,source.decrypt_private_backup(path,password),survey)
    return result

def main():
    if len(sys.argv)!=1:
        raise ValueError('no_arguments_accepted')
    print('KANDORTY_STAGE4_PRIVATE_SURVEY_AUDIT: OFFLINE_READ_ONLY')
    print('Never share private survey files, order codes, passphrases or screenshots.')
    triage=load('owner_stage4_triage','owner-private-legacy-triage.py')
    source=load('owner_stage4_docket','owner-private-legacy-exception-docket.py')
    survey=load('owner_stage4_survey','owner-private-legacy-status-survey.py')
    password=getpass.getpass('Private GPG passphrase (keep private): ')
    output=audit_private(triage.PRIVATE_DIR,password,triage,source,survey)
    completed=0
    for group in SPECS:
        values=output[group]
        if values is None:
            print('OWNER_'+group+'_ENCRYPTED_SURVEY: MISSING')
        else:
            completed+=1
            print('OWNER_'+group+'_ENCRYPTED_SURVEY: VALID')
            for field in ('matching','changed','missing','skipped'):
                print('OWNER_'+group+'_'+field.upper()+':',values[field])
    print('ENCRYPTED_VISUAL_SURVEYS_VERIFIED:',str(completed)+'/2')
    print('INDEPENDENT_CASE_CAUSAL_EVIDENCE_VERIFIED: NO')
    print('MANAGED_FIRESTORE_EXPORT_AND_REAL_RESTORE_VERIFIED: NO')
    print('FIREBASE_STRIPE_STOCK_REFUND_WRITES: NONE')
    print('STAGE4_RELEASE_AUTHORIZED: NO')
    print('This tool cannot independently close the 18 historic exceptions.')

if __name__=='__main__':
    try:
        main()
    except (ValueError,OSError,subprocess.TimeoutExpired,json.JSONDecodeError,EOFError,KeyboardInterrupt,TypeError,KeyError):
        print('PRIVATE_STAGE4_SURVEY_AUDIT_NOT_COMPLETED: local validation failed',file=sys.stderr)
        sys.exit(2)
