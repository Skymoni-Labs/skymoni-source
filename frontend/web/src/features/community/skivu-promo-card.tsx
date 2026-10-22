import { ArrowUpRight, Sparkles } from 'lucide-react'

import './skivu-launch.css'

export function SkivuPromoCard() {
  return (
    <section className='skivu-community-promo' aria-label='探索 Skivu'>
      <div>
        <span className='skivu-launch-eyebrow'>SKIVU · YOUR OWN ORBIT</span>
        <h2>一个属于你的 AI 空间。</h2>
        <p>自由选择模型，让角色、外观与每一次对话，都成为你的样子。</p>
        <div className='skivu-launch-actions'>
          <a href='/skivu/'>
            探索 Skivu <ArrowUpRight size={16} />
          </a>
          <a href='/creators/skivu-beta'>
            内测中心 <ArrowUpRight size={16} />
          </a>
        </div>
      </div>
      <div className='skivu-promo-mark' aria-hidden='true'>
        <Sparkles />
        <img src='/skivu/assets/skivu.png' alt='' />
      </div>
    </section>
  )
}
