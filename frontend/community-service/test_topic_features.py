import base64
import json
import tempfile
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request,urlopen

from community import Store,ApiError
import test_http_flow as http

PNG=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==')


class TopicFeatureTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.store=Store(Path(self.tmp.name)/'community.db')
        self.owner=dict(id=1,username='owner',name='Owner',avatar='',role=1)
        self.reader=dict(id=2,username='reader',name='Reader',avatar='',role=1)
        self.admin=dict(id=3,username='admin',name='Admin',avatar='',role=100)
        for actor in [self.owner,self.reader,self.admin]:self.store.sync_member(actor)

    def tearDown(self):self.tmp.cleanup()

    def error(self,status,fn,*args):
        with self.assertRaises(ApiError) as raised:fn(*args)
        self.assertEqual(raised.exception.status,status)

    def create(self,**values):
        data=dict(title='A useful uploaded discussion',content='Original discussion body.',category='general')
        data.update(values)
        return self.store.create_topic(self.owner,data)['id']

    def upload(self,name='图片.png',content=PNG,actor=None):
        return self.store.add_upload(actor or self.owner,dict(name=name,content=base64.b64encode(content).decode()))

    def test_trash_is_private_recoverable_and_revision_protected(self):
        tid=self.create()
        self.store.reply(tid,self.reader,dict(content='A retained reply'))
        topic=self.store.detail(tid)['topic']
        self.error(403,self.store.trash_topic,tid,self.reader,dict(deleted=True,revision=topic['revision']))
        self.store.trash_topic(tid,self.owner,dict(deleted=True,revision=topic['revision']))
        self.error(409,self.store.trash_topic,tid,self.owner,dict(deleted=False,revision=topic['revision']))
        self.assertEqual(self.store.listing({})['total'],0)
        self.assertEqual(self.store.metadata()['stats']['topics'],0)
        self.assertEqual(self.store.member_profile(1)['topics'],[])
        self.error(404,self.store.detail,tid)
        self.error(404,self.store.detail,tid,self.reader)
        self.error(404,self.store.reply,tid,self.owner,dict(content='Not while deleted'))
        self.assertEqual(self.store.listing({'view':['trash']},self.owner)['total'],1)
        self.assertEqual(self.store.listing({'view':['trash']},self.reader)['total'],0)
        self.error(401,self.store.listing,{'view':['trash']})
        private=self.store.detail(tid,self.owner)
        self.assertTrue(private['topic']['deleted'])
        self.store.trash_topic(tid,self.admin,dict(deleted=False,revision=private['topic']['revision']))
        self.assertEqual(self.store.detail(tid)['posts'][1]['content'],'A retained reply')
        self.assertEqual(self.store.listing({})['total'],1)

    def test_public_uploads_and_references_survive_restart_and_follow_topic_visibility(self):
        image=self.upload()
        attachment=self.upload('article.html',b'<h1>download only</h1><script>bad()</script>')
        tid=self.create(content='An image: ![x]('+image['url']+')',attachments=[attachment['id']],contentFormat='markdown')
        restarted=Store(self.store.path)
        self.assertEqual(len(restarted.detail(tid)['attachments']),2)
        self.assertEqual(restarted.read_upload(image['id']).path.read_bytes(),PNG)
        self.assertFalse(restarted.read_upload(attachment['id']).image)
        topic=restarted.detail(tid)['topic']
        restarted.trash_topic(tid,self.owner,dict(deleted=True,revision=topic['revision']))
        self.error(404,restarted.read_upload,image['id'])
        self.error(404,restarted.read_upload,attachment['id'])
        deleted=restarted.detail(tid,self.owner)['topic']
        restarted.trash_topic(tid,self.owner,dict(deleted=False,revision=deleted['revision']))
        self.assertEqual(restarted.read_upload(image['id']).mime,'image/png')

    def test_attachments_are_authorized_and_detached_files_do_not_become_public_again(self):
        image=self.upload()
        self.error(403,self.store.create_topic,self.reader,dict(title='Cannot steal an upload',content='A different owner owns this upload.',category='general',attachments=[image['id']]))
        tid=self.create(attachments=[image['id']])
        topic=self.store.detail(tid)['topic']
        self.store.edit_topic(tid,self.owner,dict(title=topic['title'],content='Content without attachment.',category='general',revision=topic['revision'],attachments=[]))
        self.error(404,self.store.read_upload,image['id'])

    def test_format_is_persisted_and_old_clients_preserve_it_when_editing(self):
        tid=self.create(content='<h1>HTML title</h1><p>Hello</p>',contentFormat='html')
        topic=self.store.detail(tid)['topic']
        self.assertEqual(self.store.detail(tid)['posts'][0]['contentFormat'],'html')
        self.store.edit_topic(tid,self.owner,dict(title=topic['title'],content='<p>Updated HTML</p>',category='general',revision=topic['revision']))
        self.assertEqual(Store(self.store.path).detail(tid)['topic']['contentFormat'],'html')
        self.error(400,self.store.create_topic,self.owner,dict(title='Unknown format topic',content='A useful content body',category='general',contentFormat='executable'))

    def test_file_validation_and_storage_limits(self):
        self.error(400,self.store.add_upload,self.owner,dict(name='../bad.html',content='eA=='))
        self.error(400,self.store.add_upload,self.owner,dict(name='bad.png',content=base64.b64encode(b'<script>bad</script>').decode()))
        self.error(400,self.store.add_upload,self.owner,dict(name='bad.txt',content='@@@'))
        self.error(413,self.store.add_upload,self.owner,dict(name='empty.txt',content=''))
        image=self.upload()
        with self.store.connect(True) as db:db.execute('UPDATE uploads SET size=? WHERE id=?',(50*1024*1024,image['id']))
        self.error(413,self.upload)


class TopicFeaturesHttpTests(unittest.TestCase):
    setUp=http.HttpFlowTest.setUp
    tearDown=http.HttpFlowTest.tearDown
    request=http.HttpFlowTest.request

    def test_upload_format_save_asset_headers_trash_and_restore(self):
        data=dict(name='image.png',content=base64.b64encode(PNG).decode())
        self.assertEqual(self.request('/uploads','POST',data)[0],401)
        self.assertEqual(self.request('/uploads','POST',data,'owner','https://evil.invalid')[0],403)
        status,result=self.request('/uploads','POST',data,'owner')
        self.assertEqual(status,200)
        image=result['data']
        _,result=self.request('/topics','POST',dict(title='Real uploaded image topic',category='general',content='<h1>HTML</h1><img src="'+image['url']+'">',contentFormat='html',attachments=[image['id']]),'owner')
        tid=result['data']['id']
        path=self.base+'/uploads/'+image['id']
        with urlopen(path) as response:
            self.assertEqual(response.read(),PNG)
            self.assertEqual(response.headers['Content-Type'],'image/png')
            self.assertEqual(response.headers['X-Content-Type-Options'],'nosniff')
        _,result=self.request('/uploads','POST',dict(name='page.html',content=base64.b64encode(b'<script>never execute</script>').decode()),'owner')
        with urlopen(self.base+'/uploads/'+result['data']['id']) as response:
            self.assertTrue(response.headers['Content-Disposition'].startswith('attachment'))
            self.assertEqual(response.headers['Content-Type'],'application/octet-stream')
            self.assertIn('sandbox',response.headers['Content-Security-Policy'])
        topic=self.request('/topics/'+tid)[1]['data']['topic']
        self.assertEqual(topic['contentFormat'],'html')
        self.assertEqual(self.request('/topics/'+tid+'/trash','PUT',dict(deleted=True,revision=topic['revision']),'reader')[0],403)
        self.assertEqual(self.request('/topics/'+tid+'/trash','PUT',dict(deleted=True,revision=topic['revision']),'owner')[0],200)
        self.assertEqual(self.request('/topics/'+tid)[0],404)
        try:
            urlopen(path)
            self.fail('Deleted topic asset remained public')
        except HTTPError as error:self.assertEqual(error.code,404)
        private=self.request('/topics/'+tid,actor='owner')[1]['data']['topic']
        self.assertEqual(self.request('/topics/'+tid+'/trash','PUT',dict(deleted=False,revision=private['revision']),'owner')[0],200)
        self.assertEqual(self.request('/topics/'+tid)[0],200)
