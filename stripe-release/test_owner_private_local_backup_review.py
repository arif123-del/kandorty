"""Synthetic and offline-only tests for owner backup validation. No customer data."""
import importlib.util
from pathlib import Path
import unittest

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("backup_review",
    HERE / "owner-private-local-backup-review.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def row(collection, doc_id, status=None):
    fields = {"testOnly": {"booleanValue": True}}
    if status is not None:
        fields["status"] = {"stringValue": status}
    return {
        "name": f"projects/kandorty-9378a/databases/(default)/documents/{collection}/{doc_id}",
        "fields": fields,
    }


def fixture():
    orders = [row("orders", f"KD-{n:08d}", "new") for n in range(1, 100)]
    tracking = [row("tracking", f"KD-{n:08d}", "new") for n in range(1, 100)]
    return {
        "format": "kandorty-firestore-rest-json-v1",
        "sourceProject": "kandorty-9378a",
        "database": "(default)",
        "collections": {
            "orders": orders,
            "tracking": tracking,
            "order_edits": [row("order_edits", f"KD-{n:08d}") for n in range(1, 29)],
            "order_access": [row("order_access", f"KD-{n:08d}") for n in range(1, 29)],
            "order_lifecycle": [],
        },
    }


class BackupReviewTests(unittest.TestCase):
    def test_synthetic_99_orders_254_documents_valid(self):
        summary = module.review_structure(fixture())
        self.assertEqual(summary["orders"], 99)
        self.assertEqual(summary["tracking"], 99)
        self.assertEqual(summary["matching_statuses"], 99)
        self.assertEqual(summary["total"], 254)
        self.assertEqual(summary["other_collection_total"], 56)
        self.assertNotIn("KD-", str(summary))

    def test_project_and_format_mismatch_rejected(self):
        for attr, value in [
            ("format", "someone-else"),
            ("sourceProject", "kandorty-stripe-test-5f8af"),
            ("database", "(anything)"),
        ]:
            data = fixture()
            data[attr] = value
            with self.assertRaises(module.UnsafeBackupError):
                module.review_structure(data)

    def test_missing_tracking_document_and_changed_status_rejected(self):
        data = fixture()
        data["collections"]["tracking"].pop()
        with self.assertRaises(module.UnsafeBackupError):
            module.review_structure(data)
        data = fixture()
        data["collections"]["tracking"][0]["fields"]["status"] = {
            "stringValue": "cancelled"
        }
        with self.assertRaises(module.UnsafeBackupError):
            module.review_structure(data)

    def test_duplicate_or_nested_path_rejected(self):
        data = fixture()
        data["collections"]["orders"][0]["name"] = data["collections"]["orders"][1]["name"]
        with self.assertRaises(module.UnsafeBackupError):
            module.review_structure(data)
        data = fixture()
        data["collections"]["orders"][0]["name"] += "/nested/x"
        with self.assertRaises(module.UnsafeBackupError):
            module.review_structure(data)

    def test_less_than_99_orders_rejected(self):
        data = fixture()
        data["collections"]["orders"].pop()
        data["collections"]["tracking"].pop()
        with self.assertRaises(module.UnsafeBackupError):
            module.review_structure(data)

    def test_unexpected_collection_and_invalid_fields_rejected(self):
        data = fixture()
        data["collections"]["credit_cards"] = []
        with self.assertRaises(module.UnsafeBackupError):
            module.review_structure(data)
        data = fixture()
        data["collections"]["orders"][0]["fields"] = None
        with self.assertRaises(module.UnsafeBackupError):
            module.review_structure(data)


if __name__ == "__main__":
    unittest.main()
