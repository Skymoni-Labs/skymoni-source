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
const labels: Record<string, string> = {
  account_age_seconds: '账号年龄（秒）',
  first_checkin_cooldown_seconds: '首次领奖冷静期（秒）',
  ip_daily_new_user_limit: '每日新账号签到上限',
  ip_daily_new_claims: '当日新账号签到数',
  burst_window_seconds: '聚集检测窗口（秒）',
  burst_new_user_threshold: '聚集新账号阈值',
  burst_rapid_user_threshold: '快速领奖账号阈值',
  burst_new_uids: '窗口内新账号数',
  burst_rapid_uids: '窗口内快速领奖账号数',
  auto_ip_window_seconds: '自动 IP 检测窗口（秒）',
  auto_ip_new_user_threshold: '自动 IP 新账号阈值',
  auto_ip_denied_threshold: '自动 IP 拒绝次数阈值',
  auto_ip_ban_seconds: '自动 IP 限制时长（秒）',
  window_new_uids: 'IP 窗口内新账号数',
  restricted_retries: '受限后重试次数',
  registration_submissions_in_window: '窗口内注册提交数',
  registration_ip_hour_limit: '注册频率上限',
  registration_window_seconds: '注册检测窗口（秒）',
}

export function EvidenceDetails({
  request_id,
  policy_revision,
  evidence,
  revoked_request_id,
}: {
  request_id?: string
  policy_revision?: number
  evidence?: Record<string, number>
  revoked_request_id?: string
}) {
  // Render an explicit numeric evidence allowlist; never stringify raw payloads.
  const rows = Object.entries(evidence || {}).filter(
    ([key, value]) =>
      labels[key] && typeof value === 'number' && Number.isFinite(value)
  )
  if (
    !request_id &&
    !policy_revision &&
    rows.length === 0 &&
    !revoked_request_id
  ) {
    return null
  }
  return (
    <details className='min-w-0 border-t pt-2 text-xs'>
      <summary className='text-muted-foreground cursor-pointer py-1'>
        规则依据与请求追踪
      </summary>
      <dl className='mt-2 grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-3 gap-y-2'>
        {!!policy_revision && (
          <>
            <dt className='text-muted-foreground'>策略版本</dt>
            <dd>#{policy_revision}</dd>
          </>
        )}
        {request_id && (
          <>
            <dt className='text-muted-foreground'>请求 ID</dt>
            <dd className='font-mono break-all'>{request_id}</dd>
          </>
        )}
        {revoked_request_id && (
          <>
            <dt className='text-muted-foreground'>撤销请求 ID</dt>
            <dd className='font-mono break-all'>{revoked_request_id}</dd>
          </>
        )}
        {rows.map(([key, value]) => (
          <div key={key} className='contents'>
            <dt className='text-muted-foreground break-words'>{labels[key]}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </details>
  )
}
