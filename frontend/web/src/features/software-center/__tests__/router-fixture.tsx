import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterContextProvider,
} from '@tanstack/react-router'
import { useState, type ReactNode } from 'react'

// Real router context for links in isolated feature tests; no network or auth routes.
export function SoftwareTestRouter(props: { children: ReactNode }) {
  const [router] = useState(() =>
    createRouter({
      routeTree: createRootRoute(),
      history: createMemoryHistory({ initialEntries: ['/software'] }),
    })
  )
  return (
    <RouterContextProvider router={router}>
      {props.children}
    </RouterContextProvider>
  )
}
