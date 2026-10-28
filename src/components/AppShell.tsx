import { Link, useNavigate } from '@tanstack/react-router'
import { Calendar, Check, Link2, LogOut, Mail, Menu, Settings, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { authClient } from '#/auth/client'

const nav = [
  { to: '/', label: 'Needs attention', icon: Mail, key: 'attention' as const },
  {
    to: '/commitments',
    label: 'Commitments',
    icon: Calendar,
    key: 'commitments' as const,
  },
  { to: '/done', label: 'Done', icon: Check, key: 'done' as const },
  {
    to: '/connections',
    label: 'Connections',
    icon: Link2,
    key: 'connections' as const,
  },
] as const

export function AppShell({
  children,
  active,
  attentionCount,
  commitmentsCount,
}: {
  children: ReactNode
  active: 'attention' | 'commitments' | 'done' | 'connections' | 'settings'
  attentionCount?: number
  commitmentsCount?: number
}) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  const signOut = async () => {
    await authClient.signOut()
    await navigate({ to: '/login' })
  }

  return (
    <div className="app-canvas" data-sidebar-open={open}>
      <button
        type="button"
        className="sidebar-backdrop"
        aria-label="Close navigation"
        onClick={() => setOpen(false)}
      />
      <aside className="app-sidebar">
        <div className="mb-1 flex items-start justify-between gap-2">
          <div className="app-sidebar-brand">
            <div className="app-sidebar-mark" aria-hidden>
              <Mail size={15} strokeWidth={2.25} />
            </div>
            <div>
              <div className="text-[15px] font-semibold tracking-tight text-[var(--color-text)]">
                Mailbox
              </div>
              <div className="text-[11px] font-medium text-[var(--color-muted)]">
                Important only
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn-ghost sidebar-toggle"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          >
            <X size={16} />
          </button>
        </div>

        <nav className="mt-1 flex flex-1 flex-col gap-0.5">
          {nav.map((item) => {
            const Icon = item.icon
            const isActive = active === item.key
            return (
              <Link
                key={item.to}
                to={item.to}
                search={item.to === '/connections' ? {} : undefined}
                className="nav-item"
                data-active={isActive}
                onClick={() => setOpen(false)}
              >
                <Icon size={16} strokeWidth={isActive ? 2.25 : 2} />
                <span className="min-w-0 truncate">{item.label}</span>
                {item.key === 'attention' && typeof attentionCount === 'number' ? (
                  <span className="nav-count">{attentionCount}</span>
                ) : null}
                {item.key === 'commitments' &&
                typeof commitmentsCount === 'number' ? (
                  <span className="nav-count">{commitmentsCount}</span>
                ) : null}
              </Link>
            )
          })}
          <div className="flex-1" />
          <Link
            to="/settings"
            className="nav-item"
            data-active={active === 'settings'}
            onClick={() => setOpen(false)}
          >
            <Settings size={16} strokeWidth={active === 'settings' ? 2.25 : 2} />
            Settings
          </Link>
          <button
            type="button"
            className="nav-item"
            onClick={() => {
              setOpen(false)
              void signOut()
            }}
          >
            <LogOut size={16} />
            Sign out
          </button>
        </nav>
      </aside>

      <div className="app-main">
        <div className="mb-4 flex items-center gap-2 md:hidden">
          <button
            type="button"
            className="btn-ghost sidebar-toggle"
            aria-label="Open navigation"
            onClick={() => setOpen(true)}
          >
            <Menu size={18} />
          </button>
          <span className="text-sm font-semibold text-[var(--color-text)]">Mailbox</span>
        </div>
        {children}
      </div>
    </div>
  )
}
