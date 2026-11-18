#!/usr/bin/env python3
"""Owner-only private encrypted backup replay to a LOOPBACK, DEMO Firestore emulator.

Never contacts the production Firestore API or any cloud database; no keys, real
projects, customer names, order IDs or content are printed. The owner runs it
ONLY inside firebase emulators:exec on their private Cloud Shell. The emulator
may hold private data briefly; do not expose emulator ports or export its data.
NOT a managed Firestore backup, complete restore, or release authorization.
"""
import getpass
import importlib.util
import json
import os
from pathlib import Path
import re
import sys
from urllib import request, error, parse

BASE=Path(__file__).resolve().parent
SOURCE_PROJECT='kandorty-9378a'
DEMO_PROJECT='demo-kandorty-stage4-recovery'
EMULATOR_HOST='127.0.0.1:8119'
BACKUP=Path.home()/'kandorty-private-backups'/'kandorty-orders-20261110T103014Z.json.gpg'
COLLECTIONS=('orders','tracking','order_edits','order_access','order_lifecycle')
ROOT=f'projects/{SOURCE_PROJECT}/databases/(default)/documents/'
EMULATOR_ROOT=f'http://{EMULATOR_HOST}/v1/projects/{DEMO_PROJECT}/databases/(default)/documents/'
OPENER=request.build_opener(request.ProxyHandler({}),request.HTTPHandler())

def load(name, filename):
    spec=importlib.util.spec_from_file_location(name,BASE/filename)
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def verify_local_guard(environ):
    if environ.get('FIRESTORE_EMULATOR_HOST')!=EMULATOR_HOST:
        raise ValueError('local_emulator_host_guard_failed')
    for key in ('GOOGLE_CLOUD_PROJECT','GCLOUD_PROJECT'):
        value=environ.get(key)
        if value and value!=DEMO_PROJECT:
            raise ValueError('non_demo_project_guard_failed')
    if environ.get('FIRESTORE_EMULATOR_HOST','').startswith(('https://','http://')):
        raise ValueError('emulator_host_must_be_loopback')

def invoke(method, path, payload=None):
    if not path.startswith(EMULATOR_ROOT) or not EMULATOR_ROOT.startswith('http://127.0.0.1:'):
        raise ValueError('non_loopback_endpoint')
    data=None if payload is None else json.dumps(payload,separators=(',',':'),ensure_ascii=False).encode('utf-8')
    headers={'Accept':'application/json'}
    if data is not None:headers['Content-Type']='application/json'
    req=request.Request(path,data=data,headers=headers,method=method)
    try:
        with OPENER.open(req,timeout=12) as rsp:
            return json.load(rsp)
    except error.HTTPError as exc:
        if method=='GET' and exc.code==404:return {'documents':[]}
        raise RuntimeError('local_emulator_request_failed') from None
    except (error.URLError, TimeoutError):
        raise RuntimeError('local_emulator_unavailable') from None

def list_coll(collection):
    url=EMULATOR_ROOT+parse.quote(collection,safe='')+'?pageSize=500'
    page=invoke('GET',url)
    if page.get('nextPageToken'):
        raise ValueError('unexpected_emulator_pagination')
    rows=page.get('documents',[])
    if not isinstance(rows,list):
        raise ValueError('unexpected_emulator_documents')
    return rows

def verify_source(data):
    reviewer=load('stage4_owner_backup_review','owner-private-local-backup-review.py')
    summary=reviewer.review_structure(data)
    if summary['orders']!=99 or summary['tracking']!=99 or summary['total']!=254:
        raise ValueError('historical_99_254_baseline_changed')
    if set(data['collections'])!=set(COLLECTIONS):
        raise ValueError('unexpected_source_collections')
    return summary

def run_rehearsal(data, transport=invoke, lister=list_coll, stage_callback=None):
    # Emits only fixed stage labels; never filenames, IDs, data or exception text.
    stage=stage_callback if stage_callback is not None else lambda _label: None
    stage('VALIDATE_BACKUP_STRUCTURE')
    summary=verify_source(data)
    stage('CHECK_EMPTY_EMULATOR')
    for coll in COLLECTIONS:
        if lister(coll):raise ValueError('non_empty_emulator_abort')
    for coll in COLLECTIONS:
        stage('WRITE_'+coll.upper())
        for doc in data['collections'][coll]:
            name=doc['name']
            prefix=ROOT+coll+'/'
            if not name.startswith(prefix):
                raise ValueError('non_source_document')
            doc_id=name[len(prefix):]
            if not doc_id or '/' in doc_id or doc_id in ('.','..'):
                raise ValueError('invalid_source_document_id')
            dest=EMULATOR_ROOT+parse.quote(coll,safe='')+'/'+parse.quote(doc_id,safe='')
            transport('PATCH',dest,{'fields':doc['fields']})
    for coll in COLLECTIONS:
        stage('READBACK_'+coll.upper())
        expected={}
        for doc in data['collections'][coll]:
            doc_id=doc['name'][len(ROOT+coll+'/'):]
            expected[doc_id]=doc['fields']
        actual={}
        for doc in lister(coll):
            name=doc.get('name','')
            prefix=f'projects/{DEMO_PROJECT}/databases/(default)/documents/{coll}/'
            if not name.startswith(prefix):raise ValueError('non_demo_readback')
            doc_id=name[len(prefix):]
            if '/' in doc_id or doc_id in actual:raise ValueError('unexpected_recovered_id')
            actual[doc_id]=doc.get('fields',{})
        if actual!=expected:
            raise ValueError('recovered_field_or_document_mismatch')
    return summary

def main():
    if len(sys.argv)!=1:
        raise ValueError('no_cli_arguments')
    verify_local_guard(os.environ)
    print('STAGE4_PRIVATE_REAL_BACKUP_EMULATOR_REPLAY: LOCAL DEMO ONLY')
    print('Never share filenames, customer data, order codes or GPG password.')
    print('This loads real private backup records into a temporary loopback emulator.')
    approval=input('Type REHEARSE_LOCAL_ONLY to continue: ').strip()
    if approval!='REHEARSE_LOCAL_ONLY':
        print('LOCAL_REHEARSAL_CANCELLED: YES');return
    # Confirm the emulator is empty BEFORE decrypting any sensitive backup.
    for collection in COLLECTIONS:
        if list_coll(collection):
            raise ValueError('local_emulator_not_empty')
    decryptor=load('stage4_private_decryptor','owner-private-legacy-exception-docket.py')
    password=getpass.getpass('Private GPG backup passphrase (never share): ')
    print('LOCAL_REPLAY_STAGE: DECRYPT_PRIVATE_BACKUP',flush=True)
    source=decryptor.decrypt_private_backup(BACKUP,password)
    print('LOCAL_REPLAY_STAGE: DECRYPTION_PASS',flush=True)
    summary=run_rehearsal(source,stage_callback=lambda label: print('LOCAL_REPLAY_STAGE: '+label,flush=True))
    print('LOCAL_EMULATOR_RESTORED_DOCUMENTS:',summary['total'])
    print('LOCAL_EMULATOR_ORDERS:',summary['orders'])
    print('LOCAL_EMULATOR_TRACKING:',summary['tracking'])
    print('LOCAL_EMULATOR_FULL_TYPED_FIELDS_MATCH: YES')
    print('OWNER_REAL_ENCRYPTED_LOCAL_EMULATOR_REPLAY: PASS')
    print('MANAGED_FIRESTORE_EXPORT_OR_CLOUD_RESTORE: NOT_TESTED')
    print('SUBCOLLECTIONS_STORAGE_AUTH_RULES: NOT_BACKED_UP_BY_THIS_SNAPSHOT')
    print('INDEPENDENT_18_CASE_EVIDENCE_VERIFIED: NO')
    print('PRODUCTION_FIREBASE_STRIPE_STOCK_REFUND_WRITES: NONE')
    print('STAGE4_RELEASE_AUTHORIZED: NO')

if __name__=='__main__':
    try:main()
    except (ValueError,TypeError,KeyError,OSError,RuntimeError,TimeoutError,EOFError,KeyboardInterrupt):
        print('LOCAL_STAGE4_EMULATOR_REHEARSAL_NOT_COMPLETED: safety check or local operation failed',file=sys.stderr)
        sys.exit(2)
