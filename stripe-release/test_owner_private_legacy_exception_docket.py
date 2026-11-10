"""Synthetic private exception docket tests. No real customer data or cloud."""
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parent
def load(filename,name):
    spec=importlib.util.spec_from_file_location(name,ROOT/filename)
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module
mod=load('owner-private-legacy-exception-docket.py','private_exception_docket')
fixtures=load('test_owner_private_local_backup_review.py','backup_fixture_exception_docket')

def example():
    data=fixtures.fixture()
    for doc in data['collections']['orders']:
        doc['fields']['payment']={'stringValue':'cod'}
        doc['fields']['customer']={'mapValue':{'fields':{
            'phone':{'stringValue':'SYNTHETIC_PRIVATE_PHONE'}}}}
        doc['fields']['items']={'arrayValue':{'values':[{'mapValue':{'fields':{
            'qty':{'integerValue':'999'}}}}]}}
    return data

def field(data,col,index,key,value):
    data['collections'][col][index]['fields'][key]={
        'booleanValue':value} if isinstance(value,bool) else {'stringValue':value}

def status(data,indexes,value):
    for i in indexes:
        field(data,'orders',i,'status',value)
        field(data,'tracking',i,'status',value)

class PrivateExceptionDocketTests(unittest.TestCase):
    def test_baseline_99_orders_254_docs_and_zero_exceptions(self):
        d=mod.build_docket(example())
        self.assertEqual((d['ordersInspected'],d['totalDocumentsInspected']),(99,254))
        self.assertEqual(d['uniqueOrdersRequiringReview'],0)
        self.assertEqual(d['records'],[])
        self.assertFalse(d['cutoverAuthorized'])
        self.assertFalse(d['refundAuthorized'])
        self.assertFalse(d['automaticStockRestorationAuthorized'])

    def test_4_lock_3_pending_11_unknown_and_other_flags_private_and_unique(self):
        data=example()
        status(data,range(4),'preparing')
        for i in (4,5,6):field(data,'orders',i,'cancelRequestedAt','2026-11-10T11:00:00Z')
        status(data,range(7,18),'cancelled')
        status(data,[18,19],'cancelled')
        field(data,'orders',18,'cancelledBy','customer')
        field(data,'orders',18,'cancelStockRestoredAt','2026-11-10T11:00:00Z')
        field(data,'orders',19,'payment','card')
        field(data,'orders',19,'cancelledBy','admin')
        field(data,'orders',20,'cancellationLockedAt','2026-11-10T11:00:00Z')
        field(data,'orders',21,'payment','unknown')
        status(data,[22],'mystery')
        d=mod.build_docket(data)
        self.assertEqual(d['uniqueOrdersRequiringReview'],23)
        counts=d['riskCategoryCounts']
        for name,count in (
            ('processing_lock_review',4),
            ('customer_cancellation_request_review',3),
            ('unknown_cancellation_origin_review',11),
            ('historical_stock_restoration_evidence_review',1),
            ('cancelled_card_payment_evidence_review',1),
            ('unexpected_new_order_lock_review',1),
            ('unknown_payment_label_review',1),
            ('unknown_status_review',1)):
            self.assertEqual(counts[name],count)
        self.assertEqual(len({x['orderCode'] for x in d['records']}),23)
        self.assertEqual(d['records'],sorted(d['records'],key=lambda x:x['orderCode']))
        output=json.dumps(d)
        self.assertNotIn('SYNTHETIC_PRIVATE_PHONE',output)
        self.assertNotIn('"integerValue"',output)
        self.assertNotIn('"qty"',output)
        self.assertNotIn('"customer"',output)

    def test_overlapping_cancel_pending_and_unknown_origin_is_one_record(self):
        data=example()
        status(data,[0],'cancelled')
        field(data,'tracking',0,'cancelRequestedAt','2026-11-10T11:00:00Z')
        d=mod.build_docket(data)
        self.assertEqual(d['uniqueOrdersRequiringReview'],1)
        self.assertIn('unknown_cancellation_origin_review',d['records'][0]['reviewOnlyFlags'])
        self.assertIn('customer_cancellation_request_review',d['records'][0]['reviewOnlyFlags'])

    def test_wrong_project_and_tracking_mismatch_fail_closed(self):
        data=example();data['sourceProject']='wrong'
        with self.assertRaises(Exception):mod.build_docket(data)
        data=example();field(data,'tracking',0,'status','cancelled')
        with self.assertRaises(Exception):mod.build_docket(data)

    def test_lifecycle_document_requires_manual_review(self):
        data=example()
        copy=data['collections']['orders'][0]['name'].replace('/orders/','/order_lifecycle/')
        data['collections']['order_lifecycle']=[{'name':copy,'fields':{}}]
        d=mod.build_docket(data)
        self.assertEqual(d['uniqueOrdersRequiringReview'],1)
        self.assertIn('trusted_lifecycle_presence_review',d['records'][0]['reviewOnlyFlags'])

    @unittest.skipUnless(shutil.which('gpg'),'GPG absent from this runner')
    def test_encryption_roundtrip_and_no_plaintext_temporary_file(self):
        with tempfile.TemporaryDirectory() as td:
            directory=Path(td)/'private'
            output=directory/'legacy-manual-review-SYNTHETIC.json.gpg'
            password='synthetic-test-only-passphrase-123'
            docket=mod.build_docket(example())
            with patch.object(mod,'PRIVATE_DIR',directory):
                mod.save_encrypted_docket(docket,output,password)
                self.assertEqual(output.stat().st_mode & 0o777,0o600)
                self.assertEqual(directory.stat().st_mode & 0o777,0o700)
                self.assertFalse(output.with_name(output.name+'.partial').exists())
                with self.assertRaises(ValueError):
                    mod.save_encrypted_docket(docket,output,password)
            self.assertNotIn(b'kandorty-private-legacy-exception-docket-v1',output.read_bytes())
            result=subprocess.run(['gpg','--batch','--quiet','--pinentry-mode','loopback',
                '--passphrase-fd','0','--decrypt',str(output)],
                input=(password+'\n').encode(),capture_output=True,timeout=30)
            self.assertEqual(result.returncode,0)
            self.assertEqual(json.loads(result.stdout),docket)

if __name__=='__main__':unittest.main()
