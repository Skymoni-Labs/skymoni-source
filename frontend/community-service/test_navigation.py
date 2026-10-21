import json
import tempfile
import unittest
from pathlib import Path

from community import ApiError, Application, Store


class NavigationTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.path=Path(self.tmp.name)/'community.db';self.store=Store(self.path)
        self.admin=dict(id=1,name='Admin',username='admin',role=100,avatar='')
        self.member=dict(id=2,name='Member',username='member',role=1,avatar='')
        for actor in [self.admin,self.member]:self.store.sync_member(actor)
        self.topic=self.store.create_topic(self.member,dict(title='Original published title',content='Original topic content',category='general'))['id']

    def tearDown(self):self.tmp.cleanup()

    def save(self,**data):
        return self.store.manage_navigation(self.admin,{'categoryId':'general','label':'Getting started','revision':self.store.navigation_catalog()['revision'],**data})

    def test_alias_and_order_persist_without_modifying_original_topic_or_posts(self):
        catalog=self.save();item=catalog['items'][0]
        self.assertEqual(self.store.metadata()['navigation'][0]['label'],'Getting started')
        self.assertEqual(self.store.detail(self.topic)['topic']['title'],'Original published title')
        before=self.store.detail(self.topic)['posts']
        catalog=self.store.manage_navigation(self.admin,dict(label='Renamed menu',revision=catalog['revision']),nid=item['id'])
        reopened=Store(self.path)
        self.assertEqual(reopened.metadata()['navigation'][0]['label'],'Renamed menu')
        self.assertEqual(reopened.detail(self.topic)['posts'],before)
        self.assertEqual(reopened.detail(self.topic)['topic']['title'],'Original published title')

    def test_only_admin_can_mutate_and_stale_revision_is_rejected(self):
        revision=self.store.navigation_catalog()['revision']
        for actor in [None,self.member]:
            with self.assertRaises(ApiError) as error:self.store.manage_navigation(actor,dict(categoryId='general',label='Menu',revision=revision))
            self.assertEqual(error.exception.status,403)
        self.save()
        with self.assertRaises(ApiError) as error:self.store.manage_navigation(self.admin,dict(categoryId='general',label='Another',revision=revision))
        self.assertEqual(error.exception.status,409)

    def test_empty_category_is_addable_and_topic_visibility_does_not_hide_category(self):
        catalog=self.save(categoryId='help');item=catalog['items'][0]
        self.assertEqual(item['categoryId'],'help')
        self.assertEqual(self.store.metadata()['navigation'][0]['categoryId'],'help')
        with self.assertRaises(ApiError) as error:self.save(categoryId='help',label='GETTING STARTED')
        self.assertEqual(error.exception.status,409)
        with self.assertRaises(ApiError):self.save(categoryId=None,label='Invalid category')

    def test_admin_routes_require_verified_identity_and_site_origin(self):
        app=Application(self.store)
        with self.assertRaises(ApiError) as error:app.dispatch('GET','/api/community/admin/navigation',{},None,'local')
        self.assertEqual(error.exception.status,401)
        app.authenticate=lambda headers,required=False:self.member
        with self.assertRaises(ApiError) as error:app.dispatch('GET','/api/community/admin/navigation',{},None,'local')
        self.assertEqual(error.exception.status,403)
        app.authenticate=lambda headers,required=False:self.admin
        with self.assertRaises(ApiError) as error:app.dispatch('POST','/api/community/admin/navigation',{'Origin':'https://evil.invalid','Content-Type':'application/json'},dict(),'local')
        self.assertEqual(error.exception.status,403)
        catalog=app.dispatch('GET','/api/community/admin/navigation',{},None,'local')
        result=app.dispatch('POST','/api/community/admin/navigation',{'Origin':'https://skymoni.com','Content-Type':'application/json'},dict(categoryId='general',label='API alias',revision=catalog['revision']),'local')
        self.assertEqual(result['items'][0]['label'],'API alias')


if __name__=='__main__':unittest.main()
