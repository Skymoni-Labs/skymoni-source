// Isolated visual acceptance fixture. Never imported by the production router.
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { AxiosHeaders } from 'axios'
import { ThemeProvider } from '@/context/theme-provider'
import { SiteVoidBackdrop } from '@/features/home-discovery/void-backdrop'
import { DocsWorkspace } from '@/features/usage-docs'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import type { DocEntry, DocPage } from '@/features/usage-docs/types'
import '@/styles/index.css'
import '@/styles/site-void.css'
import '@/styles/site-glass.css'

const page = {"id": "cc-switch", "title": "CC Switch：一键接入编程工具", "summary": "CC Switch 帮你管理 Claude Code、Codex 等工具的服务商配置。先装好目标编程工具和 CC Switch，再从 skymoni 导入自己的密钥。", "category": "编程软件接入", "order": 36, "blocks": [{"id": "39f61695-876b-45df-a600-6343899327fe", "type": "heading", "text": "先安装", "url": "", "level": 2}, {"id": "adc4b18c-f5b4-401e-b5bf-ffaf86c2214f", "type": "text", "text": "在 [CC Switch 官方发布页](https://github.com/farion1231/cc-switch/releases) 选择适合自己系统的版本。Claude Code 或 Codex 需要另行安装。", "url": "", "level": 0}, {"id": "986556e1-fa36-4eb0-aea2-58b12638d870", "type": "heading", "text": "方法一：从 skymoni 一键导入", "url": "", "level": 2}, {"id": "e2231f2b-88bc-43e9-8e0d-f3822de7ec80", "type": "text", "text": "1. 打开 skymoni「API 密钥」，找到要使用的密钥。\n2. 打开该密钥的操作菜单，点击「CC Switch」。\n3. 选择 Claude 或 Codex，填写完整的主要模型 ID。\n4. 点击「打开 CC Switch」，允许浏览器打开已安装的软件。\n5. 在 CC Switch 确认导入；选择 skymoni 供应商并点击「切换」，确认显示「使用中」。（记得开启路由模式）\n\nClaude 的小模型、Sonnet、Opus 映射是可选项；填写时也要使用自己有权限的完整模型 ID。\n\n导入后核对当前供应商是否显示「使用中」；还未生效时点击「切换」。若浏览器没有打开软件，用下面的手动方法。", "url": "", "level": 0}, {"id": "2a238499-f396-4211-93c2-2183416b969e", "type": "heading", "text": "方法二：手动添加", "url": "", "level": 2}, {"id": "ff037c78-65e8-484b-8e85-96c09d1c61fd", "type": "text", "text": "在 CC Switch 选择对应应用，点击「添加供应商」，选择自定义配置，填名称、密钥和模型。\n\n| 配置 | Claude Code | Codex |\n| --- | --- | --- |\n| 名称 | skymoni | skymoni |\n| 地址 | `https://skymoni.com` | `https://skymoni.com/v1` |\n| 密钥 | 自己的 skymoni API 密钥 | 自己的 skymoni API 密钥 |\n| 模型 | 完整模型 ID | 完整模型 ID |\n| 接口要求 | Anthropic Messages | OpenAI Responses |\n\n先用「直连」配置。保存后点击供应商的「切换」按钮，核对生效状态。菜单依据见 [官方添加指南](https://github.com/farion1231/cc-switch/blob/main/docs/user-manual/zh/2-providers/2.1-add.md)。", "url": "", "level": 0}, {"id": "2555c6ae-e62e-46d9-a1aa-666586046d68", "type": "heading", "text": "切换后怎么生效", "url": "", "level": 2}, {"id": "dcd15eeb-25e2-4c1c-89b9-94d795b1068e", "type": "text", "text": "Claude Code 当前版本支持配置热重载；若仍显示旧地址，重新打开会话。Codex 需要退出后重开；桌面版彻底退出再启动。\n\n先发一句短问题，并去 skymoni「使用日志」确认调用。详细行为见 [官方切换说明](https://github.com/farion1231/cc-switch/blob/main/docs/user-manual/zh/2-providers/2.2-switch.md)。", "url": "", "level": 0}, {"id": "ac137211-304a-4a54-b329-49ab915c8d4b", "type": "heading", "text": "什么时候才用路由模式", "url": "", "level": 2}, {"id": "2f1fa011-aed4-455b-a6a3-cdbd9df71215", "type": "text", "text": "如果上游只有 Chat Completions，但目标工具要求另一种协议，需要在支持转换的 CC Switch 版本里配置「路由」及上游格式。路由需要 CC Switch 保持运行。\n\n本站模型支持目标原生接口时，先照上面的直连方法。填写另一个接口地址本身不会完成协议转换。", "url": "", "level": 0}, {"id": "cc-switch-codex-routing-heading", "type": "heading", "text": "Codex 路由配置示例", "url": "", "level": 3}, {"id": "cc-switch-codex-routing-notes", "type": "callout", "text": "**对照图填写（Codex）**\n\n- API 请求地址：`https://skymoni.com/v1`，图中的「完整 URL」开关保持关闭。\n- API Key：填自己的 skymoni API 密钥。默认模型换成自己有权限的完整模型 ID，图中名称仅作示例。\n- 如使用 Chat Completions 上游，在「高级选项 → 上游格式」选择 Chat Completions，并开启 CC Switch 的路由。支持原生 Responses 的模型仍按上面的直连说明配置。", "url": "", "level": 0}, {"id": "cc-switch-codex-routing-image", "type": "image", "text": "CC Switch 的 Codex 配置示例：Chat Completions 上游需开启路由。点击图片可查看大图。", "url": "https://skymoni.com/api/docs/images/e9c8231c9a4c4e18a22cbd271c0ec31c", "level": 0}], "publishedAt": 1791704963} as DocPage
let entries: DocEntry[] = [{ id: 'cc-switch', revision: 'fixture-1', draft: page, published: structuredClone(page), updatedAt: 1791590400, publishedAt: 1791590400 }]
useAuthStore.setState((state) => ({ auth: { ...state.auth, user: { id: 999, username: 'preview', role: 100 }, accessToken: 'local-preview-fixture', accessExpiresAt: 9999999999, session: { sid: 'local-preview-fixture', current: true, login_method: 'fixture', ip: '', user_agent: '', created_at: 1, last_active_at: 1, expires_at: 9999999999 }, bootstrapState: 'complete' } }))
api.defaults.adapter = async (config) => {
  const url = config.url ?? ''; const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data
  let data: unknown = null
  if (url === '/api/docs/admin' && config.method === 'get') data = entries
  else if (url === '/api/docs/admin/images' && config.method === 'post') data = { url: "https://skymoni.com/api/docs/images/e9c8231c9a4c4e18a22cbd271c0ec31c" }
  else if (url.startsWith('/api/docs/admin/') && config.method === 'put') {
    const id = url.split('/').at(-1)!; const current = entries.find((e) => e.id === id)
    if (body.action === 'delete') entries = entries.filter((e) => e.id !== id)
    else {
      const entry: DocEntry = { id, draft: structuredClone(body.draft), revision: crypto.randomUUID(), updatedAt: Date.now() / 1000, publishedAt: current?.publishedAt ?? 0, published: current?.published }
      if (body.action === 'publish') { entry.published = structuredClone(body.draft); entry.publishedAt = Date.now() / 1000 }
      if (body.action === 'unpublish') entry.published = undefined
      entries = [...entries.filter((e) => e.id !== id), entry]; data = entry
    }
  } else if (url === '/api/docs/public') data = entries.filter((e) => e.published).map((e) => ({ ...e.published, id: e.id, publishedAt: e.publishedAt }))
  else if (url.startsWith('/api/docs/public/')) { const e = entries.find((e) => e.id === url.split('/').at(-1)); data = e && { ...e.published, id: e.id, publishedAt: e.publishedAt } }
  return { config, headers: new AxiosHeaders(), status: 200, statusText: 'OK', data: { success: true, data: structuredClone(data) } }
}
const rootRoute = createRootRoute()
const docsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/docs', validateSearch: (s: Record<string, unknown>) => ({ doc: typeof s.doc === 'string' ? s.doc : '', edit: s.edit === true || s.edit === 'true' }), component: PreviewDocs })
function PreviewDocs() { const { doc, edit } = docsRoute.useSearch(); return <DocsWorkspace key={`${doc}:${edit}`} admin actor={999} /> }
const router = createRouter({ routeTree: rootRoute.addChildren([docsRoute]) })
const query = new QueryClient({ defaultOptions: { queries: { retry: false } } })
createRoot(document.querySelector('#root')!).render(<ThemeProvider defaultTheme='dark' storageKey='skymoni-docs-preview'><SiteVoidBackdrop /><div className='relative h-svh'><QueryClientProvider client={query}><RouterProvider router={router} /></QueryClientProvider></div></ThemeProvider>)
