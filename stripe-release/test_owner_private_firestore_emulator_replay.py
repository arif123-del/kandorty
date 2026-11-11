"""Synthetic-only regression for the private demo Firestore-emulator restoration path."""
import copy
import importlib.util
import json
from pathlib import Path
from urllib.parse import unquote
import unittest

HERE=Path(__file__).resolve().parent
def load(filename, name):
    spec=importlib.util.spec_from_file_location(name,HERE/filename)
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

impl=load('owner-private-firestore-emulator-replay.py','stage4_private_emulator_replay')
fixtures=load('test_owner_private_local_backup_review.py','stage4_private_synthetic_fixture')

class LocalPrivateEmulatorReplayTests(unittest.TestCase):
    def test_strict_demo_loopback_only(self):
        valid={'FIRESTORE_EMULATOR_HOST':'127.0.0.1:8119',
               'GCLOUD_PROJECT':'demo-kandorty-stage4-recovery',
               'GOOGLE_CLOUD_PROJECT':'demo-kandorty-stage4-recovery'}
        impl.verify_local_guard(valid)
        for changes in ({'FIRESTORE_EMULATOR_HOST':'0.0.0.0:8119'},
                        {'FIRESTORE_EMULATOR_HOST':'remote.example:8119'},
                        {'GCLOUD_PROJECT':'kandorty-9378a'},
                        {'GOOGLE_CLOUD_PROJECT':'kandorty-9378a'}):
            with self.subTest(changes=changes):
                with self.assertRaises(ValueError):
                    impl.verify_local_guard({**valid,**changes})

    def test_254_synthetic_documents_full_field_emulator_roundtrip(self):
        snapshot=fixtures.fixture()
        snapshot['collections']['orders'][0]['fields'].update({
            'array':{'arrayValue':{'values':[{'integerValue':'9007199254740993'},
                                              {'booleanValue':True}]}},
            'arabic':{'stringValue':'اختبار'},
            'geo':{'geoPointValue':{'latitude':25.2,'longitude':55.3}},
            'timestamp':{'timestampValue':'2026-11-10T08:00:00Z'},
            'bytes':{'bytesValue':'ZmFrZQ=='}})
        before=copy.deepcopy(snapshot)
        db={coll:{} for coll in impl.COLLECTIONS}
        def lister(coll):
            return [{'name':f'projects/{impl.DEMO_PROJECT}/databases/(default)/documents/{coll}/{doc_id}',
                    'fields':copy.deepcopy(fields)} for doc_id,fields in db[coll].items()]
        def transport(method,url,payload=None):
            self.assertEqual(method,'PATCH')
            self.assertTrue(url.startswith(impl.EMULATOR_ROOT))
            path=url[len(impl.EMULATOR_ROOT):]
            collection,code=path.split('/')
            collection,code=unquote(collection),unquote(code)
            self.assertIn(collection,impl.COLLECTIONS)
            self.assertNotIn(code,db[collection])
            db[collection][code]=copy.deepcopy(payload['fields'])
            return {'name':f'projects/{impl.DEMO_PROJECT}/databases/(default)/documents/{collection}/{code}'}
        summary=impl.run_rehearsal(snapshot,transport=transport,lister=lister)
        self.assertEqual(summary['orders'],99)
        self.assertEqual(summary['total'],254)
        self.assertEqual(sum(len(coll) for coll in db.values()),254)
        self.assertEqual(snapshot,before)

    def test_dirty_emulator_refuses_any_write(self):
        db={'orders':[{'name':'unexpected'}]}
        calls=[]
        def lister(coll):return db.get(coll,[])
        def transport(*args):calls.append(args)
        with self.assertRaises(ValueError):
            impl.run_rehearsal(fixtures.fixture(),transport=transport,lister=lister)
        self.assertEqual(calls,[])

    def test_tampered_source_fails_before_any_write(self):
        original=fixtures.fixture()
        original['collections']['tracking'][0]['fields']['status']={'stringValue':'cancelled'}
        calls=[]
        with self.assertRaises(Exception):
            impl.run_rehearsal(original,transport=lambda *x:calls.append(x),
                               lister=lambda _ : [])
        self.assertEqual(calls,[])

    def test_cannot_treat_source_as_production_restore(self):
        source=(HERE/'owner-private-firestore-emulator-replay.py').read_text()
        self.assertIn("STAGE4_RELEASE_AUTHORIZED: NO",source)
        self.assertIn("MANAGED_FIRESTORE_EXPORT_OR_CLOUD_RESTORE: NOT_TESTED",source)
        self.assertNotIn("https://firestore.googleapis.com",source)
        self.assertNotIn("gcloud firestore import",source)
        self.assertNotIn("firebase_admin",source)
        self.assertNotIn("0.0.0.0:8119",source)
        self.assertIn("ProxyHandler({})",source)

if __name__=='__main__':
    unittest.main()
