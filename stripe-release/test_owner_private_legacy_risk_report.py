"""Synthetic only risk-report tests. No real customer data or cloud access."""
import importlib.util
from pathlib import Path
import unittest

BASE = Path(__file__).resolve().parent
def load(filename, module_name):
    spec = importlib.util.spec_from_file_location(module_name, BASE / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module
mod = load("owner-private-legacy-risk-report.py", "legacy_risk_report")
fixtures = load("test_owner_private_local_backup_review.py", "backup_review_fixtures")

def raw(value):
    if isinstance(value, bool):
        return {"booleanValue": value}
    return {"stringValue": value}
def set_status(data, indexes, status):
    for idx in indexes:
        for k in ("orders", "tracking"):
            data["collections"][k][idx]["fields"]["status"] = raw(status)
def set_field(data, collection, idx, key, value):
    data["collections"][collection][idx]["fields"][key] = raw(value)
def set_customer_cancel(data, collection, idx):
    data["collections"][collection][idx]["fields"]["customerEdit"] = {
        "mapValue":{"fields":{"cancelRequestedAt":{"timestampValue":"2026-11-09T00:00:00Z"}}}
    }

class OfflineLegacyRiskReportTests(unittest.TestCase):
    def test_baseline_99_orders_254_docs_contains_no_order_ids(self):
        result = mod.aggregate_risks(fixtures.fixture())
        self.assertEqual(result["orders"], 99)
        self.assertEqual(result["total"], 254)
        self.assertTrue(all(x == 0 for x in result["risks"].values()))
        self.assertNotIn("KD-", str(result))

    def test_four_processing_missing_locks_are_detected_individually(self):
        data = fixtures.fixture()
        set_status(data, range(4), "preparing")
        result = mod.aggregate_risks(data)
        self.assertEqual(result["risks"]["processing_lock_missing_or_mismatch"], 4)
        self.assertEqual(result["risks"]["pending_customer_cancellation"], 0)

    def test_valid_lock_pair_does_not_create_fictitious_risk(self):
        data = fixtures.fixture()
        set_status(data, [0, 1], "shipping")
        for index in (0, 1):
            for collection in ("orders", "tracking"):
                set_field(data, collection, index, "cancellationLockedAt", "2026-11-09T12:00:00Z")
        self.assertEqual(mod.aggregate_risks(data)["risks"]["processing_lock_missing_or_mismatch"], 0)
        set_field(data, "tracking", 1, "cancellationLockedAt", "2026-11-09T13:00:00Z")
        self.assertEqual(mod.aggregate_risks(data)["risks"]["processing_lock_missing_or_mismatch"], 1)

    def test_cancelled_customer_restoration_flags_do_not_trigger_stock_changes(self):
        data = fixtures.fixture()
        set_status(data, [0, 1, 2], "cancelled")
        for i in range(3):
            set_field(data, "orders", i, "cancelledBy", "customer")
            set_field(data, "orders", i, "cancelStockRestoredAt", "2026-11-09T12:00:00Z")
        flags = mod.aggregate_risks(data)["risks"]
        self.assertEqual(flags["cancelled_customer_restored_flag"], 3)
        self.assertEqual(flags["cancelled_customer_without_restored_flag"], 0)

    def test_pending_cancellation_is_review_not_automatic_status_change(self):
        data = fixtures.fixture()
        set_customer_cancel(data, "orders", 0)
        set_customer_cancel(data, "tracking", 1)
        set_status(data, [1], "cancelled")
        flags = mod.aggregate_risks(data)["risks"]
        self.assertEqual(flags["pending_customer_cancellation"], 2)
        self.assertEqual(flags["cancelled_customer_without_restored_flag"], 1)

    def test_card_cancellations_and_unknown_methods_are_review_only(self):
        data = fixtures.fixture()
        set_status(data, [0, 1], "cancelled")
        set_field(data, "orders", 0, "payment", "card")
        set_field(data, "orders", 1, "payment", "unknown")
        set_field(data, "orders", 0, "cancelledBy", "admin")
        flags = mod.aggregate_risks(data)["risks"]
        self.assertEqual(flags["cancelled_card_payment_review"], 1)
        self.assertEqual(flags["invalid_payment_label"], 1)
        self.assertEqual(flags["cancelled_unknown_origin"], 1)

    def test_project_status_and_tracking_mismatch_fail_closed(self):
        data = fixtures.fixture()
        data["sourceProject"] = "wrong"
        with self.assertRaises(Exception):
            mod.aggregate_risks(data)
        data = fixtures.fixture()
        set_field(data, "tracking", 0, "status", "cancelled")
        with self.assertRaises(Exception):
            mod.aggregate_risks(data)

    def test_new_order_with_lock_and_ledger_present_are_detected(self):
        data = fixtures.fixture()
        set_field(data, "orders", 0, "cancellationLockedAt", "2026-11-09T10:00:00Z")
        data["collections"]["order_lifecycle"] = [fixtures.row("order_lifecycle", "KD-00000001")]
        flags = mod.aggregate_risks(data)["risks"]
        self.assertEqual(flags["new_order_had_processing_lock"], 1)
        self.assertEqual(flags["ledger_documents_present"], 1)

if __name__=="__main__":
    unittest.main()
