import json
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from community import Application, Handler, Server, Store

class IdentityStub(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith('/api/creators/public/'):
            wid=self.path.split('/')[-1]
            valid=wid in ['public-work','other-work'] and wid not in getattr(self.server,'unpublished',set())
            self.server.public_auth_forwarded=bool(self.headers.get('Authorization'))
            raw=json.dumps({'success':valid,'data':{'work':{'id':wid,'title':'Public work','ownerId':11,'status':'published'}}}).encode()
            self.send_response(200 if valid else 404);self.end_headers();self.wfile.write(raw);return
        token=self.headers.get('Authorization','')
        uid={'Bearer fixture-owner':11,'Bearer fixture-reader':12,'Bearer fixture-admin':13}.get(token)
        valid=bool(uid) and self.headers.get('New-Api-User')==str(uid)
        body=json.dumps({'success':valid,'data':{'id':uid,'username':f'user{uid}','display_name':f'User {uid}','role':100 if uid==13 else 1,'status':1}}).encode()
        self.send_response(200 if valid else 401); self.end_headers(); self.wfile.write(body)
    def log_message(self,*args): pass

class HttpFlowTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.identity=ThreadingHTTPServer(('127.0.0.1',0),IdentityStub)
        threading.Thread(target=self.identity.serve_forever,daemon=True).start()
        self.service=Server(('127.0.0.1',0),Handler)
        self.service.application=Application(Store(Path(self.tmp.name)/'forum.db'),f'http://127.0.0.1:{self.identity.server_port}')
        threading.Thread(target=self.service.serve_forever,daemon=True).start()
        self.base=f'http://127.0.0.1:{self.service.server_port}/api/community'

    def tearDown(self):
        self.service.shutdown(); self.service.server_close()
        self.identity.shutdown(); self.identity.server_close()
        self.tmp.cleanup()

    def request(self,path,method='GET',data=None,actor=None,origin='https://skymoni.com'):
        headers={'Content-Type':'application/json','Origin':origin}
        if actor:
            headers.update({'Authorization':'Bearer fixture-'+actor,'New-Api-User':str({'owner':11,'reader':12,'admin':13}.get(actor,99))})
        try:
            response=urlopen(Request(self.base+path,data=json.dumps(data).encode() if data is not None else None,method=method,headers=headers),timeout=5)
        except HTTPError as error: response=error
        return response.status,json.load(response)

    def test_real_http_topic_reply_like_bookmark_notification_and_moderation(self):
        status,result=self.request('/topics','POST',{'title':'Integration test topic','content':'A real stored discussion body.','category':'development','tags':['Python']},'owner')
        self.assertEqual(status,200)
        tid=result['data']['id']
        self.assertEqual(self.request(f'/topics/{tid}/replies','POST',{'content':'Hello from another member'},'reader')[0],200)
        detail=self.request(f'/topics/{tid}',actor='reader')[1]['data']
        self.assertEqual(detail['topic']['replies'],1)
        pid=detail['posts'][0]['id']
        for _ in range(2): self.assertEqual(self.request(f'/posts/{pid}/like','PUT',{'liked':True},'reader')[0],200)
        self.assertEqual(self.request(f'/topics/{tid}',actor='reader')[1]['data']['posts'][0]['likes'],1)
        self.request(f'/topics/{tid}/bookmark','PUT',{'bookmarked':True},'reader')
        self.assertEqual(self.request('/topics?view=bookmarks',actor='reader')[1]['data']['total'],1)
        self.assertEqual(self.request('/topics?view=bookmarks',actor='owner')[1]['data']['total'],0)
        self.assertEqual(len(self.request('/me/notifications',actor='owner')[1]['data']),2)
        self.request(f'/posts/{pid}/report','POST',{'reason':'Please review this content'},'reader')
        self.assertEqual(len(self.request('/admin',actor='admin')[1]['data']['reports']),1)
        detail=self.request(f'/topics/{tid}',actor='admin')[1]['data']
        self.assertEqual(self.request(f'/topics/{tid}/moderation','PUT',{'closed':True,'revision':detail['topic']['revision']},'admin')[0],200)
        self.assertEqual(self.request(f'/topics/{tid}/replies','POST',{'content':'Closed reply'},'reader')[0],409)
        self.assertEqual(self.request('/meta')[1]['data']['stats']['topics'],1)

    def test_http_authentication_csrf_and_server_permissions(self):
        body={'title':'Cannot publish','content':'Not authorized at all','category':'general'}
        self.assertEqual(self.request('/topics','POST',body)[0],401)
        self.assertEqual(self.request('/topics','POST',body,'invalid')[0],401)
        self.assertEqual(self.request('/topics','POST',body,'owner','https://evil.example')[0],403)
        self.assertEqual(self.request('/admin',actor='owner')[0],403)
        self.assertEqual(self.request('/topics?view=bookmarks')[0],401)

if __name__=='__main__': unittest.main()


class WorkCommentsHttpTest(unittest.TestCase):
    setUp=HttpFlowTest.setUp
    tearDown=HttpFlowTest.tearDown
    request=HttpFlowTest.request
    def test_independent_comments_validate_real_public_work_and_identity(self):
        self.assertEqual(self.request('/works/missing-work/comments')[0],404)
        self.assertEqual(self.request('/works/public-work/comments','POST',{'content':'Anonymous'})[0],401)
        status,result=self.request('/works/public-work/comments','POST',{'content':'A persisted work comment'},'reader')
        self.assertEqual(status,200)
        cid=result['data']['id']
        self.assertFalse(self.identity.public_auth_forwarded)
        listing=self.request('/works/public-work/comments',actor='reader')[1]['data']
        self.assertEqual(listing['count'],1)
        self.assertEqual(listing['comments'][0]['content'],'A persisted work comment')
        self.assertEqual(self.request('/topics')[1]['data']['total'],0)
        revision=listing['comments'][0]['revision']
        self.assertEqual(self.request(f'/work-comments/{cid}','PUT',{'content':'Stolen edit','revision':revision},'owner')[0],403)
        self.assertEqual(self.request(f'/work-comments/{cid}/like','PUT',{'liked':True},'owner')[0],200)
        self.assertEqual(self.request('/works/public-work/comments','POST',{'content':'Cross-site comment'},'reader','https://evil.example')[0],403)
        notices=self.request('/me/notifications',actor='reader')[1]['data']
        self.assertEqual(notices[0]['workId'],'public-work')
        self.assertEqual(self.request(f'/work-comments/{cid}/report','POST',{'reason':'Please review this work comment'},'owner')[0],200)
        reports=self.request('/admin',actor='admin')[1]['data']['workReports']
        self.assertEqual(len(reports),1)
        self.assertEqual(self.request('/admin/work-reports/'+reports[0]['id'],'PUT',{},'reader')[0],403)
        self.assertEqual(self.request('/admin/work-reports/'+reports[0]['id'],'PUT',{},'admin')[0],200)
        self.identity.unpublished={'public-work'}
        self.assertEqual(self.request('/works/public-work/comments')[0],404)
        self.assertEqual(self.request(f'/work-comments/{cid}/like','PUT',{'liked':False},'owner')[0],404)
