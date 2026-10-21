import {
  ArrowRight01Icon,
  SourceCodeIcon,
  PackageIcon,
  GlobalIcon,
  FavouriteIcon,
  Mail01Icon,
  SparklesIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { AnimateInView } from '@/components/animate-in-view'
import { Button } from '@/components/ui/button'
import { HomeFooter } from '@/features/home-preview/footer'

import '@/styles/home-preview.css'
import '@/styles/about.css'

const services = [
  {
    icon: SourceCodeIcon,
    title: 'Model access',
    text: 'Find available models, compare prices and connect your application through skymoni.',
    href: '/pricing',
    action: 'Explore models',
    tone: 'blue',
  },
  {
    icon: PackageIcon,
    title: 'Tools for your ideas',
    text: 'Discover Drip Browser, skymoni Mail and useful tools from the developer community.',
    href: '/software',
    action: 'Explore software',
    tone: 'mint',
  },
  {
    icon: SparklesIcon,
    title: 'Resources within reach',
    text: 'Find digital resources in the store and manage your purchases in My Warehouse.',
    href: '/store',
    action: 'Explore the store',
    tone: 'violet',
  },
] as const

const steps = [
  {
    title: 'Choose a model',
    text: 'Check model availability, group access and pricing in Model Square.',
    href: '/pricing',
    action: 'Model Square',
  },
  {
    title: 'Create your API key',
    text: 'Sign in, open API Keys and create a key for your application. Keep it private.',
    href: '/keys',
    action: 'API Keys',
  },
  {
    title: 'Connect and try it',
    text: 'Set the base URL in a compatible client, select the full model name and send your first request.',
    href: '/playground',
    action: 'Playground',
  },
] as const

export function SkymoniAbout() {
  const { t } = useTranslation()
  return (
    <div className='hp-page ab-page'>
      <main>
        <section className='ab-hero' aria-labelledby='about-title'>
          <div className='ab-container ab-hero-grid'>
            <div className='ab-hero-copy'>
              <span className='ab-eyebrow'>ABOUT SKYMONI</span>
              <p className='ab-intro'>
                {t('A small spark. A world of possibilities.')}
              </p>
              <h1 id='about-title'>
                {t('A place for your ideas.')}
                <br />
                <span>{t('A little more possible.')}</span>
              </h1>
              <p className='ab-lead'>
                {t(
                  'skymoni connects AI models, everyday tools and digital resources, so your next idea has somewhere to begin.'
                )}
              </p>
              <div className='ab-actions'>
                <Button
                  role='link'
                  className='ab-primary'
                  render={<Link to='/software' />}
                >
                  {t('Explore software')}
                  <HugeiconsIcon
                    icon={ArrowRight01Icon}
                    data-icon='inline-end'
                    aria-hidden='true'
                  />
                </Button>
                <Button
                  role='link'
                  variant='outline'
                  className='ab-secondary'
                  render={<a href='#guide' />}
                >
                  {t('Quick start guide')}
                  <HugeiconsIcon
                    icon={ArrowRight01Icon}
                    data-icon='inline-end'
                    aria-hidden='true'
                  />
                </Button>
              </div>
              <div className='ab-signature'>
                <span aria-hidden='true' />
                {t('Models, tools and resources, connected.')}
              </div>
            </div>
            <div className='ab-scene' aria-hidden='true'>
              <div className='ab-orbit ab-orbit-one' />
              <div className='ab-orbit ab-orbit-two' />
              <div className='ab-scene-glow' />
              <span className='ab-star ab-star-one'>✦</span>
              <span className='ab-star ab-star-two'>✧</span>
              <div className='ab-mascot'>
                <div className='hp-cloud-crop'>
                  <img
                    src='/branding/skymoni-cloud-friend-transparent.png'
                    alt=''
                    width='240'
                    height='240'
                  />
                </div>
                <strong>skymoni</strong>
                <span>{t('Your AI workspace')}</span>
              </div>
              <div className='ab-scene-label ab-label-model'>
                <HugeiconsIcon icon={SourceCodeIcon} size={18} />
                {t('Model access')}
              </div>
              <div className='ab-scene-label ab-label-tool'>
                <HugeiconsIcon icon={GlobalIcon} size={18} />
                {t('Everyday tools')}
              </div>
              <div className='ab-scene-label ab-label-mail'>
                <HugeiconsIcon icon={Mail01Icon} size={18} />
                {t('skymoni Mail')}
              </div>
              <div className='ab-scene-note'>
                <HugeiconsIcon icon={FavouriteIcon} size={16} />
                <span>{t('Made for the things you want to create.')}</span>
              </div>
            </div>
          </div>
        </section>

        <AnimateInView as='section' className='ab-container ab-story'>
          <div>
            <span className='ab-eyebrow'>OUR IDEA</span>
            <h2>{t('Useful things, brought a little closer.')}</h2>
          </div>
          <div className='ab-story-copy'>
            <p>
              {t(
                'A model is only the beginning. The browser you open, the tools you work with and the resources you collect all become part of the same creative process.'
              )}
            </p>
            <p>
              {t(
                'We are building skymoni around that everyday experience: a clear place to discover, connect and get started.'
              )}
            </p>
          </div>
        </AnimateInView>

        <section
          className='ab-container ab-services'
          aria-labelledby='about-services'
        >
          <AnimateInView className='ab-section-heading'>
            <span className='ab-eyebrow'>EXPLORE SKYMONI</span>
            <h2 id='about-services'>{t('Start with what you need.')}</h2>
            <p>{t('From a first request to your everyday workspace.')}</p>
          </AnimateInView>
          <div className='ab-service-grid'>
            {services.map((service, index) => (
              <AnimateInView
                key={service.title}
                delay={index * 70}
                className={`ab-service ab-service-${service.tone}`}
              >
                <span className='ab-service-icon'>
                  <HugeiconsIcon
                    icon={service.icon}
                    size={24}
                    aria-hidden='true'
                  />
                </span>
                <span className='ab-service-number' aria-hidden='true'>
                  0{index + 1}
                </span>
                <h3>{t(service.title)}</h3>
                <p>{t(service.text)}</p>
                <Link to={service.href} className='ab-text-link'>
                  {t(service.action)}
                  <HugeiconsIcon
                    icon={ArrowRight01Icon}
                    size={16}
                    aria-hidden='true'
                  />
                </Link>
              </AnimateInView>
            ))}
          </div>
        </section>

        <section
          id='guide'
          className='ab-container ab-guide'
          aria-labelledby='about-guide-title'
        >
          <AnimateInView className='ab-guide-heading'>
            <span className='ab-eyebrow'>QUICK START</span>
            <h2 id='about-guide-title'>
              {t('Your first connection, step by step.')}
            </h2>
            <p>{t('skymoni user guide')}</p>
            <div className='ab-endpoint'>
              <span>API BASE URL</span>
              <code>https://skymoni.com/v1</code>
            </div>
            <p className='ab-guide-note'>
              {t(
                'Use the API base URL format required by your client. Protocol-specific endpoints may differ.'
              )}
            </p>
          </AnimateInView>
          <ol className='ab-steps'>
            {steps.map((step, index) => (
              <li key={step.title}>
                <span className='ab-step-number' aria-hidden='true'>
                  0{index + 1}
                </span>
                <div>
                  <h3>{t(step.title)}</h3>
                  <p>{t(step.text)}</p>
                  <Link to={step.href} className='ab-text-link'>
                    {t(step.action)}
                    <HugeiconsIcon
                      icon={ArrowRight01Icon}
                      size={14}
                      aria-hidden='true'
                    />
                  </Link>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <AnimateInView className='ab-container ab-notes'>
          <div>
            <h3>{t('Before you begin')}</h3>
            <p>
              {t(
                'Usage is charged to your site balance or subscription. Upstream routing is automatic; provider limits still apply.'
              )}
            </p>
            <p>
              {t(
                'Third-party tools have their own accounts, terms and pricing. Check their official websites for supported connections.'
              )}
            </p>
          </div>
          <div>
            <h3>{t('More ways to connect')}</h3>
            <p>
              {t(
                'Jev uses structured state and questions. Read the decision API guide before calling it.'
              )}
            </p>
            <a href='/jev' className='ab-text-link'>
              {t('Jev decision API')}
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                size={14}
                aria-hidden='true'
              />
            </a>
          </div>
        </AnimateInView>
      </main>
      <HomeFooter />
    </div>
  )
}
