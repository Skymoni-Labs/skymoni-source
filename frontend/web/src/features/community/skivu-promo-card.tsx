import { Layers3, MessageCircle, Palette } from 'lucide-react'

import './skivu-promo-card.css'

// Stable positions keep the sky consistent across rerenders.
const stars = Array.from({ length: 32 }, (_, id) => ({
  id,
  x: (id * 37 + 11) % 100,
  y: (id * 23 + 7) % 100,
  size: id % 7 === 0 ? 2 : 1,
  delay: -(id % 6),
}))
const features = [
  {
    number: '01',
    Icon: Layers3,
    title: '多模型对话',
    detail: '为灵感，找到更多可能',
  },
  {
    number: '02',
    Icon: MessageCircle,
    title: '角色陪伴',
    detail: '让对话，拥有自己的性格',
  },
  {
    number: '03',
    Icon: Palette,
    title: '外观随心',
    detail: '把每一处，变成你的样子',
  },
]

export function SkivuPromoCard() {
  return (
    <section className='skivu-community-promo' aria-label='探索 Skivu'>
      <div className='sp-sky' aria-hidden='true'>
        <div
          className='sp-galaxy'
          style={{
            backgroundImage: "url('/skivu/assets/community-galaxy.webp')",
          }}
        />
        <div className='sp-sky-shade' />
        <span className='sp-comet' />
        <span className='sp-comet sp-comet-second' />
        {stars.map(({ id, x, y, size, delay }) => (
          <i
            key={id}
            style={{
              left: `${x}%`,
              top: `${y}%`,
              width: size,
              height: size,
              animationDelay: `${delay}s`,
            }}
          />
        ))}
      </div>
      <div className='sp-main'>
        <div className='sp-copy'>
          <div className='sp-eyebrow'>
            <span /> SKIVU <i /> YOUR OWN UNIVERSE
          </div>
          <h2>
            一个属于你的<span>AI 空间。</span>
          </h2>
          <p>
            让每次对话，更像你。
            <br />
            自由选择模型，遇见角色，也定义自己的界面。
          </p>
          <div className='sp-actions'>
            <a href='/skivu/' aria-label='探索 Skivu'>
              <span className='sp-button-friend' aria-hidden='true'>
                <img
                  src='/branding/skymoni-cloud-friend-transparent.png'
                  alt=''
                />
              </span>
              <span className='sp-button-label'>探索 Skivu</span>
            </a>
            <a href='/creators/skivu-beta' aria-label='内测中心'>
              <span className='sp-button-friend' aria-hidden='true'>
                <img
                  src='/branding/skymoni-cloud-friend-transparent.png'
                  alt=''
                />
              </span>
              <span className='sp-button-label'>内测中心</span>
            </a>
          </div>
        </div>
        <div className='sp-universe' aria-hidden='true'>
          <div className='sp-aura' />
          <div className='sp-orbit sp-orbit-outer' />
          <div className='sp-orbit sp-orbit-inner' />
          <div className='sp-orbit sp-orbit-cross' />
          <span className='sp-orbit-star sp-orbit-star-one' />
          <span className='sp-orbit-star sp-orbit-star-two' />
          <div
            className='sp-cloud'
            style={{ maskImage: "url('/skivu/assets/skivu.png')" }}
          />
          <div className='sp-coordinate'>
            SKIVU <span>·</span> A SPACE, FOR YOU
          </div>
        </div>
      </div>
      <div className='sp-features' aria-label='Skivu 已有功能'>
        {features.map(({ number, Icon, title, detail }) => (
          <div className='sp-feature' key={number}>
            <span className='sp-feature-icon'>
              <Icon />
            </span>
            <div>
              <span className='sp-feature-title'>{title}</span>
              <span className='sp-feature-detail'>{detail}</span>
            </div>
            <span className='sp-feature-number'>{number}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
