#!/usr/bin/env python3
"""Offline private structural audit for Kandorty owner's newest encrypted all-Firestore backup.

No network, Firebase credentials, unencrypted output file, plaintext logs or
production writes. It validates structure and document identities in memory.
This is NOT a managed export or a Firestore-emulator replay/rollback proof.
"""
import getpass
import hashlib
import importlib.util
from pathlib import Path
import sys

HERE=Path(__file__).resolve().parent
SOURCE_PROJECT='kandorty-9378a'
ROOT=f'projects/{SOURCE_PROJECT}/databases/(default)/documents'
PRIVATE_DIR=Path.home()/'kandorty-private-backups'
PREFIX='kandorty-expanded-firestore-'
SUFFIX='.json.gpg'
MAX_ROOTS=500
MAX_COLLECTIONS=1000
MAX_DOCUMENTS=25000

def require(check,reason):
    if not check:raise ValueError(reason)

def audit(data):
    require(isinstance(data,dict),'invalid_json_root')
    require(data.get('format')=='kandorty-private-all-firestore-collections-json-v1',
            'invalid_expanded_backup_format')
    require(data.get('sourceProject')==SOURCE_PROJECT and
            data.get('database')=='(default)','wrong_project_or_database')
    cols=data.get('collections')
    require(isinstance(cols,dict) and 11<=len(cols)<=MAX_COLLECTIONS,
            'unexpected_collection_scope')
    roots=set()
    seen=set()
    ids_by_collection={}
    status_by_collection={}
    total=0
    nested=0
    for path,docs in cols.items():
        require(isinstance(path,str) and len(path)<=2048 and
                not path.startswith('/') and not path.endswith('/'),'invalid_collection_path')
        segments=path.split('/')
        require(len(segments)%2==1 and all(s and s not in ('.','..') for s in segments),
                'collection_not_in_document_hierarchy')
        if len(segments)==1:roots.add(path)
        else:nested+=1
        require(isinstance(docs,list),'invalid_documents_list')
        within=set()
        for doc in docs:
            require(isinstance(doc,dict),'invalid_document')
            name=doc.get('name')
            prefix=ROOT+'/'+path+'/'
            require(isinstance(name,str) and name.startswith(prefix),
                    'document_not_in_expected_source')
            suffix=name[len(prefix):]
            require(suffix and '/' not in suffix and suffix not in within,
                    'duplicate_or_nested_document')
            within.add(suffix)
            require(name not in seen,'duplicate_firestore_document')
            seen.add(name)
            fields=doc.get('fields',{})
            require(isinstance(fields,dict),'invalid_firestore_fields')
            if path in ('orders','tracking'):
                require(isinstance(fields.get('status'),dict) and
                        isinstance(fields['status'].get('stringValue'),str),
                        'order_tracking_status_invalid')
        ids_by_collection[path]=within
        if path in ('orders','tracking'):
            status_by_collection[path]={
                d['name'][(len(ROOT+'/'+path+'/')):]:d['fields']['status']['stringValue']
                for d in docs
            }
        total+=len(docs)
        require(total<=MAX_DOCUMENTS,'document_scope_too_large')
    require(len(roots)>=11 and len(roots)<=MAX_ROOTS,
            'not_all_expected_nonempty_roots')
    require(roots==set(p for p in cols if '/' not in p),
            'root_collections_inconsistent')
    for path in cols:
        segments=path.split('/')
        if len(segments)>1:
            parent_collection='/'.join(segments[:-2])
            parent_doc=segments[-2]
            require(parent_collection in cols and
                    parent_doc in ids_by_collection[parent_collection],
                    'missing_parent_document_for_nested_collection')
    require(set(status_by_collection)=={'orders','tracking'},
            'order_or_tracking_collection_missing')
    order_count=len(ids_by_collection['orders'])
    require(order_count>=99 and ids_by_collection['orders']==ids_by_collection['tracking'],
            'order_tracking_identity_mismatch')
    require(status_by_collection['orders']==status_by_collection['tracking'],
            'order_tracking_status_mismatch')
    require(total>=254,'snapshot_below_prior_254_document_scope')
    require(data.get('rootCollectionCount')==len(roots) and
            data.get('collectionCount')==len(cols) and
            data.get('documentCount')==total,
            'snapshot_manifest_counts_inconsistent')
    require(data.get('consistency')=='SEQUENTIAL READS - NOT TRANSACTIONAL / NOT POINT IN TIME',
            'snapshot_consistency_claim_invalid')
    return {
        'ROOT_COLLECTIONS_VERIFIED':len(roots),
        'NESTED_COLLECTIONS_VERIFIED':nested,
        'TOTAL_COLLECTIONS_VERIFIED':len(cols),
        'DOCUMENTS_VERIFIED':total,
        'ORDERS_VERIFIED':order_count,
        'TRACKING_VERIFIED':len(ids_by_collection['tracking']),
        'ORDER_TRACKING_STATUS_EQUAL':'YES',
        'MANAGED_RESTORE_REHEARSAL_PASS':'NO',
        'AUTH_STORAGE_RULES_BACKED_UP':'NO',
        'PRODUCTION_RELEASE_AUTHORIZED':'NO',
    }

def newest_private_backup():
    require(PRIVATE_DIR.is_dir() and not PRIVATE_DIR.is_symlink(),
            'private_directory_missing_or_unsafe')
    files=[p for p in PRIVATE_DIR.glob(PREFIX+'*'+SUFFIX)
           if p.is_file() and not p.is_symlink()]
    require(bool(files),'no_expanded_backup_file_found')
    return max(files,key=lambda p:p.stat().st_mtime_ns)

def private_decrypt(path,password):
    spec=importlib.util.spec_from_file_location(
        'kandorty_private_gpg_reader',HERE/'owner-private-legacy-exception-docket.py')
    mod=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.decrypt_private_backup(path,password)

def main():
    require(len(sys.argv)==1 and sys.stdin.isatty(),'private_interactive_shell_only')
    print('KANDORTY_EXPANDED_BACKUP_OFFLINE_STRUCTURAL_REVIEW: NO NETWORK OR WRITES')
    print('Uses the latest private expanded .json.gpg in the owner Cloud Shell.')
    print('Private codes/customer data are never displayed. Do not share password.')
    path=newest_private_backup()
    secret=getpass.getpass('Private GPG passphrase: ')
    result=audit(private_decrypt(path,secret))
    print('ENCRYPTED_EXPANDED_BACKUP_STRUCTURE: PASS')
    for key,value in result.items():print(key+':',value)
    print('ENCRYPTED_SHA256:',hashlib.sha256(path.read_bytes()).hexdigest())
    print('A successful offline structure check is not a full project restore test.')

if __name__=='__main__':
    try:main()
    except (ValueError,RuntimeError,OSError,TypeError,KeyError,TimeoutError):
        print('EXPANDED_BACKUP_OFFLINE_REVIEW_NOT_COMPLETED: safe verification failed',
              file=sys.stderr)
        sys.exit(2)
