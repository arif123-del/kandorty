"""Synthetic-only tests of owner private full Firestore scope backup walker.

Never contacts Firebase. Never uses real project credentials or private data.
"""
import copy
import importlib.util
from pathlib import Path
import unittest

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location(
    'owner_expanded_backup_synthetic',HERE/'owner-private-expanded-firestore-backup.py')
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
ROOT=module.ROOT
ROOT_NAMES=('orders','tracking','order_edits','order_access','products',
            'categories','customers','admin_access','notifications','homepage',
            'settings')

def row(parent,collection,suffix,status=None):
    fields={'syntheticOnly':{'booleanValue':True}}
    if status is not None:fields['status']={'stringValue':status}
    return {'name':parent+'/'+collection+'/'+suffix,'fields':fields}

def fixtures(nested=True):
    records={}
    for collection in ROOT_NAMES:
        if collection in ('orders','tracking'):
            records[(ROOT,collection)]=[
                row(ROOT,collection,f'KD-{i:08d}','new' if i<50 else 'cancelled')
                for i in range(1,100)]
        else:
            records[(ROOT,collection)]=[row(ROOT,collection,'fake-one')]
    order_parent=ROOT+'/orders/KD-00000001'
    if nested:
        records[(order_parent,'test_notes')]=[
            row(order_parent,'test_notes','synthetic-note')]
    def ids(parent):
        if parent==ROOT:return list(ROOT_NAMES)
        if parent==order_parent and nested:return ['test_notes']
        return []
    def docs(parent,collection):
        return copy.deepcopy(records.get((parent,collection),[]))
    return ids,docs

class SafeExpandedFirestoreBackupTests(unittest.TestCase):
    def test_all_eleven_roots_and_one_nested_collection_are_collected(self):
        ids,docs=fixtures()
        result=module.crawl(ids,docs)
        self.assertEqual(result['rootCollectionCount'],11)
        self.assertEqual(result['collectionCount'],12)
        self.assertEqual(result['orderCount'],99)
        self.assertEqual(result['trackingCount'],99)
        self.assertEqual(result['documentCount'],208)
        self.assertEqual(result['missingParentRefs'],0)
        self.assertIn('orders/KD-00000001/test_notes',result['collections'])
        self.assertEqual(result['collections']['orders'][0]['fields']['status'],
                         {'stringValue':'new'})

    def test_missing_tracking_or_inconsistent_status_fails_closed(self):
        ids,docs=fixtures(False)
        def missing(parent,coll):
            found=docs(parent,coll)
            if parent==ROOT and coll=='tracking':return found[:-1]
            return found
        with self.assertRaisesRegex(ValueError,'order_tracking_mismatch'):
            module.crawl(ids,missing)
        def bad_status(parent,coll):
            found=docs(parent,coll)
            if parent==ROOT and coll=='tracking':
                found[0]['fields']['status']={'stringValue':'delivered'}
            return found
        with self.assertRaisesRegex(ValueError,'order_tracking_mismatch'):
            module.crawl(ids,bad_status)

    def test_duplicate_nested_document_ref_is_rejected(self):
        ids,docs=fixtures()
        def repeated(parent,coll):
            data=docs(parent,coll)
            if coll=='test_notes':data.append(copy.deepcopy(data[0]))
            return data
        with self.assertRaisesRegex(ValueError,'invalid_or_duplicate_nested_document'):
            module.crawl(ids,repeated)

    def test_less_than_eleven_roots_is_not_claimed_complete(self):
        ids,docs=fixtures(False)
        with self.assertRaisesRegex(ValueError,'root_collection_count'):
            module.crawl(lambda p:ids(p)[:-1] if p==ROOT else ids(p),docs)

    def test_nested_limit_triggers_explicit_failure_not_silent_truncation(self):
        ids,docs=fixtures(False)
        start=ROOT+'/orders/KD-00000001'
        def deep_ids(parent):
            if parent==ROOT:return list(ROOT_NAMES)
            if parent==start:return ['level0']
            if parent.startswith(start+'/') and parent.count('/level')<=10:
                return ['level'+str(parent.count('/level'))]
            return []
        def deep_docs(parent,coll):
            if parent==ROOT:return docs(parent,coll)
            return [row(parent,coll,'fake-node')]
        with self.assertRaisesRegex(ValueError,'nested_depth_limit'):
            module.crawl(deep_ids,deep_docs)

    def test_expanded_backup_is_structurally_checked_before_and_after_gpg(self):
        ids,docs=fixtures(nested=True)
        def enough_docs(parent,collection):
            rows=docs(parent,collection)
            if parent==ROOT and collection in ('order_edits','order_access'):
                rows.extend(row(ROOT,collection,'safe-'+str(i)) for i in range(23))
            return rows
        data=module.crawl(ids,enough_docs)
        export={
            'format':'kandorty-private-all-firestore-collections-json-v1',
            'sourceProject':'kandorty-9378a',
            'database':'(default)',
            'rootCollectionCount':data['rootCollectionCount'],
            'collectionCount':data['collectionCount'],
            'documentCount':data['documentCount'],
            'consistency':'SEQUENTIAL READS - NOT TRANSACTIONAL / NOT POINT IN TIME',
            'collections':data['collections'],
        }
        original=copy.deepcopy(export)
        result=module.verify_expanded_structure(export)
        self.assertEqual(result['ROOT_COLLECTIONS_VERIFIED'],11)
        self.assertEqual(result['ORDERS_VERIFIED'],99)
        self.assertEqual(result['TRACKING_VERIFIED'],99)
        self.assertEqual(result['DOCUMENTS_VERIFIED'],254)
        self.assertEqual(export,original)
        # This structural preflight intentionally refuses an incomplete
        # or inconsistent source *before* any encrypted backup is written.
        export['collections']['tracking'][0]['fields']['status']={
            'stringValue':'cancelled'}
        with self.assertRaisesRegex(ValueError,'order_tracking_status_mismatch'):
            module.verify_expanded_structure(export)

    def test_cache_free_writer_self_checks_both_decryption_and_structure(self):
        text=(HERE/'owner-private-expanded-firestore-backup.py').read_text()
        self.assertIn("expected_structure=verify_expanded_structure(export)",text)
        self.assertIn("verified_structure=verify_expanded_structure(restored_json)",text)
        self.assertIn("verified_structure==expected_structure",text)
        self.assertIn("print('ENCRYPTED_EXPANDED_BACKUP_STRUCTURE: PASS')",text)
        self.assertIn("'--no-symkey-cache','--decrypt'",text)
        self.assertIn("'--no-symkey-cache','--symmetric'",text)

    def test_no_firestore_mutations_or_plaintext_backup_files(self):
        src=(HERE/'owner-private-expanded-firestore-backup.py').read_text()
        self.assertIn("path.endswith(':listCollectionIds')",src)
        self.assertIn('showMissing',src)
        self.assertIn("'--cipher-algo','AES256'",src)
        self.assertIn("file.chmod(0o600)",src)
        self.assertNotIn('firebase_admin',src)
        self.assertNotIn('firestore.googleapis.com/v1/projects/',src.replace("f'https://firestore.googleapis.com/v1/{ROOT}'",''))
        self.assertNotIn('cloud storage upload',src.lower())
        self.assertIn('STAGE4_RELEASE_AUTHORIZED: NO',src)

if __name__=='__main__':unittest.main()
