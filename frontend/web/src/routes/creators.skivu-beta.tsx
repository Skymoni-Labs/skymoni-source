import { createFileRoute } from '@tanstack/react-router'

import { AppBetaCard } from '@/features/community/app-beta-card'

import '@/features/community/skivu-launch.css'

export const Route = createFileRoute('/creators/skivu-beta')({
  component: BetaCenter,
})

function BetaCenter() {
  return (
    <main className='skivu-beta-center'>
      <a className='skivu-back-link' href='/skivu/'>
        ← 探索 Skivu
      </a>
      <header>
        <span className='skivu-launch-eyebrow'>THE INNER CIRCLE / SKIVU</span>
        <h1>
          下一次进化，<span>与你有关。</span>
        </h1>
        <p>加入内测，一起打磨属于你的 AI 空间。</p>
      </header>
      <div className='skivu-beta-center-grid'>
        <div>
          <AppBetaCard redirectTo='/creators/skivu-beta' />
        </div>
        <aside>
          <span className='skivu-launch-eyebrow'>TAKE SKIVU WITH YOU</span>
          <h2>
            先把 Skivu
            <br />
            装进口袋。
          </h2>
          <p>使用同一社区账号登录 App，同步你的内测资格与额度。</p>
          <a
            className='skivu-download-link'
            href='https://github.com/skyjjgw/skivu/releases/latest'
            target='_blank'
            rel='noreferrer'
          >
            下载 Android 版 ↗
          </a>
          <small>
            注册与申请不会自动赠送额度。审核通过后，额度由管理员手动分配，与中转站余额独立。
          </small>
          <a className='skivu-back-link' href='/creators'>
            前往社区 →
          </a>
        </aside>
      </div>
    </main>
  )
}
