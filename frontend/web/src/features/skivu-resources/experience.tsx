import {
  ArrowRight,
  ArrowUpRight,
  MessageCircle,
  Palette,
  Play,
  Sparkles,
  Users,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'

const experiences = [
  {
    id: 'conversation',
    icon: MessageCircle,
    name: '多模型对话',
    title: '让想法，有回响。',
    text: '在不同模型之间自由选择。把日常的好奇、零散的灵感，聊成一个新的开始。',
    user: '想把今天的灵感，整理成一个开始。',
    reply: '先挑一个最想实现的想法。我们一起，把它拆成今天就能完成的第一步。',
    label: '灵感空间',
  },
  {
    id: 'characters',
    icon: Users,
    name: '角色与陪伴',
    title: '相处的方式，由你定义。',
    text: '写下喜欢的角色设定，调整语气和表达。每一段对话，都可以有自己的性格。',
    user: '今天有点累，想安静地聊一会。',
    reply: '慢慢说，我在这里。今天不用急着做什么，先给自己留一点轻松的时间。',
    label: '云朵 · 日常陪伴',
  },
  {
    id: 'appearance',
    icon: Palette,
    name: '外观自定义',
    title: '把偏爱，调成你的光。',
    text: '壁纸、主题、字体和对话气泡。从喜欢的颜色到恰好的透明，让每一次打开都像你。',
    user: '想给这里，换一片喜欢的风景。',
    reply:
      '星云、海岸，或一束温柔的晨光。选一个属于你的背景，让灵感在这里停留。',
    label: '你的专属空间',
  },
] as const

export function SkivuExperience() {
  const [selected, setSelected] = useState(0)
  const [blur, setBlur] = useState(12)
  const [theme, setTheme] = useState('nebula')
  const experience = experiences[selected]
  useEffect(() => {
    const selectFromHash = () => {
      const index = experiences.findIndex(
        (item) => `#${item.id}` === window.location.hash
      )
      if (index >= 0) setSelected(index)
    }
    selectFromHash()
    window.addEventListener('hashchange', selectFromHash)
    return () => window.removeEventListener('hashchange', selectFromHash)
  }, [])
  return (
    <section
      className='sr-section sr-experience'
      id='experience'
      aria-labelledby='sr-experience-title'
    >
      <span className='sr-anchor' id='conversation' />
      <span className='sr-anchor' id='characters' />
      <span className='sr-anchor' id='appearance' />
      <div className='sr-section-heading'>
        <div>
          <p className='sr-eyebrow'>01 / A SPACE THAT FEELS LIKE YOU</p>
          <h2 id='sr-experience-title'>不止对话，更是你的空间。</h2>
        </div>
        <p className='sr-heading-aside'>
          从一个想法开始，
          <br />
          把更多可能，留给自己。
        </p>
      </div>
      <div className='sr-experience-grid'>
        <div className='sr-experience-copy'>
          <div className='sr-experience-tabs' aria-label='探索 Skivu 功能'>
            {experiences.map((item, index) => (
              <button
                type='button'
                key={item.id}
                aria-pressed={selected === index}
                aria-controls='sr-experience-panel'
                onClick={() => setSelected(index)}
              >
                <span className='sr-tab-number' aria-hidden>
                  0{index + 1}
                </span>
                <item.icon size={18} />
                {item.name}
                <ArrowUpRight size={16} />
              </button>
            ))}
          </div>
          <div id='sr-experience-panel' aria-live='polite' key={experience.id}>
            <span className='sr-feature-index' aria-hidden>
              0{selected + 1}
            </span>
            <h3>{experience.title}</h3>
            <p>{experience.text}</p>
          </div>
          <a
            className='sr-inline-link'
            href={selected === 2 ? '#wallpapers' : '#download'}
          >
            {selected === 2 ? '挑选一片风景' : '在 Skivu 中开启体验'}
            <ArrowRight size={17} />
          </a>
        </div>
        <div className={`sr-demo sr-demo-${theme}`}>
          <div className='sr-demo-moon' aria-hidden />
          <div className='sr-demo-bar'>
            <span>
              <Sparkles size={15} />
              {experience.label}
            </span>
            <span aria-hidden>•••</span>
          </div>
          <div className='sr-demo-body' key={experience.id}>
            <span className='sr-demo-kicker'>A LITTLE MORE YOU</span>
            <p className='sr-demo-welcome'>此刻，想聊些什么？</p>
            <div className='sr-demo-user'>{experience.user}</div>
            <div
              className='sr-demo-reply'
              style={{ backdropFilter: `blur(${blur}px)` }}
            >
              <img
                src='/skivu/assets/skivu.png'
                alt=''
                width={30}
                height={30}
              />
              <p>{experience.reply}</p>
            </div>
          </div>
          <div className='sr-demo-controls'>
            <label htmlFor='sr-blur'>
              玻璃模糊 <output>{blur} px</output>
            </label>
            <input
              id='sr-blur'
              type='range'
              min={0}
              max={24}
              value={blur}
              onChange={(event) => setBlur(Number(event.target.value))}
            />
          </div>
          <div className='sr-demo-bottom'>
            <span>功能交互示意 · 不发起模型请求</span>
            <div aria-label='预览空间配色'>
              {[
                ['nebula', '星云'],
                ['aurora', '极光'],
                ['dawn', '晨曦'],
              ].map(([key, name]) => (
                <button
                  key={key}
                  type='button'
                  aria-label={`预览${name}配色`}
                  aria-pressed={theme === key}
                  onClick={() => setTheme(key)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export function SkivuStory() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <section className='sr-story' id='film' aria-labelledby='sr-film-title'>
        <img
          className='sr-story-backdrop'
          src='/skivu/assets/universe-finale-20261025.webp'
          alt=''
          loading='lazy'
        />
        <div>
          <p className='sr-eyebrow'>THE SKIVU STORY</p>
          <h2 id='sr-film-title'>
            从一束微光，
            <br />
            到你的宇宙。
          </h2>
          <p>让想象，穿过已知的边界。</p>
        </div>
        <button
          type='button'
          onClick={() => setOpen(true)}
          aria-label='播放 Skivu 品牌短片'
        >
          <span>
            <Play size={23} fill='currentColor' />
          </span>
          <strong>
            观看品牌短片<small>00:40 / YOUR UNIVERSE</small>
          </strong>
        </button>
      </section>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className='sr-film-dialog'>
          <DialogTitle>Skivu · 一个属于你的 AI 空间</DialogTitle>
          <DialogDescription>
            品牌短片 · 40 秒 · 默认静音，可在播放器内开启声音。
          </DialogDescription>
          {open && (
            <iframe
              src='/skivu/film/index.html'
              title='Skivu 品牌宣传片'
              sandbox='allow-scripts'
              allow='fullscreen'
              allowFullScreen
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
