"""Synthetic-only private 291+ document demo Firestore restoration tests.
NO Firebase access, private order codes or credentials.
"""
import copy
import importlib.util
from pathlib import Path
import unittest
from urllib.parse import unquote

HERE=Path(__file__).resolve().parent
def load(filename,alias):
    spec=importlib.util.spec_from_file_location(alias,HERE/filename)
    mod=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

impl=load('owner-private-expanded-firestore-emulator-replay.py','expanded_emulator_script')
fixture=load('test_owner_private_expanded_backup_review.py','expanded_fake_data')

def synthetic_291():
    data=fixture.snapshot()
    products=data['collections']['products']
    for i in range(29):
        products.append({
            'name':fixture.ROOT+'/products/fake-extra-'+str(i),
            'fields':{'synthetic':{'booleanValue':True},
                      'string':{'stringValue':'synthetic only'}}
        })
    data['documentCount']=sum(len(d) for d in data['collections'].values())
    assert data['documentCount']==291
    return data

def emulated_store(data):
    db={path:{} for path in data['collections']}
    touched=[]
    def transport(method,endpoint,payload=None):
        assert method=='PATCH'
        assert endpoint.startswith(impl.EMULATOR_ROOT)
        path_and_id=unquote(endpoint[len(impl.EMULATOR_ROOT):])
        path,doc_id=path_and_id.rsplit('/',1)
        assert path in db
        assert doc_id not in db[path]
        db[path][doc_id]=copy.deepcopy(payload['fields'])
        touched.append((path,doc_id))
        return {'name':endpoint}
    def lister(path):
        return [{
            'name':'projects/'+impl.DEMO_PROJECT+'/databases/(default)/documents/'+path+'/'+k,
            'fields':copy.deepcopy(fields)
        } for k,fields in db[path].items()]
    return db,touched,transport,lister

class ExpandedEmulatorRehearsalTests(unittest.TestCase):
    def test_demo_only_guard_disallows_prod_credentials_and_remote_emulator(self):
        valid={'FIRESTORE_EMULATOR_HOST':impl.EMULATOR_HOST,
               'GOOGLE_CLOUD_PROJECT':impl.DEMO_PROJECT,
               'GCLOUD_PROJECT':impl.DEMO_PROJECT}
        impl.guard(valid)
        changes=[
            {'FIRESTORE_EMULATOR_HOST':'0.0.0.0:8119'},
            {'FIRESTORE_EMULATOR_HOST':'kandorty-9378a'},
            {'GCLOUD_PROJECT':impl.SOURCE_PROJECT},
            {'GOOGLE_CLOUD_PROJECT':impl.SOURCE_PROJECT},
            {'GOOGLE_APPLICATION_CREDENTIALS':'/fake/service-account-key.json'}
        ]
        for update in changes:
            with self.subTest(update=update), self.assertRaises(ValueError):
                impl.guard({**valid,**update})

    def test_all_291_synthetic_docs_nested_and_special_typed_fields_roundtrip(self):
        data=synthetic_291()
        order=data['collections']['orders'][0]['fields']
        order.update({
            'array':{'arrayValue':{'values':[{'integerValue':'9007199254740993'},
                                              {'booleanValue':True}]}},
            'arabic':{'stringValue':'اختبار'},
            'geo':{'geoPointValue':{'latitude':25.2,'longitude':55.3}},
            'stamp':{'timestampValue':'2026-11-12T04:00:00Z'},
            'rawBytes':{'bytesValue':'ZmFrZQ=='},
            'nestedMap':{'mapValue':{'fields':{
                'value':{'stringValue':'NO_USER_DATA'}}}}
        })
        original=copy.deepcopy(data)
        db,touched,transport,lister=emulated_store(data)
        stages=[]
        result=impl.run_rehearsal(data,transport=transport,lister=lister,
                    root_lister=lambda:[],stage=stages.append)
        self.assertEqual(result['ROOT_COLLECTIONS_VERIFIED'],11)
        self.assertEqual(result['NESTED_COLLECTIONS_VERIFIED'],1)
        self.assertEqual(result['DOCUMENTS_VERIFIED'],291)
        self.assertEqual(len(touched),291)
        self.assertEqual(sum(len(v) for v in db.values()),291)
        self.assertEqual(data,original)
        self.assertEqual(stages[0],'VALIDATE_ENCRYPTED_SOURCE_STRUCTURE')
        self.assertEqual(stages[-1],'VERIFY_EXACT_DOCUMENTS_AND_TYPED_FIELDS')
        self.assertEqual(db['orders']['KD-00000000']['geo'],
                         {'geoPointValue':{'latitude':25.2,'longitude':55.3}})

    def test_empty_emulator_gate_stops_any_write(self):
        data=synthetic_291()
        _,touched,transport,lister=emulated_store(data)
        with self.assertRaisesRegex(ValueError,'emulator_not_empty'):
            impl.run_rehearsal(data,transport=transport,lister=lister,
                               root_lister=lambda:['unexpected_collection'])
        self.assertEqual(touched,[])

    def test_tampered_source_prevents_any_demo_write(self):
        data=synthetic_291()
        data['collections']['tracking'][0]['fields']['status']={'stringValue':'cancelled'}
        _,touched,transport,lister=emulated_store(data)
        with self.assertRaisesRegex(ValueError,'order_tracking_status_mismatch'):
            impl.run_rehearsal(data,transport=transport,lister=lister,
                               root_lister=lambda:[])
        self.assertEqual(touched,[])

    def test_missing_document_or_field_readback_fails(self):
        data=synthetic_291()
        db,touched,transport,lister=emulated_store(data)
        def corrupt_lister(path):
            rows=lister(path)
            if path=='tracking' and rows:
                # Only after at least one PATCH has populated fake local DB.
                rows[0]['fields']['status']={'stringValue':'incorrect'}
            return rows
        with self.assertRaisesRegex(ValueError,'emulator_exact_typed_field_mismatch'):
            impl.run_rehearsal(data,transport=transport,lister=corrupt_lister,
                               root_lister=lambda:[])
        self.assertEqual(len(touched),291)

    def test_path_id_protected_and_loopback_transport_only(self):
        self.assertEqual(impl.url_coll('orders/KD-fake/nested'),
                         impl.EMULATOR_ROOT+'orders/KD-fake/nested')
        for bad in ('','../../foreign','/orders','orders/','orders//child'):
            with self.subTest(bad=bad),self.assertRaises(ValueError):
                impl.url_coll(bad)
        for bad in ('http://example.com/v1/projects/kandorty-9378a/',
                    'https://firestore.googleapis.com/v1/projects/kandorty-9378a/',
                    'http://127.0.0.1:8118'):
            with self.assertRaises(ValueError):
                impl.invoke('PATCH',bad,{'fields':{}})

    def test_source_code_explicitly_forbids_production_storage_and_approval(self):
        s=(HERE/'owner-private-expanded-firestore-emulator-replay.py').read_text()
        self.assertIn('ProxyHandler({})',s)
        self.assertIn('NoRedirect',s)
        self.assertIn('STAGE4_RELEASE_AUTHORIZED: NO',s)
        self.assertIn('AUTH_STORAGE_RULES_RECOVERY_VERIFIED: NO',s)
        self.assertIn('OWNER_EXPANDED_ENCRYPTED_EMULATOR_RESTORE: PASS',s)
        self.assertNotIn('https://firestore.googleapis.com',s)
        self.assertNotIn('firebase_admin',s)
        self.assertNotIn('gcloud firestore',s)

if __name__=='__main__':unittest.main()
