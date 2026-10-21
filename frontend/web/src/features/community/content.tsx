/* eslint-disable react/no-danger -- HTML is restricted by the shared forum sanitizer before rendering. */
import DOMPurify from 'dompurify'
import { useMemo } from 'react'

import { Markdown } from '@/components/ui/markdown'

import { forumMarkdownSanitize } from './markdown'
import type { TopicFormat } from './types'

export function CommunityContent(props: {
  children: string
  format?: TopicFormat
  className?: string
}) {
  const html = useMemo(
    () =>
      props.format === 'html'
        ? DOMPurify.sanitize(props.children, forumMarkdownSanitize)
        : '',
    [props.children, props.format]
  )
  if (props.format === 'html') {
    return (
      <div
        className={`sf-article-content sf-html-content ${props.className ?? ''}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    )
  }
  if (props.format === 'text') {
    return (
      <div
        className={`sf-article-content sf-text-content ${props.className ?? ''}`}
      >
        {props.children}
      </div>
    )
  }
  return (
    <Markdown
      sanitizeOptions={forumMarkdownSanitize}
      className={`sf-article-content ${props.className ?? ''}`}
    >
      {props.children}
    </Markdown>
  )
}
