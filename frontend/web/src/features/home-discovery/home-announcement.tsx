import { useQuery } from '@tanstack/react-query'
import { ChevronDown, Megaphone } from 'lucide-react'

import { RichContent } from '@/components/rich-content'
import { getNotice } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'

import '@/styles/home-announcement.css'

export function HomeAnnouncement() {
  const { data } = useQuery({
    queryKey: ['notice'],
    queryFn: async () => requireServerSuccess(await getNotice()),
    staleTime: 1000 * 60 * 5,
  })
  const firstSection = (data?.data ?? '')
    .trim()
    .split(/\r?\n\s*---\s*\r?\n/, 1)[0]
  if (!firstSection) return null

  const [heading, ...lines] = firstSection.split(/\r?\n/)
  const title = heading
    .replace(/^#{1,6}\s*/, '')
    .replaceAll('**', '')
    .trim()

  return (
    <section className='hn-shell hn-announcement' aria-label='平台公告'>
      <details className='hn-announcement-card'>
        <summary className='hn-announcement-summary'>
          <span className='hn-announcement-icon' aria-hidden='true'>
            <Megaphone size={20} />
          </span>
          <span className='hn-announcement-copy'>
            <span className='hn-announcement-label'>平台公告</span>
            <strong>{title}</strong>
          </span>
          <span className='hn-announcement-action' aria-hidden='true'>
            查看详情 <ChevronDown size={16} />
          </span>
        </summary>
        <div className='hn-announcement-content'>
          <RichContent breaks content={lines.join('\n').trim()} />
        </div>
      </details>
    </section>
  )
}
