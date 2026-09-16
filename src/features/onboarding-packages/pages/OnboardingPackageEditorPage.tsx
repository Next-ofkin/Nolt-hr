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
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      {/* Top Breadcrumb Header */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div className="flex items-center space-x-3">
          <Link
            to="/hr/onboarding-packages"
            className="flex items-center space-x-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to Packages</span>
          </Link>
          <div className="h-4 w-px bg-slate-200" />
          <div className="flex items-center space-x-2">
            <Package className="h-4 w-4 text-indigo-600" />
            <span className="text-sm font-bold text-slate-900 truncate">
              {detail ? detail.title : 'Onboarding Package Editor'}
            </span>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
          <p className="text-sm font-medium">Loading onboarding package editor...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center shadow-sm">
          <AlertCircle className="mx-auto h-8 w-8 text-red-500 mb-2" />
          <h3 className="text-base font-bold text-red-900">Error Loading Package</h3>
          <p className="text-xs text-red-700 mt-1">{error}</p>
          <button
            onClick={() => navigate('/hr/onboarding-packages')}
            className="mt-4 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 transition-colors"
          >
            Return to Onboarding Packages
          </button>
        </div>
      )}

      {/* Editor Content */}
      {!isLoading && !error && detail && (
        <PackageEditor initialDetail={detail} onPackageUpdated={setDetail} />
      )}
    </div>
  )
}
