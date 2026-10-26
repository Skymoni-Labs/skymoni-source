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
import { useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

import { isExactIP, parseUserIds, ruleLimits, validateConfig } from './policy'
import type { ConfigSnapshot, ProtectionConfig } from './types'

const rules: Array<{
  key: keyof ProtectionConfig
  label: string
  help: string
}> = [
  {
    key: 'registration_ip_hour_limit',
    label: '同 IP 注册频率上限',
    help: '在注册检测窗口内暂缓过量新注册，不据此限制普通付费请求。',
  },
  {
    key: 'registration_window_seconds',
    label: '注册检测窗口（秒）',
    help: '同一 IP 注册频率的统计窗口。',
  },
  {
    key: 'first_checkin_cooldown_seconds',
    label: '首次领奖冷静期（秒）',
    help: '注册后需等待的最短时间；0 表示不设冷静期。',
  },
  {
    key: 'new_account_age_seconds',
    label: '新账号认定窗口（秒）',
    help: '仅在此账号年龄内参与新用户聚集判断。',
  },
  {
    key: 'ip_daily_new_user_limit',
    label: '每 IP 每日新账号签到上限',
    help: '认定窗口内新账号每天的签到均参与计数，不只统计首次领取。共享 IP 不代表同一人。',
  },
  {
    key: 'burst_window_seconds',
    label: '聚集检测窗口（秒）',
    help: '统计同一 IP 的短时新账号聚集。',
  },
  {
    key: 'burst_new_user_threshold',
    label: '聚集新账号阈值',
    help: '窗口内达到此数量时，触发聚集规则。',
  },
  {
    key: 'burst_rapid_user_threshold',
    label: '聚集快速领奖账号阈值',
    help: '窗口内快速领奖的新账号数量阈值。',
  },
  {
    key: 'rapid_claim_seconds',
    label: '快速领奖判定时间（秒）',
    help: '注册后短时间内尝试领奖，作为组合信号。',
  },
  {
    key: 'auto_ip_window_seconds',
    label: '自动 IP 检测窗口（秒）',
    help: '自动 IP 限制采用的统计窗口。',
  },
  {
    key: 'auto_ip_new_user_threshold',
    label: '自动 IP 新账号阈值',
    help: '与拒绝次数组合判断；正常老用户和已验证付费用户受保护，消费赠额不视为付费。',
  },
  {
    key: 'auto_ip_denied_threshold',
    label: '自动 IP 拒绝次数阈值',
    help: '达到组合阈值后，才执行临时 IP 限制。',
  },
  {
    key: 'auto_ip_ban_seconds',
    label: '自动 IP 限制时长（秒）',
    help: '自动限制会到期，不自动永久封禁。',
  },
  {
    key: 'retention_days',
    label: '防护事件保留天数',
    help: '用于回溯规则效果与误拦截。',
  },
]

export function ConfigForm({
  snapshot,
  saving,
  error,
  onSave,
  onReload,
}: {
  snapshot: ConfigSnapshot
  saving: boolean
  error: string | null
  onSave: (config: ProtectionConfig) => void
  onReload: () => void
}) {
  const [config, setConfig] = useState(snapshot.config)
  const [ips, setIps] = useState(snapshot.config.allowlist_ips.join('\n'))
  const [ids, setIds] = useState(snapshot.config.allowlist_user_ids.join('\n'))
  const [validation, setValidation] = useState<string | null>(null)
  const dirty =
    JSON.stringify(config) !== JSON.stringify(snapshot.config) ||
    ips !== snapshot.config.allowlist_ips.join('\n') ||
    ids !== snapshot.config.allowlist_user_ids.join('\n')

  function submit(event: FormEvent) {
    event.preventDefault()
    const userIds = parseUserIds(ids)
    const ipList = [...new Set(ips.split(/[\s,，]+/).filter(Boolean))]
    // Preserve pre-existing server-managed CIDRs; this UI only adds exact IPs.
    if (
      ipList.some(
        (ip) => !isExactIP(ip) && !snapshot.config.allowlist_ips.includes(ip)
      )
    ) {
      setValidation(
        '白名单请填写精确 IPv4 或 IPv6 地址，每行一个。此页面不新增网段。'
      )
      return
    }
    if (!userIds) {
      setValidation('白名单用户 ID 必须为正整数，每行一个。')
      return
    }
    const next = {
      ...config,
      allowlist_ips: ipList,
      allowlist_user_ids: userIds,
    }
    const problem = validateConfig(next)
    setValidation(problem)
    if (!problem) onSave(next)
  }

  return (
    <form onSubmit={submit} className='min-w-0 space-y-5' aria-label='防护配置'>
      <fieldset
        disabled={saving}
        className='min-w-0 space-y-5 disabled:opacity-70'
      >
        <div className='flex items-start justify-between gap-4 rounded-xl border p-4'>
          <div className='min-w-0 space-y-1'>
            <Label
              htmlFor='protection-enabled'
              className='text-sm font-semibold'
            >
              自动防护总开关
            </Label>
            <p className='text-muted-foreground text-xs leading-relaxed'>
              关闭后停止自动检测和处置；已存在的人工限制、历史 IP 封禁继续有效。
            </p>
          </div>
          <Switch
            id='protection-enabled'
            disabled={saving}
            checked={config.enabled}
            onCheckedChange={(enabled) => setConfig({ ...config, enabled })}
          />
        </div>
        <div className='space-y-2'>
          <Label htmlFor='protection-mode'>运行模式</Label>
          <select
            id='protection-mode'
            className='bg-background h-10 w-full min-w-0 rounded-lg border px-3 text-sm'
            value={config.mode}
            onChange={(event) =>
              setConfig({
                ...config,
                mode: event.target.value === 'enforce' ? 'enforce' : 'observe',
              })
            }
          >
            <option value='observe'>只观察：记录命中，不自动拦截</option>
            <option value='enforce'>
              执行防护：按规则暂缓领奖和临时限制 IP
            </option>
          </select>
          <p className='text-muted-foreground text-xs'>
            只有总开关开启且使用执行模式时，自动规则才会限制请求。人工限制立即生效。
          </p>
        </div>
        <div className='grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3'>
          {rules.map((rule) => (
            <div key={rule.key} className='min-w-0 space-y-1.5'>
              <Label htmlFor={`rule-${rule.key}`} className='text-xs'>
                {rule.label}
              </Label>
              <Input
                id={`rule-${rule.key}`}
                type='number'
                inputMode='numeric'
                required
                min={ruleLimits[rule.key]?.[0]}
                max={ruleLimits[rule.key]?.[1]}
                step={1}
                value={Number(config[rule.key])}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    [rule.key]: Number(event.target.value),
                  })
                }
              />
              <p className='text-muted-foreground text-xs leading-relaxed'>
                {rule.help} 范围 {ruleLimits[rule.key]?.[0]}–
                {ruleLimits[rule.key]?.[1]}。
              </p>
            </div>
          ))}
        </div>
        <div className='grid min-w-0 gap-4 md:grid-cols-2'>
          <div className='min-w-0 space-y-2'>
            <Label htmlFor='protection-allow-users'>用户白名单</Label>
            <Textarea
              id='protection-allow-users'
              value={ids}
              onChange={(event) => setIds(event.target.value)}
              rows={4}
              className='min-w-0'
              placeholder='用户 ID，每行一个'
            />
            <p className='text-muted-foreground text-xs'>
              按用户 ID 豁免自动规则。不会恢复已停用或已删除账号。
            </p>
          </div>
          <div className='min-w-0 space-y-2'>
            <Label htmlFor='protection-allow-ips'>IP 白名单</Label>
            <Textarea
              id='protection-allow-ips'
              value={ips}
              onChange={(event) => setIps(event.target.value)}
              rows={4}
              className='min-w-0'
              placeholder='精确 IPv4 / IPv6，每行一个'
            />
            <p className='text-muted-foreground text-xs'>
              仅在此添加精确地址。现有服务器白名单网段会保留。
            </p>
          </div>
        </div>
      </fieldset>
      {(validation || error) && (
        <p
          role='alert'
          className='text-destructive rounded-lg border p-3 text-sm leading-relaxed'
        >
          {validation || error}
        </p>
      )}
      <div className='flex flex-wrap items-center justify-between gap-3 border-t pt-4'>
        <p className='text-muted-foreground text-xs' aria-live='polite'>
          配置版本 #{snapshot.revision}
          {dirty ? ' · 有未保存的修改' : ' · 已保存'}
        </p>
        <div className='flex flex-wrap gap-2'>
          <Button
            type='button'
            variant='outline'
            disabled={saving}
            onClick={onReload}
          >
            放弃修改并载入最新
          </Button>
          <Button type='submit' disabled={saving || !dirty}>
            {saving ? '正在保存…' : '保存防护配置'}
          </Button>
        </div>
      </div>
    </form>
  )
}
