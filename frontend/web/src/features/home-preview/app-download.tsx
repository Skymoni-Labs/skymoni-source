/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import {
  ArrowUpRight,
  ArrowDownToLine,
  Boxes,
  Copy,
  Home,
  Image,
  KeyRound,
  LayoutDashboard,
  MessageCircle,
  PanelLeft,
  Plus,
  Send,
  Sparkles,
  UserRound,
  Wallet,
  Cloud,
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import { useAndroidRelease } from './app-release'

import '@/styles/app-download.css'

function PhonePreview(props: { chat?: boolean }) {
  const { t } = useTranslation()
  if (props.chat) {
    return (
      <div className='ad-screen ad-chat-screen'>
        <div className='ad-screen-header'>
          <PanelLeft size={13} />
          <div>
            {t('Explain some code')}
            <small>skymoni · {t('Chat')}</small>
          </div>
          <Plus size={14} />
        </div>
        <div className='ad-chat-messages'>
          <div className='ad-mini-user'>
            {t('Help me understand this code.')}
          </div>
          <h3>{t('A little more clarity.')}</h3>
          <p>{t('This line prints a greeting on the screen.')}</p>
          <div className='ad-mini-code'>
            <div>
              python<span>{t('Copy')}</span>
            </div>
            <pre>
              <code>print("Hello, skymoni")</code>
            </pre>
          </div>
          <p>{t('We can talk about formulas, too:')}</p>
          <div className='ad-mini-math'>E = mc²</div>
          <div className='ad-mini-usage'>
            <Copy size={11} />
            {t('Copy')} · {t('Regenerate')}
          </div>
        </div>
        <div className='ad-mini-composer'>
          <div className='ad-mini-placeholder'>{t('Send a message…')}</div>
          <div className='ad-mini-composer-controls'>
            <span className='ad-mini-model'>
              <Boxes size={11} />
              {t('Choose model')} ⌄
            </span>
            <Image size={14} />
            <span className='ad-mini-send'>
              <Send size={13} />
            </span>
          </div>
        </div>
      </div>
    )
  }
  return (
    <div className='ad-screen'>
      <div className='ad-screen-header'>
        <img
          className='ad-screen-brand'
          src='/branding/skymoni-app-mascot.png'
          alt=''
        />
        <div>
          skymoni.<small>PERSONAL WORKSPACE</small>
        </div>
        <Sparkles size={14} />
      </div>
      <div className='ad-screen-body'>
        <h3 className='ad-home-title'>{t('Every idea belongs to you.')}</h3>
        <div className='ad-mini-identity'>
          <span className='ad-mini-eyebrow'>YOUR SKYMONI</span>
          <h3>
            {t('Your own space.')}
            <br />
            {t('Start here.')}
          </h3>
          <p>{t('Sign in to get your account card.')}</p>
          <div className='ad-mini-login'>{t('Sign in to skymoni')} ↗</div>
        </div>
        <div className='ad-mini-chat-entry'>
          <Sparkles size={18} />
          <div>
            <strong>{t('Start a new idea')}</strong>
            <small>{t('Make it happen with AI.')}</small>
          </div>
        </div>
        <div className='ad-mini-shortcuts'>
          <span>
            <KeyRound />
            {t('API Keys')}
          </span>
          <span>
            <Wallet />
            {t('Wallet')}
          </span>
          <span>
            <Boxes />
            {t('My warehouse')}
          </span>
          <span>
            <Boxes />
            {t('Models')}
          </span>
        </div>
      </div>
      <div className='ad-mini-dock'>
        <span>
          <Home size={16} />
          {t('Home')}
        </span>
        <span>
          <MessageCircle size={16} />
          AI
        </span>
        <span>
          <Boxes size={16} />
          {t('Console')}
        </span>
        <span>
          <Wallet size={16} />
          {t('Store')}
        </span>
        <span>
          <UserRound size={16} />
          {t('Me')}
        </span>
      </div>
    </div>
  )
}

export function AppDownload() {
  const { t } = useTranslation()
  const androidRelease = useAndroidRelease()
  let releaseStatus = t('Currently under maintenance.')
  if (androidRelease.loading) {
    releaseStatus = t('Checking the latest version…')
  } else if (androidRelease.error) {
    releaseStatus = t('Version information unavailable.')
  } else if (androidRelease.available) {
    releaseStatus = t('Officially available.')
  }
  return (
    <section
      id='app-download'
      className='ad-section hp-container'
      aria-labelledby='ad-title'
    >
      <div className='ad-showcase'>
        <div className='ad-copy'>
          <div className='ad-eyebrow'>
            <span />
            SKYMONI APP
          </div>
          <h2 id='ad-title'>
            {t('skymoni App,')}
            <br />
            <span>{releaseStatus}</span>
          </h2>
          <p className='ad-description'>
            {t(
              'Sign in with your station account to continue chatting and view your history.'
            )}
          </p>
          <ul className='ad-features'>
            <li>
              <MessageCircle size={16} />
              {t('Chat with multiple models')}
            </li>
            <li>
              <Cloud size={16} />
              {t('History follows your account')}
            </li>
            <li>
              <UserRound size={16} />
              {t('Manage your account')}
            </li>
          </ul>
          <div className='ad-release-actions'>
            {!androidRelease.loading && androidRelease.available && (
              <Button
                role='link'
                className='ad-primary'
                render={
                  <a
                    href={androidRelease.url}
                    download={`skymoni-${androidRelease.version}.apk`}
                  />
                }
              >
                <ArrowDownToLine size={17} />
                {t('Download for Android')}
              </Button>
            )}
            {androidRelease.error && (
              <Button className='ad-primary' onClick={androidRelease.retry}>
                {t('Retry')}
              </Button>
            )}
            {!androidRelease.error &&
              (androidRelease.loading || !androidRelease.available) && (
                <Button disabled className='ad-primary'>
                  {androidRelease.loading
                    ? t('Checking the latest version…')
                    : t('App under maintenance')}
                </Button>
              )}
            <a className='ad-more' href='#ad-release-note'>
              {t('Release notes')}
              <ArrowUpRight size={16} />
            </a>
          </div>
          <div className='ad-platform-note'>
            Android 7.0+
            {androidRelease.available && ` · v${androidRelease.version}`}
            <span>·</span>
            {t('iOS support is coming later.')}
          </div>
          <div
            className='ad-colors'
            aria-label={t(
              'Sea salt blue by default, with rose and turquoise options.'
            )}
          >
            <i className='ad-blue' />
            <i className='ad-rose' />
            <i className='ad-jade' />
            <span>{t('Sea salt blue by default. Make it your own.')}</span>
          </div>
        </div>
        <div
          className='ad-art'
          role='img'
          aria-label={t('Illustrative skymoni mobile screens')}
        >
          <div aria-hidden='true'>
            <i className='ad-orbit' />
            <i className='ad-orbit ad-orbit-two' />
            <div className='ad-floating-icon'>
              <img src='/branding/skymoni-app-mascot.png' alt='' />
            </div>
            <div className='ad-phone ad-phone-back'>
              <i className='ad-phone-camera' />
              <PhonePreview />
            </div>
            <div className='ad-phone ad-phone-front'>
              <i className='ad-phone-camera' />
              <PhonePreview chat />
            </div>
            <div className='ad-glass-tag'>
              <MessageCircle size={17} />
              {t('Keep your ideas going.')}
            </div>
            <span className='ad-ui-note'>{t('Illustrative screens')}</span>
          </div>
        </div>
      </div>
      <div className='ad-release-footer' id='ad-release-note'>
        <div className='ad-footer-brand'>
          <img
            src='/branding/skymoni-app-mascot.png'
            width='36'
            height='36'
            alt=''
          />
          <div>
            <strong>{t('One account. On the web and on your phone.')}</strong>
            <p>
              {t(
                'Android 64-bit · Native chat, wallet, store and account management.'
              )}
            </p>
            <a className='ad-more' href='/app-releases/release.json'>
              {t('Version and SHA-256 verification')}
            </a>
          </div>
        </div>
        {androidRelease.available && (
          <div className='ad-qr-note'>
            <QRCodeSVG
              value='https://skymoni.com/app'
              size={64}
              marginSize={0}
              title={t('Scan to open the official app download page')}
            />
            <span>{t('Scan to download')}</span>
          </div>
        )}
      </div>
    </section>
  )
}

export function ConsoleEntry() {
  const { t } = useTranslation()
  return (
    <a
      className='ad-hero-entry'
      href='/dashboard'
      target='_blank'
      rel='noopener noreferrer'
    >
      <span className='ad-entry-icon'>
        <LayoutDashboard size={20} />
      </span>
      <span>
        <strong>{t('Open the console')}</strong>
        <small>{t('Manage your account, API keys and usage.')}</small>
      </span>
      <span className='ad-entry-arrow'>
        <ArrowUpRight size={18} />
      </span>
    </a>
  )
}
