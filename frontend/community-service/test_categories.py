import sqlite3
import tempfile
import unittest
from pathlib import Path

from community import ApiError, Store
import test_http_flow as http


class CategoryTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.store=Store(Path(self.tmp.name)/'community.db')
        self.admin=dict(id=1,username='admin',name='Admin',avatar='',role=100)
        self.member=dict(id=2,username='member',name='Member',avatar='',role=1)
        for actor in [self.admin,self.member]: self.store.sync_member(actor)

    def tearDown(self): self.tmp.cleanup()

    def create(self, **changes):
        body=dict(name='开源项目',description='分享开源实践',color='#123abc',revision=self.store.category_catalog()['revision'])
        body.update(changes)
        return self.store.manage_categories(self.admin,body)

    def error(self,status,fn,*args,**kwargs):
        with self.assertRaises(ApiError) as context: fn(*args,**kwargs)
        self.assertEqual(context.exception.status,status)

    def test_added_category_accepts_topics_filters_and_survives_restart(self):
        result=self.create()
        cid=result['categories'][-1]['id']
        tid=self.store.create_topic(self.member,dict(title='An open source discussion',content='A useful contribution with context.',category=cid))['id']
        restarted=Store(self.store.path)
        self.assertEqual(restarted.listing({'category':[cid]})['topics'][0]['id'],tid)
        self.assertEqual(restarted.metadata()['categories'][-1]['topics'],1)
        self.assertEqual(restarted.category_catalog()['categories'][-1]['name'],'开源项目')

    def test_edit_keeps_id_topic_association_and_announcement_permissions(self):
        tid=self.store.create_topic(self.member,dict(title='A general topic',content='A general topic body',category='general'))['id']
        catalog=self.create(name='新的分类')
        edited=self.store.manage_categories(self.admin,dict(name='新的交流区',description='说明已更新',color='#abcdef',revision=catalog['revision']),cid='general')
        self.assertEqual(self.store.detail(tid)['topic']['category'],'general')
        self.assertEqual(Store(self.store.path).metadata()['categories'][0]['name'],'新的交流区')
        self.store.manage_categories(self.admin,dict(name='站务公告',description='',color='#aabbcc',adminOnly=False,revision=edited['revision']),cid='announcements')
        self.error(403,self.store.create_topic,self.member,dict(title='Cannot publish announcement',content='A normal member cannot post here.',category='announcements'))

    def test_reorder_is_complete_atomic_and_revision_protected(self):
        catalog=self.create()
        ids=[c['id'] for c in catalog['categories']][::-1]
        self.store.manage_categories(self.admin,dict(ids=ids,revision=catalog['revision']),reorder=True)
        self.assertEqual([c['id'] for c in self.store.metadata()['categories']],ids)
        self.error(409,self.store.manage_categories,self.admin,dict(ids=ids,revision=catalog['revision']),reorder=True)
        current=self.store.category_catalog()
        self.error(400,self.store.manage_categories,self.admin,dict(ids=ids[:-1],revision=current['revision']),reorder=True)
        self.assertEqual(self.store.category_catalog(),current)

    def test_invalid_duplicate_and_unauthorized_updates_are_rejected(self):
        self.error(403,self.store.manage_categories,self.member,{})
        self.error(400,self.create,name=' ')
        self.error(400,self.create,color='red;background:url(bad)')
        self.error(400,self.create,description='x'*181)
        self.error(409,self.create,name='社区交流')
        catalog=self.create(name='Unique')
        self.error(409,self.create,name='unique')
        self.assertEqual(self.store.category_catalog(),catalog)

    def test_additive_schema_upgrade_preserves_existing_forum_data(self):
        tid=self.store.create_topic(self.member,dict(title='An existing topic',content='Existing content before migration.',category='ai'))['id']
        with self.store.connect(True) as db:
            db.execute('DROP TABLE categories')
            db.execute('DROP TABLE category_state')
            db.execute('PRAGMA user_version=2')
        upgraded=Store(self.store.path)
        self.assertEqual(upgraded.detail(tid)['posts'][0]['content'],'Existing content before migration.')
        self.assertEqual(len(upgraded.metadata()['categories']),8)
        with upgraded.connect() as db: self.assertEqual(db.execute('PRAGMA user_version').fetchone()[0],6)


class CategoryHttpTests(unittest.TestCase):
    setUp=http.HttpFlowTest.setUp
    tearDown=http.HttpFlowTest.tearDown
    request=http.HttpFlowTest.request

    def test_admin_only_routes_and_new_public_category_flow(self):
        self.assertEqual(self.request('/admin/categories')[0],401)
        self.assertEqual(self.request('/admin/categories',actor='owner')[0],403)
        self.assertEqual(self.request('/admin/categories','POST',{},'owner')[0],403)
        catalog=self.request('/admin/categories',actor='admin')[1]['data']
        body=dict(name='分享与发现',description='A new category',color='#aabbcc',revision=catalog['revision'])
        self.assertEqual(self.request('/admin/categories','POST',body,'admin','https://evil.invalid')[0],403)
        status,result=self.request('/admin/categories','POST',body,'admin')
        self.assertEqual(status,200)
        cid=result['data']['categories'][-1]['id']
        self.assertEqual(self.request('/meta')[1]['data']['categories'][-1]['id'],cid)
        self.assertEqual(self.request('/topics','POST',dict(title='In the new category',content='A real topic in a new category.',category=cid),'owner')[0],200)
        self.assertEqual(self.request('/topics?category='+cid)[1]['data']['total'],1)
        body.update(name='更新后的分类',revision=result['data']['revision'])
        status,result=self.request('/admin/categories/'+cid,'PUT',body,'admin')
        self.assertEqual(status,200)
        ids=[c['id'] for c in result['data']['categories']][::-1]
        self.assertEqual(self.request('/admin/categories/order','PUT',dict(ids=ids,revision=result['data']['revision']),'admin')[0],200)
