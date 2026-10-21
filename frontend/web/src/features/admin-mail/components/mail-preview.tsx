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
import DOMPurify from 'dompurify'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

/** Keep the email document's colors and spacing separate from the console. */
export function MailPreview({ html }: { html: string }) {
  const { t } = useTranslation()
  const frame = useRef<HTMLIFrameElement>(null)
  const observer = useRef<ResizeObserver | null>(null)
  const [height, setHeight] = useState(320)
  const documentHtml = useMemo(() => {
    const sanitized = DOMPurify.sanitize(html, {
      WHOLE_DOCUMENT: true,
      FORBID_TAGS: [
        'script',
        'style',
        'link',
        'base',
        'meta',
        'iframe',
        'object',
        'embed',
        'form',
        'input',
        'button',
        'video',
        'audio',
      ],
    })
    const document = new DOMParser().parseFromString(sanitized, 'text/html')
    document.querySelectorAll('img').forEach((image) => {
      if (
        !/^https:\/\/skymoni\.com\/api\/model-sales\/public\/[a-f0-9]{32}\/countdown\.gif$/.test(
          image.getAttribute('src') ?? ''
        ) &&
        !/^https:\/\/skymoni\.com\/api\/admin-mail-images\/[a-f0-9]{64}\.(png|jpg|gif)$/.test(
          image.getAttribute('src') ?? ''
        )
      ) {
        image.remove()
        return
      }
      image.removeAttribute('srcset')
      image.removeAttribute('sizes')
    })
    document.querySelectorAll('a').forEach((link) => {
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
    })
    return `<!doctype html>${document.documentElement.outerHTML}`
  }, [html])

  useEffect(() => () => observer.current?.disconnect(), [])

  const measureDocument = () => {
    observer.current?.disconnect()
    const body = frame.current?.contentDocument?.body
    if (!body) return
    const updateHeight = () => {
      setHeight(Math.max(160, Math.ceil(body.getBoundingClientRect().height)))
    }
    updateHeight()
    if (typeof ResizeObserver !== 'undefined') {
      observer.current = new ResizeObserver(updateHeight)
      observer.current.observe(body)
    }
  }

  return (
    <iframe
      ref={frame}
      title={t('Email preview')}
      className='block w-full min-w-0 rounded-lg border-0 bg-white'
      style={{ height, colorScheme: 'light' }}
      sandbox='allow-same-origin allow-popups allow-popups-to-escape-sandbox'
      referrerPolicy='no-referrer'
      srcDoc={documentHtml}
      onLoad={measureDocument}
    />
  )
}
