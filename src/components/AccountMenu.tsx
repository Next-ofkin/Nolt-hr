import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { LogOut, User } from 'lucide-react'
import { useAuth } from '../lib/useAuth'
import { RoleBadge } from './RoleBadge'
import type { UserRole } from '../lib/database.types'

interface AccountMenuProps {
  name: string
  email: string
  role: UserRole | null
  onNavigate?: () => void
}

export function AccountMenu({ name, email, role, onNavigate }: AccountMenuProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const { signOut } = useAuth()
  const location = useLocation()

  const [lastPathname, setLastPathname] = useState(location.pathname)
  if (location.pathname !== lastPathname) {
    setLastPathname(location.pathname)
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return

    function handlePointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div className="account-menu" ref={containerRef}>
      <button
        type="button"
        className="account-trigger"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="account-avatar" aria-hidden="true">
          <User size={16} />
        </span>
        <span className="account-identity">
          <span className="account-name">{name}</span>
          <span className="account-email">{email}</span>
        </span>
        {role && <RoleBadge role={role} />}
      </button>

      {open && (
        <div className="account-popover" role="menu">
          <Link
            to="/profile"
            role="menuitem"
            className="account-popover-item"
            onClick={() => {
              setOpen(false)
              onNavigate?.()
            }}
          >
            My Profile
          </Link>
          <button
            type="button"
            role="menuitem"
            className="account-popover-item account-popover-danger"
            onClick={() => void signOut()}
          >
            <LogOut size={14} aria-hidden="true" />
            Sign Out
          </button>
        </div>
      )}
    </div>
  )
}
