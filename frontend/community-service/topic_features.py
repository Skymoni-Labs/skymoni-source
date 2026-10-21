"""Recoverable topic deletion and bounded, persistent public discussion uploads."""
import base64
import os
import re
import shutil
import time
import uuid
from dataclasses import dataclass
from pathlib import Path

MAX_FILE = 5 * 1024 * 1024


@dataclass
class UploadAsset:
    path: Path
    name: str
    mime: str
    size: int
    image: bool


class TopicFeaturesMixin:
    def init_topic_features(self):
        with self.connect(True) as db:
            columns={row[1] for row in db.execute('PRAGMA table_info(topics)')}
            for name, definition in [('deleted','INTEGER NOT NULL DEFAULT 0'),('content_format',"TEXT NOT NULL DEFAULT 'markdown'")]:
                if name not in columns: db.execute('ALTER TABLE topics ADD COLUMN '+name+' '+definition)
            db.execute('CREATE TABLE IF NOT EXISTS uploads(id TEXT PRIMARY KEY,owner_id INTEGER NOT NULL REFERENCES members(id),name TEXT NOT NULL,size INTEGER NOT NULL,mime TEXT NOT NULL,image INTEGER NOT NULL,created INTEGER NOT NULL,bound INTEGER NOT NULL DEFAULT 0)')
            if 'bound' not in {r[1] for r in db.execute('PRAGMA table_info(uploads)')}: db.execute('ALTER TABLE uploads ADD COLUMN bound INTEGER NOT NULL DEFAULT 0')
            db.execute('CREATE TABLE IF NOT EXISTS topic_uploads(topic_id TEXT NOT NULL REFERENCES topics(id),upload_id TEXT NOT NULL REFERENCES uploads(id),PRIMARY KEY(topic_id,upload_id))')
            db.execute('PRAGMA user_version=4')
        self.upload_dir=Path(self.path).parent/'uploads'
        self.upload_dir.mkdir(exist_ok=True,mode=0o700)

    def trash_topic(self,tid,actor,data):
        deleted=data.get('deleted')
        if not isinstance(deleted,bool): raise self.error_type(400,'请指定删除或恢复操作')
        with self.connect(True) as db:
            topic=self.topic(db,tid,actor,allow_deleted=True)
            if topic['author_id']!=actor['id'] and actor['role']!=100:
                raise self.error_type(403,'只能删除或恢复自己的话题')
            if data.get('revision')!=topic['revision']:
                raise self.error_type(409,'话题已更新，请刷新后重试')
            self.writable(db,actor,'edit')
            db.execute('UPDATE topics SET deleted=?,revision=?,updated=? WHERE id=?',(int(deleted),uuid.uuid4().hex,int(time.time()),tid))
            db.execute('INSERT INTO audit VALUES(?,?,?,?)',(actor['id'],'trash-topic' if deleted else 'restore-topic',tid,int(time.time())))
        return dict(id=tid,deleted=deleted)

    def upload_data(self,row):
        return dict(id=row['id'],name=row['name'],size=row['size'],mime=row['mime'],image=bool(row['image']),url='/api/community/uploads/'+row['id'])

    def add_upload(self,actor,data):
        name=data.get('name')
        encoded=data.get('content')
        if not isinstance(name,str) or not 1<=len(name.strip())<=180 or any(ord(ch)<32 for ch in name) or '/' in name or '\\' in name:
            raise self.error_type(400,'请使用有效的文件名（最多 180 个字符）')
        if not isinstance(encoded,str) or len(encoded)>((MAX_FILE+2)//3)*4:
            raise self.error_type(413,'单个文件最多 5 MB')
        try: raw=base64.b64decode(encoded,validate=True)
        except (ValueError,TypeError): raise self.error_type(400,'文件编码无效')
        if not raw or len(raw)>MAX_FILE: raise self.error_type(413,'请选择非空文件，单个文件最多 5 MB')
        mime='application/octet-stream'
        if raw.startswith(b'\x89PNG\r\n\x1a\n'): mime='image/png'
        elif raw.startswith(b'\xff\xd8\xff'): mime='image/jpeg'
        elif raw.startswith((b'GIF87a',b'GIF89a')): mime='image/gif'
        elif raw[:4]==b'RIFF' and raw[8:12]==b'WEBP': mime='image/webp'
        image=mime.startswith('image/')
        if Path(name).suffix.lower() in ['.png','.jpg','.jpeg','.gif','.webp'] and not image:
            raise self.error_type(400,'图片内容与格式不匹配，请重新选择图片')
        fid=uuid.uuid4().hex
        target=self.upload_dir/fid
        try:
            with self.connect(True) as db:
                self.writable(db,actor,'upload')
                own=db.execute('SELECT COALESCE(SUM(size),0) FROM uploads WHERE owner_id=?',(actor['id'],)).fetchone()[0]
                total=db.execute('SELECT COALESCE(SUM(size),0) FROM uploads').fetchone()[0]
                if own+len(raw)>50*1024*1024: raise self.error_type(413,'当前账号的社区附件空间已达 50 MB')
                if total+len(raw)>512*1024*1024 or shutil.disk_usage(self.upload_dir).free<128*1024*1024+len(raw):
                    raise self.error_type(503,'附件存储暂时已满，请稍后重试')
                with target.open('xb') as stream:
                    stream.write(raw)
                    stream.flush()
                    os.fsync(stream.fileno())
                target.chmod(0o600)
                db.execute('INSERT INTO uploads(id,owner_id,name,size,mime,image,created) VALUES(?,?,?,?,?,?,?)',(fid,actor['id'],name.strip(),len(raw),mime,int(image),int(time.time())))
                row=db.execute('SELECT * FROM uploads WHERE id=?',(fid,)).fetchone()
                result=self.upload_data(row)
            return result
        except BaseException:
            if target.exists(): target.unlink()
            raise

    def bind_uploads(self,db,tid,actor,content,ids):
        if not isinstance(ids,list) or any(not isinstance(fid,str) for fid in ids):
            raise self.error_type(400,'请检查附件列表')
        ids=set(ids)|set(re.findall(r'/api/community/uploads/([a-f0-9]{32})',content))
        if len(ids)>20: raise self.error_type(400,'一个话题最多附带 20 个文件')
        for fid in ids:
            row=db.execute('SELECT * FROM uploads WHERE id=?',(fid,)).fetchone()
            existing=db.execute('SELECT 1 FROM topic_uploads WHERE topic_id=? AND upload_id=?',(tid,fid)).fetchone()
            if not row: raise self.error_type(400,'附件不存在，请重新上传')
            if row['owner_id']!=actor['id'] and not existing:
                raise self.error_type(403,'不能将其他人的未授权附件添加到话题')
        db.executemany('UPDATE uploads SET bound=1 WHERE id=?',[(fid,) for fid in ids])
        db.execute('DELETE FROM topic_uploads WHERE topic_id=?',(tid,))
        db.executemany('INSERT INTO topic_uploads VALUES(?,?)',[(tid,fid) for fid in ids])

    def topic_attachments(self,db,tid):
        return [self.upload_data(row) for row in db.execute('SELECT u.* FROM uploads u JOIN topic_uploads a ON a.upload_id=u.id WHERE a.topic_id=? ORDER BY u.created,u.rowid',(tid,))]

    def read_upload(self,fid):
        with self.connect() as db:
            row=db.execute('SELECT * FROM uploads WHERE id=?',(fid,)).fetchone()
            public=db.execute('SELECT 1 FROM topic_uploads a JOIN topics t ON t.id=a.topic_id WHERE a.upload_id=? AND t.deleted=0 AND t.hidden=0 LIMIT 1',(fid,)).fetchone()
            if not row or (row['bound'] and not public): raise self.error_type(404,'附件不存在或话题未公开')
            path=self.upload_dir/fid
            if not path.is_file(): raise self.error_type(404,'附件暂不可用')
            return UploadAsset(path,row['name'],row['mime'],row['size'],bool(row['image']))
