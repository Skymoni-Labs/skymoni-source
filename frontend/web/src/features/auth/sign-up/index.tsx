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
import { Link, useSearch } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { CommunityAccessDescription } from '@/features/community/access-copy'
import { useStatus } from '@/hooks/use-status'

import { BrandAuthLayout } from '../brand-auth-layout'
import { TermsFooter } from '../components/terms-footer'
import { isCommunityAuthReturn } from '../lib/community-auth'
import { SignUpForm } from './components/sign-up-form'

export function SignUp() {
  const { t } = useTranslation()
  const { status } = useStatus()
  const { redirect } = useSearch({ from: '/(auth)/sign-up' })
  const community = isCommunityAuthReturn(redirect)

  return (
    <BrandAuthLayout variant='sign-up'>
      <div className='w-full space-y-5'>
        <div className='space-y-2'>
          <h2 className='text-center text-2xl font-semibold tracking-tight sm:text-left'>
            {community ? '免费加入 skymoni 社区' : t('Create an account')}
          </h2>
          <p className='text-muted-foreground text-left text-sm sm:text-base'>
            {community ? '已有 skymoni 账号？' : t('Already have an account?')}{' '}
            <Link
              to='/sign-in'
              search={{ redirect }}
              className='hover:text-primary font-medium underline underline-offset-4'
            >
              {community ? '直接登录社区' : t('Sign in')}
            </Link>
            {community ? '，无需重新注册。' : '.'}
          </p>
        </div>

        {community && (
          <p className='rounded-xl border border-sky-400/20 bg-sky-400/5 p-3 text-sm leading-6'>
            <CommunityAccessDescription>
              社区免费开放注册。注册后即可发帖、回复和评论作品，无需充值、兑换码或激活创作者资格。
            </CommunityAccessDescription>
          </p>
        )}
        <SignUpForm />

        <TermsFooter
          variant='sign-up'
          status={status}
          className='text-center'
        />
      </div>
    </BrandAuthLayout>
  )
}
