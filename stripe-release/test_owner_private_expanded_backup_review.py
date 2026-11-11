"""Offline synthetic tests for expanded owner GPG snapshot verifier."""
import copy
import importlib.util
from pathlib import Path
import unittest

DIR=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location(
    'stage4_expanded_backup_review',DIR/'owner-private-expanded-backup-review.py')
review=importlib.util.module_from_spec(spec);spec.loader.exec_module(review)
ROOT=review.ROOT

def snapshot():
    cols={}
    for c in ['orders','tracking','order_edits','order_access',
              'products','categories','customers','admin_access','notifications',
              'homepage','settings']:
        count=99 if c in ('orders','tracking') else (
            28 if c in ('order_edits','order_access') else 1)
        docs=[]
        for i in range(count):
            doc_id=('KD-'+str(i).zfill(8)) if c in ('orders','tracking') else 'test-'+str(i)
            fields={'testOnly':{'booleanValue':True},
                    'privateSecret':{'stringValue':'PRIVATE-NOT-PRINT'}}
            if c in ('orders','tracking'):fields['status']={'stringValue':'new'}
            docs.append({'name':ROOT+'/'+c+'/'+doc_id,'fields':fields})
        cols[c]=docs
    nested='orders/KD-00000000/synthetic_notes'
    cols[nested]=[{'name':ROOT+'/'+nested+'/note-one',
                   'fields':{'testOnly':{'booleanValue':True}}}]
    total=sum(len(v) for v in cols.values())
    return {
        'format':'kandorty-private-all-firestore-collections-json-v1',
        'sourceProject':'kandorty-9378a',
        'database':'(default)',
        'rootCollectionCount':11,
        'collectionCount':len(cols),
        'documentCount':total,
        'consistency':'SEQUENTIAL READS - NOT TRANSACTIONAL / NOT POINT IN TIME',
        'collections':cols,
    }

class ExpandedBackupReview(unittest.TestCase):
    def test_all_eleven_root_collections_nested_and_99_orders_pass(self):
        data=snapshot()
        before=copy.deepcopy(data)
        result=review.audit(data)
        self.assertEqual(result['ROOT_COLLECTIONS_VERIFIED'],11)
        self.assertEqual(result['NESTED_COLLECTIONS_VERIFIED'],1)
        self.assertEqual(result['ORDERS_VERIFIED'],99)
        self.assertEqual(result['TRACKING_VERIFIED'],99)
        self.assertEqual(result['DOCUMENTS_VERIFIED'],262)
        self.assertEqual(result['ORDER_TRACKING_STATUS_EQUAL'],'YES')
        self.assertEqual(result['PRODUCTION_RELEASE_AUTHORIZED'],'NO')
        self.assertNotIn('PRIVATE-NOT-PRINT',str(result))
        self.assertNotIn('KD-00000000',str(result))
        self.assertEqual(data,before)

    def test_duplicate_and_malformed_doc_aborts(self):
        data=snapshot()
        data['collections']['orders'].append(
            copy.deepcopy(data['collections']['orders'][0]))
        data['documentCount']+=1
        with self.assertRaisesRegex(ValueError,'duplicate_or_nested_document'):
            review.audit(data)
        data=snapshot()
        data['collections']['products'][0]['name']+='/nested/secret'
        with self.assertRaisesRegex(ValueError,'duplicate_or_nested_document'):
            review.audit(data)

    def test_missing_root_or_parent_aborts(self):
        data=snapshot()
        del data['collections']['homepage']
        with self.assertRaisesRegex(ValueError,'not_all_expected_nonempty_roots'):
            review.audit(data)
        data=snapshot()
        data['collections']['orders/KD-00000000/synthetic_notes'][0]['name']=(
            ROOT+'/orders/UNKNOWN/synthetic_notes/note-one')
        with self.assertRaisesRegex(ValueError,'document_not_in_expected_source'):
            review.audit(data)

    def test_unmatched_nested_parent_aborts(self):
        data=snapshot()
        nested=data['collections'].pop('orders/KD-00000000/synthetic_notes')
        data['collections']['orders/UNKNOWN/synthetic_notes']=nested
        data['collectionCount']=len(data['collections'])
        with self.assertRaisesRegex(ValueError,'document_not_in_expected_source'):
            review.audit(data)

    def test_status_or_id_mismatch_aborts(self):
        data=snapshot()
        data['collections']['tracking'][0]['fields']['status']['stringValue']='cancelled'
        with self.assertRaisesRegex(ValueError,'order_tracking_status_mismatch'):
            review.audit(data)
        data=snapshot()
        data['collections']['tracking'][0]['name']=ROOT+'/tracking/KD-99999999'
        with self.assertRaisesRegex(ValueError,'order_tracking_identity_mismatch'):
            review.audit(data)

    def test_manifest_count_falsification_and_other_project_abort(self):
        data=snapshot()
        data['documentCount']+=1
        with self.assertRaisesRegex(ValueError,'snapshot_manifest_counts_inconsistent'):
            review.audit(data)
        data=snapshot()
        data['sourceProject']='another-project'
        with self.assertRaisesRegex(ValueError,'wrong_project_or_database'):
            review.audit(data)

if __name__=='__main__':unittest.main()
