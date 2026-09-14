import * as React from 'react'
import { cn } from '../../lib/utils'

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'neutral' | 'outline'
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  const variants = {
    default: 'badge badge-neutral',
    neutral: 'badge badge-neutral',
    success: 'badge badge-success',
    warning: 'badge badge-warning',
    danger: 'badge badge-danger',
    outline: 'badge border border-gray-300 text-gray-700 bg-transparent',
  }

  return <div className={cn('badge', variants[variant], className)} {...props} />
}
