import { createFileRoute, Outlet } from '@tanstack/react-router'

import { PublicLayout } from '@/components/layout'
import { HomeFooter } from '@/features/home-preview/footer'

import '@/styles/home-preview.css'

function SoftwarePage() {
  return (
    <PublicLayout showMainContainer={false}>
      <div className='hp-page'>
        <Outlet />
        <HomeFooter />
      </div>
    </PublicLayout>
  )
}

export const Route = createFileRoute('/software')({ component: SoftwarePage })
