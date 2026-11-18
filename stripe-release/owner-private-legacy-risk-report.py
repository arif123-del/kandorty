#!/usr/bin/env python3
"""Owner-only aggregate risk review of an encrypted local Kandorty order backup.

Read-only and offline. Does not print customer data, document IDs or passwords.
This never approves a production cutover or changes Firestore, stock or Stripe.
"""
import getpass
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parent
REVIEW_PATH = ROOT / "owner-private-local-backup-review.py"
spec = importlib.util.spec_from_file_location("kandorty_owner_backup_review", REVIEW_PATH)
review = importlib.util.module_from_spec(spec)
spec.loader.exec_module(review)
DEFAULT_FILE = Path.home() / "kandorty-private-backups" / "kandorty-orders-20261110T103014Z.json.gpg"
LIMIT_BYTES = 200 * 1024 * 1024

def prop(fields, key):
    value = fields.get(key, {})
    if not isinstance(value, dict):
        return None
    for t in ("stringValue", "timestampValue", "booleanValue", "integerValue", "doubleValue"):
        if t in value:
            return value[t]
    return None

def nested(fields, root, field):
    val = fields.get(root, {})
    if not isinstance(val, dict):
        return None
    sub = val.get("mapValue", {}).get("fields", {})
    return prop(sub, field) if isinstance(sub, dict) else None

def record_fields(doc):
    fields = doc.get("fields", {})
    if not isinstance(fields, dict):
        raise ValueError("invalid_firestore_fields")
    return fields

def aggregate_risks(data):
    # First enforce project, orders/tracking identity, status and duplicate checks.
    summary = review.review_structure(data)
    collections = data["collections"]
    pref = "projects/kandorty-9378a/databases/(default)/documents/"
    tracking = {doc["name"][len(pref + "tracking/"):]: record_fields(doc)
                for doc in collections["tracking"]}
    keys = (
        "processing_lock_missing_or_mismatch",
        "new_order_had_processing_lock",
        "pending_customer_cancellation",
        "cancelled_customer_restored_flag",
        "cancelled_customer_without_restored_flag",
        "cancelled_card_payment_review",
        "cancelled_unknown_origin",
        "invalid_payment_label",
        "ledger_documents_present",
    )
    counts = {key: 0 for key in keys}
    # Overlap counters prevent double-counting the same exceptional order.
    # No order identifier is included in any result or console output.
    overlaps = {
        "pending_request_already_cancelled": 0,
        "pending_request_still_new": 0,
        "pending_request_in_processing": 0,
        "pending_request_with_restored_stock_flag": 0,
        "cancelled_missing_origin_including_pending": 0,
        "cancelled_unknown_origin_with_pending_request": 0,
        "cancelled_unknown_origin_with_restored_stock_flag": 0,
        "processing_lock_gap_with_pending_request": 0,
    }
    for doc in collections["orders"]:
        order = record_fields(doc)
        suffix = doc["name"][len(pref + "orders/"):]
        track = tracking[suffix]
        status = prop(order, "status")
        payment = prop(order, "payment")
        ol = prop(order, "cancellationLockedAt")
        tl = prop(track, "cancellationLockedAt")
        pending = any((
            nested(order, "customerEdit", "cancelRequestedAt"),
            nested(track, "customerEdit", "cancelRequestedAt"),
            prop(order, "cancelRequestedAt"),
            prop(track, "cancelRequestedAt")
        ))
        restored = bool(prop(order, "cancelStockRestoredAt"))
        cancelled_by = prop(order, "cancelledBy")
        lock_gap = status in ("preparing", "shipping", "delivered") and (
            not ol or not tl or ol != tl
        )
        unknown_cancel_origin = status == "cancelled" and cancelled_by not in (
            "admin", "customer"
        )
        if pending:
            if status == "cancelled":
                overlaps["pending_request_already_cancelled"] += 1
            elif status == "new":
                overlaps["pending_request_still_new"] += 1
            elif status in ("preparing", "shipping", "delivered"):
                overlaps["pending_request_in_processing"] += 1
            if restored:
                overlaps["pending_request_with_restored_stock_flag"] += 1
        if unknown_cancel_origin:
            overlaps["cancelled_missing_origin_including_pending"] += 1
        if unknown_cancel_origin and pending:
            overlaps["cancelled_unknown_origin_with_pending_request"] += 1
        if unknown_cancel_origin and restored:
            overlaps["cancelled_unknown_origin_with_restored_stock_flag"] += 1
        if lock_gap and pending:
            overlaps["processing_lock_gap_with_pending_request"] += 1
        if status in ("preparing", "shipping", "delivered") and (not ol or not tl or ol != tl):
            counts["processing_lock_missing_or_mismatch"] += 1
        if status == "new" and (ol or tl):
            counts["new_order_had_processing_lock"] += 1
        if pending:
            counts["pending_customer_cancellation"] += 1
        if status == "cancelled":
            if cancelled_by == "customer" or pending:
                if restored:
                    counts["cancelled_customer_restored_flag"] += 1
                else:
                    counts["cancelled_customer_without_restored_flag"] += 1
            elif cancelled_by not in ("admin", "customer"):
                counts["cancelled_unknown_origin"] += 1
            if payment == "card":
                counts["cancelled_card_payment_review"] += 1
        if payment not in ("cod", "card"):
            counts["invalid_payment_label"] += 1
    counts["ledger_documents_present"] = len(collections["order_lifecycle"])
    return {"orders": summary["orders"], "total": summary["total"],
            "risks": counts, "overlaps": overlaps}

def decrypt_and_review(path, password):
    if not shutil.which("gpg"):
        raise ValueError("gpg_unavailable")
    if not path.is_file() or path.is_symlink() or not path.name.endswith(".json.gpg") or path.stat().st_size > LIMIT_BYTES:
        raise ValueError("encrypted_backup_missing_or_invalid")
    result = subprocess.run(
        ["gpg", "--batch", "--quiet", "--pinentry-mode", "loopback", "--passphrase-fd", "0",
         "--decrypt", str(path)],
        input=(password + "\n").encode(), stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL, timeout=240, check=False)
    if result.returncode != 0 or not result.stdout:
        raise ValueError("decryption_or_integrity_failed")
    parsed = json.loads(result.stdout)
    return aggregate_risks(parsed)

def main():
    path = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else DEFAULT_FILE
    print("KANDORTY_LEGACY_OFFLINE_RISK_REPORT (READ ONLY, NO CUSTOMER IDs)")
    password = getpass.getpass("Private local backup password: ")
    report = decrypt_and_review(path, password)
    print("ORDERS_INSPECTED:", report["orders"])
    print("TOTAL_DOCUMENTS_INSPECTED:", report["total"])
    for key, count in report["risks"].items():
        print(key.upper() + ":", count)
    print("CROSS_CUTTING_EXCEPTION_COUNTS (not additive):")
    for key, count in report["overlaps"].items():
        print(key.upper() + ":", count)
    print("AUTOMATIC_STOCK_RESTORATION_AUTHORIZED: NO")
    print("REFUNDS_OR_LIVE_RELEASE_AUTHORIZED: NO")
    print("LEGACY_CUTOVER_ALLOWED: NO")
    print("This review does not prove card settlement or inventory debits.")

if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, json.JSONDecodeError, subprocess.TimeoutExpired):
        print("RISK_REPORT_NOT_COMPLETED: private local validation failed", file=sys.stderr)
        sys.exit(2)
