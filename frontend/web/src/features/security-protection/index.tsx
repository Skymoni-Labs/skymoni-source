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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Activity, RefreshCw, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'

import { SectionPageLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import { ProtectionError, protectionApi, protectionErrorMessage } from './api'
import { BanPanel } from './ban-panel'
import { ConfigForm } from './config-form'
import { EvidenceDetails } from './evidence-details'
import { eventActionLabel, eventKindLabel, formatTime } from './policy'
import type { CreateBan, ProtectionConfig } from './types'

const tabs = [
  ['config', '防护配置'],
  ['events', '检测事件'],
  ['bans', '账号与 IP 限制'],
] as const
type Tab = (typeof tabs)[number][0]
const isForbidden = (error: unknown) =>
  error instanceof ProtectionError &&
  (error.status === 401 || error.status === 403)

export function SecurityProtection() {
  const user = useAuthStore((state) => state.auth.user)
  if (!user || user.role !== ROLE.SUPER_ADMIN) {
    return (
      <p role='alert' className='p-6 text-sm'>
        仅超级管理员可访问安全防护控制台。
      </p>
    )
  }
  return <RootConsole key={user.id} userId={user.id} />
}

function RootConsole({ userId }: { userId: number }) {
  const queryClient = useQueryClient()
  const prefix = ['security-protection', userId]
  const [tab, setTab] = useState<Tab>('config')
  const [eventPage, setEventPage] = useState(1)
  const [banPage, setBanPage] = useState(1)
  const [formVersion, setFormVersion] = useState(0)
  const [saveMessage, setSaveMessage] = useState('')
  const [banError, setBanError] = useState<unknown>(null)
  const [accessDenied, setAccessDenied] = useState(false)
  async function read<T>(request: () => Promise<T>): Promise<T> {
    try {
      return await request()
    } catch (error) {
      if (isForbidden(error)) setAccessDenied(true)
      throw error
    }
  }
  const config = useQuery({
    queryKey: [...prefix, 'config'],
    queryFn: () => read(protectionApi.config),
    enabled: !accessDenied,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
    gcTime: 0,
  })
  const overview = useQuery({
    queryKey: [...prefix, 'overview'],
    queryFn: () => read(protectionApi.overview),
    enabled: !accessDenied,
    refetchInterval: 30000,
    retry: false,
    gcTime: 0,
  })
  const events = useQuery({
    queryKey: [...prefix, 'events', eventPage],
    queryFn: () => read(() => protectionApi.events(eventPage)),
    enabled: tab === 'events' && !accessDenied,
    refetchInterval: 30000,
    retry: false,
    gcTime: 0,
  })
  const bans = useQuery({
    queryKey: [...prefix, 'bans', banPage],
    queryFn: () => read(() => protectionApi.bans(banPage)),
    enabled: tab === 'bans' && !accessDenied,
    refetchInterval: 30000,
    retry: false,
    gcTime: 0,
  })
  const save = useMutation({
    mutationFn: (next: ProtectionConfig) => {
      const revision = config.data?.revision
      if (revision === undefined) {
        throw new ProtectionError('config_unavailable')
      }
      return read(() => protectionApi.saveConfig(revision, next))
    },
    onMutate: () => setSaveMessage(''),
    onSuccess: (snapshot) => {
      queryClient.setQueryData([...prefix, 'config'], snapshot)
      setSaveMessage(`防护配置已保存，当前版本 #${snapshot.revision}。`)
      void queryClient.invalidateQueries({ queryKey: [...prefix, 'overview'] })
    },
  })
  const create = useMutation({ mutationFn: protectionApi.createBan })
  const revoke = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      protectionApi.revokeBan(id, reason),
  })
  useEffect(() => {
    if (!accessDenied) return
    void queryClient.cancelQueries({
      queryKey: ['security-protection', userId],
    })
    queryClient.removeQueries({ queryKey: ['security-protection', userId] })
  }, [accessDenied, queryClient, userId])
  useEffect(
    () => () => {
      queryClient.removeQueries({ queryKey: ['security-protection', userId] })
    },
    [queryClient, userId]
  )

  async function refreshRecords() {
    await queryClient.invalidateQueries({ queryKey: [...prefix, 'overview'] })
    await queryClient.invalidateQueries({ queryKey: [...prefix, 'events'] })
    await queryClient.invalidateQueries({ queryKey: [...prefix, 'bans'] })
  }
  async function createBan(payload: CreateBan) {
    setBanError(null)
    try {
      await create.mutateAsync(payload)
      await refreshRecords()
      return true
    } catch (error) {
      if (isForbidden(error)) setAccessDenied(true)
      setBanError(error)
      return false
    }
  }
  async function revokeBan(id: number, reason: string) {
    setBanError(null)
    try {
      await revoke.mutateAsync({ id, reason })
      await refreshRecords()
      return true
    } catch (error) {
      if (isForbidden(error)) setAccessDenied(true)
      setBanError(error)
      return false
    }
  }

  let protectionState = '读取中…'
  let healthState = '读取中…'
  if (overview.data) {
    protectionState = overview.data.mode === 'observe' ? '只观察' : '执行防护'
    if (!overview.data.enabled) protectionState = '自动防护已关闭'
    healthState = overview.data.healthy ? '防护存储正常' : '存储异常'
  }
  let banMessage: string | null = null
  if (bans.error) {
    banMessage = `限制记录读取失败。${protectionErrorMessage(bans.error)}`
  }
  if (banError) banMessage = protectionErrorMessage(banError)

  if (accessDenied) {
    return (
      <p role='alert' className='p-6 text-sm'>
        管理员权限已失效，安全数据已隐藏。请重新登录。
      </p>
    )
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>安全防护</SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <Button
          variant='outline'
          onClick={() => void refreshRecords()}
          disabled={overview.isFetching}
        >
          <RefreshCw className={overview.isFetching ? 'animate-spin' : ''} />
          刷新记录
        </Button>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div
          className='mx-auto w-full max-w-6xl min-w-0 space-y-5 pb-4'
          data-testid='security-console'
        >
          <div className='bg-muted/40 flex min-w-0 gap-3 rounded-xl border p-4'>
            <ShieldCheck className='text-primary mt-0.5 size-5 shrink-0' />
            <div className='min-w-0 space-y-1'>
              <p className='text-sm font-semibold'>
                检测账号与来源滥用，保留人工复核和撤销入口
              </p>
              <p className='text-muted-foreground text-xs leading-relaxed'>
                检测以行为组合信号为依据。共享出口不等于同一人；自动处置采用临时限制，不删除账号，不自动永久封禁。
              </p>
            </div>
          </div>
          {overview.error && (
            <p role='alert' className='text-destructive text-sm'>
              健康摘要读取失败。{protectionErrorMessage(overview.error)}
            </p>
          )}
          <div
            className='grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4'
            aria-label='防护健康摘要'
          >
            <Summary
              label='防护状态'
              value={protectionState}
              detail={
                overview.data
                  ? `配置版本 #${overview.data.revision}`
                  : '等待服务器确认'
              }
            />
            <Summary
              label='服务健康'
              value={healthState}
              detail={
                overview.data
                  ? `最后事件 ${formatTime(overview.data.last_event_at)}`
                  : '检查配置与防护表'
              }
            />
            <Summary
              label='24 小时事件'
              value={overview.data ? String(overview.data.events_24h) : '—'}
              detail={
                overview.data
                  ? `观察 ${overview.data.observed_24h} · 拒绝 ${overview.data.denied_24h}`
                  : '检测统计'
              }
            />
            <Summary
              label='有效期内限制记录'
              value={
                overview.data
                  ? String(
                      overview.data.active_user_bans +
                        overview.data.active_ip_bans
                    )
                  : '—'
              }
              detail={
                overview.data
                  ? `账号 ${overview.data.active_user_bans} · IP ${overview.data.active_ip_bans}`
                  : '临时与人工限制'
              }
            />
          </div>
          <div
            className='grid min-w-0 gap-2 rounded-xl border p-3 text-xs sm:grid-cols-2 xl:grid-cols-4'
            aria-label='防护动作说明'
          >
            <p>
              <strong>只观察</strong>
              <span className='text-muted-foreground'>
                ：记录命中，不自动拦截。
              </span>
            </p>
            <p>
              <strong>暂缓领奖</strong>
              <span className='text-muted-foreground'>：仅拒绝签到领奖。</span>
            </p>
            <p>
              <strong>账号限制</strong>
              <span className='text-muted-foreground'>
                ：限制目标账号请求。
              </span>
            </p>
            <p>
              <strong>IP 限制</strong>
              <span className='text-muted-foreground'>
                ：限制明确来源；自动规则保护正常老用户与已验证付费用户。
              </span>
            </p>
          </div>
          <div
            role='tablist'
            aria-label='安全防护功能'
            className='flex min-w-0 flex-wrap gap-2 border-b pb-3'
          >
            {tabs.map(([id, label]) => (
              <Button
                key={id}
                id={`protection-tab-${id}`}
                role='tab'
                aria-selected={tab === id}
                aria-controls={`protection-panel-${id}`}
                variant={tab === id ? 'default' : 'outline'}
                onClick={() => {
                  setTab(id)
                  setSaveMessage('')
                }}
              >
                {label}
              </Button>
            ))}
          </div>
          {saveMessage && (
            <p role='status' className='text-primary text-sm'>
              {saveMessage}
            </p>
          )}
          <div
            role='tabpanel'
            id={`protection-panel-${tab}`}
            aria-labelledby={`protection-tab-${tab}`}
            className='min-w-0'
          >
            <div hidden={tab !== 'config'}>
              {config.isPending && (
                <p role='status' className='text-muted-foreground text-sm'>
                  正在读取防护配置…
                </p>
              )}
              {config.error && (
                <div className='space-y-3'>
                  <p role='alert' className='text-destructive text-sm'>
                    防护配置读取失败。{protectionErrorMessage(config.error)}
                  </p>
                  <Button
                    variant='outline'
                    onClick={() => void config.refetch()}
                  >
                    重试读取配置
                  </Button>
                </div>
              )}
              {config.data && (
                <ConfigForm
                  key={`${config.data.revision}:${formVersion}`}
                  snapshot={config.data}
                  saving={save.isPending}
                  error={save.error ? protectionErrorMessage(save.error) : null}
                  onSave={(next) => save.mutate(next)}
                  onReload={() => {
                    save.reset()
                    setSaveMessage('')
                    void config.refetch().then((result) => {
                      if (result.isSuccess) {
                        setFormVersion((value) => value + 1)
                      }
                    })
                  }}
                />
              )}
            </div>
            {tab === 'events' && (
              <div className='min-w-0 space-y-4'>
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <h3 className='text-sm font-semibold'>检测事件</h3>
                  <p className='text-muted-foreground text-xs'>
                    共 {events.data?.total ?? 0} 条 · 每 30 秒刷新
                  </p>
                </div>
                <p className='text-muted-foreground text-xs'>
                  仅展示行为摘要和规则命中，不展示聊天正文、令牌、模型密钥或原始请求。IPv6
                  网段仅作关联信号，不据此扩大封禁。
                </p>
                {events.error && (
                  <p role='alert' className='text-destructive text-sm'>
                    检测事件读取失败。{protectionErrorMessage(events.error)}
                  </p>
                )}
                {events.isPending && (
                  <p role='status' className='text-muted-foreground text-sm'>
                    正在读取检测事件…
                  </p>
                )}
                <ul
                  aria-label='检测事件记录'
                  className='grid min-w-0 gap-3 lg:grid-cols-2'
                >
                  {events.data?.items.map((event) => (
                    <li
                      key={event.id}
                      className='min-w-0 space-y-2 rounded-xl border p-4'
                    >
                      <div className='flex flex-wrap items-center justify-between gap-2'>
                        <p className='text-sm font-semibold'>
                          {eventActionLabel(
                            event.decision,
                            event.rule,
                            event.kind,
                            event.scope
                          )}
                        </p>
                        <time className='text-muted-foreground text-xs'>
                          {formatTime(event.created_at)}
                        </time>
                      </div>
                      <p className='text-sm leading-relaxed [overflow-wrap:anywhere] break-words'>
                        {event.summary}
                      </p>
                      <p className='min-w-0 font-mono text-xs break-all'>
                        {event.user_id ? `UID ${event.user_id} · ` : ''}
                        {event.ip || '无来源 IP'}
                      </p>
                      <div className='text-muted-foreground flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-xs'>
                        <span className='break-all'>
                          规则：{event.rule || '未命中'}
                        </span>
                        <span>{eventKindLabel(event.kind)}</span>
                        {event.new_user && <span>新账号</span>}
                        {event.rapid && <span>快速领奖信号</span>}
                      </div>
                      <EvidenceDetails
                        request_id={event.request_id}
                        policy_revision={event.policy_revision}
                        evidence={event.evidence}
                      />
                    </li>
                  ))}
                </ul>
                {events.data?.items.length === 0 && (
                  <div className='text-muted-foreground rounded-xl border border-dashed p-8 text-center text-sm'>
                    <Activity className='mx-auto mb-2 size-5' />
                    暂无检测事件
                  </div>
                )}
                <div className='flex flex-wrap items-center justify-between gap-3'>
                  <span className='text-muted-foreground text-xs'>
                    第 {eventPage} 页
                  </span>
                  <div className='flex gap-2'>
                    <Button
                      variant='outline'
                      disabled={eventPage === 1 || events.isFetching}
                      onClick={() => setEventPage((page) => page - 1)}
                      aria-label='检测事件上一页'
                    >
                      上一页
                    </Button>
                    <Button
                      variant='outline'
                      disabled={
                        events.isFetching ||
                        !events.data ||
                        eventPage * events.data.page_size >= events.data.total
                      }
                      onClick={() => setEventPage((page) => page + 1)}
                      aria-label='检测事件下一页'
                    >
                      下一页
                    </Button>
                  </div>
                </div>
              </div>
            )}
            {tab === 'bans' && (
              <BanPanel
                userId={userId}
                data={bans.data}
                loading={bans.isPending}
                pending={create.isPending || revoke.isPending}
                error={banMessage}
                page={banPage}
                onPage={setBanPage}
                onCreate={createBan}
                onRevoke={revokeBan}
              />
            )}
          </div>
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}

function Summary({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail: string
}) {
  return (
    <div className='min-w-0 space-y-2 rounded-xl border p-3 sm:p-4'>
      <p className='text-muted-foreground text-xs'>{label}</p>
      <p className='text-sm font-semibold break-words sm:text-base'>{value}</p>
      <p className='text-muted-foreground text-xs leading-relaxed break-words'>
        {detail}
      </p>
    </div>
  )
}
