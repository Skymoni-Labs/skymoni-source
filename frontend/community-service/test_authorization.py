import tempfile,unittest
from pathlib import Path
from community import Store,Application,ApiError

class AuthorizationTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.store=Store(Path(self.tmp.name)/'community.db');self.app=Application(self.store)
  self.actor=dict(id=2,username='member',name='Current site name',avatar='',role=1);self.store.sync_member(self.actor)
  self.headers={'Origin':'https://skymoni.com','Content-Type':'application/json'}
  self.data={'approved':True,'userId':2,'returnTo':'/creators?category=general'}
 def tearDown(self):self.tmp.cleanup()
 def call(self,data=None,headers=None):return self.app.dispatch('POST','/api/community/auth/authorize',headers or self.headers,data or self.data,'local')
 def assertStatus(self,status,operation):
  with self.assertRaises(ApiError) as error:operation()
  self.assertEqual(error.exception.status,status)
 def test_cookie_or_user_id_alone_cannot_authorize(self):
  self.assertStatus(401,lambda:self.call(headers={**self.headers,'Cookie':'new_api_has_session=1','New-Api-User':'2'}))
 def test_origin_and_explicit_approval_required(self):
  self.app.authenticate=lambda headers,required=False:self.actor
  self.assertStatus(403,lambda:self.call(headers={**self.headers,'Origin':'https://evil.invalid'}))
  self.assertStatus(400,lambda:self.call({**self.data,'approved':False}))
  self.assertStatus(409,lambda:self.call({**self.data,'userId':3}))
 def test_verified_account_returns_only_public_identity_and_records_consent(self):
  self.app.authenticate=lambda headers,required=False:self.actor
  result=self.call()
  self.assertTrue(result['authorized']);self.assertEqual(result['returnTo'],self.data['returnTo'])
  self.assertEqual(set(result['user']),{'id','name','username','avatar'})
  with self.store.connect() as db:
   self.assertEqual(db.execute("SELECT COUNT(*) FROM audit WHERE action='authorize-community'").fetchone()[0],1)
   self.assertEqual(db.execute('SELECT COUNT(*) FROM topics').fetchone()[0],0)
 def test_external_and_traversal_returns_rejected(self):
  self.app.authenticate=lambda headers,required=False:self.actor
  for target in ['https://evil.invalid/creators','//evil.invalid/creators','/dashboard','/creators-fake','/creators/../dashboard','/creators/%2e%2e/dashboard','/creators/%5c../dashboard','/creators/%00','/creators\n']:
   self.assertStatus(400,lambda:self.call({**self.data,'returnTo':target}))
 def test_read_only_community_restriction_does_not_revoke_site_session(self):
  self.app.authenticate=lambda headers,required=False:self.actor
  with self.store.connect(True) as db:db.execute('UPDATE members SET suspended=1 WHERE id=2')
  self.assertTrue(self.call()['authorized'])
 def test_repeated_confirmation_is_bounded_without_affecting_other_accounts(self):
  self.app.authenticate=lambda headers,required=False:self.actor
  for _ in range(10):self.call()
  self.assertStatus(429,lambda:self.call())
if __name__=='__main__':unittest.main()
