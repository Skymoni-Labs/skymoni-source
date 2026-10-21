import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from community import ApiError, Application, Store


class CommunityTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.store=Store(Path(self.tmp.name)/'community.db')
        self.owner={'id':1,'username':'maker','name':'Maker','avatar':'','role':1}
        self.member={'id':2,'username':'reader','name':'Reader','avatar':'','role':1}
        self.admin={'id':3,'username':'admin','name':'Admin','avatar':'','role':100}
        for actor in [self.owner,self.member,self.admin]: self.store.sync_member(actor)

    def tearDown(self): self.tmp.cleanup()

    def topic(self,category='general'):
        return self.store.create_topic(self.owner,{'title':'A useful discussion','content':'A real topic body with enough content.','category':category,'tags':['Python']})['id']

    def error(self,status,fn,*args):
        with self.assertRaises(ApiError) as raised: fn(*args)
        self.assertEqual(raised.exception.status,status)

    def test_topic_reply_and_counts_survive_database_restart(self):
        tid=self.topic()
        self.store.reply(tid,self.member,{'content':'Useful reply'})
        restarted=Store(self.store.path)
        detail=restarted.detail(tid,self.owner)
        self.assertEqual(detail['topic']['replies'],1)
        self.assertEqual([p['content'] for p in detail['posts']],['A real topic body with enough content.','Useful reply'])

    def test_likes_and_bookmarks_are_idempotent_and_private(self):
        tid=self.topic()
        pid=self.store.detail(tid)['posts'][0]['id']
        for _ in range(2): self.store.reaction('like',pid,self.member,True)
        for _ in range(2): self.store.reaction('bookmark',tid,self.member,True)
        self.assertEqual(self.store.detail(tid,self.member)['posts'][0]['likes'],1)
        self.assertTrue(self.store.detail(tid,self.member)['topic']['bookmarked'])
        self.assertFalse(self.store.detail(tid,self.owner)['topic']['bookmarked'])
        self.assertEqual(self.store.listing({'view':['bookmarks']},self.member)['total'],1)
        self.assertEqual(self.store.listing({'view':['bookmarks']},self.owner)['total'],0)
        self.store.reaction('like',pid,self.member,False)
        self.assertEqual(self.store.detail(tid)['posts'][0]['likes'],0)

    def test_authorization_prevents_editing_another_members_post_and_stale_edit(self):
        tid=self.topic()
        post=self.store.detail(tid)['posts'][0]
        edit={'content':'Edited content','revision':post['revision']}
        self.error(403,self.store.update_post,post['id'],self.member,edit)
        self.store.update_post(post['id'],self.owner,edit)
        self.error(409,self.store.update_post,post['id'],self.owner,edit)
        self.error(400,self.store.update_post,post['id'],self.owner,{'deleted':True,'revision':self.store.detail(tid)['posts'][0]['revision']})

    def test_admin_can_close_hide_and_restore_without_deleting_content(self):
        tid=self.topic()
        topic=self.store.detail(tid)['topic']
        self.error(403,self.store.moderation,self.member,tid,{'closed':True,'revision':topic['revision']})
        self.store.moderation(self.admin,tid,{'closed':True,'revision':topic['revision']})
        self.error(409,self.store.reply,tid,self.member,{'content':'Late reply'})
        topic=self.store.detail(tid)['topic']
        self.store.moderation(self.admin,tid,{'hidden':True,'revision':topic['revision']})
        self.error(404,self.store.detail,tid,self.owner)
        self.assertEqual(self.store.listing({})['total'],0)
        topic=self.store.detail(tid,self.admin)['topic']
        self.store.moderation(self.admin,tid,{'hidden':False,'closed':False,'revision':topic['revision']})
        self.assertEqual(self.store.detail(tid)['posts'][0]['content'],'A real topic body with enough content.')

    def test_reply_reference_cannot_target_another_topic(self):
        first,second=self.topic(),self.topic()
        pid=self.store.detail(first)['posts'][0]['id']
        self.error(400,self.store.reply,second,self.member,{'content':'cross-topic reply','replyTo':pid})

    def test_notifications_are_recipient_scoped_and_mark_read(self):
        tid=self.topic()
        self.store.reply(tid,self.member,{'content':'A reply for the author'})
        self.assertEqual(len(self.store.notifications(self.owner)),1)
        self.assertEqual(self.store.notifications(self.member),[])
        self.store.mark_read(self.member)
        self.assertFalse(self.store.notifications(self.owner)[0]['read'])
        self.store.mark_read(self.owner)
        self.assertTrue(self.store.notifications(self.owner)[0]['read'])

    def test_reports_are_admin_only_and_resolved(self):
        tid=self.topic()
        pid=self.store.detail(tid)['posts'][0]['id']
        self.store.report(pid,self.member,{'reason':'This needs review'})
        self.error(403,self.store.admin,self.member)
        report=self.store.admin(self.admin)['reports'][0]
        self.store.resolve_report(self.admin,report['id'])
        self.assertEqual(self.store.admin(self.admin)['reports'][0]['state'],'resolved')

    def test_repeated_views_same_day_do_not_inflate_views(self):
        tid=self.topic()
        for _ in range(5): self.store.detail(tid,fingerprint='one-reader')
        self.store.detail(tid,fingerprint='second-reader')
        self.assertEqual(self.store.detail(tid)['topic']['views'],2)

    def test_search_and_category_filters_use_real_posts_and_bound_parameters(self):
        tid=self.topic('development')
        self.assertEqual(self.store.listing({'q':['enough content']})['topics'][0]['id'],tid)
        self.assertEqual(self.store.listing({'category':['ai']})['total'],0)
        self.assertEqual(self.store.listing({'q':["' OR 1=1 --"]})['total'],0)

    def test_anonymous_identity_cannot_be_forged_with_user_id_or_cookie(self):
        app=Application(self.store)
        self.error(401,app.authenticate,{'New-Api-User':'3','Cookie':'session=fake'},True)
        self.error(403,app.dispatch,'POST','/api/community/topics',{'Origin':'https://evil.example','Content-Type':'application/json'},{},'test')

    def test_authentication_failure_cannot_downgrade_into_anonymous_or_admin(self):
        app=Application(self.store)
        with patch.object(app.opener,'open',side_effect=OSError('network unavailable')):
            self.error(503,app.authenticate,{'Authorization':'Bearer invalid','New-Api-User':'3'},True)

    def test_announcement_category_and_reaction_types_enforced_on_server(self):
        self.error(403,self.topic,'announcements')
        tid=self.topic()
        self.error(400,self.store.reaction,'bookmark',tid,self.member,'true')
        self.error(401,self.store.listing,{'view':['bookmarks']})

    def test_rate_limits_and_failed_actions_are_transactional(self):
        for _ in range(5): self.topic()
        self.error(429,self.topic)
        self.assertEqual(self.store.listing({})['total'],5)

    def test_sqlite_startup_is_idempotent_and_preserves_existing_data(self):
        tid=self.topic()
        Store(self.store.path)
        Store(self.store.path)
        self.assertEqual(self.store.detail(tid)['topic']['title'],'A useful discussion')

    def test_edit_topic_updates_title_body_and_checks_owner_and_revision(self):
        tid=self.topic()
        revision=self.store.detail(tid)['topic']['revision']
        data={'title':'Updated title','category':'ai','tags':['Models'],'content':'The updated topic body.','revision':revision}
        self.error(403,self.store.edit_topic,tid,self.member,data)
        self.store.edit_topic(tid,self.owner,data)
        detail=self.store.detail(tid)
        self.assertEqual(detail['topic']['title'],'Updated title')
        self.assertEqual(detail['posts'][0]['content'],'The updated topic body.')
        self.error(409,self.store.edit_topic,tid,self.owner,data)

    def test_topic_reply_pages_are_bounded_and_keep_total_count(self):
        tid=self.topic()
        with self.store.connect(True) as db:
            for index in range(105):
                db.execute('INSERT INTO posts(id,topic_id,author_id,content,created,revision) VALUES(?,?,?,?,?,?)',(f'post{index}',tid,2,f'Reply {index}',2000000000+index,f'revision{index}'))
        first=self.store.detail(tid,page=1)
        second=self.store.detail(tid,page=2)
        self.assertEqual(first['totalPosts'],106)
        self.assertEqual(len(first['posts']),100)
        self.assertEqual(len(second['posts']),6)
        self.assertEqual(first['posts'][0]['content'],'A real topic body with enough content.')


if __name__=='__main__': unittest.main()
