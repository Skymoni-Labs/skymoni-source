import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, expect, test, vi } from 'vitest'

import { BlockComposer } from '../components/block-composer'
import { ProjectContent } from '../components/project-content'
import { reorderBlocks } from '../lib/blocks'
import {
  duplicateProject,
  parseProject,
  serializeProject,
  templateComposition,
} from '../lib/configuration'
import { compositionSchema } from '../lib/schema'
import { createBlock, defaultSettings, emptyWork, settingsFor } from '../types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, args?: Record<string, unknown>) =>
      key.replaceAll(/\{\{(\w+)\}\}/g, (_, k) => String(args?.[k] ?? k)),
  }),
}))
afterEach(cleanup)

test('a project configuration roundtrips its composition and appearance without exporting local attachment IDs', () => {
  const work = {
    ...emptyWork(),
    title: 'My project',
    blocks: [{ ...createBlock('code'), text: 'console.log("hello")' }],
    settings: {
      ...defaultSettings(),
      accent: '#8180d7',
      buttonLabel: 'Try it',
      metadata: [{ id: 'version', label: 'Version', value: '1.2' }],
    },
    attachment: { id: 'private-local-file', name: 'archive.zip', size: 123 },
  }
  const text = serializeProject(work)
  const imported = parseProject(text)
  expect(imported).toMatchObject({
    title: work.title,
    settings: work.settings,
    status: 'draft',
  })
  expect(imported.id).not.toBe(work.id)
  expect(imported.blocks?.[0].text).toBe(work.blocks[0].text)
  expect(imported.blocks?.[0].id).not.toBe(work.blocks[0].id)
  expect(text).not.toContain('private-local-file')
  expect(imported.attachment).toBeUndefined()
})

test.each(['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>'])(
  'import rejects an executable link: %s',
  (url) => {
    const work = {
      ...emptyWork(),
      settings: {
        ...defaultSettings(),
        links: [{ id: 'x', label: 'Open', url }],
      },
    }
    expect(() => parseProject(serializeProject(work))).toThrow()
  }
)

test('import rejects unrecognized block types and duplicate block IDs', () => {
  const block = createBlock('text')
  const work = { ...emptyWork(), blocks: [block, block] }
  expect(() => parseProject(serializeProject(work))).toThrow()
  const data = JSON.parse(serializeProject({ ...work, blocks: [block] }))
  data.project.blocks[0].type = 'raw-html'
  expect(() => parseProject(JSON.stringify(data))).toThrow()
})

test('duplicating a draft gives it an independent composition', () => {
  const work = {
    ...emptyWork(),
    title: 'A project',
    blocks: [createBlock('text')],
    settings: defaultSettings(),
    status: 'review' as const,
  }
  const copy = duplicateProject(work)
  if (!copy.blocks || !copy.settings) throw new Error('Composition missing')
  copy.blocks[0].text = 'Changed copy'
  copy.settings.links.push({
    id: 'demo',
    label: 'Demo',
    url: 'https://example.com',
  })
  expect(copy.status).toBe('draft')
  expect(copy.id).not.toBe(work.id)
  expect(work.blocks[0].text).toBe('')
  expect(work.settings.links).toHaveLength(0)
})

test('templates have editable blocks and the blank template contains none', () => {
  expect(templateComposition('software').blocks.map((b) => b.type)).toContain(
    'list'
  )
  expect(templateComposition('design').settings.layout).toBe('showcase')
  expect(templateComposition('blank').blocks).toEqual([])
  expect(settingsFor(emptyWork())).toEqual(defaultSettings())
})

test('block order changes without changing IDs or other content', () => {
  const a = { ...createBlock('heading'), title: 'One' }
  const b = { ...createBlock('text'), text: 'Two' }
  expect(reorderBlocks([a, b], b.id, a.id)).toEqual([b, a])
  expect(reorderBlocks([a, b], 'unknown', a.id)).toEqual([a, b])
  expect(
    compositionSchema.safeParse({ blocks: [a, b], settings: defaultSettings() })
      .success
  ).toBe(true)
})

test('creators can add, edit, reorder and hide a block through the controls', async () => {
  const user = userEvent.setup()
  function Host() {
    const [blocks, setBlocks] = useState([createBlock('text')])
    return (
      <>
        <BlockComposer blocks={blocks} onChange={setBlocks} />
        <ProjectContent
          work={{
            ...emptyWork(),
            blocks,
            settings: { ...defaultSettings(), showCover: false },
          }}
        />
      </>
    )
  }
  render(<Host />)
  await user.click(screen.getByRole('button', { name: 'Heading' }))
  await user.type(screen.getByLabelText('Block title'), 'An original idea')
  expect(
    screen.getByRole('heading', { name: 'An original idea' })
  ).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Move block up' }))
  expect(screen.getByRole('button', { name: 'Move block up' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Hide block 1' }))
  expect(
    screen.queryByRole('heading', { name: 'An original idea' })
  ).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Show block 1' }))
  expect(
    screen.getByRole('heading', { name: 'An original idea' })
  ).toBeVisible()
})

test('rendering a draft suppresses unsafe links and hidden sections while preserving ordinary text', () => {
  const work = {
    ...emptyWork(),
    description: 'A useful introduction',
    blocks: [
      { ...createBlock('link'), url: 'javascript:alert(1)', title: 'Unsafe' },
      {
        ...createBlock('text'),
        title: 'Hidden block',
        text: 'Private note',
        visible: false,
      },
      { ...createBlock('code'), text: '<script>alert(1)</script>' },
    ],
    settings: {
      ...defaultSettings(),
      showCover: false,
      showDescription: false,
    },
  }
  const { container } = render(<ProjectContent work={work} />)
  expect(screen.queryByText('A useful introduction')).not.toBeInTheDocument()
  expect(screen.queryByText('Private note')).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Unsafe' })).not.toBeInTheDocument()
  expect(container.querySelector('script')).toBeNull()
  expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument()
})
