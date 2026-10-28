import { Link } from '@tanstack/react-router'
import { Mail } from 'lucide-react'
import type { ReactNode } from 'react'

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="auth-canvas">
      <div className="auth-panel">
        <div className="mb-8 flex items-center gap-3">
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
        <h1 className="whitespace-pre-line text-[28px] font-semibold leading-tight tracking-tight text-[var(--color-text)]">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-2 text-sm text-[var(--color-muted)]">{subtitle}</p>
        ) : null}
        <div className="mt-8">{children}</div>
        {footer ? <div className="mt-6 text-sm text-[var(--color-muted)]">{footer}</div> : null}
      </div>
    </div>
  )
}

export function SocialAuthButtons({
  pending,
  onGoogle,
  onMicrosoft,
}: {
  pending: 'google' | 'microsoft' | 'email' | null
  onGoogle: () => void
  onMicrosoft: () => void
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <button
        type="button"
        className="btn-secondary auth-social"
        disabled={pending !== null}
        onClick={onGoogle}
      >
        <GoogleMark />
        Continue with Google
      </button>
      <button
        type="button"
        className="btn-secondary auth-social"
        disabled={pending !== null}
        onClick={onMicrosoft}
      >
        <MicrosoftMark />
        Continue with Microsoft
      </button>
    </div>
  )
}

export function AuthDivider() {
  return (
    <div className="auth-divider" role="separator">
      <span>or</span>
    </div>
  )
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path
        fill="#EA4335"
        d="M9 7.2v3.5h4.9c-.2 1.1-.8 2-1.7 2.6l2.7 2.1c1.6-1.5 2.5-3.7 2.5-6.3 0-.6-.1-1.2-.2-1.8H9z"
      />
      <path
        fill="#34A853"
        d="M4.1 10.7l-.6.5-2.1 1.6C2.8 15.4 5.7 17.2 9 17.2c1.9 0 3.5-.6 4.7-1.7l-2.7-2.1c-.7.5-1.7.8-2.9.8-2.2 0-4.1-1.5-4.8-3.5z"
      />
      <path
        fill="#4A90E2"
        d="M1.4 5.2C.8 6.4.5 7.7.5 9.1s.3 2.7.9 3.9l2.7-2.1c-.2-.5-.3-1.1-.3-1.8s.1-1.3.3-1.8L1.4 5.2z"
      />
      <path
        fill="#FBBC05"
        d="M9 3.6c1.1 0 2 .4 2.8 1.1l2.1-2.1C12.5 1.2 10.9.5 9 .5 5.7.5 2.8 2.3 1.4 5.2l2.7 2.1C5 5.2 6.8 3.6 9 3.6z"
      />
    </svg>
  )
}

function MicrosoftMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <path fill="#F25022" d="M0 0h7.5v7.5H0z" />
      <path fill="#7FBA00" d="M8.5 0H16v7.5H8.5z" />
      <path fill="#00A4EF" d="M0 8.5h7.5V16H0z" />
      <path fill="#FFB900" d="M8.5 8.5H16V16H8.5z" />
    </svg>
  )
}

export function AuthLink({
  to,
  children,
}: {
  to: '/login' | '/signup'
  children: ReactNode
}) {
  return (
    <Link to={to} className="font-medium text-[var(--color-accent)] hover:underline">
      {children}
    </Link>
  )
}
