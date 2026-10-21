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
import { CherryStudio } from '@lobehub/icons'
import { Ellipsis } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const appLinkClassName =
  'group border-border/40 bg-muted/15 text-foreground/80 hover:border-border hover:bg-muted/30 hover:text-foreground h-11 gap-3 rounded-full px-5 text-sm font-medium shadow-[0_1px_2.5px_rgba(0,0,0,0.01)] transition-all duration-300 hover:scale-[1.02]'

export function SupportedApplications(props: { className?: string }) {
  const { t } = useTranslation()
  return (
    <section
      className={cn('w-full max-w-xl', props.className)}
      aria-label={t('Supported Applications')}
    >
      <div className='mb-4 flex flex-col gap-1'>
        <span className='text-muted-foreground/50 text-[10px] font-bold tracking-[0.15em] uppercase'>
          {t('Supported Applications')}
        </span>
        <p className='text-muted-foreground/60 text-xs leading-relaxed'>
          {t(
            'Supports one-click configuration and perfectly adapts to skymoni multi-protocol configuration.'
          )}
        </p>
      </div>
      <div className='flex flex-wrap items-center gap-3'>
        <Button
          variant='outline'
          role='link'
          className={appLinkClassName}
          render={
            <a
              href='https://cherry-ai.com'
              target='_blank'
              rel='noopener noreferrer'
            />
          }
        >
          <CherryStudio.Color
            size={24}
            className='size-6 shrink-0'
            aria-hidden
          />
          <span>Cherry Studio</span>
        </Button>
        <Button
          variant='outline'
          role='link'
          className={appLinkClassName}
          render={
            <a
              href='https://ccswitch.io'
              target='_blank'
              rel='noopener noreferrer'
            />
          }
        >
          <Avatar size='sm' className='rounded-md after:hidden' aria-hidden>
            <AvatarImage
              src='https://ccswitch.io/favicon.png'
              alt=''
              className='rounded-md object-contain'
            />
            <AvatarFallback className='rounded-md bg-blue-500/10 text-[10px] font-bold text-blue-600 dark:bg-blue-400/10 dark:text-blue-400'>
              CC
            </AvatarFallback>
          </Avatar>
          <span>CC Switch</span>
        </Button>
        <span className='border-border/40 bg-muted/15 text-foreground/55 flex h-11 items-center gap-2.5 rounded-full border px-5 text-sm font-medium'>
          <Ellipsis
            className='text-muted-foreground/60 size-6 shrink-0'
            aria-hidden
          />
          <span>{t('More Apps')}</span>
        </span>
      </div>
    </section>
  )
}
