import {
  ArrowUpRight,
  Command,
  FileText,
  Sparkles,
  Sun,
  Zap,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { Work } from '../types'

// Code-native editorial artwork: the preview never relies on external image services.
export function CoverArt(props: { work: Work; className?: string }) {
  const { t } = useTranslation()
  const style = props.work.style
  if (props.work.cover) {
    return (
      <div className={`cc-art cc-art-image ${props.className ?? ''}`}>
        <img src={props.work.cover} alt='' />
      </div>
    )
  }
  return (
    <div
      className={`cc-art cc-art-${style} ${props.className ?? ''}`}
      aria-hidden
    >
      {style === 'horizon' && (
        <div className='cc-site-mock'>
          <div className='cc-mock-nav'>
            <span>horizon.</span>
            <span>INDEX / WORK / ABOUT</span>
          </div>
          <div className='cc-site-body'>
            <div>
              <small>HELLO, WORLD.</small>
              <strong>
                Stay curious.
                <br />
                Make things.
              </strong>
              <span className='cc-mini-cta'>
                Selected work <ArrowUpRight />
              </span>
            </div>
            <div className='cc-sun-sculpture'>
              <i />
              <i />
              <i />
            </div>
          </div>
          <div className='cc-site-foot'>
            <span>
              Designing a little
              <br />
              corner of the internet.
            </span>
            <span>↗ 01 — 08</span>
          </div>
        </div>
      )}
      {style === 'notes' && (
        <>
          <span className='cc-art-caption'>LIGHTNOTE / A PLACE FOR IDEAS</span>
          <div className='cc-note-sheet'>
            <small>MONDAY, A FRESH START</small>
            <strong>
              A little less noise.
              <br />A little more space.
            </strong>
            <span>☑ Make something small</span>
            <span>☐ Leave room for an idea</span>
            <span>☐ Take a walk</span>
            <i className='cc-note-line' />
          </div>
          <span className='cc-note-sticker'>
            <Sun />
          </span>
        </>
      )}
      {style === 'palette' && (
        <>
          <div className='cc-palette-title'>
            <span>soft / UI</span>
            <small>LESS NOISE. MORE FEELING.</small>
          </div>
          <div className='cc-ui-chips'>
            <span>
              Say hello <ArrowUpRight />
            </span>
            <span>
              <Sparkles /> New idea
            </span>
          </div>
          <div className='cc-palette-swatches'>
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
          <div className='cc-palette-foot'>
            A gentle interface kit <span>Aa</span>
          </div>
        </>
      )}
      {style === 'flow' && (
        <>
          <span className='cc-art-caption'>
            PAPERFLOW / YOUR READING COMPANION
          </span>
          <div className='cc-flow'>
            <div>
              <FileText />
              <span>Read</span>
            </div>
            <i />
            <div>
              <Sparkles />
              <span>Understand</span>
            </div>
            <i />
            <div>
              <Zap />
              <span>Connect</span>
            </div>
          </div>
          <span className='cc-flow-note'>One paper. A new perspective.</span>
        </>
      )}
      {style === 'guide' && (
        <>
          <span className='cc-guide-index'>FIELD NOTES / 001</span>
          <strong className='cc-guide-title'>
            Hello,
            <br />
            <em>API.</em>
          </strong>
          <div className='cc-code-tag'>
            <span>POST</span> /v1/chat/completions
          </div>
          <span className='cc-guide-foot'>
            A small step. A new possibility. <ArrowUpRight />
          </span>
        </>
      )}
      {style === 'orbit' && (
        <>
          <span className='cc-art-caption'>ORBIT / A MOMENT TO FOCUS</span>
          <div className='cc-timer'>
            <span>25:00</span>
            <small>make room for one thing</small>
          </div>
          <span className='cc-orbit-pill'>
            take your time <Sun />
          </span>
        </>
      )}
      {style === 'cloud' && (
        <>
          <div className='cc-cloud-orb' />
          <span className='cc-cloud-copy'>
            somewhere,
            <br />
            <em>in the clouds.</em>
          </span>
          <img
            className='cc-cloud-mascot'
            src='/branding/skymoni-cloud-friend-transparent.png'
            alt=''
          />
          <span className='cc-cloud-foot'>THE SKY COLLECTION / 01</span>
        </>
      )}
      {style === 'prompt' && (
        <>
          <span className='cc-art-caption'>
            PROMPT LAB / THINK IN POSSIBILITIES
          </span>
          <div className='cc-prompt-card'>
            <Command />
            <span>
              What if we tried
              <br />
              <strong>something new?</strong>
            </span>
            <i>
              <ArrowUpRight />
            </i>
          </div>
          <span className='cc-prompt-foot'>IDEA → DIRECTION → CREATE</span>
        </>
      )}
      {!props.work.sample && (
        <span className='cc-user-art-label'>
          {props.work.title || t('Untitled project')}
        </span>
      )}
    </div>
  )
}
