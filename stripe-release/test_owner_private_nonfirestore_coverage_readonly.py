"""No-network synthetic-only tests of owner's read-only scope probe."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location(
  'nonfirestore_owner_private_probe',HERE/'owner-private-nonfirestore-coverage-readonly.py')
impl=importlib.util.module_from_spec(spec)
spec.loader.exec_module(impl)
class ScopeReadOnlyTests(unittest.TestCase):
 def test_exactly_four_approved_get_endpoints(self):
  self.assertEqual(len(impl.SOURCES),4)
  for label,url in impl.SOURCES.items():
   self.assertTrue(url.startswith('https://'),label)
   self.assertIn(impl.PROJECT,url)
   self.assertFalse(url.endswith('/delete'))
  with self.assertRaisesRegex(ValueError,'non_allowlisted_resource'):
   impl.safe_read('https://other.example/account', 'FAKE_TOKEN')
 def test_probes_return_only_aggregate_presence(self):
  self.assertEqual(impl.verdict('AUTH',{'users':[{'email':'TEST_PRIVATE_EMAIL'}]}),
                  'USERS_PRESENT')
  self.assertEqual(impl.verdict('AUTH',{'users':[]}), 'NO_USERS_IN_FIRST_PAGE')
  self.assertEqual(impl.verdict('RULES',{'releases':[{'name':'PRIVATE_RULE'}]}),
                  'RELEASES_PRESENT')
  self.assertEqual(impl.verdict('STORAGE_NEW',{'items':[{'name':'PRIVATE_IMAGE'}]}),
                  'OBJECTS_PRESENT')
  self.assertEqual(impl.verdict('STORAGE_OLD',{'items':[]}),
                  'NO_OBJECTS_IN_FIRST_PAGE')
  self.assertEqual(impl.verdict('STORAGE_NEW',None),'ACCESS_UNAVAILABLE')
 def test_never_uses_write_methods_or_echoes_auth_or_object_data(self):
  src=(HERE/'owner-private-nonfirestore-coverage-readonly.py').read_text()
  self.assertIn("method='GET'",src)
  self.assertNotIn("method='POST'",src)
  self.assertNotIn("method='PATCH'",src)
  self.assertNotIn("method='PUT'",src)
  self.assertNotIn("method='DELETE'",src)
  self.assertNotIn('print(data)',src)
  self.assertNotIn('print(token.stdout)',src)
  self.assertIn('NoExternalRedirects',src)
 def test_deny_http_requests_not_in_exact_whitelist(self):
  with patch.object(impl.OPENER,'open') as opened:
   with self.assertRaisesRegex(ValueError,'non_allowlisted_resource'):
    impl.safe_read('https://evil.example/user?token=FAKE','FAKE')
   opened.assert_not_called()
if __name__=='__main__':unittest.main()
