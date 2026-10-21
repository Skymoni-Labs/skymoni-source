"""Administrator-managed category shortcuts. Aliases never modify category names."""
import time
import uuid


class NavigationMixin:
    def init_navigation(self):
        with self.connect(True) as db:
            # Retain the old topic shortcut table for recovery; migrate once only.
            existing=db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='category_navigation'").fetchone()
            db.execute('CREATE TABLE IF NOT EXISTS category_navigation(id TEXT PRIMARY KEY,category_id TEXT NOT NULL REFERENCES categories(id),label TEXT NOT NULL,position INTEGER NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS navigation_state(id INTEGER PRIMARY KEY CHECK(id=1),revision TEXT NOT NULL)')
            db.execute('INSERT OR IGNORE INTO navigation_state VALUES(1,?)',(uuid.uuid4().hex,))
            legacy=db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='topic_navigation'").fetchone()
            if not existing and legacy:
                # Preserve every existing alias and its order, even if two pointed
                # to topics in the same category. New duplicate categories are rejected.
                db.execute("""INSERT INTO category_navigation SELECT n.id,t.category,n.label,n.position
                    FROM topic_navigation n JOIN topics t ON t.id=n.topic_id
                    JOIN categories c ON c.id=t.category ORDER BY n.position,n.id""")
                db.execute('UPDATE navigation_state SET revision=? WHERE id=1',(uuid.uuid4().hex,))
            db.execute('PRAGMA user_version=6')

    def public_navigation(self, db):
        return [dict(id=row['id'],categoryId=row['category_id'],label=row['label'],title=row['name'])
            for row in db.execute("""SELECT n.*,c.name FROM category_navigation n
                JOIN categories c ON c.id=n.category_id ORDER BY n.position,n.id""")]

    def navigation_catalog(self, db=None):
        if db is None:
            with self.connect() as connection: return self.navigation_catalog(connection)
        return dict(revision=db.execute('SELECT revision FROM navigation_state WHERE id=1').fetchone()[0],
            items=[dict(item,available=True) for item in self.public_navigation(db)])

    def manage_navigation(self, actor, data, nid=None, reorder=False):
        if not actor or actor['role']!=100: raise self.error_type(403,'只有管理员可以管理顶部导航')
        with self.connect(True) as db:
            current=self.navigation_catalog(db)
            if data.get('revision')!=current['revision']: raise self.error_type(409,'导航已更新，请刷新配置后再保存；填写的内容会保留')
            self.writable(db,actor,'edit')
            if reorder:
                ids=data.get('ids');known=[item['id'] for item in current['items']]
                if not isinstance(ids,list) or any(not isinstance(uid,str) for uid in ids) or len(ids)!=len(known) or set(ids)!=set(known):
                    raise self.error_type(400,'导航排序不完整，请刷新后重试')
                for position,uid in enumerate(ids): db.execute('UPDATE category_navigation SET position=? WHERE id=?',(position,uid))
                action,target='reorder-navigation','navigation'
            elif data.get('remove') is True:
                if not nid or not db.execute('DELETE FROM category_navigation WHERE id=?',(nid,)).rowcount: raise self.error_type(404,'导航入口不存在')
                action,target='remove-navigation',nid
            else:
                label=data.get('label')
                if not isinstance(label,str) or not 1<=len(label.strip())<=24 or any(ord(ch)<32 for ch in label): raise self.error_type(400,'导航显示名需要 1–24 个字符')
                label=' '.join(label.split())
                if label in ['论坛交流','作品广场','创作者工作台','管理导航']: raise self.error_type(400,'请使用与固定模块不同的导航显示名')
                if any(item['label'].casefold()==label.casefold() and item['id']!=nid for item in current['items']): raise self.error_type(409,'已有同名导航入口，请换一个显示名')
                if nid:
                    if not any(item['id']==nid for item in current['items']): raise self.error_type(404,'导航入口不存在')
                    db.execute('UPDATE category_navigation SET label=? WHERE id=?',(label,nid))
                    action='rename-navigation'
                else:
                    cid=data.get('categoryId')
                    if not isinstance(cid,str) or not cid or len(cid)>100: raise self.error_type(400,'请选择话题分类')
                    category=db.execute('SELECT id FROM categories WHERE id=?',(cid,)).fetchone()
                    if not category: raise self.error_type(404,'话题分类不存在，请刷新后重试')
                    if len(current['items'])>=12: raise self.error_type(400,'顶部最多添加 12 个分类入口，请先整理已有导航')
                    if any(item['categoryId']==cid for item in current['items']): raise self.error_type(409,'这个分类已经在顶部导航中，可以直接修改导航显示名')
                    nid=uuid.uuid4().hex
                    position=db.execute('SELECT COALESCE(MAX(position),-1)+1 FROM category_navigation').fetchone()[0]
                    db.execute('INSERT INTO category_navigation VALUES(?,?,?,?)',(nid,cid,label,position))
                    action='create-navigation'
                target=nid
            db.execute('UPDATE navigation_state SET revision=? WHERE id=1',(uuid.uuid4().hex,))
            db.execute('INSERT INTO audit VALUES(?,?,?,?)',(actor['id'],action,target,int(time.time())))
            return self.navigation_catalog(db)
