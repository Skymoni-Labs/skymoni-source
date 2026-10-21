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
  BadgePercent,
  Clock3,
  Copy,
  Mail,
  Plus,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { listMail } from '@/features/admin-mail/api'

import {
  changeSale,
  checkSavedSale,
  refreshSaleCosts,
  publishSale,
  unpublishSale,
  saleInputMatches,
  createSaleMailDraft,
  defaultPolicy,
  listSales,
  quoteSales,
  saleStatus,
  saveSale,
  type Sale,
  type SaleInput,
  type SalePolicy,
  type SaleQuote,
} from './api'
import { FlipCountdown } from './countdown'
import {
  SalePublication,
  beijingInput,
  parseBeijingInput,
  publicationState,
} from './publication'
import { SaleTimePrices, saleTierLabel } from './time-prices'
import {
  saleTemplateInput,
  templateModelCount,
  updatedSaleConfig,
  saleConfigForSave,
} from './template'

import './sale.css'

const localTime = beijingInput
const time = (s: number) =>
  new Date(s * 1000).toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour12: false,
  })
const fresh = (): SaleInput => {
  const start = Math.ceil((Date.now() / 1000 + 300) / 60) * 60
  return {
    title: '精选模型限时降价',
    start_at: start,
    end_at: start + 7 * 86400,
    revision: 0,
    config: {
      models: [],
      discount_percent: 0,
      pricing_basis: 'official',
      request_prices_cny: {},
      model_multipliers: {},
      policy: { ...defaultPolicy },
      countdown_mode: 'end',
    },
  }
}
const errorText = (e: unknown) =>
  e instanceof Error ? e.message : '操作失败，请刷新后重试'
const componentName: Record<string, string> = {
  p: '输入',
  c: '输出',
  cr: '缓存读取',
  cc: '缓存写入',
  cc1h: '缓存写入 1 小时',
  request: '每次请求',
}

export function ModelSales() {
  const client = useQueryClient()
  const list = useQuery({
    queryKey: ['model-sales'],
    queryFn: listSales,
    refetchInterval: 10000,
  })
  const quoteRequest = useRef(0)
  const mailRequest = useRef({ fingerprint: '', key: crypto.randomUUID() })
  const [form, setForm] = useState<SaleInput>(fresh)
  const [editing, setEditing] = useState<string>()
  const [quotes, setQuotes] = useState<SaleQuote[]>([])
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [reusing, setReusing] = useState(false)
  const recentMail = useQuery({
    queryKey: ['admin-mail', 'sale-templates'],
    queryFn: () => listMail(1),
  })
  const [baseDraftId, setBaseDraftId] = useState(0)
  const [createdMailId, setCreatedMailId] = useState<number>()
  const [mailBusy, setMailBusy] = useState(false)
  const [showBlocked, setShowBlocked] = useState(true)
  const [preview, setPreview] = useState<Sale>()
  const eligible = quotes.filter((q) => q.eligible)
  const shown = showBlocked ? quotes : eligible
  const current = list.data?.items.find((s) => s.id === editing)
  const publicationDirty = !!current && !saleInputMatches(current, form)
  const canEdit = !current || ['draft', 'paused'].includes(current.status)
  const updateConfig = (patch: Partial<SaleInput['config']>) => {
    setForm((f) => ({ ...f, config: updatedSaleConfig(f.config, patch) }))
    quoteRequest.current++
    setChecked(false)
  }
  const check = async () => {
    const request = ++quoteRequest.current
    setBusy(true)
    try {
      const r = await quoteSales(
        form.config.policy,
        form.config.model_multipliers ?? {},
        form.config.request_prices_cny ?? {}
      )
      if (request !== quoteRequest.current) return
      setQuotes(r.quotes)
      setChecked(true)
      toast.success(
        `核验完成：${r.quotes.filter((q) => q.eligible).length} 个模型可参与`
      )
    } catch (e) {
      toast.error(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  const load = (sale: Sale) => {
    const request = ++quoteRequest.current
    const multipliers =
      sale.config.pricing_basis === 'official'
        ? (sale.config.model_multipliers ?? {})
        : {}
    setCreatedMailId(undefined)
    setEditing(sale.id)
    setPreview(sale)
    setForm({
      title: sale.title,
      start_at: sale.start_at,
      end_at: sale.end_at,
      revision: sale.revision,
      config: {
        ...structuredClone(sale.config),
        pricing_basis: 'official',
        discount_percent: 0,
        model_multipliers: multipliers,
        request_prices_cny:
          sale.config.pricing_basis === 'official'
            ? (sale.config.request_prices_cny ?? {})
            : {},
      },
    })
    setChecked(false)
    setQuotes([])
    void (
      sale.status === 'active'
        ? checkSavedSale(sale.id)
        : quoteSales(
            sale.config.policy,
            multipliers,
            sale.config.pricing_basis === 'official'
              ? (sale.config.request_prices_cny ?? {})
              : {}
          )
    )
      .then(async (result) => {
        if (request !== quoteRequest.current) return
        if (
          sale.config.pricing_basis !== 'official' &&
          sale.status !== 'active'
        ) {
          const converted: Record<string, number> = {}
          const requests: Record<string, number> = {}
          for (const q of result.quotes.filter((q) =>
            sale.config.models.includes(q.model)
          )) {
            const f =
              sale.config.model_multipliers?.[q.model] ??
              1 - sale.config.discount_percent / 100
            if (q.pricing_basis === 'request')
              requests[q.model] = (q.current_request_cny ?? 0) * f
            else if (q.current_multiplier > 0)
              converted[q.model] = Number((q.current_multiplier * f).toFixed(6))
          }
          setForm((f) => ({
            ...f,
            config: {
              ...f.config,
              model_multipliers: converted,
              request_prices_cny: requests,
            },
          }))
          result = await quoteSales(sale.config.policy, converted, requests)
          if (request !== quoteRequest.current) return
        }
        setQuotes(result.quotes)
        setChecked(true)
      })
      .catch((e) => toast.error(errorText(e)))
  }
  const save = async () => {
    setBusy(true)
    try {
      const config = saleConfigForSave(form.config, quotes)
      const s = await saveSale({ ...form, config }, editing)
      setEditing(s.id)
      setPreview(s)
      setForm((f) => ({ ...f, config: s.config, revision: s.revision }))
      await client.invalidateQueries({ queryKey: ['model-sales'] })
      toast.success('已保存为未启用模板')
    } catch (e) {
      toast.error(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  const reuse = async (sales: Sale[], title?: string) => {
    setReusing(true)
    quoteRequest.current++
    try {
      // Read fresh settings and server time before saving; the new template
      // never changes the original activity or copies its publication state.
      const latest = await listSales()
      const sources = sales.map((s) => {
        const source = latest.items.find((item) => item.id === s.id)
        if (!source || source.revision !== s.revision)
          throw new Error('原活动已变化，请刷新列表后再复用')
        return source
      })
      const created = await saveSale(
        saleTemplateInput(sources, latest.server_time, title)
      )
      await client.invalidateQueries({ queryKey: ['model-sales'] })
      load(created)
      toast.success('已保存新的未启用模板；请设置时间并重新核验成本')
      document
        .getElementById('sale-settings')
        ?.scrollIntoView({ behavior: 'smooth' })
    } catch (e) {
      toast.error(errorText(e))
    } finally {
      setReusing(false)
    }
  }
  const change = async (s: Sale, action: 'enable' | 'disable') => {
    setBusy(true)
    try {
      const result = await changeSale(s, action)
      if (editing === s.id) load(result)
      setPreview(result)
      await client.invalidateQueries({ queryKey: ['model-sales'] })
      toast.success(
        action === 'enable' ? '定时降价已启用' : '已停用并处理价格恢复'
      )
    } catch (e) {
      toast.error(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('已复制')
    } catch {
      toast.error('复制失败，请手动选择文本')
    }
  }
  const publish = async (at?: number) => {
    if (!current) return
    setBusy(true)
    try {
      const result =
        at === undefined
          ? await unpublishSale(current)
          : await publishSale(current, at)
      load(result)
      await client.invalidateQueries({ queryKey: ['model-sales'] })
      await client.invalidateQueries({ queryKey: ['public-model-sales'] })
      toast.success(
        at === undefined
          ? '公告已取消；实际价格与降价计划不变'
          : '仅更新公告发布计划；实际降价计划未变，也未发送邮件'
      )
    } catch (e) {
      toast.error(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  const policyFields: {
    key: keyof SalePolicy
    label: string
    step: number
    min: number
    max: number
  }[] = [
    {
      key: 'cny_per_credit',
      label: '每额度收入上限（元）',
      step: 0.001,
      min: 0.001,
      max: 0.1,
    },
    {
      key: 'cny_per_usd',
      label: '成本换算备用值（元）',
      step: 0.1,
      min: 4,
      max: 15,
    },
    {
      key: 'minimum_margin_percent',
      label: '最低利润率（%）',
      step: 1,
      min: 10,
      max: 80,
    },
    {
      key: 'cost_buffer_percent',
      label: '成本上涨缓冲（%）',
      step: 1,
      min: 5,
      max: 100,
    },
    {
      key: 'revenue_reserve_percent',
      label: '收入折损预留（%）',
      step: 1,
      min: 5,
      max: 50,
    },
    {
      key: 'max_cost_age_hours',
      label: '报价有效期（小时）',
      step: 1,
      min: 1,
      max: 72,
    },
  ]
  return (
    <main className="sale-admin mx-auto min-h-0 w-full max-w-7xl flex-1 space-y-5 overflow-y-auto p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="sale-eyebrow">SKYMONI / PRICING</p>
          <h1 className="text-2xl font-semibold">模型降价定时</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Token
            模型填写官方价格倍率，按次模型填写每次金额。先核验成本底线，再保存定时。
          </p>
        </div>
        <Button
          variant="outline"
          disabled={reusing || busy}
          onClick={() => {
            setEditing(undefined)
            setPreview(undefined)
            setForm(fresh())
            setQuotes([])
            setChecked(false)
          }}
        >
          <Plus className="size-4" />
          新建模板
        </Button>
      </header>
      <div className="sale-guard">
        <ShieldCheck className="size-5 shrink-0 text-sky-400" />
        <p>
          按已知上游成本核验所有计费档与分组。默认预留{' '}
          <b>20% 利润、10% 成本缓冲、5% 收入折损</b>
          ；成本缺失、过期、映射不匹配或利润不足时拦截。签到赠送额度没有现金收入，补贴和运营费用须计入收入折损。
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          '01 · 查看全部模型与最低倍率',
          '02 · 自行选模型并设置目标倍率',
          '03 · 生成邮件草稿，预览后发送',
        ].map((label) => (
          <div
            key={label}
            className="bg-card rounded-xl border px-4 py-3 text-xs font-medium"
          >
            {label}
          </div>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section id="sale-settings" className="sale-panel space-y-4">
          <div className="flex items-center gap-2 font-semibold">
            <BadgePercent className="size-4 text-sky-400" />
            活动设置
            {current && (
              <span className="sale-tag">{saleStatus[current.status]}</span>
            )}
          </div>
          <fieldset
            disabled={!canEdit || busy || reusing}
            className="space-y-4 disabled:opacity-65"
          >
            <label className="sale-field">
              活动名称
              <Input
                value={form.title}
                maxLength={100}
                onChange={(e) =>
                  setForm((f) => ({ ...f, title: e.target.value }))
                }
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="sale-field">
                开始时间
                <Input
                  type="datetime-local"
                  value={localTime(form.start_at)}
                  onChange={(e) => {
                    const value = parseBeijingInput(e.target.value)
                    if (Number.isFinite(value)) {
                      setForm((f) => ({ ...f, start_at: value }))
                    }
                  }}
                />
              </label>
              <label className="sale-field">
                结束时间
                <Input
                  type="datetime-local"
                  value={localTime(form.end_at)}
                  onChange={(e) => {
                    const value = parseBeijingInput(e.target.value)
                    if (Number.isFinite(value)) {
                      setForm((f) => ({ ...f, end_at: value }))
                    }
                  }}
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              {[1, 3, 7].map((days) => (
                <Button
                  key={days}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const start = Math.ceil((Date.now() / 1000 + 60) / 60) * 60
                    setForm((f) => ({
                      ...f,
                      start_at: start,
                      end_at: start + days * 86400,
                    }))
                  }}
                >
                  从现在开始 {days} 天
                </Button>
              ))}
              <span className="text-muted-foreground self-center text-xs">
                最长 7 天 · 北京时间
              </span>
            </div>
            <label className="sale-field">
              倒计时显示
              <select
                className="sale-select"
                value={form.config.countdown_mode}
                onChange={(e) =>
                  updateConfig({
                    countdown_mode: e.target
                      .value as SaleInput['config']['countdown_mode'],
                  })
                }
              >
                <option value="end">优惠结束倒计时</option>
                <option value="start">降价开始倒计时</option>
                <option value="auto">开始前倒数开场，开始后倒数结束</option>
              </select>
            </label>
            <details className="sale-details">
              <summary>保本参数与计算口径</summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {policyFields.map(({ key, label, step, min, max }) => (
                  <label key={key} className="sale-field">
                    {label}
                    <Input
                      type="number"
                      step={step}
                      min={min}
                      max={max}
                      value={form.config.policy[key]}
                      onChange={(e) =>
                        updateConfig({
                          policy: {
                            ...form.config.policy,
                            [key]: Number(e.target.value),
                          },
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <p className="text-muted-foreground mt-3 text-xs leading-6">
                按 ¥9.9 / 99 额度这一档计算，每额度 ¥0.10；不考虑大额套餐优惠。
                手续费、赠送额度和运营费用计入收入预留。各上游使用已配置的实际采购換算价。
                最低倍率取所有计费档、分项、启用渠道和用户分组的最高成本要求。高低峰按最高上游成本核验每一档；固定成本分组单独计算。
                官方价格 = 1×，如当前官方倍率 0.17×，可以填写 0.16×。
                输入、输出和缓存逐项对照官方价；美元报价使用已核验参考汇率换算。
                按次模型直接填写元/次；低于成本保护底线不能启用。
              </p>
            </details>
          </fieldset>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              disabled={busy || reusing || !canEdit}
              onClick={check}
            >
              <RefreshCw className={`size-4 ${busy ? 'animate-spin' : ''}`} />
              核验可降价模型
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy || reusing}
              onClick={async () => {
                setBusy(true)
                try {
                  await refreshSaleCosts()
                  await check()
                } catch (e) {
                  toast.error(errorText(e))
                } finally {
                  setBusy(false)
                }
              }}
            >
              刷新上游成本并核验
            </Button>
            <span className="text-muted-foreground text-xs">
              已选 {form.config.models.length} 个 ·{' '}
              {checked ? `${eligible.length} 个通过` : '修改参数后请重新核验'}
            </span>
            {eligible.length > 0 && canEdit && (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy || !checked}
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    config: {
                      ...f.config,
                      models: eligible.slice(0, 200).map((q) => q.model),
                    },
                  }))
                }
              >
                选中通过项
              </Button>
            )}
          </div>
          {quotes.length > 0 && (
            <>
              <button
                type="button"
                className="text-muted-foreground text-xs underline underline-offset-4"
                onClick={() => setShowBlocked((v) => !v)}
              >
                {showBlocked
                  ? '只看可参与模型'
                  : `查看全部 ${quotes.length} 个模型及拦截原因`}
              </button>
              <div className="sale-model-list">
                {shown.map((q) => (
                  <div key={q.model} className="sale-model">
                    <label className="flex min-w-0 items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 size-4 accent-sky-500"
                        disabled={
                          (!q.eligible &&
                            !form.config.models.includes(q.model)) ||
                          !canEdit ||
                          busy
                        }
                        checked={form.config.models.includes(q.model)}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            config: {
                              ...f.config,
                              models: e.target.checked
                                ? [...f.config.models, q.model].slice(0, 200)
                                : f.config.models.filter((n) => n !== q.model),
                            },
                          }))
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <b className="text-sm break-all">{q.model}</b>
                        <p
                          className={`mt-1 text-xs ${q.eligible ? 'text-sky-400' : 'text-muted-foreground'}`}
                        >
                          {q.eligible
                            ? `${q.pricing_basis === 'request' ? `最低安全价 ¥${(q.minimum_request_cny ?? 0).toFixed(6)}/次` : `最低官方倍率 ${q.minimum_multiplier.toFixed(6)}×`} · 目标利润 ${q.target_margin_percent.toFixed(1)}%（已计缓冲）`
                            : q.reason}
                        </p>
                      </div>
                    </label>
                    <div className="mt-3 flex flex-wrap items-center gap-3 pl-7 text-xs">
                      <span className="text-muted-foreground">
                        {q.pricing_basis === 'request'
                          ? `当前 ¥${(q.current_request_cny ?? 0).toFixed(6)}/次 · 最低 ${(q.minimum_request_cny ?? 0) > 0 ? `¥${q.minimum_request_cny!.toFixed(6)}/次` : '待核验'}`
                          : `当前官方倍率 ${q.current_multiplier > 0 ? `${q.current_multiplier.toFixed(6)}×` : '待核验'} · 最低 ${q.minimum_multiplier > 0 && Number.isFinite(q.minimum_multiplier) ? `${q.minimum_multiplier.toFixed(6)}×` : '待核验'}`}
                      </span>
                      <label className="flex items-center gap-2">
                        {q.pricing_basis === 'request'
                          ? '目标价格（元/次）'
                          : '目标官方倍率'}
                        <Input
                          type="number"
                          className="h-8 w-28"
                          min="0.000001"
                          step={
                            q.pricing_basis === 'request' ? '0.0001' : '0.001'
                          }
                          value={
                            q.pricing_basis === 'request'
                              ? (form.config.request_prices_cny?.[q.model] ??
                                q.target_request_cny ??
                                '')
                              : (form.config.model_multipliers?.[q.model] ??
                                  q.target_multiplier) ||
                                ''
                          }
                          disabled={
                            !canEdit ||
                            busy ||
                            q.lines.length === 0 ||
                            (q.pricing_basis === 'request'
                              ? (q.minimum_request_cny ?? 0) <= 0
                              : q.minimum_multiplier <= 0 ||
                                !Number.isFinite(q.minimum_multiplier))
                          }
                          onChange={(e) =>
                            updateConfig(
                              q.pricing_basis === 'request'
                                ? {
                                    request_prices_cny: {
                                      ...form.config.request_prices_cny,
                                      [q.model]: Number(e.target.value),
                                    },
                                  }
                                : {
                                    model_multipliers: {
                                      ...form.config.model_multipliers,
                                      [q.model]: Number(e.target.value),
                                    },
                                  }
                            )
                          }
                        />
                      </label>
                      {q.official_source && (
                        <a
                          className="text-sky-400 underline"
                          href={q.official_source}
                          target="_blank"
                          rel="noreferrer"
                        >
                          官方价格 ↗
                        </a>
                      )}
                      {(q.maximum_current_multiplier ?? 0) >
                        q.current_multiplier + 0.000001 && (
                        <span className="text-muted-foreground">
                          分项当前倍率范围 {q.current_multiplier.toFixed(6)}–
                          {q.maximum_current_multiplier!.toFixed(6)}×
                        </span>
                      )}
                      {!checked && (
                        <span className="text-amber-400">修改后请重新核验</span>
                      )}
                    </div>
                    {q.official_prices_cny && q.lines.length === 0 && (
                      <details className="mt-2 pl-7 text-xs">
                        <summary className="text-muted-foreground cursor-pointer">
                          查看官方价格（人民币 / 百万 Token）
                        </summary>
                        {Object.entries(q.official_prices_cny).map(
                          ([tier, prices]) => (
                            <p key={tier} className="mt-2">
                              {saleTierLabel(tier)} ·{' '}
                              {Object.entries(prices)
                                .map(
                                  ([k, v]) =>
                                    `${componentName[k] ?? k} ¥${v.toFixed(4)}`
                                )
                                .join(' · ')}
                            </p>
                          )
                        )}
                      </details>
                    )}
                    {q.lines.length > 0 && (
                      <details className="mt-2 pl-7 text-xs">
                        <summary className="text-muted-foreground cursor-pointer">
                          分项价格依据（人民币 / 百万 Token；按次项为每次）
                        </summary>
                        <div className="overflow-x-auto">
                          <table className="sale-price-table">
                            <thead>
                              <tr>
                                <th>计费档 / 分项</th>
                                <th>官方价</th>
                                <th>原价</th>
                                <th>降后</th>
                                <th>成本</th>
                                <th>保本底价</th>
                              </tr>
                            </thead>
                            <tbody>
                              {q.lines.map((l) => (
                                <tr key={`${l.tier}-${l.component}`}>
                                  <td>
                                    {saleTierLabel(l.tier)} /{' '}
                                    {componentName[l.component] ?? l.component}
                                  </td>
                                  <td>
                                    {l.official_cny === undefined
                                      ? '—'
                                      : `¥${l.official_cny.toFixed(4)}`}
                                  </td>
                                  {[
                                    l.sale_cny,
                                    l.target_cny,
                                    l.cost_cny,
                                    l.floor_cny,
                                  ].map((v, i) => (
                                    <td
                                      key={
                                        ['sale', 'target', 'cost', 'floor'][i]
                                      }
                                    >
                                      ¥{v.toFixed(4)}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <p className="text-muted-foreground mt-2">
                          成本核验：
                          {q.observed_at
                            ? time(Date.parse(q.observed_at) / 1000)
                            : '无'}{' '}
                          · 分组：{q.groups.join('、')} · 实际收入 ¥
                          {q.cash_cny_per_credit?.toFixed(5)} / 额度 ·
                          采购换算：
                          {Object.entries(q.cost_conversion ?? {})
                            .map(([provider, v]) => `${provider} ¥${v}`)
                            .join('、') || '使用备用值'}
                        </p>
                      </details>
                    )}
                  </div>
                ))}
              </div>
              {shown.length === 0 && (
                <p className="text-muted-foreground py-4 text-sm">
                  当前参数下没有通过的模型。请查看拦截原因或先同步上游成本。
                </p>
              )}
            </>
          )}
          {form.config.models.length > 0 && (
            <p className="text-muted-foreground text-xs break-all">
              模板模型：{form.config.models.join('、')}
            </p>
          )}
          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button
              disabled={
                busy ||
                reusing ||
                !canEdit ||
                form.config.models.length === 0 ||
                !checked
              }
              onClick={save}
            >
              保存未启用模板
            </Button>
            {current && ['draft', 'paused'].includes(current.status) && (
              <Button
                disabled={busy || reusing || !checked || publicationDirty}
                variant="outline"
                onClick={() => change(current, 'enable')}
              >
                启用定时降价
              </Button>
            )}
            <span className="text-muted-foreground self-center text-xs">
              保存不会改变当前价格；启用时再次核验。
            </span>
          </div>
          <SaleTimePrices
            details={current?.time_prices?.filter((detail) =>
              form.config.models.includes(detail.model)
            )}
            multipliers={form.config.model_multipliers}
            planned={current?.status !== 'active'}
          />
        </section>
        <aside className="space-y-4">
          <SalePublication
            sale={current}
            serverTime={list.data?.server_time ?? Math.floor(Date.now() / 1000)}
            busy={busy || reusing}
            dirty={publicationDirty}
            onPublish={(at) => void publish(at)}
            onCancel={() => void publish()}
          />
          <section className="sale-preview">
            <p className="sale-eyebrow">LIMITED TIME</p>
            <h2 className="mt-2 text-xl font-semibold">
              {form.title || '模型优惠'}
            </h2>
            <p className="mt-2 text-sm text-sky-300">
              {current ? saleStatus[current.status] : '未保存预览'} · 官方倍率 /
              元每次
            </p>
            <FlipCountdown
              target={
                form.config.countdown_mode === 'start' ||
                (form.config.countdown_mode === 'auto' &&
                  (list.data?.server_time ?? 0) < form.start_at)
                  ? form.start_at
                  : form.end_at
              }
              serverTime={list.data?.server_time}
            />
            <p className="text-center text-xs text-slate-400">
              截止 {time(form.end_at)} · 北京时间
            </p>
            <p className="mt-4 text-xs leading-5 text-slate-400">
              启用后约每 10
              秒检查一次。到期或成本不再满足要求时自动结束；人工改价会被保留。
            </p>
            <div className="mt-4 border-t border-slate-500/20 pt-3 text-xs leading-6 text-slate-400">
              自动同步保护：待开始和降价中的模型会跳过自动改价；成本仍继续同步。到期恢复原配置，随后回归原有同步策略。
            </div>
          </section>
          {preview && (
            <section className="sale-panel space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Mail className="size-4 text-sky-400" />
                优惠邮件联动
              </h3>
              <img
                className="w-full rounded-lg"
                src={`/api/model-sales/public/${preview.id}/countdown.gif?revision=${preview.revision}`}
                alt="GIF 翻页倒计时预览"
                width="620"
                height="132"
              />
              <p className="text-muted-foreground text-xs leading-5">
                真实 GIF 翻页约 60
                秒，不循环回跳。邮箱可能缓存图片，邮件同时注明截止时间并链接实时活动页。
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    copy(
                      `<div data-model-sale="${preview.id}">模型优惠倒计时</div>`
                    )
                  }
                >
                  <Copy className="size-3" />
                  复制邮件插入块
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  render={
                    <a
                      href={`/model-offers/${preview.id}`}
                      target="_blank"
                      rel="noreferrer"
                    />
                  }
                >
                  活动页
                </Button>
              </div>
              <label className="sale-field">
                邮件内容
                <select
                  className="sale-select"
                  value={baseDraftId}
                  onChange={(e) => {
                    setBaseDraftId(Number(e.target.value))
                    setCreatedMailId(undefined)
                  }}
                >
                  <option value={0}>只生成本次优惠通知</option>
                  {recentMail.data?.items
                    .filter((m) => m.format === 'html')
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        融合 #{m.id} · {m.subject}
                      </option>
                    ))}
                </select>
              </label>
              <Button
                className="w-full"
                disabled={
                  mailBusy || !current || current.revision !== preview.revision
                }
                onClick={async () => {
                  setMailBusy(true)
                  try {
                    const fingerprint = `${preview.id}/${preview.revision}/${baseDraftId}`
                    if (mailRequest.current.fingerprint !== fingerprint) {
                      mailRequest.current = {
                        fingerprint,
                        key: crypto.randomUUID(),
                      }
                    }
                    const draft = await createSaleMailDraft(
                      preview,
                      baseDraftId,
                      mailRequest.current.key
                    )
                    setCreatedMailId(draft.id)
                    await client.invalidateQueries({
                      queryKey: ['admin-mail'],
                    })
                    toast.success(`邮件草稿 #${draft.id} 已生成，尚未发送`)
                  } catch (e) {
                    toast.error(errorText(e))
                  } finally {
                    setMailBusy(false)
                  }
                }}
              >
                <Mail className="size-4" />
                {mailBusy ? '正在生成…' : '生成优惠邮件草稿'}
              </Button>
              {createdMailId && (
                <a
                  className="block text-xs font-semibold text-sky-500 underline"
                  href={`/email-messages?draft-preview=${createdMailId}`}
                >
                  打开草稿 #{createdMailId} 预览 →
                </a>
              )}
              <p className="text-muted-foreground text-xs leading-5">
                倒计时自动放在邮件顶部，收件人默认为绑定邮箱的用户。生成只保存草稿；群发前必须启用活动并再次通过成本检查。
              </p>
            </section>
          )}
        </aside>
      </div>
      <section className="sale-panel">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              <Clock3 className="size-4 text-sky-400" />
              活动与复用模板
            </h2>
            <p className="text-muted-foreground mt-2 text-xs leading-5">
              复用保留模型、目标倍率及成本保护参数，时间重新设置。只生成未启用模板；启用前重新核验，邮件另行生成草稿。
            </p>
          </div>
          {!!list.data?.items.filter((s) => s.status === 'active').length && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy || reusing}
              onClick={() =>
                reuse(
                  list.data!.items.filter((s) => s.status === 'active'),
                  list
                    .data!.items.filter((s) => s.status === 'active')
                    .every((s) => s.end_at - s.start_at === 7 * 86400)
                    ? '七天限时降价 · 组合复用模板'
                    : '限时降价 · 组合复用模板'
                )
              }
            >
              <Copy className="size-4" />
              保存当前活动为组合模板
            </Button>
          )}
        </div>
        {list.isError && (
          <p className="text-destructive text-sm">{errorText(list.error)}</p>
        )}
        {list.isPending && (
          <p className="text-muted-foreground text-sm">正在读取…</p>
        )}
        {list.data?.items.length === 0 && (
          <p className="text-muted-foreground text-sm">
            保存第一份模板后会显示在这里。
          </p>
        )}
        <div className="space-y-3">
          {list.data?.items.map((s) => (
            <article className="sale-saved" key={s.id}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap gap-2">
                  <b className="text-sm">{s.title}</b>
                  <span
                    className={`sale-tag ${s.status === 'active' ? 'sale-tag-active' : ''}`}
                  >
                    {saleStatus[s.status] ?? s.status}
                  </span>
                </div>
                <p className="text-muted-foreground mt-2 text-xs">
                  {time(s.start_at)} → {time(s.end_at)} ·{' '}
                  {templateModelCount(s)} 个模型 · 独立价格倍率
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {s.message}
                </p>
                {!!s.time_prices?.length && (
                  <p className="mt-1 text-xs text-sky-400">
                    分时降价：普通与高峰各有原价 / 优惠价，查看模板可展开两档。
                  </p>
                )}
                <p className="mt-1 text-xs text-sky-400">
                  公告：
                  {
                    (
                      {
                        scheduled: '待定时发布',
                        published: '已到发布时间',
                        unpublished: '未发布',
                        ended: '已结束',
                      } as Record<string, string>
                    )[publicationState(s, list.data?.server_time ?? 0)]
                  }
                  {s.announcement_enabled &&
                    ` · ${time(s.announcement_at ?? 0)}（北京时间）`}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={reusing}
                  onClick={() => load(s)}
                >
                  查看{['draft', 'paused'].includes(s.status) ? ' / 编辑' : ''}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || reusing}
                  onClick={() => reuse([s])}
                >
                  <Copy className="size-3.5" />
                  复用模板
                </Button>
                {['scheduled', 'active'].includes(s.status) && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || reusing}
                    onClick={() => change(s, 'disable')}
                  >
                    停用
                  </Button>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
