import tempfile
import unittest
from pathlib import Path
from community import Store,ApiError

class WorkCommentTest(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.db=Path(self.tmp.name)/'test.db';self.store=Store(self.db)
  self.owner={'id':11,'username':'owner','name':'Owner','avatar':'','role':1}
  self.reader={'id':12,'username':'reader','name':'Reader','avatar':'','role':1}
  self.admin={'id':13,'username':'admin','name':'Admin','avatar':'','role':100}
  for actor in [self.owner,self.reader,self.admin]:self.store.sync_member(actor)
  self.work={'id':'work-one','title':'A real work','ownerId':11}
 def tearDown(self):self.tmp.cleanup()
 def error(self,status,fn,*args):
  with self.assertRaises(ApiError) as context:fn(*args)
  self.assertEqual(context.exception.status,status)
 def test_comments_persist_without_creating_topics_or_changing_forum_stats(self):
  before=self.store.metadata()['stats']
  cid=self.store.add_work_comment(self.work,self.reader,{'content':'A real work comment'})['id']
  listing=Store(self.db).list_work_comments(self.work,self.reader)
  self.assertEqual(listing['count'],1);self.assertEqual(listing['comments'][0]['id'],cid)
  self.assertEqual(self.store.listing({})['topics'],[])
  self.assertEqual(self.store.metadata()['stats'],before)
 def test_replies_must_target_comments_in_the_same_work(self):
  cid=self.store.add_work_comment(self.work,self.reader,{'content':'A comment'})['id']
  other={'id':'work-two','title':'Other work','ownerId':11}
  self.error(400,self.store.add_work_comment,other,self.owner,{'content':'Wrong work','replyTo':cid})
  self.store.add_work_comment(self.work,self.owner,{'content':'A valid reply','replyTo':cid})
  self.assertEqual(self.store.list_work_comments(self.work)['comments'][1]['replyToName'],'Reader')
 def test_edit_delete_ownership_and_revision_conflicts(self):
  cid=self.store.add_work_comment(self.work,self.reader,{'content':'Comment body'})['id']
  row=self.store.list_work_comments(self.work)['comments'][0]
  data={'content':'Updated comment','revision':row['revision']}
  self.error(403,self.store.update_work_comment,cid,self.owner,data)
  self.store.update_work_comment(cid,self.reader,data)
  self.error(409,self.store.update_work_comment,cid,self.reader,data)
  row=self.store.list_work_comments(self.work)['comments'][0]
  self.store.update_work_comment(cid,self.reader,{'deleted':True,'revision':row['revision']})
  result=self.store.list_work_comments(self.work)
  self.assertEqual(result['count'],0);self.assertEqual(result['total'],1);self.assertEqual(result['comments'][0]['content'],'')
 def test_likes_are_unique_and_notifications_keep_work_target(self):
  cid=self.store.add_work_comment(self.work,self.reader,{'content':'Comment body'})['id']
  for _ in range(2):self.store.like_work_comment(cid,self.owner,True)
  self.assertEqual(self.store.list_work_comments(self.work,self.owner)['comments'][0]['likes'],1)
  notice=self.store.notifications(self.reader)[0]
  self.assertEqual(notice['workId'],'work-one');self.assertEqual(notice['topicId'],'')
  self.store.mark_read(self.reader);self.assertTrue(self.store.notifications(self.reader)[0]['read'])
 def test_reports_are_separate_and_administrator_can_remove_comment(self):
  cid=self.store.add_work_comment(self.work,self.reader,{'content':'Comment body'})['id']
  self.store.report_work_comment(cid,self.owner,{'reason':'Please review this comment'})
  self.error(403,self.store.work_comment_reports,self.reader)
  report=self.store.admin(self.admin)['workReports'][0]
  self.assertEqual(self.store.admin(self.admin)['reports'],[])
  self.error(403,self.store.resolve_work_comment_report,report['id'],self.owner,{})
  self.error(409,self.store.resolve_work_comment_report,report['id'],self.admin,{'remove':True,'revision':'old'})
  self.store.resolve_work_comment_report(report['id'],self.admin,{'remove':True,'revision':report['revision']})
  self.assertTrue(self.store.list_work_comments(self.work)['comments'][0]['deleted'])
 def test_additive_migration_preserves_existing_forum_content(self):
  tid=self.store.create_topic(self.owner,{'title':'Existing topic','content':'Existing discussion content','category':'general'})['id']
  with self.store.connect(True) as db:db.execute('PRAGMA user_version=1')
  upgraded=Store(self.db)
  self.assertEqual(upgraded.detail(tid)['topic']['title'],'Existing topic')
  with upgraded.connect() as db:self.assertEqual(db.execute('PRAGMA user_version').fetchone()[0],6)

class WorkCommentPaginationTest(unittest.TestCase):
 setUp=WorkCommentTest.setUp
 tearDown=WorkCommentTest.tearDown
 def test_comment_pages_are_scoped_to_the_work_and_keep_deleted_positions(self):
  for i in range(31):
   with self.store.connect(True) as db:db.execute('DELETE FROM events')
   self.store.add_work_comment(self.work,self.reader,{'content':f'Comment number {i}'})
  first=self.store.list_work_comments(self.work,page=1);last=self.store.list_work_comments(self.work,page=2)
  self.assertEqual(first['total'],31);self.assertEqual(len(first['comments']),30);self.assertEqual(len(last['comments']),1)
  self.assertEqual(last['comments'][0]['content'],'Comment number 30')

if __name__=='__main__':unittest.main()
