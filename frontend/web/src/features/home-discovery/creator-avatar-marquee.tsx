import type { HomeAuthor } from '@/features/creator-center/home-api'

export function CreatorAvatarMarquee({ creators }: { creators: HomeAuthor[] }) {
  const examples = creators.every((creator) => creator.sample)
  if (!creators.length) return null

  return (
    <section
      className='hn-shell hn-avatar-marquee'
      aria-labelledby='hn-creator-marquee-heading'
      data-single={creators.length === 1 || undefined}
    >
      <h3 id='hn-creator-marquee-heading'>
        每一份作品背后，都有一个爱创造的人。
        {examples && <span>示例创作者</span>}
      </h3>
      <div className='hn-avatar-viewport'>
        <div className='hn-avatar-track'>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((copy) => (
            <ul
              className='hn-avatar-group'
              key={copy}
              aria-hidden={copy > 0 || undefined}
              data-duplicate={copy > 0 || undefined}
            >
              {creators.map((creator) => {
                const name = creator.name.trim() || '创作者'
                return (
                  <li key={creator.userId} title={name}>
                    <a
                      className='hn-avatar-link'
                      href={`/creators/people/${encodeURIComponent(creator.profileId ?? String(creator.userId))}`}
                      aria-label={`查看 ${name} 的创作者主页`}
                      tabIndex={copy > 0 ? -1 : 0}
                    >
                      <span
                        className='hn-avatar-portrait'
                        data-style={
                          ['horizon', 'cloud', 'flow', 'palette'][
                            Math.abs(creator.userId) % 4
                          ]
                        }
                        aria-hidden
                      >
                        {creator.avatar || !creator.sample ? (
                          <img
                            src={creator.avatar || '/skymoni-avatar.png'}
                            alt=''
                            loading='lazy'
                          />
                        ) : (
                          [...name][0].toLocaleUpperCase()
                        )}
                      </span>
                      <span className='hn-avatar-name'>{name}</span>
                    </a>
                  </li>
                )
              })}
            </ul>
          ))}
        </div>
      </div>
    </section>
  )
}
