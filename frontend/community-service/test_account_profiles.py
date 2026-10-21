import json
import sqlite3
import tempfile
import time
import unittest
from contextlib import closing
from pathlib import Path

from account_profiles import clean_avatar, setting_avatar
from community import ApiError, Application, Store
from export_profiles import project

PNG = 'data:image/png;base64,iVBORw0KGgo='
JPEG = 'data:image/jpeg;base64,/9j/AA=='


class AccountProfileTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.store = Store(self.root/'community.db')
        self.owner = dict(id=1, username='old', name='Old snapshot', avatar='', role=1)
        self.reader = dict(id=2, username='reader', name='Reader', avatar='', role=1)
        for actor in [self.owner, self.reader]: self.store.sync_member(actor)
        self.topic = self.store.create_topic(self.owner, dict(title='Keep original topic', content='Keep original content', category='general'))['id']
        self.store.reply(self.topic, self.reader, dict(content='A real reply'))
        self.work = dict(id='work', title='Published work', ownerId=1)
        self.store.add_work_comment(self.work, self.owner, dict(content='Keep work comment'))
        self.accounts = self.root/'accounts.db'
        with closing(sqlite3.connect(self.accounts)) as db, db:
            db.execute('CREATE TABLE users(id INTEGER,username TEXT,name TEXT,setting TEXT,status INTEGER,email TEXT,password TEXT)')
            db.execute('INSERT INTO users VALUES(?,?,?,?,?,?,?)', (1,'account-name','Current name',json.dumps(dict(avatar=PNG, private='never-export')),1,'private@example.test','never-export'))
            db.execute('INSERT INTO users VALUES(?,?,?,?,?,?,?)', (99,'unrelated','Unrelated','{}',1,'secret@example.test','never-export'))

    def tearDown(self): self.temp.cleanup()

    def refresh(self, creators=lambda: set()):
        def reader(ids):
            with closing(sqlite3.connect(self.accounts)) as db:
                return {str(uid): dict(id=uid, username=username, name=name, avatar=setting_avatar(setting))
                        for uid, username, name, setting in db.execute('SELECT id,username,name,setting FROM users WHERE status=1') if uid in ids}
        project(self.store.path, self.root/'account-profiles.json', reader, creators)

    def test_old_topics_comments_profiles_and_notifications_follow_current_name_and_avatar(self):
        self.refresh()
        for identity in [self.store.detail(self.topic)['topic']['author'], self.store.detail(self.topic)['posts'][0]['author'],
                         self.store.member_profile(1)['member'], self.store.list_work_comments(self.work)['comments'][0]['author']]:
            self.assertEqual(identity['name'], 'Current name')
            self.assertEqual(identity['username'], 'account-name')
            self.assertEqual(identity['avatar'], PNG)
        self.store.reply(self.topic, self.owner, dict(content='A reply to reader', replyTo=self.store.detail(self.topic)['posts'][1]['id']))
        self.refresh()
        self.assertEqual(self.store.notifications(self.reader)[0]['actor'], 'Current name')
        with closing(sqlite3.connect(self.accounts)) as db, db:
            db.execute('UPDATE users SET name=?,setting=? WHERE id=1', ('Changed again', json.dumps(dict(avatar=JPEG))))
        self.refresh()
        self.assertEqual(self.store.listing({})['topics'][0]['author']['name'], 'Changed again')
        self.assertEqual(self.store.member_profile(1)['member']['avatar'], JPEG)

    def test_projection_is_read_only_and_contains_only_public_fields_of_participating_members_or_creators(self):
        before = self.accounts.read_bytes()
        self.refresh()
        self.assertEqual(self.accounts.read_bytes(), before)
        data = json.loads((self.root/'account-profiles.json').read_text(encoding='utf8'))
        self.assertEqual(set(data['profiles']), {'1', '2'})
        self.assertEqual(set(data['profiles']['1']), {'id', 'name', 'username', 'avatar'})
        self.assertNotIn('never-export', json.dumps(data))
        self.assertNotIn('@example.test', json.dumps(data))
        self.refresh(lambda: {99})
        self.assertEqual(self.store.profiles.get(99)['name'], 'Unrelated')

    def test_avatar_removal_and_disabled_account_remove_old_public_identity(self):
        self.refresh()
        with closing(sqlite3.connect(self.accounts)) as db, db: db.execute('UPDATE users SET setting=? WHERE id=1', ('{}',))
        self.refresh()
        self.assertEqual(self.store.member_profile(1)['member']['avatar'], '')
        with closing(sqlite3.connect(self.accounts)) as db, db: db.execute('UPDATE users SET status=2 WHERE id=1')
        self.refresh()
        self.assertEqual(self.store.member_profile(1)['member']['name'], '社区成员')

    def test_fresh_authenticated_profile_wins_over_stale_projection_and_failed_export_keeps_snapshot(self):
        self.refresh()
        self.store.sync_member({**self.owner, 'name': 'Just saved', 'avatar': JPEG})
        self.assertEqual(self.store.member_profile(1)['member']['name'], 'Just saved')
        before = (self.root/'account-profiles.json').read_bytes()
        def failure(_): raise OSError('Unavailable')
        with self.assertRaises(OSError): project(self.store.path, self.root/'account-profiles.json', failure, lambda: set())
        self.assertEqual((self.root/'account-profiles.json').read_bytes(), before)
        self.refresh()
        self.assertEqual(self.store.member_profile(1)['member']['name'], 'Current name')

    def test_public_batch_only_returns_known_profiles_and_validates_ids(self):
        self.refresh()
        app = Application(self.store)
        result = app.dispatch('GET','/api/community/identities?ids=1,999',{},None,'local')
        self.assertEqual(set(result), {'1'})
        for raw in ['1 OR 1=1', '-1', '0', ',1', ','.join(['1']*101)]:
            with self.assertRaises(ApiError): app.dispatch('GET','/api/community/identities?ids='+raw,{},None,'local')

    def test_verified_identity_reads_account_settings_and_rejects_non_image_values(self):
        class Response:
            def __enter__(self): return self
            def __exit__(self, *_): pass
            def read(self, *_): return json.dumps(dict(success=True,data=dict(id=1,username='account',display_name='Account',setting=json.dumps(dict(avatar=PNG))))).encode()
        class Opener:
            def open(self, *_, **__): return Response()
        app=Application(self.store); app.opener=Opener()
        actor=app.authenticate({'Authorization':'Bearer local-fixture'})
        self.assertEqual(actor['avatar'],PNG)
        self.assertEqual(self.store.member_profile(1)['member']['name'],'Account')
        for value in ['https://tracker.invalid/a.png', 'javascript:alert(1)', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,%%%%']:
            self.assertEqual(clean_avatar(value),'')


if __name__ == '__main__': unittest.main()
