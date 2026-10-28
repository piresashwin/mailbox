import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'

import { fetchAuthBootstrap } from '#/auth/session-fn'

export const Route = createFileRoute('/_authed')({
  beforeLoad: async ({ location }) => {
    const bootstrap = await fetchAuthBootstrap()
    if (!bootstrap.session) {
      throw redirect({
        to: '/login',
        search: { redirect: location.href },
      })
    }
    if (!bootstrap.onboardingComplete) {
      throw redirect({ to: '/onboarding' })
    }
    return bootstrap
  },
  component: AuthedLayout,
})

function AuthedLayout() {
  return <Outlet />
}
