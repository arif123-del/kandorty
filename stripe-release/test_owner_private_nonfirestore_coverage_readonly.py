"""No-network synthetic-only tests of owner's read-only scope probe."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
from urllib.error import HTTPError, URLError
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
  self.assertEqual(impl.verdict('STORAGE_NEW',None),'ACCESS_UNAVAILABLE_UNCLASSIFIED')
 def test_denials_are_safe_distinct_http_categories_without_private_response(self):
  cases={
   400:'HTTP_400_INVALID_REQUEST',
   401:'HTTP_401_AUTHENTICATION',
   403:'HTTP_403_ACCESS_OR_API_DISABLED',
   404:'HTTP_404_RESOURCE_NOT_FOUND',
   429:'HTTP_429_RATE_LIMIT',
   503:'HTTP_5XX_SERVER'}
  for status,expected in cases.items():
   with self.subTest(status=status):
    error=HTTPError('https://identitytoolkit.googleapis.com/SECRET_DO_NOT_LOG',
                    status,'SENSITIVE_ERR_BODY',None,None)
    with patch.object(impl.OPENER,'open',side_effect=error):
     got=impl.verdict('AUTH',impl.safe_read(impl.SOURCES['AUTH'],'FAKE_TOKEN'))
     self.assertEqual(got,expected)
     self.assertNotIn('SENSITIVE',got)
 def test_readonly_network_timeout_is_explicitly_distinct_from_http_denial(self):
  with patch.object(impl.OPENER,'open',side_effect=URLError('PRIVATE_ENDPOINT')):
   self.assertEqual(impl.verdict('RULES',impl.safe_read(
     impl.SOURCES['RULES'],'FAKE_TOKEN')),'NETWORK_OR_TIMEOUT')
 def test_https_get_only_probe_error_output_does_not_false_claim_absence(self):
  for code in ('HTTP_403_ACCESS_OR_API_DISABLED','HTTP_404_RESOURCE_NOT_FOUND'):
   self.assertEqual(impl.verdict('STORAGE_NEW',{'_safe_probe_error':code}),code)
   self.assertNotIn('NO_OBJECTS',code)
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
