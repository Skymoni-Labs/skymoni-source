import type { ReactNode } from 'react'

import { useCommunityAccessPolicy } from './access-policy-api'

export function CommunitySignupLabel() {
  const policy = useCommunityAccessPolicy()
  return policy.data?.redemptionRequired || policy.data?.inviteRequired
    ? '注册 / 开通社区'
    : '免费注册'
}
export function CommunityAccessDescription({
  children,
}: {
  children: ReactNode
}) {
  const policy = useCommunityAccessPolicy()
  const conditions = [
    policy.data?.redemptionRequired ? '成功兑换额度或充值' : '',
    policy.data?.inviteRequired ? '有效邀请码' : '',
  ].filter(Boolean)
  return conditions.length
    ? `新成员开通社区需要${conditions.join('，并提供')}。已开通成员可直接登录，作品与话题分别管理。`
    : children
}
