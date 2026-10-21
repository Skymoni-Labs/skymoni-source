"""Persistent topic categories; existing category IDs and topics are preserved."""
import re
import time
import uuid


class CategoriesMixin:
    def init_categories(self, defaults):
        with self.connect(True) as db:
            db.execute('CREATE TABLE IF NOT EXISTS categories(id TEXT PRIMARY KEY,name TEXT NOT NULL,description TEXT NOT NULL,color TEXT NOT NULL,position INTEGER NOT NULL,admin_only INTEGER NOT NULL DEFAULT 0)')
            db.execute('CREATE TABLE IF NOT EXISTS category_state(id INTEGER PRIMARY KEY CHECK(id=1),revision TEXT NOT NULL)')
            for position, item in enumerate(defaults):
                db.execute('INSERT OR IGNORE INTO categories VALUES(?,?,?,?,?,?)', (item['id'],item['name'],item['description'],item['color'],position,int(item.get('adminOnly',False))))
            db.execute('INSERT OR IGNORE INTO category_state VALUES(1,?)',(uuid.uuid4().hex,))
            db.execute('PRAGMA user_version=3')

    def category_rows(self, db):
        return [dict(id=r['id'],name=r['name'],description=r['description'],color=r['color'],adminOnly=bool(r['admin_only']))
                for r in db.execute('SELECT * FROM categories ORDER BY position,id')]

    def category_catalog(self, db=None):
        if db is None:
            with self.connect() as connection:
                return self.category_catalog(connection)
        return dict(categories=self.category_rows(db),revision=db.execute('SELECT revision FROM category_state WHERE id=1').fetchone()[0])

    def manage_categories(self, actor, data, cid=None, reorder=False):
        if not actor or actor['role'] != 100:
            raise self.error_type(403,'只有管理员可以管理社区分类')
        with self.connect(True) as db:
            current=self.category_catalog(db)
            if data.get('revision') != current['revision']:
                raise self.error_type(409,'分类已更新，请刷新后重试；你填写的内容会保留')
            if reorder:
                ids=data.get('ids')
                known=[c['id'] for c in current['categories']]
                if not isinstance(ids,list) or any(not isinstance(i,str) for i in ids) or len(ids)!=len(known) or set(ids)!=set(known):
                    raise self.error_type(400,'分类排序不完整，请刷新后重试')
                for position,item in enumerate(ids):
                    db.execute('UPDATE categories SET position=? WHERE id=?',(position,item))
                action,target='reorder-categories','categories'
            else:
                name=data.get('name')
                description=data.get('description','')
                color=data.get('color')
                if not isinstance(name,str) or not 1<=len(name.strip())<=24 or any(ord(ch)<32 for ch in name):
                    raise self.error_type(400,'分类名称需要 1–24 个字符')
                if not isinstance(description,str) or len(description.strip())>180 or '\x00' in description:
                    raise self.error_type(400,'分类说明最多 180 个字符')
                if not isinstance(color,str) or not re.fullmatch(r'#[0-9a-fA-F]{6}',color):
                    raise self.error_type(400,'请选择有效的分类颜色')
                name=' '.join(name.split())
                if any(c['name'].casefold()==name.casefold() and c['id']!=cid for c in current['categories']):
                    raise self.error_type(409,'已存在同名分类，请使用其他名称')
                if cid:
                    if not any(c['id']==cid for c in current['categories']):
                        raise self.error_type(404,'分类不存在')
                    db.execute('UPDATE categories SET name=?,description=?,color=? WHERE id=?',(name,description.strip(),color.lower(),cid))
                    action='edit-category'
                else:
                    if len(current['categories'])>=100:
                        raise self.error_type(400,'社区分类最多 100 个，请先整理已有分类')
                    cid='cat_'+uuid.uuid4().hex
                    position=db.execute('SELECT COALESCE(MAX(position),-1)+1 FROM categories').fetchone()[0]
                    db.execute('INSERT INTO categories VALUES(?,?,?,?,?,0)',(cid,name,description.strip(),color.lower(),position))
                    action='create-category'
                target=cid
            db.execute('UPDATE category_state SET revision=? WHERE id=1',(uuid.uuid4().hex,))
            db.execute('INSERT INTO audit VALUES(?,?,?,?)',(actor['id'],action,target,int(time.time())))
            return self.category_catalog(db)
