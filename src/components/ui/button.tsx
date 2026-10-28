import { Slot } from '@radix-ui/react-slot'
import type { ButtonHTMLAttributes } from 'react'

import { cn } from '#/lib/cn'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary'
  asChild?: boolean
}

export function Button({
  className,
  variant = 'primary',
  asChild,
  ...props
}: Props) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      className={cn(
        variant === 'primary' ? 'btn-primary' : 'btn-secondary',
        className,
      )}
      {...props}
    />
  )
}
