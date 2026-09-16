import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Package,
  Plus,
  Search,
  FileText,
  FileCheck,
  Clock,
  CheckCircle2,
  ChevronRight,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import {
  listOnboardingPackages,
  createOnboardingPackage,
} from '../data/onboarding-packages-repository'
import type { OnboardingPackageSummary } from '../data/onboarding-packages-types'

export const OnboardingPackagesPage: React.FC = () => {
  const navigate = useNavigate()
  const [packages, setPackages] = useState<OnboardingPackageSummary[]>([])
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true
    listOnboardingPackages()
      .then((data) => {
        if (isMounted) {
          setPackages(data)
          setIsLoading(false)
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load onboarding packages.')
          setIsLoading(false)
        }
      })
    return () => {
      isMounted = false
    }
  }, [])


  const handleCreatePackage = async () => {
    setIsCreating(true)
    setError(null)
    try {
      const result = await createOnboardingPackage({
        title: 'Untitled Onboarding Package',
        description: 'New reusable onboarding package',
      })
      navigate(`/hr/onboarding-packages/${result.onboardingPackageId}/edit`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create onboarding package.')
      setIsCreating(false)
    }
  }

  const filteredPackages = packages.filter(
    (pkg) =>
      pkg.title.toLowerCase().includes(search.toLowerCase()) ||
      (pkg.description && pkg.description.toLowerCase().includes(search.toLowerCase())),
  )

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center space-x-2">
            <div className="rounded-lg bg-indigo-600 p-2 text-white shadow-sm">
              <Package className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Onboarding Packages</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Create reusable onboarding packages from published forms and required documents.
          </p>
        </div>

        <button
          onClick={handleCreatePackage}
          disabled={isCreating}
          className="inline-flex items-center justify-center space-x-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors shrink-0"
        >
          {isCreating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Creating Package...</span>
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" />
              <span>New Package</span>
            </>
          )}
        </button>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center space-x-3 shadow-sm">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Search & Stats Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search onboarding packages..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="text-xs text-slate-500 font-medium">
          Showing {filteredPackages.length} of {packages.length} packages
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
          <p className="text-sm font-medium">Loading onboarding packages...</p>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filteredPackages.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 mb-4 shadow-sm">
            <Package className="h-7 w-7" />
          </div>
          <h3 className="text-base font-bold text-slate-900">No onboarding packages found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            {search
              ? 'No onboarding packages match your current search query.'
              : 'Create your first onboarding package to group published forms and document requirements into reusable templates.'}
          </p>
          {!search && (
            <button
              onClick={handleCreatePackage}
              disabled={isCreating}
              className="mt-6 inline-flex items-center space-x-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors shadow-sm"
            >
              <Plus className="h-4 w-4" />
              <span>Create First Package</span>
            </button>
          )}
        </div>
      )}

      {/* Package Grid */}
      {!isLoading && filteredPackages.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPackages.map((pkg) => {
            const hasDraft = pkg.draftVersionNumber !== null
            const hasPublished = pkg.latestPublishedVersionNumber !== null

            return (
              <div
                key={pkg.id}
                onClick={() => navigate(`/hr/onboarding-packages/${pkg.id}/edit`)}
                className="group flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer"
              >
                <div className="space-y-4">
                  {/* Top Status Badges */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      {hasDraft ? (
                        <span className="inline-flex items-center space-x-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800">
                          <Clock className="h-3 w-3" />
                          <span>Draft V{pkg.draftVersionNumber}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                          <CheckCircle2 className="h-3 w-3" />
                          <span>Published V{pkg.latestPublishedVersionNumber}</span>
                        </span>
                      )}
                    </div>

                    {hasPublished && hasDraft && (
                      <span className="text-[10px] font-semibold text-slate-500">
                        V{pkg.latestPublishedVersionNumber} Live
                      </span>
                    )}
                  </div>

                  {/* Title & Description */}
                  <div>
                    <h3 className="text-base font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                      {pkg.title}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                      {pkg.description || 'No description provided.'}
                    </p>
                  </div>

                  {/* Summary Counters */}
                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <div className="flex items-center space-x-2 rounded-lg bg-slate-50 p-2.5 border border-slate-100">
                      <FileText className="h-4 w-4 text-indigo-600 shrink-0" />
                      <div>
                        <div className="text-xs font-bold text-slate-900">{pkg.totalFormsCount}</div>
                        <div className="text-[10px] text-slate-500 font-medium">Published Forms</div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 rounded-lg bg-slate-50 p-2.5 border border-slate-100">
                      <FileCheck className="h-4 w-4 text-amber-600 shrink-0" />
                      <div>
                        <div className="text-xs font-bold text-slate-900">{pkg.totalDocumentsCount}</div>
                        <div className="text-[10px] text-slate-500 font-medium">Doc Requirements</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between border-t border-slate-100 pt-4 mt-6 text-xs text-slate-500">
                  <span>Updated {new Date(pkg.updatedAt).toLocaleDateString()}</span>
                  <span className="flex items-center font-semibold text-indigo-600 group-hover:translate-x-0.5 transition-transform">
                    <span>Manage Package</span>
                    <ChevronRight className="h-4 w-4 ml-0.5" />
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
