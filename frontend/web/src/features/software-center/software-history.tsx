import { useQuery } from '@tanstack/react-query'
import { ArrowDownToLine, ArrowUpRight, History, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { SoftwareEntry } from './types'
import '@/styles/software-history.css'

export type HistoryAsset = { filename: string; platform: string; architecture: string; format: string; url: string; downloadUrl: string; size: number; kind: string; digest?: string }
export type HistoryRelease = { id: string; version: string; name: string; date: string; prerelease: boolean; sourceUrl: string; assets: HistoryAsset[]; fileCount?: number }
type HistoryResponse = { app: { name: string; note: string; syncedAt: string; sources: string[] }; total: number; page: number; pages: number; platforms: string[]; releases: HistoryRelease[] }

export async function loadSoftwareHistory(id: string, params: URLSearchParams, signal?: AbortSignal): Promise<HistoryResponse> {
  const response = await fetch(`/software-history/${encodeURIComponent(id)}?${params}`, { signal })
  if (!response.ok) throw new Error('Unable to load software history')
  const data: HistoryResponse = await response.json()
  if (!data.app || !Array.isArray(data.releases) || !Array.isArray(data.platforms) || !Number.isInteger(data.total)) throw new Error('Invalid software history')
  return data
}

export function historyFileSize(bytes: number) {
  if (!bytes) return ''
  return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`
}

// Translate presentation labels while retaining the original platform values for API filters.
export function historyPlatformLabel(value: string, t: (key: string) => string) {
  return value.replace(/Windows|macOS|Android|Linux|iOS|HarmonyOS|Node\.js|Web|Other|Apple Silicon|arm64|x64/g, token => t(({ Windows: 'Windows system', macOS: 'macOS system', Android: 'Android system', Linux: 'Linux system', iOS: 'iOS system', HarmonyOS: 'HarmonyOS system', 'Node.js': 'Node.js runtime', Other: 'Software platform Other', Web: 'Software platform Web', arm64: '64-bit ARM (ARM64)', x64: '64-bit (x64)' } as Record<string, string>)[token] || token))
}
export function historyArchitectureLabel(value: string, t: (key: string) => string) {
  return t(({ x64: '64-bit (x64)', x86: '32-bit (x86)', ARM64: '64-bit ARM (ARM64)', ARMv7: '32-bit ARM (ARMv7)', 'RISC-V 64': '64-bit RISC-V' } as Record<string, string>)[value] || value)
}

export function SoftwareHistory(props: { entry: SoftwareEntry }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger render={<Button variant='outline' size='sm' className='sc-get sh-history-trigger' />} aria-label={t('Version history for {{name}}', { name: props.entry.name })}>
      <History aria-hidden /><span>{t('Version history')}</span>
    </DialogTrigger>
    <DialogContent className='sh-dialog'>
      <DialogTitle className='sh-title'>{props.entry.name} · {t('Version history and all downloads')}</DialogTitle>
      <DialogDescription>{t('Choose a version, platform and installer. Existing website, store and cloud drive links remain available.')}</DialogDescription>
      {open && <HistoryBrowser key={props.entry.id} entry={props.entry} />}
    </DialogContent>
  </Dialog>
}

function HistoryBrowser({ entry }: { entry: SoftwareEntry }) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [platform, setPlatform] = useState('')
  const [channel, setChannel] = useState('stable')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState('')
  const [otherFiles, setOtherFiles] = useState(false)
  const [platformOptions, setPlatformOptions] = useState<string[]>([])
  const [architecture, setArchitecture] = useState('')
  useEffect(() => {
    if (search.trim() === query) return
    const timer = window.setTimeout(() => { setQuery(search.trim()); setPage(1); setSelected(''); setArchitecture('') }, 250)
    return () => window.clearTimeout(timer)
  }, [search, query])
  const history = useQuery({
    queryKey: ['software-history', entry.id, query, platform, channel, page],
    queryFn: ({ signal }) => loadSoftwareHistory(entry.id, new URLSearchParams({ q: query, platform, channel, page: String(page) }), signal),
    staleTime: 5 * 60 * 1000,
    meta: { errorToast: false },
  })
  const data = history.data
  useEffect(() => { if (data) setPlatformOptions(data.platforms) }, [data])
  const release = data?.releases.find(item => item.id === selected) || data?.releases[0]
  const needsFiles = Boolean(release?.fileCount && !release.assets.length)
  const files = useQuery({
    queryKey: ['software-release-files', entry.id, release?.id],
    enabled: needsFiles,
    queryFn: async ({ signal }) => {
      const response = await fetch(`/software-history/${encodeURIComponent(entry.id)}?${new URLSearchParams({ release: release!.id })}`, { signal })
      if (!response.ok) throw new Error('Unable to load release files')
      const data: { release: HistoryRelease } = await response.json()
      if (!data.release || !Array.isArray(data.release.assets)) throw new Error('Invalid release files')
      return data.release
    },
    staleTime: 5 * 60 * 1000,
    meta: { errorToast: false },
  })
  const allAssets = needsFiles ? files.data?.assets || [] : release?.assets || []
  const architectures = [...new Set(allAssets.filter(item => !platform || item.platform === platform).map(item => item.architecture))].sort()
  const assets = allAssets.filter(item => (!platform || item.platform === platform) && (!architecture || item.architecture === architecture) && (otherFiles || item.kind !== 'auxiliary'))
  return <>
    <div className='sh-filters'>
      <label className='sh-search'><Search aria-hidden /><Input aria-label={t('Search versions or filenames')} placeholder={t('Search versions or filenames')} value={search} onChange={event => setSearch(event.target.value)} /></label>
      <select aria-label={t('Supported platforms')} value={platform} onChange={event => { setPlatform(event.target.value); setPage(1); setSelected(''); setArchitecture('') }}>
        <option value=''>{t('All platforms')}</option>
        {platformOptions.map(value => <option key={value} value={value}>{historyPlatformLabel(value, t)}</option>)}
      </select>
      <select aria-label={t('Release channel')} value={channel} onChange={event => { setChannel(event.target.value); setPage(1); setSelected(''); setArchitecture('') }}>
        <option value='all'>{t('All releases')}</option><option value='stable'>{t('Stable releases')}</option><option value='preview'>{t('Preview releases')}</option>
      </select>
    </div>
    {history.isPending && <p role='status'>{t('Loading version history…')}</p>}
    {history.isError && <div className='sh-empty'><p>{t('Version history could not be loaded.')}</p><Button variant='outline' onClick={() => void history.refetch()}>{t('Retry')}</Button></div>}
    {data && <>
      <p className='sh-note'>{t(data.app.note)} <span>{t('Synced on')} {data.app.syncedAt.slice(0, 10)} · {t('{{count}} versions', { count: data.total })}</span></p>
      {release ? <div className='sh-browser'>
        <div className='sh-version-list' aria-label={t('Available versions')}>
          {data.releases.map(item => <button type='button' key={item.id} className='sh-version' aria-pressed={release.id === item.id} onClick={() => { setSelected(item.id); setArchitecture('') }}>
            <strong>{t(item.version, { defaultValue: item.version })}</strong><span>{item.version === 'Official entry' || item.version === 'Web' ? t('Official entry') : item.prerelease ? t('Preview release') : t('Stable release')}{item.date && ` · ${item.date.slice(0, 10)}`}</span>
          </button>)}
        </div>
        <div className='sh-files'>
          <div className='sh-release-heading'><div><h3>{t(release.version, { defaultValue: release.version })}</h3></div>
            {release.sourceUrl && <a href={release.sourceUrl} target='_blank' rel='noopener noreferrer'>{t('Official release')}<ArrowUpRight aria-hidden /></a>}
          </div>
          {architectures.length > 1 && <select className='sh-architecture' aria-label={t('Architecture')} value={architecture} onChange={event => setArchitecture(event.target.value)}><option value=''>{t('All architectures')}</option>{architectures.map(value => <option key={value} value={value}>{historyArchitectureLabel(value, t)}</option>)}</select>}
          <label className='sh-other-files'><input type='checkbox' checked={otherFiles} onChange={event => setOtherFiles(event.target.checked)} />{t('Show checksums, signatures and other files')}</label>
          {needsFiles && files.isPending ? <p role='status'>{t('Loading downloads…')}</p> : needsFiles && files.isError ? <div className='sh-empty'><p>{t('Download options could not be loaded.')}</p><Button variant='outline' onClick={() => void files.refetch()}>{t('Retry')}</Button></div> : assets.length ? assets.map(asset => <div key={asset.url} className='sh-file'>
            <div className='sh-file-info'><strong>{historyPlatformLabel(asset.platform, t)} {asset.architecture !== 'Unspecified' && historyArchitectureLabel(asset.architecture, t)} · {asset.format.split(' · ').map(part => t('Software format ' + part, { defaultValue: part })).join(' · ')}</strong><span>{asset.filename}</span><small>{historyFileSize(asset.size)}{asset.kind === 'auxiliary' && ` · ${t('Supporting file')}`}</small>{asset.digest && <details><summary>{t('Official checksum')}</summary><code>{asset.digest}</code></details>}</div>
            <div className='sh-file-actions'><a href={asset.downloadUrl || asset.url} download={asset.kind === 'website' || asset.kind === 'cloud' ? undefined : asset.filename} target={asset.downloadUrl ? undefined : '_blank'} rel='noopener noreferrer'><ArrowDownToLine aria-hidden />{asset.downloadUrl ? t('Site relay') : asset.kind === 'website' ? t('Official entry') : t('Download')}</a>
              {asset.downloadUrl && asset.url !== asset.downloadUrl && <a href={asset.url} target='_blank' rel='noopener noreferrer'>{t('Original source')}<ArrowUpRight aria-hidden /></a>}</div>
          </div>) : <p className='sh-empty'>{t('No installer for this selection. Check the official release for source code or other files.')}</p>}
        </div>
      </div> : <p className='sh-empty'>{t(query || platform ? 'No matching version. Try another search or platform.' : 'No public historical installer is available. Use the official links below.')}</p>}
      {data.pages > 1 && <div className='sh-pagination'><Button size='sm' variant='outline' disabled={page <= 1} onClick={() => { setPage(page - 1); setSelected(''); setArchitecture('') }}>{t('Previous page')}</Button><span>{page} / {data.pages}</span><Button size='sm' variant='outline' disabled={page >= data.pages} onClick={() => { setPage(page + 1); setSelected(''); setArchitecture('') }}>{t('Next page')}</Button></div>}
      <div className='sh-sources'>{data.app.sources.map(url => <a key={url} href={url} target='_blank' rel='noopener noreferrer'>{t('Official version source')}<ArrowUpRight aria-hidden /></a>)}</div>
      <p className='sh-disclaimer'>{t('Older versions may require older systems or lose online compatibility. Availability follows the publisher; preview releases are marked separately.')}</p>
    </>}
  </>
}
