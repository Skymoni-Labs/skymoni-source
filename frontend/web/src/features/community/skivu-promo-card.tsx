import {
  ArrowUpRight,
  Layers3,
  MessageCircle,
  Palette,
  Sparkles,
} from 'lucide-react'

import './skivu-promo-card.css'

const stars = [
  [8, 18, 1, 0],
  [25, 76, 1, 2],
  [41, 12, 2, 1],
  [56, 87, 1, 4],
  [68, 18, 1, 3],
  [79, 72, 2, 1],
  [92, 30, 1, 5],
  [94, 87, 1, 2],
  [53, 47, 1, 2],
  [72, 43, 1, 0],
  [17, 92, 1, 4],
  [36, 40, 1, 3],
]

export function SkivuPromoCard() {
  return (
    <section className='skivu-community-promo' aria-label='探索 Skivu'>
      <div className='sp-sky' aria-hidden='true'>
        <div className='sp-nebula' />
        <div className='sp-horizon' />
        <span className='sp-comet' />
        {stars.map(([x, y, size, delay]) => (
          <i
            key={`${x}-${y}`}
            style={{
              left: `${x}%`,
              top: `${y}%`,
              width: size,
              height: size,
              animationDelay: `${-delay}s`,
            }}
          />
        ))}
      </div>
      <div className='sp-copy'>
        <div className='sp-eyebrow'>
          <span /> SKIVU <i /> YOUR OWN ORBIT
        </div>
        <h2>
          一个属于你的<span>AI 空间。</span>
        </h2>
        <p>
          让每次对话，更像你。
          <br />
          自由选择模型，遇见角色，也定义自己的界面。
        </p>
        <div className='sp-features' aria-label='Skivu 已有功能'>
          <span>
            <Layers3 />
            多模型对话
          </span>
          <span>
            <MessageCircle />
            角色陪伴
          </span>
          <span>
            <Palette />
            外观随心
          </span>
        </div>
        <div className='sp-actions'>
          <a href='/skivu/'>
            探索 Skivu{' '}
            <span>
              <ArrowUpRight size={16} />
            </span>
          </a>
          <a href='/creators/skivu-beta'>
            内测中心 <ArrowUpRight size={16} />
          </a>
        </div>
      </div>
      <div className='sp-universe' aria-hidden='true'>
        <span className='sp-wordmark'>Skivu</span>
        <div className='sp-orbit sp-orbit-one' />
        <div className='sp-orbit sp-orbit-two' />
        <svg className='sp-constellation' viewBox='0 0 360 280' fill='none'>
          <path d='M43 190Q115 230 183 139T318 78M83 56Q210 40 183 139T291 239' />
          <circle cx='43' cy='190' r='3' />
          <circle cx='318' cy='78' r='3' />
          <circle cx='83' cy='56' r='2' />
          <circle cx='291' cy='239' r='2' />
        </svg>
        <div className='sp-core-glow' />
        <div className='sp-core'>
          <div>
            <img src='/skivu/assets/skivu.png' alt='' />
          </div>
        </div>
        <span className='sp-satellite sp-satellite-one'>
          <MessageCircle />
        </span>
        <span className='sp-satellite sp-satellite-two'>
          <Sparkles />
        </span>
        <span className='sp-satellite sp-satellite-three'>
          <Palette />
        </span>
        <span className='sp-universe-caption'>
          <i /> A SPACE, FOR YOU
        </span>
      </div>
    </section>
  )
}
