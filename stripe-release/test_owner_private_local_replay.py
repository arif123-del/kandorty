"""Synthetic-only tests of local in-memory Firestore JSON fidelity, no real orders."""
import copy
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parent


def load(filename, module_name):
    spec = importlib.util.spec_from_file_location(module_name, ROOT / filename)
    instance = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(instance)
    return instance


replay = load('owner-private-local-replay.py', 'synthetic_backup_local_replay')
fixtures = load('test_owner_private_local_backup_review.py', 'synthetic_backup_local_replay_fixtures')


def snapshot():
    return fixtures.fixture()


class LocalInMemoryReplayTests(unittest.TestCase):
    def test_full_99_orders_254_documents_replayed_in_ram(self):
        data = snapshot()
        result = replay.replay_in_memory(data)
        self.assertEqual(result['orders'], 99)
        self.assertEqual(result['tracking'], 99)
        self.assertEqual(result['total_documents'], 254)
        self.assertEqual(result['replayed_documents'], 254)
        self.assertEqual(result['matching_statuses'], 99)
        self.assertTrue(result['value_roundtrip_matching'])

    def test_firestore_typed_and_unicode_payloads_remain_exact(self):
        data = snapshot()
        order = data['collections']['orders'][0]
        order['fields'].update({
            'createdAt': {'timestampValue': '2026-11-10T08:45:00Z'},
            'geo': {'geoPointValue': {'latitude': 25.20, 'longitude': 55.27}},
            'file': {'bytesValue': 'ZmFrZQ=='},
            'arabic': {'stringValue': 'تجربة آمنة'},
            'list': {'arrayValue': {'values': [
                {'integerValue': '9007199254740993'},
                {'booleanValue': True},
                {'nullValue': None},
                {'mapValue': {'fields': {'x': {'doubleValue': 1.25}}}}
            ]}}
        })
        copy_before = copy.deepcopy(data)
        self.assertTrue(replay.replay_in_memory(data)['value_roundtrip_matching'])
        self.assertEqual(data, copy_before)

    def test_replay_does_not_mutate_order_documents(self):
        data = snapshot()
        original = json.dumps(data, sort_keys=True)
        replay.replay_in_memory(data)
        self.assertEqual(original, json.dumps(data, sort_keys=True))

    def test_wrong_source_project_fails_without_replay(self):
        data = snapshot()
        data['sourceProject'] = 'not-the-expected-project'
        with self.assertRaises(Exception):
            replay.replay_in_memory(data)

    def test_order_tracking_disagreement_fails_without_replay(self):
        data = snapshot()
        data['collections']['tracking'][0]['fields']['status'] = {
            'stringValue': 'cancelled'}
        with self.assertRaises(Exception):
            replay.replay_in_memory(data)

    def test_altered_baseline_count_requires_a_new_audit(self):
        data = snapshot()
        data['collections']['order_lifecycle'].append(
            fixtures.row('order_lifecycle', 'KD-00000001'))
        with self.assertRaisesRegex(ValueError, 'private_snapshot_baseline_changed'):
            replay.replay_in_memory(data)

    def test_invalid_unbounded_numeric_values_fail_closed(self):
        data = snapshot()
        data['collections']['orders'][0]['fields']['invalid'] = {
            'doubleValue': float('nan')}
        with self.assertRaises(ValueError):
            replay.replay_in_memory(data)


if __name__ == '__main__':
    unittest.main()
