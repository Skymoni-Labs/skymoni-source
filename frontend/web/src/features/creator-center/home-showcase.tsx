import { useQuery } from '@tanstack/react-query'
import { ArrowRight, ArrowUpRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { AnimateInView } from '@/components/animate-in-view'
import { CreatorAvatarMarquee } from '@/features/home-discovery/creator-avatar-marquee'
import { CreatorGallery } from '@/features/home-discovery/creator-gallery'

import { loadHomepageShowcase, type HomeAuthor } from './home-api'

import '@/styles/home-discovery.css'
import '@/styles/creator-home.css'

export function CreatorHomeShowcase() {
  const { t } = useTranslation()
  const query = useQuery({
    queryKey: ['home-creator-public'],
    queryFn: ({ signal }) => loadHomepageShowcase(signal),
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: false,
  })
  const works = query.data?.works ?? []
  const authors: HomeAuthor[] = (query.data?.authors ?? []).filter(
    (author) => !author.sample && author.userId > 0
  )
  if (
    query.data &&
    !query.data.config.galleryEnabled &&
    !query.data.config.marqueeEnabled
  ) {
    return null
  }
  const galleryMessage =
    query.data?.source === 'creator-center'
      ? t(
          'Real creations from the creator center, updated as projects are published.'
        )
      : '一份作品，一个新的开始。5 额度展示一年，10 额度永久展示。'
  let emptyMessage = '还没有公开的首页展示作品。'
  if (query.isLoading) emptyMessage = '正在加载首页作品…'
  else if (query.isError) emptyMessage = '暂时无法加载首页作品，请稍后重试。'
  return (
    <section
      className='hn-section hn-creators'
      id='creators'
      aria-labelledby='hn-creator-heading'
    >
      {query.data?.config.galleryEnabled !== false && (
        <>
          <AnimateInView className='hn-shell hn-section-heading'>
            <div>
              <p className='hn-kicker'>
                <span>03</span> A LITTLE SOMETHING, BY YOU
              </p>
              <h2 id='hn-creator-heading'>好作品，值得被看见。</h2>
              <p>让灵感流动，让每一份小小的创造在这里相遇。</p>
            </div>
            <a href='/creators' className='hn-text-link'>
              发现更多创作 <ArrowRight />
            </a>
          </AnimateInView>
          {works.length > 0 ? (
            <CreatorGallery
              key={works.map((work) => work.id).join(',')}
              works={works}
            />
          ) : (
            <p className='hn-shell hn-creator-empty' role='status'>
              {emptyMessage}
            </p>
          )}
          <div className='hn-shell hn-creator-footer'>
            <p>
              {works.length
                ? galleryMessage
                : '让你的第一份作品，从这里被看见。'}
            </p>
            <a href='/creators/workspace?tab=homepage' className='hn-text-link'>
              申请首页展示 <ArrowUpRight />
            </a>
          </div>
        </>
      )}
      {query.data?.config.marqueeEnabled !== false && (
        <CreatorAvatarMarquee creators={authors} />
      )}
    </section>
  )
}
