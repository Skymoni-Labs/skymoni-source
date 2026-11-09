import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/skivu-resources')({
  beforeLoad: ({ location }) => {
    throw redirect({
      href: `/skivu/${location.searchStr}${location.hash ? `#${location.hash}` : ''}`,
      replace: true,
    })
  },
})
