import { createRoot } from 'react-dom/client'

import { TopicReader } from '../src/features/community/topic-reader'
import type { TopicDetail } from '../src/features/community/types'

import '../src/styles/community.css'
import '../src/styles/community-polish.css'
import '../src/styles/community-daylight.css'

const root = createRoot(document.getElementById('root')!)
const data = (await fetch(
  '/api/community/topics/487fae0d09b241be80b9904937905a0f'
).then((response) => response.json())) as { data: TopicDetail }
const { topic, posts } = data.data
root.render(
  <main
    className='community-shell cp-platform'
    style={{ padding: '24px', minHeight: '100vh' }}
  >
    <article className='sf-post' style={{ maxWidth: '960px', margin: 'auto' }}>
      <div className='sf-post-body'>
        <h1 style={{ marginBottom: '20px', fontSize: '22px' }}>
          {topic.title}
        </h1>
        <TopicReader
          content={posts[0].content}
          format={posts[0].contentFormat ?? topic.contentFormat}
          prompt
        />
      </div>
    </article>
  </main>
)
