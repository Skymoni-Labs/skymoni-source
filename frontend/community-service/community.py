"""skymoni Community. Python 3.11+, standard library only.

Identity is verified by the existing relay on every authenticated request.
Community content lives in its own SQLite database; relay data is never changed.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import re
import secrets
import sqlite3
import threading
import time
import uuid

from work_comments import COMMENTS_SCHEMA, WorkCommentsMixin
from categories import CategoriesMixin
from navigation import NavigationMixin
from account_profiles import AccountProfiles, setting_avatar
from topic_features import TopicFeaturesMixin, UploadAsset
from urllib.parse import quote
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlsplit
from urllib.request import Request, build_opener, ProxyHandler, HTTPRedirectHandler

CATEGORIES = [
    {"id": "general", "name": "社区交流", "color": "#12a89d", "description": "日常交流、想法分享与新朋友报到"},
    {"id": "development", "name": "开发调优", "color": "#eeb83c", "description": "编程、开源项目与技术实践"},
    {"id": "ai", "name": "人工智能", "color": "#9b72cf", "description": "模型、提示词、AI 应用与工作流"},
    {"id": "showcase", "name": "创作交流", "color": "#ed7669", "description": "讨论创作经验、产品与设计"},
    {"id": "resources", "name": "资源荟萃", "color": "#4a9ed7", "description": "实用工具、学习资料与经验整理"},
    {"id": "help", "name": "求助问答", "color": "#74b05c", "description": "提出具体问题，一起寻找答案"},
    {"id": "feedback", "name": "运营反馈", "color": "#da8a55", "description": "社区建议、问题反馈与使用交流"},
    {"id": "announcements", "name": "社区公告", "color": "#d55461", "description": "由社区管理员发布的重要消息", "adminOnly": True},
]


class ApiError(Exception):
    def __init__(self, status: int, message: str):
        self.status, self.message = status, message


def identifier() -> str:
    return uuid.uuid4().hex


def text(value, minimum=0, maximum=40000):
    if not isinstance(value, str) or not minimum <= len(value.strip()) <= maximum or "\x00" in value:
        raise ApiError(400, "请检查内容长度和格式")
    return value.strip()


def boolean(value):
    if not isinstance(value, bool):
        raise ApiError(400, "请检查操作参数")
    return value


class Store(NavigationMixin, TopicFeaturesMixin, CategoriesMixin, WorkCommentsMixin):
    error_type = ApiError
    def __init__(self, path: str | Path):
        self.path = str(path)
        self.profiles = AccountProfiles(Path(path).parent / "account-profiles.json")
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.executescript("""
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS members (
                    id INTEGER PRIMARY KEY, username TEXT NOT NULL, name TEXT NOT NULL,
                    avatar TEXT NOT NULL DEFAULT '', role INTEGER NOT NULL DEFAULT 1,
                    seen INTEGER NOT NULL, suspended INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS topics (
                    id TEXT PRIMARY KEY, title TEXT NOT NULL, category TEXT NOT NULL,
                    tags TEXT NOT NULL, author_id INTEGER NOT NULL REFERENCES members(id),
                    created INTEGER NOT NULL, updated INTEGER NOT NULL,
                    pinned INTEGER NOT NULL DEFAULT 0, closed INTEGER NOT NULL DEFAULT 0,
                    hidden INTEGER NOT NULL DEFAULT 0, revision TEXT NOT NULL,
                    views INTEGER NOT NULL DEFAULT 0, work_id TEXT NOT NULL DEFAULT ''
                );
                CREATE TABLE IF NOT EXISTS posts (
                    id TEXT PRIMARY KEY, topic_id TEXT NOT NULL REFERENCES topics(id),
                    author_id INTEGER NOT NULL REFERENCES members(id), content TEXT NOT NULL,
                    created INTEGER NOT NULL, edited INTEGER NOT NULL DEFAULT 0,
                    deleted INTEGER NOT NULL DEFAULT 0, revision TEXT NOT NULL,
                    reply_to TEXT REFERENCES posts(id)
                );
                CREATE INDEX IF NOT EXISTS posts_topic ON posts(topic_id, created, id);
                CREATE INDEX IF NOT EXISTS topics_updated ON topics(hidden, pinned, updated);
                CREATE TABLE IF NOT EXISTS likes (
                    post_id TEXT NOT NULL REFERENCES posts(id), member_id INTEGER NOT NULL REFERENCES members(id),
                    PRIMARY KEY(post_id, member_id)
                );
                CREATE TABLE IF NOT EXISTS bookmarks (
                    topic_id TEXT NOT NULL REFERENCES topics(id), member_id INTEGER NOT NULL REFERENCES members(id),
                    PRIMARY KEY(topic_id, member_id)
                );
                CREATE TABLE IF NOT EXISTS views (
                    topic_id TEXT NOT NULL REFERENCES topics(id), fingerprint TEXT NOT NULL,
                    day INTEGER NOT NULL, PRIMARY KEY(topic_id, fingerprint, day)
                );
                CREATE TABLE IF NOT EXISTS notifications (
                    id TEXT PRIMARY KEY, member_id INTEGER NOT NULL REFERENCES members(id),
                    actor_id INTEGER NOT NULL REFERENCES members(id), topic_id TEXT NOT NULL REFERENCES topics(id),
                    kind TEXT NOT NULL, created INTEGER NOT NULL, seen INTEGER NOT NULL DEFAULT 0,
                    event TEXT NOT NULL UNIQUE
                );
                CREATE INDEX IF NOT EXISTS notification_member ON notifications(member_id, created);
                CREATE TABLE IF NOT EXISTS reports (
                    id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES posts(id),
                    member_id INTEGER NOT NULL REFERENCES members(id), reason TEXT NOT NULL,
                    state TEXT NOT NULL DEFAULT 'open', created INTEGER NOT NULL,
                    UNIQUE(post_id, member_id)
                );
                CREATE TABLE IF NOT EXISTS events (member_id INTEGER NOT NULL, action TEXT NOT NULL, created INTEGER NOT NULL);
                CREATE INDEX IF NOT EXISTS event_rate ON events(member_id, action, created);
                CREATE TABLE IF NOT EXISTS audit (actor_id INTEGER NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL, created INTEGER NOT NULL);

            """)
            db.executescript(COMMENTS_SCHEMA)
        self.init_categories(CATEGORIES)
        self.init_topic_features()
        self.init_navigation()

    @contextmanager
    def connect(self, write=False):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        db.execute("PRAGMA busy_timeout=10000")
        try:
            if write:
                db.execute("BEGIN IMMEDIATE")
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def sync_member(self, actor):
        self.profiles.remember(actor)
        with self.connect(True) as db:
            db.execute("""INSERT INTO members(id,username,name,avatar,role,seen) VALUES(?,?,?,?,?,?)
                ON CONFLICT(id) DO UPDATE SET username=excluded.username,name=excluded.name,
                avatar=excluded.avatar,role=excluded.role,seen=excluded.seen""",
                (actor['id'], actor['username'], actor['name'], actor['avatar'], actor['role'], int(time.time())))

    def writable(self, db, actor, action):
        member = db.execute("SELECT suspended FROM members WHERE id=?", (actor['id'],)).fetchone()
        if not member or member['suspended']:
            raise ApiError(403, "此账号暂时无法在社区发布内容")
        limits = {"topic": (5, 600), "reply": (25, 600), "reaction": (60, 60), "edit": (30, 60), "report": (10, 600), "upload": (20, 600)}
        count, window = limits[action]
        now = int(time.time())
        if db.execute("SELECT COUNT(*) FROM events WHERE member_id=? AND action=? AND created>?", (actor['id'], action, now-window)).fetchone()[0] >= count:
            raise ApiError(429, "操作太频繁，请稍后再试")
        db.execute("DELETE FROM events WHERE created<?", (now-86400,))
        db.execute("INSERT INTO events VALUES(?,?,?)", (actor['id'], action, now))

    @staticmethod
    def topic(db, topic_id, actor=None, allow_deleted=False):
        item = db.execute("SELECT * FROM topics WHERE id=?", (topic_id,)).fetchone()
        if not item or (item['hidden'] and (not actor or actor['role'] != 100)):
            raise ApiError(404, "话题不存在或暂未公开")
        if item['deleted'] and (not allow_deleted or not actor or (actor['id']!=item['author_id'] and actor['role']!=100)):
            raise ApiError(404,'话题已删除或不存在')
        return item

    def author(self, row):
        return self.profiles.get(row['author_id'], {"name": row['author_name'], "username": row['author_username'], "avatar": row['author_avatar']})

    def topic_data(self, db, row, uid=0):
        tid = row['id']
        author = db.execute("SELECT name,username,avatar FROM members WHERE id=?", (row['author_id'],)).fetchone()
        posts = db.execute("SELECT COUNT(*) FROM posts WHERE topic_id=? AND deleted=0", (tid,)).fetchone()[0]
        return {"id": tid, "title": row['title'], "category": row['category'], "tags": json.loads(row['tags']),
                "author": self.profiles.get(row['author_id'], dict(author)),
                "createdAt": row['created'], "updatedAt": row['updated'], "pinned": bool(row['pinned']),
                "closed": bool(row['closed']), "hidden": bool(row['hidden']), "deleted": bool(row['deleted']), "contentFormat": row['content_format'], "revision": row['revision'],
                "views": row['views'], "replies": max(0, posts-1), "workId": row['work_id'],
                "likes": db.execute("SELECT COUNT(*) FROM likes l JOIN posts p ON p.id=l.post_id WHERE p.topic_id=? AND p.deleted=0", (tid,)).fetchone()[0],
                "bookmarked": bool(db.execute("SELECT 1 FROM bookmarks WHERE topic_id=? AND member_id=?", (tid, uid)).fetchone())}

    def metadata(self):
        with self.connect() as db:
            counts = dict(db.execute("SELECT category,COUNT(*) FROM topics WHERE hidden=0 AND deleted=0 GROUP BY category").fetchall())
            return {"navigation": self.public_navigation(db), "categories": [{**c, "topics": counts.get(c['id'], 0)} for c in self.category_rows(db)],
                    "stats": {"topics": sum(counts.values()), "replies": max(0, db.execute("SELECT COUNT(*) FROM posts p JOIN topics t ON t.id=p.topic_id WHERE t.hidden=0 AND t.deleted=0 AND p.deleted=0").fetchone()[0]-sum(counts.values())),
                              "members": db.execute("SELECT COUNT(*) FROM members").fetchone()[0]}}

    def member_profile(self,uid):
        with self.connect() as db:
            member=db.execute('SELECT id,name,username,role FROM members WHERE id=?',(uid,)).fetchone()
            if not member:
                raise ApiError(404,'成员尚未加入社区')
            rows=db.execute('SELECT * FROM topics WHERE author_id=? AND hidden=0 AND deleted=0 ORDER BY created DESC LIMIT 30',(uid,)).fetchall()
            replies=db.execute('SELECT COUNT(*) FROM posts p JOIN topics t ON t.id=p.topic_id WHERE p.author_id=? AND t.hidden=0 AND t.deleted=0 AND p.deleted=0 AND p.author_id<>t.author_id',(uid,)).fetchone()[0]
            return {'member':{**dict(member), **self.profiles.get(uid, dict(member))},'topics':[self.topic_data(db,row) for row in rows],'replies':replies}

    def listing(self, query, actor=None):
        uid = actor['id'] if actor else 0
        category = query.get('category', [''])[0]
        term = text(query.get('q', [''])[0], 0, 120)
        view = query.get('view', ['latest'])[0]
        try:
            page = max(1, min(10000, int(query.get('page', ['1'])[0])))
        except ValueError:
            raise ApiError(400, "页码无效")
        if view=='trash' and not actor: raise ApiError(401,'请先登录')
        clauses, args = (["t.deleted=1"], []) if view=='trash' else (["t.hidden=0","t.deleted=0"], [])
        if view=='trash' and actor['role']!=100:
            clauses.append('t.author_id=?');args.append(uid)
        if category:
            with self.connect() as db:
                if not isinstance(category,str) or not db.execute('SELECT 1 FROM categories WHERE id=?',(category,)).fetchone():
                    raise ApiError(400, "分类不存在")
            clauses.append("t.category=?")
            args.append(category)
        if term:
            clauses.append("(instr(lower(t.title),lower(?))>0 OR EXISTS(SELECT 1 FROM posts p WHERE p.topic_id=t.id AND p.deleted=0 AND instr(lower(p.content),lower(?))>0))")
            args.extend([term, term])
        if view in ['bookmarks', 'mine']:
            if not actor:
                raise ApiError(401, "请先登录")
            clauses.append("EXISTS(SELECT 1 FROM bookmarks b WHERE b.topic_id=t.id AND b.member_id=?)" if view=='bookmarks' else "t.author_id=?")
            args.append(uid)
        order = {"new": "t.created DESC", "top": "t.views DESC,t.updated DESC", "unanswered": "t.updated DESC"}.get(view, "t.updated DESC")
        if view == 'unanswered':
            clauses.append("(SELECT COUNT(*) FROM posts p WHERE p.topic_id=t.id AND p.deleted=0)=1")
        where = ' AND '.join(clauses)
        with self.connect() as db:
            total = db.execute("SELECT COUNT(*) FROM topics t WHERE "+where, args).fetchone()[0]
            rows = db.execute("SELECT t.* FROM topics t WHERE "+where+" ORDER BY t.pinned DESC,"+order+" LIMIT 30 OFFSET ?", [*args, (page-1)*30]).fetchall()
            return {"topics": [self.topic_data(db, row, uid) for row in rows], "total": total, "page": page, "pageSize": 30}

    def create_topic(self, actor, data):
        tid, pid, now = identifier(), identifier(), int(time.time())
        with self.connect(True) as db:
            title,body,category,tags=self.topic_input(db,actor,data)
            content_format=data.get('contentFormat','markdown')
            if content_format not in ['markdown','html','text']: raise ApiError(400,'正文格式无效')
            self.writable(db, actor, 'topic')
            db.execute("INSERT INTO topics(id,title,category,tags,author_id,created,updated,revision) VALUES(?,?,?,?,?,?,?,?)", (tid,title,category,json.dumps(tags),actor['id'],now,now,identifier()))
            db.execute("INSERT INTO posts(id,topic_id,author_id,content,created,revision) VALUES(?,?,?,?,?,?)", (pid,tid,actor['id'],body,now,identifier()))
            db.execute('UPDATE topics SET content_format=? WHERE id=?',(content_format,tid))
            self.bind_uploads(db,tid,actor,body,data.get('attachments',[]))
        return {"id": tid}

    def topic_input(self,db,actor,data):
        title = text(data.get('title'), 3, 180)
        body = text(data.get('content'), 8, 200000)
        category = data.get('category')
        tags = data.get('tags', [])
        choice=db.execute('SELECT admin_only FROM categories WHERE id=?',(category,)).fetchone() if isinstance(category,str) else None
        if not choice or not isinstance(tags, list) or len(tags)>5:
            raise ApiError(400, "请选择分类，标签最多 5 个")
        tags = list(dict.fromkeys(text(tag, 1, 24) for tag in tags))
        if choice['admin_only'] and actor['role']!=100:
            raise ApiError(403, "公告由管理员发布")
        return title,body,category,tags

    def edit_topic(self,tid,actor,data):
        with self.connect(True) as db:
            title,body,category,tags=self.topic_input(db,actor,data)
            self.writable(db,actor,'edit')
            topic=self.topic(db,tid,actor)
            content_format=data.get('contentFormat',topic['content_format'])
            if content_format not in ['markdown','html','text']: raise ApiError(400,'正文格式无效')
            if topic['author_id']!=actor['id'] and actor['role']!=100:
                raise ApiError(403,'只能编辑自己的话题')
            if topic['revision']!=data.get('revision'):
                raise ApiError(409,'话题已更新，请刷新后重试')
            now=int(time.time())
            db.execute('UPDATE topics SET title=?,category=?,tags=?,revision=?,updated=? WHERE id=?',(title,category,json.dumps(tags),identifier(),now,tid))
            first=db.execute('SELECT id FROM posts WHERE topic_id=? ORDER BY created,rowid LIMIT 1',(tid,)).fetchone()[0]
            db.execute('UPDATE posts SET content=?,revision=?,edited=? WHERE id=?',(body,identifier(),now,first))
            db.execute('UPDATE topics SET content_format=? WHERE id=?',(content_format,tid))
            self.bind_uploads(db,tid,actor,body,data.get('attachments',[item['id'] for item in self.topic_attachments(db,tid)]))
            db.execute('INSERT INTO audit VALUES(?,?,?,?)',(actor['id'],'edit-topic',tid,now))
        return {'id':tid}

    def detail(self, tid, actor=None, fingerprint='',page=1):
        uid = actor['id'] if actor else 0
        with self.connect(True) as db:
            topic = self.topic(db, tid, actor,allow_deleted=True)
            if fingerprint and not topic['hidden'] and not topic['deleted']:
                day = int(time.time())//86400
                inserted = db.execute("INSERT OR IGNORE INTO views VALUES(?,?,?)", (tid,fingerprint,day)).rowcount
                if inserted:
                    db.execute("UPDATE topics SET views=views+1 WHERE id=?", (tid,))
                db.execute("DELETE FROM views WHERE day<?", (day-7,))
                topic=self.topic(db,tid,actor)
            first_id=db.execute('SELECT id FROM posts WHERE topic_id=? ORDER BY created,rowid LIMIT 1',(tid,)).fetchone()[0]
            posts = db.execute("""SELECT p.*,m.name author_name,m.username author_username,m.avatar author_avatar,
                (SELECT COUNT(*) FROM likes l WHERE l.post_id=p.id) likes,
                EXISTS(SELECT 1 FROM likes l WHERE l.post_id=p.id AND l.member_id=?) liked
                FROM posts p JOIN members m ON m.id=p.author_id WHERE p.topic_id=? ORDER BY p.created,p.rowid LIMIT 100 OFFSET ?""", (uid,tid,(page-1)*100)).fetchall()
            return {"topic": self.topic_data(db,topic,uid), "posts": [{"id":p['id'],"author":self.author(p),
                    "content":'' if p['deleted'] else p['content'], "contentFormat":topic['content_format'] if p['id']==first_id else 'markdown', "createdAt":p['created'],"editedAt":p['edited'],
                    "deleted":bool(p['deleted']),"revision":p['revision'],"replyTo":p['reply_to'],
                    "likes":0 if p['deleted'] else p['likes'],"liked":False if p['deleted'] else bool(p['liked'])} for p in posts],
                    "attachments":self.topic_attachments(db,tid),"page":page,"totalPosts":db.execute('SELECT COUNT(*) FROM posts WHERE topic_id=?',(tid,)).fetchone()[0]}

    @staticmethod
    def notify(db, recipient, actor, tid, kind, event):
        if recipient!=actor:
            db.execute("INSERT OR IGNORE INTO notifications(id,member_id,actor_id,topic_id,kind,created,event) VALUES(?,?,?,?,?,?,?)", (identifier(),recipient,actor,tid,kind,int(time.time()),event))

    def reply(self, tid, actor, data):
        content=text(data.get('content'),1,20000)
        parent=data.get('replyTo') or None
        pid, now=identifier(),int(time.time())
        with self.connect(True) as db:
            self.writable(db,actor,'reply')
            topic=self.topic(db,tid,actor)
            if topic['closed']:
                raise ApiError(409,"此话题已关闭回复")
            recipient=topic['author_id']
            if parent:
                post=db.execute("SELECT * FROM posts WHERE id=? AND topic_id=? AND deleted=0",(parent,tid)).fetchone()
                if not post:
                    raise ApiError(400,"引用的回复不存在")
                recipient=post['author_id']
            db.execute("INSERT INTO posts(id,topic_id,author_id,content,created,revision,reply_to) VALUES(?,?,?,?,?,?,?)",(pid,tid,actor['id'],content,now,identifier(),parent))
            db.execute("UPDATE topics SET updated=? WHERE id=?",(now,tid))
            self.notify(db,recipient,actor['id'],tid,'reply','reply:'+pid)
        return {"id":pid}

    def update_post(self,pid,actor,data):
        with self.connect(True) as db:
            self.writable(db,actor,'edit')
            post=db.execute("SELECT * FROM posts WHERE id=?",(pid,)).fetchone()
            if not post:
                raise ApiError(404,"回复不存在")
            self.topic(db,post['topic_id'],actor)
            if post['author_id']!=actor['id'] and actor['role']!=100:
                raise ApiError(403,"只能修改自己的内容")
            if data.get('revision')!=post['revision']:
                raise ApiError(409,"内容已更新，请刷新后再编辑")
            deleted=boolean(data.get('deleted',False))
            content=post['content'] if deleted else text(data.get('content'),1,40000)
            first=db.execute("SELECT id FROM posts WHERE topic_id=? ORDER BY created,rowid LIMIT 1",(post['topic_id'],)).fetchone()[0]
            if first==pid and deleted:
                raise ApiError(400,"主题正文不可删除，可编辑正文或联系管理员隐藏话题")
            db.execute("UPDATE posts SET content=?,deleted=?,edited=?,revision=? WHERE id=?",(content,deleted,int(time.time()),identifier(),pid))
            if actor['role']==100 and post['author_id']!=actor['id']:
                db.execute("INSERT INTO audit VALUES(?,?,?,?)",(actor['id'],'edit-post',pid,int(time.time())))
        return {"updated":True}

    def reaction(self,kind,target,actor,enabled):
        boolean(enabled)
        with self.connect(True) as db:
            self.writable(db,actor,'reaction')
            if kind=='like':
                post=db.execute("SELECT * FROM posts WHERE id=? AND deleted=0",(target,)).fetchone()
                if not post:
                    raise ApiError(404,"内容不存在")
                self.topic(db,post['topic_id'],actor)
                if post['author_id']==actor['id']:
                    raise ApiError(400,"不能给自己的内容点赞")
                if enabled:
                    db.execute("INSERT OR IGNORE INTO likes VALUES(?,?)",(target,actor['id']))
                    self.notify(db,post['author_id'],actor['id'],post['topic_id'],'like','like:'+target+':'+str(actor['id']))
                else:
                    db.execute("DELETE FROM likes WHERE post_id=? AND member_id=?",(target,actor['id']))
            else:
                self.topic(db,target,actor)
                if enabled:
                    db.execute("INSERT OR IGNORE INTO bookmarks VALUES(?,?)",(target,actor['id']))
                else:
                    db.execute("DELETE FROM bookmarks WHERE topic_id=? AND member_id=?",(target,actor['id']))
        return {"updated":True}

    def notifications(self,actor):
        with self.connect() as db:
            rows=db.execute("""SELECT n.*,t.title,m.name FROM notifications n JOIN topics t ON t.id=n.topic_id
                JOIN members m ON m.id=n.actor_id WHERE n.member_id=? AND t.hidden=0 AND t.deleted=0 ORDER BY n.created DESC,n.rowid DESC LIMIT 60""",(actor['id'],)).fetchall()
            topics=[{"id":r['id'],"topicId":r['topic_id'],"title":r['title'],"actor":self.profiles.get(r['actor_id'],dict(name=r['name']))['name'],"kind":r['kind'],"read":bool(r['seen']),"createdAt":r['created']} for r in rows]
        return sorted(topics+self.work_comment_notifications(actor),key=lambda item:item['createdAt'],reverse=True)[:60]

    def mark_read(self,actor):
        with self.connect(True) as db:
            db.execute("UPDATE notifications SET seen=1 WHERE member_id=?",(actor['id'],))
            db.execute("UPDATE work_comment_notifications SET seen=1 WHERE member_id=?",(actor['id'],))
        return {"updated":True}

    def report(self,pid,actor,data):
        reason=text(data.get('reason'),3,1000)
        with self.connect(True) as db:
            self.writable(db,actor,'report')
            post=db.execute("SELECT topic_id FROM posts WHERE id=? AND deleted=0",(pid,)).fetchone()
            if not post:
                raise ApiError(404,"内容不存在")
            self.topic(db,post['topic_id'],actor)
            db.execute("INSERT OR IGNORE INTO reports(id,post_id,member_id,reason,created) VALUES(?,?,?,?,?)",(identifier(),pid,actor['id'],reason,int(time.time())))
        return {"submitted":True}

    def moderation(self,actor,target,data):
        if actor['role']!=100:
            raise ApiError(403,"需要管理员权限")
        with self.connect(True) as db:
            topic=self.topic(db,target,actor)
            if data.get('revision')!=topic['revision']:
                raise ApiError(409,"话题已更新，请刷新后重试")
            values={key:boolean(data.get(key,bool(topic[key]))) for key in ['pinned','closed','hidden']}
            db.execute("UPDATE topics SET pinned=?,closed=?,hidden=?,revision=? WHERE id=?",(*values.values(),identifier(),target))
            db.execute("INSERT INTO audit VALUES(?,?,?,?)",(actor['id'],'moderate-topic',target,int(time.time())))
        return {"updated":True}

    def admin(self,actor):
        if actor['role']!=100:
            raise ApiError(403,"需要管理员权限")
        with self.connect() as db:
            reports=db.execute("""SELECT r.*,p.topic_id,p.content,m.name,t.title FROM reports r JOIN posts p ON p.id=r.post_id
                JOIN topics t ON t.id=p.topic_id JOIN members m ON m.id=r.member_id ORDER BY r.created DESC LIMIT 100""").fetchall()
            hidden=db.execute("SELECT * FROM topics WHERE hidden=1 AND deleted=0 ORDER BY updated DESC LIMIT 100").fetchall()
            return {"reports":[{"id":r['id'],"topicId":r['topic_id'],"postId":r['post_id'],"reason":r['reason'],"state":r['state'],"title":r['title'],"reporter":r['name'],"content":r['content'][:1000]} for r in reports],
                    "hidden":[self.topic_data(db,row,actor['id']) for row in hidden], "workReports":self.work_comment_reports(actor)}

    def resolve_report(self,actor,rid):
        if actor['role']!=100:
            raise ApiError(403,"需要管理员权限")
        with self.connect(True) as db:
            if not db.execute("UPDATE reports SET state='resolved' WHERE id=?",(rid,)).rowcount:
                raise ApiError(404,"举报不存在")
            db.execute("INSERT INTO audit VALUES(?,?,?,?)",(actor['id'],'resolve-report',rid,int(time.time())))
        return {"updated":True}


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):
        return None


class Application:
    def __init__(self,store,relay='http://127.0.0.1:8081',origins=None):
        self.store,self.relay=store,relay.rstrip('/')
        self.origins=set(origins or ['https://skymoni.com','https://www.skymoni.com'])
        self.opener=build_opener(ProxyHandler({}),NoRedirect())
        self.view_secret=secrets.token_bytes(32)

    def authenticate(self,headers,required=False):
        authorization=headers.get('Authorization','')
        # Never treat an unverified user-id header or a session cookie as identity.
        if not authorization.startswith('Bearer '):
            if required:
                raise ApiError(401,'请先登录 skymoni 账号')
            return None
        forwarded={'Authorization':authorization,'Accept':'application/json','X-Skymoni-Auth-Scope':'community'}
        if headers.get('New-Api-User'):
            forwarded['New-Api-User']=headers['New-Api-User']
        try:
            with self.opener.open(Request(self.relay+'/api/user/self',headers=forwarded),timeout=8) as response:
                data=json.loads(response.read(256000))
        except HTTPError as error:
            raise ApiError(401 if error.code in [401,403] else 503,'登录已失效，请重新登录' if error.code in [401,403] else '账号服务暂不可用')
        except (URLError,TimeoutError,OSError,ValueError):
            raise ApiError(503,'账号服务暂不可用，请稍后重试')
        user=data.get('data') if data.get('success') else None
        if not isinstance(user,dict) or not isinstance(user.get('id'),int) or user['id']<=0 or user.get('status',1)!=1:
            raise ApiError(401,'登录已失效或账号不可用')
        actor={'id':user['id'],'username':str(user.get('username',''))[:100],'name':str(user.get('display_name') or user.get('username') or '社区成员')[:100], 'avatar':setting_avatar(user.get('setting')),'role':int(user.get('role',1))}
        self.store.sync_member(actor)
        return actor

    def authorize_community(self,actor,data):
        if not actor: raise ApiError(401,'请先登录中转站账号')
        if data.get('approved') is not True: raise ApiError(400,'请明确确认使用当前账号')
        if type(data.get('userId')) is not int or data['userId']!=actor['id']: raise ApiError(409,'账号已变化，请刷新授权页面重新确认')
        target=data.get('returnTo','/creators')
        from urllib.parse import unquote
        import posixpath
        if not isinstance(target,str) or len(target)>1000 or any(ord(ch)<=32 for ch in target) or '\\' in target:
            raise ApiError(400,'社区返回地址无效')
        parsed=urlsplit(target)
        decoded=unquote(parsed.path)
        normalized=posixpath.normpath(decoded)
        if parsed.scheme or parsed.netloc or not re.match(r'^/creators(?:/|$)',parsed.path) or not re.match(r'^/creators(?:/|$)',normalized) or '\\' in decoded or decoded.startswith('//') or any(ord(ch)<=32 for ch in decoded):
            raise ApiError(400,'只能返回本站社区页面')
        with self.store.connect(True) as db:
            if db.execute("SELECT COUNT(*) FROM audit WHERE actor_id=? AND action='authorize-community' AND created>?",(actor['id'],int(time.time())-60)).fetchone()[0]>=10:
                raise ApiError(429,'确认过于频繁，请稍后再试')
            db.execute('INSERT INTO audit VALUES(?,?,?,?)',(actor['id'],'authorize-community','basic-profile:v1',int(time.time())))
        return {'authorized':True,'returnTo':target,'user':{key:actor[key] for key in ['id','username','name','avatar']}}

    def public_work(self,work_id):
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,80}',work_id): raise ApiError(404,'作品不存在')
        try:
            with self.opener.open(Request(self.relay+'/api/creators/public/'+work_id,headers={'Accept':'application/json'}),timeout=8) as response:
                raw=response.read(8*1024*1024+1)
                if len(raw)>8*1024*1024: raise ApiError(503,'作品资料过大，请稍后重试')
                result=json.loads(raw)
        except HTTPError as error:
            raise ApiError(404 if error.code in [401,403,404] else 503,'作品未公开或不存在' if error.code in [401,403,404] else '作品服务暂不可用')
        except (URLError,TimeoutError,OSError,ValueError): raise ApiError(503,'作品服务暂不可用')
        work=(result.get('data') or {}).get('work') if result.get('success') else None
        if not isinstance(work,dict) or work.get('id')!=work_id or work.get('status')!='published' or work.get('sample') or type(work.get('ownerId')) is not int or work['ownerId']<=0:
            raise ApiError(404,'作品未公开或不存在')
        return {'id':work_id,'title':str(work.get('title','作品'))[:180],'ownerId':work['ownerId']}

    def dispatch(self,method,path,headers,data,peer):
        parsed=urlsplit(path)
        route=parsed.path.removeprefix('/api/community').rstrip('/') or '/'
        query=parse_qs(parsed.query)
        write=method not in ['GET','HEAD']
        if write:
            if headers.get('Origin') not in self.origins or headers.get('Sec-Fetch-Site')=='cross-site':
                raise ApiError(403,'请从本站页面提交操作')
            if headers.get('Content-Type','').lower().split(';')[0].strip()!='application/json':
                raise ApiError(415,'请求必须使用 JSON 格式')
        if method=='GET' and route=='/health':
            return {'status':'ok','version':9}
        actor=self.authenticate(headers,write or route.startswith('/me/') or route=='/admin' or route.startswith('/admin/'))
        if method=='POST' and route=='/auth/authorize': return self.authorize_community(actor,data)
        if method=='GET' and route=='/identities':
            raw=query.get('ids',[''])[0].split(',')
            if len(raw)>100 or any(not re.fullmatch(r'[1-9][0-9]{0,14}', uid) for uid in raw):
                raise ApiError(400,'请检查成员编号')
            result={}
            with self.store.connect() as db:
                for uid in set(map(int,raw)):
                    member=db.execute('SELECT id,name,username,avatar FROM members WHERE id=?',(uid,)).fetchone()
                    profile=self.store.profiles.get(uid,dict(member) if member else None)
                    if profile: result[str(uid)]=profile
            return result
        match=re.fullmatch(r'/uploads/([a-f0-9]{32})',route)
        if match and method in ['GET','HEAD']: return self.store.read_upload(match.group(1))
        match=re.fullmatch(r'/topics/([a-f0-9]{32})/trash',route)
        if match and method=='PUT': return self.store.trash_topic(match.group(1),actor,data)
        if route=='/admin/navigation':
            if actor['role']!=100: raise ApiError(403,'只有管理员可以管理顶部导航')
            if method=='GET': return self.store.navigation_catalog()
            if method=='POST': return self.store.manage_navigation(actor,data)
        if route=='/admin/navigation/order' and method=='PUT': return self.store.manage_navigation(actor,data,reorder=True)
        match=re.fullmatch(r'/admin/navigation/([a-f0-9]{32})',route)
        if match and method=='PUT': return self.store.manage_navigation(actor,data,nid=match.group(1))
        if route=='/admin/categories':
            if actor['role']!=100: raise ApiError(403,'只有管理员可以管理社区分类')
            if method=='GET': return self.store.category_catalog()
            if method=='POST': return self.store.manage_categories(actor,data)
        if route=='/admin/categories/order' and method=='PUT':
            return self.store.manage_categories(actor,data,reorder=True)
        match=re.fullmatch(r'/admin/categories/([A-Za-z0-9_-]{1,80})',route)
        if match and method=='PUT':
            return self.store.manage_categories(actor,data,cid=match.group(1))
        match=re.fullmatch(r'/works/([A-Za-z0-9_-]{1,80})/comments',route)
        if match and method in ['GET','POST']:
            work=self.public_work(match.group(1))
            if method=='POST': return self.store.add_work_comment(work,actor,data)
            try: page=max(1,min(10000,int(query.get('page',['1'])[0])))
            except ValueError: raise ApiError(400,'页码无效')
            return self.store.list_work_comments(work,actor,page)
        match=re.fullmatch(r'/work-comments/([a-f0-9]{32})(?:/(like|report))?',route)
        if match and method in ['PUT','POST']:
            cid,action=match.groups()
            self.public_work(self.store.comment_work_id(cid))
            if method=='PUT' and not action: return self.store.update_work_comment(cid,actor,data)
            if method=='PUT' and action=='like': return self.store.like_work_comment(cid,actor,data.get('liked'))
            if method=='POST' and action=='report': return self.store.report_work_comment(cid,actor,data)
        match=re.fullmatch(r'/admin/work-reports/([a-f0-9]{32})',route)
        if match and method=='PUT': return self.store.resolve_work_comment_report(match.group(1),actor,data)
        if method=='GET' and route=='/meta': return self.store.metadata()
        if method=='GET' and re.fullmatch(r'/members/[1-9][0-9]{0,11}',route):
            return self.store.member_profile(int(route.split('/')[-1]))
        if route=='/topics':
            if method=='GET': return self.store.listing(query,actor)
            if method=='POST': return self.store.create_topic(actor,data)
        if method=='GET' and re.fullmatch(r'/topics/[a-f0-9]{32}',route):
            fingerprint=hmac.new(self.view_secret,((str(actor['id']) if actor else peer)+'|'+headers.get('User-Agent','')[:300]).encode(),hashlib.sha256).hexdigest()
            try: page=max(1,min(10000,int(query.get('page',['1'])[0])))
            except ValueError: raise ApiError(400,'页码无效')
            return self.store.detail(route.split('/')[-1],actor,fingerprint,page)
        if method=='PUT' and re.fullmatch(r'/topics/[a-f0-9]{32}',route):
            return self.store.edit_topic(route.split('/')[-1],actor,data)
        match=re.fullmatch(r'/topics/([a-f0-9]{32})/(replies|bookmark|moderation)',route)
        if match:
            tid,action=match.groups()
            if method=='POST' and action=='replies': return self.store.reply(tid,actor,data)
            if method=='PUT' and action=='bookmark': return self.store.reaction('bookmark',tid,actor,data.get('bookmarked'))
            if method=='PUT' and action=='moderation': return self.store.moderation(actor,tid,data)
        match=re.fullmatch(r'/posts/([a-f0-9]{32})(?:/(like|report))?',route)
        if match:
            pid,action=match.groups()
            if method=='PUT' and not action: return self.store.update_post(pid,actor,data)
            if method=='PUT' and action=='like': return self.store.reaction('like',pid,actor,data.get('liked'))
            if method=='POST' and action=='report': return self.store.report(pid,actor,data)
        if route=='/me/notifications':
            if method=='GET': return self.store.notifications(actor)
            if method=='PUT': return self.store.mark_read(actor)
        if method=='GET' and route=='/admin': return self.store.admin(actor)
        match=re.fullmatch(r'/admin/reports/([a-f0-9]{32})',route)
        if method=='PUT' and match: return self.store.resolve_report(actor,match.group(1))
        raise ApiError(404,'接口不存在')


UPLOAD_SLOTS=threading.BoundedSemaphore(2)


class Server(ThreadingHTTPServer):
    daemon_threads=True
    request_queue_size=64


class Handler(BaseHTTPRequestHandler):
    server_version='skymoni-community'
    def setup(self):
        super().setup()
        self.connection.settimeout(15)

    def handle_request(self):
        upload_slot=False
        try:
            if self.headers.get('Transfer-Encoding'):
                raise ApiError(400,'不支持此请求编码')
            try: length=int(self.headers.get('Content-Length','0'))
            except ValueError: raise ApiError(400,'请求长度无效')
            upload=urlsplit(self.path).path=='/api/community/uploads' and self.command=='POST'
            if not 0<=length<=(7*1024*1024 if upload else 1024*1024):
                raise ApiError(413,'文件或内容过大')
            actor=None
            if upload:
                if self.headers.get('Origin') not in self.server.application.origins or self.headers.get('Sec-Fetch-Site')=='cross-site':
                    raise ApiError(403,'请从本站上传文件')
                if self.headers.get('Content-Type','').lower().split(';')[0].strip()!='application/json':
                    raise ApiError(415,'请求必须使用 JSON 格式')
                upload_slot=UPLOAD_SLOTS.acquire(blocking=False)
                if not upload_slot: raise ApiError(429,'正在处理其他上传，请稍后重试')
                actor=self.server.application.authenticate(self.headers,True)
            data={}
            if length:
                try: data=json.loads(self.rfile.read(length))
                except (ValueError,UnicodeDecodeError): raise ApiError(400,'JSON 格式无效')
                if not isinstance(data,dict): raise ApiError(400,'请求格式无效')
            peer=self.headers.get('X-Real-IP',self.client_address[0])
            result=self.server.application.store.add_upload(actor,data) if upload else self.server.application.dispatch(self.command,self.path,self.headers,data,peer)
            if isinstance(result,UploadAsset):
                self.respond_asset(result)
                return
            self.respond(200,{'success':True,'data':result})
        except ApiError as error:
            self.respond(error.status,{'success':False,'message':error.message})
        except sqlite3.OperationalError:
            self.respond(503,{'success':False,'message':'社区繁忙，请稍后重试'})
        except Exception:
            # Do not include headers, tokens, submitted content or credentials in logs.
            logging.error('community request failed: %s %s',self.command,urlsplit(self.path).path)
            self.respond(500,{'success':False,'message':'社区服务暂时不可用'})
        finally:
            if upload_slot: UPLOAD_SLOTS.release()

    def respond_asset(self,asset):
        with asset.path.open('rb') as stream:
            self.send_response(200)
            self.send_header('Content-Type',asset.mime)
            self.send_header('Content-Length',str(asset.size))
            self.send_header('Content-Disposition',('inline' if asset.image else 'attachment')+"; filename*=UTF-8''"+quote(asset.name,safe=''))
            self.send_header('Cache-Control','no-store')
            self.send_header('X-Content-Type-Options','nosniff')
            self.send_header('Content-Security-Policy',"sandbox; default-src 'none'")
            self.send_header('Cross-Origin-Resource-Policy','same-origin')
            self.end_headers()
            if self.command!='HEAD':
                import shutil
                shutil.copyfileobj(stream,self.wfile,length=65536)

    def respond(self,status,data):
        raw=json.dumps(data,ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Content-Length',str(len(raw)))
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Vary','Authorization')
        self.end_headers()
        if self.command!='HEAD': self.wfile.write(raw)

    do_GET=handle_request
    do_POST=handle_request
    do_PUT=handle_request
    do_HEAD=handle_request
    def log_message(self,*args): pass


def main():
    directory=Path(os.environ.get('COMMUNITY_DATA_DIR','/var/lib/skymoni-community'))
    app=Application(Store(directory/'community.db'),os.environ.get('COMMUNITY_RELAY_URL','http://127.0.0.1:8081'),os.environ.get('COMMUNITY_ORIGINS','https://skymoni.com,https://www.skymoni.com').split(','))
    server=Server(('127.0.0.1',int(os.environ.get('COMMUNITY_PORT','18885'))),Handler)
    server.application=app
    server.serve_forever()


if __name__=='__main__': main()
