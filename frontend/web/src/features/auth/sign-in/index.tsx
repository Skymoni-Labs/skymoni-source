import { Link, useSearch } from '@tanstack/react-router'
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
import { ArrowRight, Server } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { useOAuthLogin } from '@/features/auth/hooks/use-oauth-login'
import { CommunityAdmissionFields } from '@/features/community/access-policy'
import { useStatus } from '@/hooks/use-status'

import { BrandAuthLayout } from '../brand-auth-layout'
import { TermsFooter } from '../components/terms-footer'
import {
  isCommunityAuthReturn,
  isCommunityAuthorizationReturn,
  safeCommunityReturn,
} from '../lib/community-auth'
import { UserAuthForm } from './components/user-auth-form'

export function SignIn() {
  const { t } = useTranslation()
  const { redirect, provider } = useSearch({ from: '/(auth)/sign-in' })
  const community = isCommunityAuthReturn(redirect)
  const { status } = useStatus()
  const { handleGitHubLogin } = useOAuthLogin(status, redirect)
  const startedGitHub = useRef(false)
  useEffect(() => {
    if (
      provider !== 'github' ||
      !status?.github_oauth ||
      startedGitHub.current
    ) {
      return
    }
    startedGitHub.current = true
    void handleGitHubLogin()
  }, [provider, status?.github_oauth, handleGitHubLogin])

  return (
    <BrandAuthLayout variant='sign-in'>
      <div className='w-full space-y-8'>
        <div className='space-y-2'>
          <h2 className='text-center text-2xl font-semibold tracking-tight sm:text-left'>
            {t('Sign in')}
          </h2>
          {!status?.self_use_mode_enabled &&
            status?.register_enabled !== false && (
              <p className='text-muted-foreground text-left text-sm sm:text-base'>
                {t("Don't have an account?")}{' '}
                <Link
                  to='/sign-up'
                  search={{ redirect }}
                  className='hover:text-primary font-medium underline underline-offset-4'
                >
                  {t('Sign up')}
                </Link>
                .
              </p>
            )}
        </div>

        {community && !isCommunityAuthorizationReturn(redirect) && (
          <Link
            to='/community-authorize'
            search={{ returnTo: safeCommunityReturn(redirect) }}
            className='sky-auth-relay-login'
          >
            <Server aria-hidden='true' />
            <span>{t('Relay sign in')}</span>
            <ArrowRight aria-hidden='true' />
          </Link>
        )}

        <CommunityAdmissionFields />
        <UserAuthForm redirectTo={redirect} />

        <TermsFooter
          variant='sign-in'
          status={status}
          className='text-center'
        />
      </div>
    </BrandAuthLayout>
  )
}
