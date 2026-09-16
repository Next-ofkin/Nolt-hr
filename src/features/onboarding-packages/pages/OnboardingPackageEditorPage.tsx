import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Loader2, AlertCircle, Package } from 'lucide-react'
import { getOnboardingPackage } from '../data/onboarding-packages-repository'
import type { OnboardingPackageDetail } from '../data/onboarding-packages-types'
import { PackageEditor } from '../components/PackageEditor'

export const OnboardingPackageEditorPage: React.FC = () => {
  const { packageId } = useParams<{ packageId: string }>()
  const navigate = useNavigate()

  const [detail, setDetail] = useState<OnboardingPackageDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!packageId) return
    let isMounted = true

    getOnboardingPackage(packageId)
      .then((data) => {
        if (!isMounted) return
        if (!data) {
          setError('Onboarding package not found.')
        } else {
          setDetail(data)
        }
        setIsLoading(false)
      })
      .catch((err) => {
        if (!isMounted) return
        setError(err instanceof Error ? err.message : 'Failed to load package detail.')
        setIsLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [packageId])

  return (
    <div className="page package-editor-page">
      <div className="package-editor-topbar">
        <Link to="/hr/onboarding-packages" className="btn btn-ghost" style={{ padding: '0.4rem 0.75rem' }}>
          <ArrowLeft style={{ width: 14, height: 14, marginRight: '0.35rem' }} /> Back to Packages
        </Link>
        <span className="package-editor-topbar-divider" />
        <span className="package-editor-name">
          <Package style={{ width: 16, height: 16, color: 'var(--primary)', flexShrink: 0 }} />
          <span>{detail ? detail.title : 'Onboarding Package Editor'}</span>
        </span>
      </div>

      {isLoading && (
        <div className="package-items-empty" style={{ border: 'none', marginTop: '1.25rem' }}>
          <Loader2 style={{ width: 26, height: 26 }} className="spin" />
          <div className="package-items-empty-title">Loading onboarding package editor…</div>
        </div>
      )}

      {error && (
        <div className="card" style={{ textAlign: 'center', marginTop: '1.25rem', padding: '2.5rem 1.5rem' }}>
          <AlertCircle style={{ width: 28, height: 28, color: 'var(--danger)', margin: '0 auto 0.6rem' }} />
          <h3 style={{ margin: 0, color: 'var(--danger)' }}>Error Loading Package</h3>
          <p className="subtitle" style={{ margin: '0.35rem 0 0' }}>{error}</p>
          <button type="button" onClick={() => navigate('/hr/onboarding-packages')} className="btn btn-primary" style={{ marginTop: '1rem' }}>
            Return to Onboarding Packages
          </button>
        </div>
      )}

      {!isLoading && !error && detail && (
        <div style={{ marginTop: '1.25rem' }}>
          <PackageEditor initialDetail={detail} onPackageUpdated={setDetail} />
        </div>
      )}
    </div>
  )
}
