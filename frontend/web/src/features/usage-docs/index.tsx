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
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getRouteApi,
  Link,
  useBlocker,
  useNavigate,
} from '@tanstack/react-router'
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronRight,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  Globe,
  List,
  Loader2,
  Pencil,
  Search,
  Share2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import { loadAdminDocs, publicDocs, saveDoc } from './api'
import { DocContent } from './content'
import { DocEditor } from './editor'
import {
  newDocPage,
  editorOutline,
  type DocEntry,
  type DocPage,
  type OutlineItem,
  type PublicDoc,
} from './types'

import '@/styles/usage-docs.css'

const route = getRouteApi('/docs')
const folderStorageKey = 'skymoni-usage-docs-folders'
export function UsageDocs() {
  const user = useAuthStore((s) => s.auth.user)
  const { doc, edit } = route.useSearch()
  return (
    <DocsWorkspace
      key={`${user?.id}:${doc}:${edit}`}
      admin={(user?.role ?? 0) >= ROLE.SUPER_ADMIN}
      actor={user?.id ?? 0}
    />
  )
}
export function DocsWorkspace({
  admin,
  actor,
}: {
  admin: boolean
  actor: number
}) {
  const { doc, edit: requestedEdit } = route.useSearch()
  const edit = admin && requestedEdit
  const navigate = useNavigate()
  const client = useQueryClient()
  const [search, setSearch] = useState('')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mobileSection, setMobileSection] = useState<'documents' | 'outline'>(
    'documents'
  )
  const [searchFolders, setSearchFolders] = useState<Record<string, boolean>>(
    {}
  )
  const [expandedFolders, setExpandedFolders] = useState<
    Record<string, boolean>
  >(() => {
    try {
      const value: unknown = JSON.parse(
        sessionStorage.getItem(folderStorageKey) || '{}'
      )
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return Object.fromEntries(
          Object.entries(value).filter(
            ([, expanded]) => typeof expanded === 'boolean'
          )
        )
      }
    } catch {
      // The directory still works when browser storage is unavailable.
    }
    return {}
  })
  const [outline, setOutline] = useState<OutlineItem[]>([])
  const [activeHeading, setActiveHeading] = useState('')
  const [creating, setCreating] = useState(false)
  const [liveDraft, setLiveDraft] = useState<{
    id: string
    page: DocPage
  } | null>(null)
  const [dirty, setDirty] = useState(false)
  const skipBlock = useRef(false)
  useBlocker({
    shouldBlockFn: () =>
      !skipBlock.current &&
      dirty &&
      !window.confirm('还有未保存的文档内容，确定离开吗？'),
    enableBeforeUnload: dirty,
  })
  const adminKey = ['usage-docs', 'admin', actor]
  const catalog = useQuery<DocEntry[] | PublicDoc[]>({
    queryKey: edit ? adminKey : ['usage-docs', 'public'],
    queryFn: () =>
      edit ? loadAdminDocs() : (publicDocs() as Promise<PublicDoc[]>),
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  })
  const rows: { id: string; page: DocPage; published: boolean }[] = edit
    ? ((catalog.data ?? []) as DocEntry[]).map((e) => ({
        id: e.id,
        page: e.draft,
        published: !!e.published,
      }))
    : ((catalog.data ?? []) as PublicDoc[]).map((p) => ({
        id: p.id,
        page: p,
        published: true,
      }))
  rows.sort(
    (a, b) =>
      a.page.order - b.page.order || a.page.title.localeCompare(b.page.title)
  )
  const selectedID = doc || rows[0]?.id || ''
  const selected = rows.find((r) => r.id === selectedID)
  const entry = edit
    ? ((catalog.data ?? []) as DocEntry[]).find((e) => e.id === selectedID)
    : undefined
  const detail = useQuery({
    queryKey: ['usage-docs', 'page', selectedID],
    queryFn: ({ signal }) =>
      publicDocs(selectedID, signal) as Promise<PublicDoc>,
    enabled: !edit && !!selected,
    staleTime: 15_000,
  })
  const onDraft = useCallback((id: string, page: DocPage) => {
    setLiveDraft({ id, page })
    setOutline(editorOutline(page))
  }, [])
  const go = (id: string, editing = edit) => {
    void navigate({ to: '/docs', search: { doc: id, edit: editing }, hash: '' })
    setMobileOpen(false)
  }
  const saved = (result: DocEntry, action: string) => {
    client.setQueryData<DocEntry[]>(adminKey, (old) =>
      action === 'delete'
        ? (old ?? []).filter((e) => e.id !== selectedID)
        : [...(old ?? []).filter((e) => e.id !== result.id), result]
    )
    void client.invalidateQueries({ queryKey: ['usage-docs', 'public'] })
    void client.invalidateQueries({ queryKey: ['usage-docs', 'page'] })
    if (action === 'delete') {
      skipBlock.current = true
      go('')
    }
  }
  const groups = new Map<string, typeof rows>()
  const searchQuery = search.trim().toLowerCase()
  rows.forEach((r) => {
    const page = liveDraft?.id === r.id ? liveDraft.page : r.page
    if (
      searchQuery &&
      !`${page.title} ${page.category} ${page.summary}`
        .toLowerCase()
        .includes(searchQuery)
    ) {
      return
    }
    const name = page.category.trim() || '其他文档'
    groups.set(name, [...(groups.get(name) ?? []), { ...r, page }])
  })
  const toggleFolder = (category: string, expanded: boolean) => {
    if (searchQuery) {
      setSearchFolders((current) => ({ ...current, [category]: !expanded }))
      return
    }
    const next = { ...expandedFolders, [category]: !expanded }
    setExpandedFolders(next)
    try {
      sessionStorage.setItem(folderStorageKey, JSON.stringify(next))
    } catch {
      // Storage is optional; toggling a folder must remain available.
    }
  }
  const jump = (item: OutlineItem) => {
    const id = edit ? item.id.replace(/-heading-\d+$/, '') : item.id
    document
      .querySelector(`#${id}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setActiveHeading(item.id)
    if (!edit) {
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname + window.location.search}#${item.id}`
      )
    }
    setMobileOpen(false)
  }
  function renderDocument() {
    if (catalog.isPending) {
      return (
        <div className='ud-empty'>
          <Loader2 className='animate-spin' />
          <p>正在加载文档…</p>
        </div>
      )
    }
    if (catalog.isError) {
      return (
        <div className='ud-empty'>
          <p>文档加载失败</p>
          <Button onClick={() => void catalog.refetch()}>重试</Button>
        </div>
      )
    }
    if (edit && entry) {
      return (
        <EditorWorkspace
          key={`${actor}:${entry.id}`}
          entry={entry}
          onDraft={onDraft}
          onDirty={setDirty}
          onSaved={saved}
        />
      )
    }
    if (!selected) {
      return (
        <div className='ud-empty'>
          <span className='ud-welcome-icon'>
            <BookOpen />
          </span>
          <small>SKYMONI KNOWLEDGE</small>
          <h2>{doc ? '文档不存在或尚未发布' : '让每一步都有指引'}</h2>
          <p>
            {doc
              ? '请从左侧选择其他文档。'
              : '这里汇集 skymoni 的使用教程。发布后的文档会自动出现在左侧目录。'}
          </p>
          {admin && !edit && (
            <Button onClick={() => go('', true)}>
              <Pencil />
              开始编写文档
            </Button>
          )}
        </div>
      )
    }
    if (detail.isPending) {
      return (
        <div className='ud-empty'>
          <Loader2 className='animate-spin' />
        </div>
      )
    }
    if (detail.isError) {
      return (
        <div className='ud-empty'>
          <p>文档加载失败或已下架</p>
          <Button onClick={() => void detail.refetch()}>重试</Button>
        </div>
      )
    }
    const page = detail.data
    if (!page) return null
    return (
      <article className='ud-article'>
        <div className='ud-breadcrumb'>
          使用文档
          <ChevronRight />
          {page.category || '其他文档'}
        </div>
        <div className='ud-article-title'>
          <h1>{page.title}</h1>
          <Button
            variant='ghost'
            size='icon'
            aria-label='复制文档分享链接'
            onClick={() => {
              const link = new URL('/docs', window.location.origin)
              link.searchParams.set('doc', selectedID)
              void navigator.clipboard
                .writeText(link.href)
                .then(() => toast.success('文档链接已复制'))
                .catch(() => toast.error('复制失败，请复制浏览器地址'))
            }}
          >
            <Share2 />
          </Button>
        </div>
        {page.summary && <p className='ud-summary'>{page.summary}</p>}
        <p className='ud-published'>
          更新于 {new Date(page.publishedAt * 1000).toLocaleDateString('zh-CN')}
        </p>
        <DocContent page={page} onOutline={setOutline} />
        <footer className='ud-article-footer'>
          <BookOpen />
          <span>skymoni 使用文档</span>
        </footer>
      </article>
    )
  }
  function renderDirectory(idPrefix: string) {
    return (
      <>
        <div className='ud-search'>
          <Search />
          <Input
            aria-label='搜索文档'
            placeholder='搜索文档标题、分类…'
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setSearchFolders({})
            }}
          />
        </div>
        {edit && (
          <Button
            className='ud-new-doc'
            variant='outline'
            size='sm'
            disabled={creating}
            onClick={() => {
              if (
                dirty &&
                !window.confirm('还有未保存的内容，确定新建另一篇文档吗？')
              ) {
                return
              }
              setCreating(true)
              void saveDoc(crypto.randomUUID(), 'new', 'save', newDocPage())
                .then((next) => {
                  client.setQueryData<DocEntry[]>(adminKey, (old) => [
                    ...(old ?? []),
                    next,
                  ])
                  skipBlock.current = true
                  go(next.id, true)
                })
                .catch((error: unknown) =>
                  toast.error(
                    error instanceof Error ? error.message : '新建失败，请重试'
                  )
                )
                .finally(() => setCreating(false))
            }}
          >
            <FilePlus2 />
            新建文档
          </Button>
        )}
        <nav className='ud-nav' aria-label='文章目录'>
          {[...groups].map(([category, documents], index) => {
            const expanded = searchQuery
              ? (searchFolders[category] ?? true)
              : (expandedFolders[category] ??
                documents.some((r) => r.id === selectedID))
            const groupID = `${idPrefix}-folder-${index}`
            return (
              <section key={category} className='ud-category'>
                <h2>
                  <button
                    type='button'
                    className='ud-category-toggle'
                    aria-label={category}
                    aria-expanded={expanded}
                    aria-controls={groupID}
                    onClick={() => toggleFolder(category, expanded)}
                  >
                    <ChevronRight className='ud-category-chevron' />
                    {expanded ? <FolderOpen /> : <Folder />}
                    <span>{category}</span>
                    <small aria-hidden='true'>{documents.length}</small>
                  </button>
                </h2>
                <div
                  id={groupID}
                  className='ud-category-documents'
                  hidden={!expanded}
                >
                  {documents.map((r) => (
                    <button
                      key={r.id}
                      type='button'
                      className='ud-doc-link'
                      data-active={r.id === selectedID}
                      aria-current={r.id === selectedID ? 'page' : undefined}
                      onClick={() => go(r.id)}
                    >
                      <FileText />
                      <span>{r.page.title || '未命名文档'}</span>
                      {!r.published && <small>草稿</small>}
                    </button>
                  ))}
                </div>
              </section>
            )
          })}
          {searchQuery && !groups.size && (
            <p className='ud-muted'>没有找到匹配的文档</p>
          )}
        </nav>
        {!!outline.length && (
          <details className='ud-outline' open>
            <summary>
              <ChevronRight />
              <span>本页章节</span>
            </summary>
            <nav aria-label='本页章节' className='ud-outline-links'>
              {outline.map((item) => (
                <button
                  type='button'
                  key={item.id}
                  style={{
                    paddingLeft: `${12 + Math.max(0, item.level - 2) * 12}px`,
                  }}
                  data-active={activeHeading === item.id}
                  onClick={() => jump(item)}
                >
                  <span>{item.text}</span>
                </button>
              ))}
            </nav>
          </details>
        )}
        <div className='ud-sidebar-footer'>
          <Globe />
          <span>公开教程 · 持续更新</span>
        </div>
      </>
    )
  }
  return (
    <main className='ud-workspace' id='main-content'>
      <header className='ud-header'>
        <Link
          to='/dashboard/$section'
          params={{ section: 'overview' }}
          className='ud-back'
        >
          <ArrowLeft />
          <span>返回控制台</span>
        </Link>
        <div className='ud-brand'>
          <span>
            <BookOpen />
          </span>
          <div>
            <small>SKYMONI KNOWLEDGE</small>
            <h1>使用文档</h1>
          </div>
        </div>
        <div className='ud-header-actions'>
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger
              render={
                <Button
                  className='ud-mobile-toggle'
                  variant='outline'
                  size='sm'
                  aria-label='目录'
                />
              }
            >
              <List />
              <span>目录</span>
            </SheetTrigger>
            <SheetContent
              side='left'
              className='ud-mobile-panel'
              showCloseButton={false}
            >
              <SheetHeader className='ud-directory-header'>
                <SheetTitle>文档目录</SheetTitle>
                <SheetClose
                  render={
                    <Button variant='ghost' size='icon' aria-label='关闭目录' />
                  }
                >
                  <X />
                </SheetClose>
              </SheetHeader>
              <div
                className='ud-directory-tabs'
                role='group'
                aria-label='目录显示范围'
              >
                <button
                  type='button'
                  aria-pressed={mobileSection === 'documents'}
                  onClick={() => setMobileSection('documents')}
                >
                  文章目录
                </button>
                <button
                  type='button'
                  aria-pressed={mobileSection === 'outline'}
                  disabled={!outline.length}
                  onClick={() => setMobileSection('outline')}
                >
                  本页章节
                </button>
              </div>
              <aside
                className='ud-sidebar ud-mobile-directory'
                aria-label='文档目录'
                data-view={mobileSection}
              >
                {renderDirectory('mobile')}
              </aside>
            </SheetContent>
          </Sheet>
          {admin && (
            <Button
              variant='ghost'
              className='ud-manage-toggle'
              aria-label={edit ? '阅读模式' : '管理文档'}
              size='sm'
              onClick={() => go(selectedID, !edit)}
            >
              {edit ? <BookOpen /> : <Pencil />}
              <span className='ud-manage-label'>
                {edit ? '阅读模式' : '管理文档'}
              </span>
            </Button>
          )}
        </div>
      </header>
      <div className='ud-body'>
        <aside className='ud-sidebar ud-desktop-sidebar' aria-label='文档目录'>
          {renderDirectory('desktop')}
        </aside>
        <div
          className='ud-scroll'
          aria-label={edit ? '文档编辑区' : '文档阅读区'}
        >
          {renderDocument()}
        </div>
      </div>
    </main>
  )
}

function EditorWorkspace({
  entry,
  onDraft,
  onDirty,
  onSaved,
}: {
  entry: DocEntry
  onDraft: (id: string, page: DocPage) => void
  onDirty: (dirty: boolean) => void
  onSaved: (entry: DocEntry, action: string) => void
}) {
  const [page, setPage] = useState(entry.draft)
  const [baseline, setBaseline] = useState(JSON.stringify(entry.draft))
  const [revision, setRevision] = useState(entry.revision)
  const [published, setPublished] = useState(!!entry.published)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState(false)
  const [error, setError] = useState('')
  const [lastSaved, setLastSaved] = useState(entry.updatedAt)
  const dirty = JSON.stringify(page) !== baseline || revision === 'new'
  useEffect(() => {
    onDraft(entry.id, page)
    onDirty(dirty || uploading)
  }, [entry.id, page, dirty, uploading, onDraft, onDirty])
  const noOutline = useCallback(() => {}, [])
  const action = async (kind: string) => {
    if (busy || uploading) return
    if (
      kind === 'delete' &&
      !window.confirm('确定删除这篇文档吗？公开链接也会失效。')
    ) {
      return
    }
    if (
      kind === 'unpublish' &&
      !window.confirm('确定下架文档吗？草稿会保留，访客将无法阅读。')
    ) {
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await saveDoc(entry.id, revision, kind, page)
      setRevision(result.revision)
      setBaseline(JSON.stringify(result.draft))
      setPublished(!!result.published)
      setLastSaved(result.updatedAt)
      onDirty(false)
      onSaved(result, kind)
      const messages: Record<string, string> = {
        publish: '文档已发布，所有人都可以阅读',
        unpublish: '文档已下架',
        delete: '文档已删除',
        save: '草稿已保存',
      }
      toast.success(messages[kind])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败，请重试')
    } finally {
      setBusy(false)
    }
  }
  let statusText = '有未保存修改'
  if (busy) statusText = '正在保存…'
  else if (uploading) statusText = '图片上传中，请稍候…'
  else if (!dirty) {
    statusText = `已保存${lastSaved ? ` · ${new Date(lastSaved * 1000).toLocaleTimeString('zh-CN')}` : ''}`
  }
  let StatusIcon = Pencil
  if (busy || uploading) StatusIcon = Loader2
  else if (!dirty) StatusIcon = Check
  return (
    <article className='ud-article ud-authoring'>
      <div className='ud-editor-toolbar'>
        <div className='ud-save-status'>
          <StatusIcon className={busy || uploading ? 'animate-spin' : ''} />
          <span>{statusText}</span>
          <small>{published ? '已公开' : '草稿'}</small>
        </div>
        <div>
          <Button
            size='sm'
            variant='ghost'
            disabled={busy || uploading}
            onClick={() => setPreview(!preview)}
          >
            {preview ? <ArrowLeft /> : <BookOpen />}
            {preview ? '继续编辑' : '预览'}
          </Button>
          <Button
            size='sm'
            variant='outline'
            disabled={busy || uploading || !dirty}
            onClick={() => void action('save')}
          >
            保存草稿
          </Button>
          <Button
            size='sm'
            disabled={busy || uploading}
            onClick={() => void action('publish')}
          >
            {published ? '发布更新' : '发布文档'}
          </Button>
        </div>
      </div>
      {error && (
        <div className='ud-error' role='alert'>
          {error}
          <p>
            当前编辑内容仍保留在页面中。发生冲突时，请先复制正文，再重新加载。
          </p>
        </div>
      )}
      {preview ? (
        <>
          <div className='ud-breadcrumb'>
            发布预览
            <ChevronRight />
            {page.category}
          </div>
          <h1 className='ud-preview-title'>{page.title}</h1>
          <p className='ud-summary'>{page.summary}</p>
          <DocContent page={page} admin onOutline={noOutline} />
        </>
      ) : (
        <DocEditor
          page={page}
          onChange={setPage}
          busy={busy}
          onUploadingChange={setUploading}
        />
      )}
      <div className='ud-editor-bottom'>
        <span>保存草稿不会改变公开版本；发布后读者才会看到更新。</span>
        <div>
          {published && (
            <Button
              variant='outline'
              size='sm'
              disabled={busy || uploading}
              onClick={() => void action('unpublish')}
            >
              下架文档
            </Button>
          )}
          <Button
            variant='ghost'
            size='sm'
            disabled={busy || uploading || revision === 'new'}
            onClick={() => void action('delete')}
          >
            删除文档
          </Button>
        </div>
      </div>
    </article>
  )
}
