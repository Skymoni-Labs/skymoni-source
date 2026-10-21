from pathlib import Path
import json
from community import Store
r=Path(__file__).parent.parent
store=Store(r/'preview-data/community.db')
owner={'id':101,'username':'preview-maker','name':'本地验收用户','avatar':'','role':1}
reader={'id':102,'username':'preview-reader','name':'本地回复用户','avatar':'','role':1}
for actor in [owner,reader]: store.sync_member(actor)
topic=store.create_topic(owner,{'title':'本地验收：分享一个实用的开发经验','content':'这是仅用于本地界面验证的话题。\n\n## 分享一点经验\n\n- 写清楚问题背景\n- 附上复现步骤\n- 欢迎友善交流\n\n```python\nprint("hello skymoni")\n```','category':'development','tags':['Python','开发经验']})
store.reply(topic['id'],reader,{'content':'回复同样来自本地验收数据库，用于检查讨论楼层、引用和排版。'})
(r/'preview-topic.json').write_text(json.dumps(topic))
print('Local QA topic:',topic['id'])
