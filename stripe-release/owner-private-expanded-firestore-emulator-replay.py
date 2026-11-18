#!/usr/bin/env python3
"""Owner-only 291+ document encrypted Firestore snapshot rehearsal in a *local*
DEMO Firestore emulator. NO requests to production Firestore or any cloud API.

All sensitive customer/order fields exist solely in the user's private
Cloud Shell process and temporary loopback emulator, never in GitHub, logs,
chat, an emulator export, or a plaintext backup file.

This proves a typed-field readback in a temporary emulator, NOT an actual
managed Firebase recovery, whole project export, Rules, Storage, or Auth.
"""
import getpass
import importlib.util
import json
import os
from pathlib import Path
import sys
from urllib import request, parse, error

BASE=Path(__file__).resolve().parent
DEMO_PROJECT='demo-kandorty-stage4-recovery'
SOURCE_PROJECT='kandorty-9378a'
EMULATOR_HOST='127.0.0.1:8119'
BASE_URL='http://'+EMULATOR_HOST+'/v1/projects/'+DEMO_PROJECT+'/databases/(default)/documents'
EMULATOR_ROOT=BASE_URL+'/'
SOURCE_ROOT='projects/'+SOURCE_PROJECT+'/databases/(default)/documents/'
LIMIT_PER_COLLECTION=25000

class NoRedirect(request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('emulator_redirect_refused')

OPENER=request.build_opener(request.ProxyHandler({}),request.HTTPHandler(),NoRedirect())

def require(condition,reason):
    if not condition: raise ValueError(reason)

def load(filename,alias):
    spec=importlib.util.spec_from_file_location(alias,BASE/filename)
    mod=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

def guard(environ):
    require(environ.get('FIRESTORE_EMULATOR_HOST')==EMULATOR_HOST,
            'emulator_host_guard')
    for key in ('GCLOUD_PROJECT','GOOGLE_CLOUD_PROJECT'):
        require(environ.get(key)==DEMO_PROJECT,'wrong_demo_project')
    require(environ.get('GOOGLE_APPLICATION_CREDENTIALS') is None,
            'production_credentials_present')

def url_coll(collection_path):
    """Quote each path segment; never interpolate full user document paths into
    an unvalidated HTTP destination."""
    require(isinstance(collection_path,str) and
            collection_path and
            all(part and part not in ('.','..') for part in collection_path.split('/')),
            'invalid_collection_path')
    return EMULATOR_ROOT+'/'.join(parse.quote(part,safe='') for part in collection_path.split('/'))

def invoke(method,url,body=None):
    # The transport rejects every external host or redirect. PATCH is only to
    # this *hard-coded demo* emulator and never an authenticated production URL.
    require(method in ('GET','PATCH'),'invalid_emulator_method')
    require(url.startswith(EMULATOR_ROOT) or url.startswith(BASE_URL+':'),
            'non_demo_emulator_endpoint')
    require(url.startswith('http://127.0.0.1:8119/'),
            'non_loopback_http_refused')
    if method=='PATCH': require(url.startswith(EMULATOR_ROOT),'invalid_patch_target')
    payload=None if body is None else json.dumps(body,ensure_ascii=False,separators=(',',':')).encode('utf8')
    headers={'Accept':'application/json'}
    if payload is not None:headers['Content-Type']='application/json'
    req=request.Request(url,data=payload,headers=headers,method=method)
    try:
        with OPENER.open(req,timeout=15) as response:
            data=json.load(response)
        require(isinstance(data,dict),'emulator_bad_response')
        return data
    except error.HTTPError as exc:
        if method=='GET' and exc.code==404:return {'documents':[]}
        raise RuntimeError('loopback_emulator_http_error') from None
    except (error.URLError,TimeoutError):
        raise RuntimeError('loopback_emulator_unavailable') from None

def list_root_collections():
    """Use GET-only known nonempty sentinels to reject a reused emulator.

    The Firestore emulator may not implement listCollectionIds for the root
    document path. emulators:exec creates a fresh temporary instance, and
    run_rehearsal checks EVERY source collection path before its first write.
    """
    sentinels=('orders','tracking','products')
    return [name for name in sentinels if list_path_documents(name)]

def list_path_documents(path):
    found=[]
    tok=''
    seen_tokens=set()
    endpoint=url_coll(path)
    for _ in range(150):
        args={'pageSize':250}
        if tok:args['pageToken']=tok
        resp=invoke('GET',endpoint+'?'+parse.urlencode(args))
        rows=resp.get('documents',[])
        require(isinstance(rows,list),'emulator_invalid_document_list')
        found.extend(rows)
        require(len(found)<=LIMIT_PER_COLLECTION,'emulator_collection_exceeds_safe_limit')
        tok=resp.get('nextPageToken','')
        if not tok:return found
        require(tok not in seen_tokens,'emulator_pagination_repeat')
        seen_tokens.add(tok)
    raise ValueError('emulator_pagination_limit')

def run_rehearsal(data,transport=invoke,lister=list_path_documents,
                  root_lister=list_root_collections, stage=None):
    log=stage or (lambda _name:None)
    verifier=load('owner-private-expanded-backup-review.py','private_expanded_structure_checker')
    log('VALIDATE_ENCRYPTED_SOURCE_STRUCTURE')
    summary=verifier.audit(data)
    # This specific first 291-document expanded backup is the source of truth.
    require(summary['DOCUMENTS_VERIFIED']>=291,'source_below_owner_291_baseline')
    collections=data['collections']
    paths=sorted(collections,key=lambda k:(k.count('/'),k))
    log('CHECK_FRESH_EMPTY_DEMO_EMULATOR')
    require(root_lister()==[],'emulator_not_empty')
    for path in paths:
        require(not lister(path),'emulator_not_empty')
    recovered=0
    for path in paths:
        for d in collections[path]:
            source_prefix=SOURCE_ROOT+path+'/'
            name=d['name']
            require(name.startswith(source_prefix),'invalid_source_prefix')
            suffix=name[len(source_prefix):]
            require(suffix and '/' not in suffix,'invalid_source_doc_id')
            endpoint=url_coll(path)+'/'+parse.quote(suffix,safe='')
            transport('PATCH',endpoint,{'fields':d.get('fields',{})})
            recovered+=1
    log('WRITE_291_PLUS_DOCUMENTS_TO_LOCAL_DEMO_ONLY')
    require(recovered==summary['DOCUMENTS_VERIFIED'],'emulator_count_write_mismatch')
    checked=0
    for path in paths:
        prefix=SOURCE_ROOT+path+'/'
        expected={d['name'][len(prefix):]:d.get('fields',{})
                  for d in collections[path]}
        actual={}
        emulator_prefix='projects/'+DEMO_PROJECT+'/databases/(default)/documents/'+path+'/'
        for d in lister(path):
            name=d.get('name')
            require(isinstance(name,str) and name.startswith(emulator_prefix),
                    'non_demo_emulator_result')
            identifier=name[len(emulator_prefix):]
            require(identifier and '/' not in identifier and identifier not in actual,
                    'duplicate_or_bad_demo_document')
            actual[identifier]=d.get('fields',{})
        require(actual==expected,'emulator_exact_typed_field_mismatch')
        checked+=len(actual)
    log('VERIFY_EXACT_DOCUMENTS_AND_TYPED_FIELDS')
    require(checked==summary['DOCUMENTS_VERIFIED'],'emulator_readback_count_mismatch')
    return summary

def main():
    require(len(sys.argv)==1 and sys.stdin.isatty(),'private_interactive_shell_only')
    guard(os.environ)
    print('EXPANDED_BACKUP_LOCAL_DEMO_EMULATOR_RESTORE: READ/WRITE LOOPBACK ONLY',flush=True)
    print('NO network to production, no order IDs, customer details or passphrase in logs.',flush=True)
    ok=input('Type REHEARSE_EXPANDED_LOCAL_ONLY to continue: ').strip()
    if ok!='REHEARSE_EXPANDED_LOCAL_ONLY':
        print('EXPANDED_LOCAL_EMULATOR_CANCELLED: YES');return
    require(list_root_collections()==[],'emulator_not_empty')
    reader=load('owner-private-expanded-backup-review.py','expanded_backup_owner_reader')
    backups=reader.private_backup_candidates()
    # A single NEW owner passphrase is checked against the private candidates.
    pw=getpass.getpass('Owner expanded-backup PRIVATE GPG password: ')
    source=None
    for file in backups:
        try:
            source=reader.private_decrypt(file,pw)
            break
        except ValueError as exc:
            if str(exc)=='private_decryption_or_integrity_failed':
                continue
            raise
    require(source is not None,'expanded_backup_gpg_did_not_unlock')
    print('OWNER_PRIVATE_EXPANDED_BACKUP_DECRYPTION: PASS',flush=True)
    result=run_rehearsal(source,stage=lambda name:print('LOCAL_STAGE4_REPLAY: '+name,flush=True))
    print('EXPANDED_LOCAL_EMULATOR_DOCUMENTS:',result['DOCUMENTS_VERIFIED'])
    print('EXPANDED_LOCAL_EMULATOR_ROOT_COLLECTIONS:',result['ROOT_COLLECTIONS_VERIFIED'])
    print('EXPANDED_LOCAL_EMULATOR_TOTAL_COLLECTIONS:',result['TOTAL_COLLECTIONS_VERIFIED'])
    print('EXPANDED_LOCAL_EMULATOR_ORDERS:',result['ORDERS_VERIFIED'])
    print('EXPANDED_LOCAL_EMULATOR_TRACKING:',result['TRACKING_VERIFIED'])
    print('EXPANDED_LOCAL_EMULATOR_TYPED_FIELDS_MATCH: YES')
    print('OWNER_EXPANDED_ENCRYPTED_EMULATOR_RESTORE: PASS')
    print('AUTH_STORAGE_RULES_RECOVERY_VERIFIED: NO')
    print('PRODUCTION_FIRESTORE_STRIPE_STOCK_RULES_WRITES: NONE')
    print('STAGE4_RELEASE_AUTHORIZED: NO')

if __name__=='__main__':
    try:main()
    except (ValueError,TypeError,KeyError,OSError,RuntimeError,TimeoutError,EOFError,KeyboardInterrupt):
        print('EXPANDED_EMULATOR_RESTORE_NOT_COMPLETED: local-only safety check failed',
              file=sys.stderr)
        sys.exit(2)
