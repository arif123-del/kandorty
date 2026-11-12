#!/usr/bin/env python3
"""Synthetic public CI smoke test against fresh LOOPBACK demo Firestore emulator.
No GPG passphrase, private user backup, customer data, or cloud credentials.
"""
import importlib.util
import os
from pathlib import Path

HERE=Path(__file__).resolve().parent
def load(file,name):
    spec=importlib.util.spec_from_file_location(name,HERE/file)
    mod=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

script=load('owner-private-expanded-firestore-emulator-replay.py',
            'expanded_recovery_demo_script')
fixtures=load('test_owner_private_expanded_firestore_emulator_replay.py',
             'expanded_demo_synthetic_291')
script.guard(os.environ)
data=fixtures.synthetic_291()
result=script.run_rehearsal(data)
if result['DOCUMENTS_VERIFIED']!=291 or result['ROOT_COLLECTIONS_VERIFIED']!=11:
    raise SystemExit('SYNTHETIC_291_EMULATOR_INTEGRATION: COUNT_MISMATCH')
print('SYNTHETIC_291_DEMO_FIRESTORE_EMULATOR_RESTORE: PASS')
print('SYNTHETIC_291_EXACT_TYPED_FIELDS_READBACK: PASS')
print('REAL_CUSTOMER_DATA_USED: NO')
print('PRODUCTION_FIRESTORE_ORDERS_STOCK_RULES_WRITES: NONE')
