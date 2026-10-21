"""Independent creator-work comments. Never inserts forum topics or posts."""
import time
import uuid

COMMENTS_SCHEMA = '''
CREATE TABLE IF NOT EXISTS comment_works (id TEXT PRIMARY KEY,title TEXT NOT NULL,owner_id INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS work_comments (
 id TEXT PRIMARY KEY,work_id TEXT NOT NULL REFERENCES comment_works(id),author_id INTEGER NOT NULL REFERENCES members(id),
 content TEXT NOT NULL,created INTEGER NOT NULL,edited INTEGER NOT NULL DEFAULT 0,deleted INTEGER NOT NULL DEFAULT 0,
 revision TEXT NOT NULL,reply_to TEXT REFERENCES work_comments(id));
CREATE INDEX IF NOT EXISTS work_comments_work ON work_comments(work_id,created,id);
CREATE TABLE IF NOT EXISTS work_comment_likes (
 comment_id TEXT NOT NULL REFERENCES work_comments(id),member_id INTEGER NOT NULL REFERENCES members(id),PRIMARY KEY(comment_id,member_id));
CREATE TABLE IF NOT EXISTS work_comment_reports (
 id TEXT PRIMARY KEY,comment_id TEXT NOT NULL REFERENCES work_comments(id),member_id INTEGER NOT NULL REFERENCES members(id),
 reason TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'open',created INTEGER NOT NULL,UNIQUE(comment_id,member_id));
CREATE TABLE IF NOT EXISTS work_comment_notifications (
 id TEXT PRIMARY KEY,member_id INTEGER NOT NULL REFERENCES members(id),actor_id INTEGER NOT NULL REFERENCES members(id),
 work_id TEXT NOT NULL REFERENCES comment_works(id),kind TEXT NOT NULL,created INTEGER NOT NULL,seen INTEGER NOT NULL DEFAULT 0,event TEXT NOT NULL UNIQUE);
PRAGMA user_version=2;
'''

def new_id(): return uuid.uuid4().hex

class WorkCommentsMixin:
    def comment_text(self,value,minimum=1,maximum=20000):
        if not isinstance(value,str) or not minimum<=len(value.strip())<=maximum or '\x00' in value:
            raise self.error_type(400,'请检查评论内容长度和格式')
        return value.strip()

    def sync_comment_work(self,work):
        with self.connect(True) as db:
            db.execute('INSERT INTO comment_works(id,title,owner_id) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,owner_id=excluded.owner_id',(work['id'],work['title'],work['ownerId']))

    def work_comment(self,db,cid):
        row=db.execute('SELECT * FROM work_comments WHERE id=?',(cid,)).fetchone()
        if not row: raise self.error_type(404,'评论不存在')
        return row

    def comment_work_id(self,cid):
        with self.connect() as db: return self.work_comment(db,cid)['work_id']

    def list_work_comments(self,work,actor=None,page=1):
        self.sync_comment_work(work)
        uid=actor['id'] if actor else 0
        with self.connect() as db:
            rows=db.execute('''SELECT c.*,m.name author_name,m.username author_username,m.avatar author_avatar,
            (SELECT COUNT(*) FROM work_comment_likes l WHERE l.comment_id=c.id) likes,
            EXISTS(SELECT 1 FROM work_comment_likes l WHERE l.comment_id=c.id AND l.member_id=?) liked,
            (SELECT pm.name FROM work_comments pc JOIN members pm ON pm.id=pc.author_id WHERE pc.id=c.reply_to) reply_name
            FROM work_comments c JOIN members m ON m.id=c.author_id WHERE c.work_id=? ORDER BY c.created,c.rowid LIMIT 30 OFFSET ?''',(uid,work['id'],(page-1)*30)).fetchall()
            return {'workId':work['id'],'title':work['title'],'page':page,'pageSize':30,
                    'total':db.execute('SELECT COUNT(*) FROM work_comments WHERE work_id=?',(work['id'],)).fetchone()[0],
                    'count':db.execute('SELECT COUNT(*) FROM work_comments WHERE work_id=? AND deleted=0',(work['id'],)).fetchone()[0],
                    'comments':[{'id':r['id'],'author':self.author(r),'content':'' if r['deleted'] else r['content'],
                       'createdAt':r['created'],'editedAt':r['edited'],'deleted':bool(r['deleted']),'revision':r['revision'],
                       'replyTo':r['reply_to'],'replyToName':r['reply_name'],'likes':0 if r['deleted'] else r['likes'],
                       'liked':False if r['deleted'] else bool(r['liked'])} for r in rows]}

    def notify_work(self,db,recipient,actor,work_id,kind,event):
        if recipient!=actor and db.execute('SELECT 1 FROM members WHERE id=?',(recipient,)).fetchone():
            db.execute('INSERT OR IGNORE INTO work_comment_notifications(id,member_id,actor_id,work_id,kind,created,event) VALUES(?,?,?,?,?,?,?)',(new_id(),recipient,actor,work_id,kind,int(time.time()),event))

    def add_work_comment(self,work,actor,data):
        content=self.comment_text(data.get('content'))
        parent=data.get('replyTo') or None
        self.sync_comment_work(work)
        cid,now=new_id(),int(time.time())
        with self.connect(True) as db:
            self.writable(db,actor,'reply')
            recipient=work['ownerId']
            if parent:
                row=db.execute('SELECT author_id FROM work_comments WHERE id=? AND work_id=? AND deleted=0',(parent,work['id'])).fetchone()
                if not row: raise self.error_type(400,'引用的评论不存在或不属于此作品')
                recipient=row['author_id']
            db.execute('INSERT INTO work_comments(id,work_id,author_id,content,created,revision,reply_to) VALUES(?,?,?,?,?,?,?)',(cid,work['id'],actor['id'],content,now,new_id(),parent))
            self.notify_work(db,recipient,actor['id'],work['id'],'reply','comment:'+cid)
        return {'id':cid,'workId':work['id']}

    def update_work_comment(self,cid,actor,data):
        with self.connect(True) as db:
            self.writable(db,actor,'edit')
            row=self.work_comment(db,cid)
            if row['author_id']!=actor['id'] and actor['role']!=100: raise self.error_type(403,'只能修改自己的评论')
            if row['revision']!=data.get('revision'): raise self.error_type(409,'评论已更新，请刷新后重试')
            deleted=data.get('deleted',False)
            if not isinstance(deleted,bool): raise self.error_type(400,'请检查操作参数')
            content=row['content'] if deleted else self.comment_text(data.get('content'))
            db.execute('UPDATE work_comments SET content=?,deleted=?,edited=?,revision=? WHERE id=?',(content,deleted,int(time.time()),new_id(),cid))
            db.execute('INSERT INTO audit VALUES(?,?,?,?)',(actor['id'],'edit-work-comment',cid,int(time.time())))
        return {'updated':True}

    def like_work_comment(self,cid,actor,liked):
        if not isinstance(liked,bool): raise self.error_type(400,'请检查操作参数')
        with self.connect(True) as db:
            self.writable(db,actor,'reaction')
            row=self.work_comment(db,cid)
            if row['deleted']: raise self.error_type(404,'评论已删除')
            if row['author_id']==actor['id']: raise self.error_type(400,'不能给自己的评论点赞')
            if liked:
                db.execute('INSERT OR IGNORE INTO work_comment_likes VALUES(?,?)',(cid,actor['id']))
                self.notify_work(db,row['author_id'],actor['id'],row['work_id'],'like','comment-like:'+cid+':'+str(actor['id']))
            else: db.execute('DELETE FROM work_comment_likes WHERE comment_id=? AND member_id=?',(cid,actor['id']))
        return {'updated':True}

    def report_work_comment(self,cid,actor,data):
        reason=self.comment_text(data.get('reason'),3,1000)
        with self.connect(True) as db:
            self.writable(db,actor,'report')
            row=self.work_comment(db,cid)
            if row['deleted']: raise self.error_type(404,'评论已删除')
            db.execute('INSERT OR IGNORE INTO work_comment_reports(id,comment_id,member_id,reason,created) VALUES(?,?,?,?,?)',(new_id(),cid,actor['id'],reason,int(time.time())))
        return {'submitted':True}

    def work_comment_reports(self,actor):
        if actor['role']!=100: raise self.error_type(403,'需要管理员权限')
        with self.connect() as db:
            rows=db.execute('''SELECT r.*,c.work_id,c.content,c.revision,c.deleted,w.title,m.name FROM work_comment_reports r
            JOIN work_comments c ON c.id=r.comment_id JOIN comment_works w ON w.id=c.work_id JOIN members m ON m.id=r.member_id ORDER BY r.created DESC LIMIT 100''').fetchall()
            return [{'id':r['id'],'commentId':r['comment_id'],'workId':r['work_id'],'title':r['title'],'reporter':r['name'],
                     'reason':r['reason'],'state':r['state'],'content':r['content'][:1000],'revision':r['revision'],'deleted':bool(r['deleted'])} for r in rows]

    def resolve_work_comment_report(self,rid,actor,data):
        if actor['role']!=100: raise self.error_type(403,'需要管理员权限')
        with self.connect(True) as db:
            report=db.execute('SELECT * FROM work_comment_reports WHERE id=?',(rid,)).fetchone()
            if not report: raise self.error_type(404,'举报不存在')
            remove=data.get('remove',False)
            if not isinstance(remove,bool): raise self.error_type(400,'请检查操作参数')
            if remove:
                row=self.work_comment(db,report['comment_id'])
                if row['revision']!=data.get('revision'): raise self.error_type(409,'评论已更新，请刷新后重试')
                db.execute('UPDATE work_comments SET deleted=1,edited=?,revision=? WHERE id=?',(int(time.time()),new_id(),row['id']))
            db.execute("UPDATE work_comment_reports SET state='resolved' WHERE id=?",(rid,))
            db.execute('INSERT INTO audit VALUES(?,?,?,?)',(actor['id'],'resolve-work-report',rid,int(time.time())))
        return {'updated':True}

    def work_comment_notifications(self,actor):
        with self.connect() as db:
            rows=db.execute('''SELECT n.*,w.title,m.name FROM work_comment_notifications n JOIN comment_works w ON w.id=n.work_id
             JOIN members m ON m.id=n.actor_id WHERE n.member_id=? ORDER BY n.created DESC,n.rowid DESC LIMIT 60''',(actor['id'],)).fetchall()
            return [{'id':r['id'],'topicId':'','workId':r['work_id'],'title':r['title'],'actor':self.profiles.get(r['actor_id'],dict(name=r['name']))['name'],'kind':r['kind'],
                     'read':bool(r['seen']),'createdAt':r['created']} for r in rows]
