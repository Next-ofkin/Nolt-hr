import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Package,
  Plus,
  Search,
  FileText,
  Files,
  Clock,
  AlertCircle,
  ArrowRight,
  Trash2,
} from 'lucide-react'
import {
  listOnboardingPackages,
  createOnboardingPackage,
  deleteOnboardingPackage,
} from '../data/onboarding-packages-repository'
import {
  filterOnboardingPackagesBySearch,
  filterOnboardingPackagesByStatus,
  formatPackageDate,
  type OnboardingPackageStatusFilter,
  type OnboardingPackageSummary,
} from '../data/onboarding-packages-types'

export const OnboardingPackagesPage: React.FC = () => {
  const navigate = useNavigate()

  const [packages, setPackages] = useState<OnboardingPackageSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<OnboardingPackageStatusFilter>('all')

  const [isCreating, setIsCreating] = useState(false)
  const [actionPackageId, setActionPackageId] = useState<string | null>(null)

  const loadPackages = async () => {
    try {
      const data = await listOnboardingPackages()
      setPackages(data)
      setIsLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load onboarding packages.')
      setIsLoading(false)
    }
  }

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
      const result = await createOnboardingPackage({ title: 'Untitled Onboarding Package' })
      navigate(`/hr/onboarding-packages/${result.onboardingPackageId}/edit`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create new onboarding package.')
      setIsCreating(false)
    }
  }

  const handleDelete = async (pkg: OnboardingPackageSummary) => {
    if (!window.confirm(`Are you sure you want to delete "${pkg.title}"?`)) {
      return
    }
    setActionPackageId(pkg.id)
    setError(null)
    try {
      await deleteOnboardingPackage(pkg.id)
      await loadPackages()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete this package.')
    } finally {
      setActionPackageId(null)
    }
  }

  const searchFiltered = filterOnboardingPackagesBySearch(packages, search)
  const filteredPackages = filterOnboardingPackagesByStatus(searchFiltered, statusFilter)
  const hasActiveFilters = search.trim() !== '' || statusFilter !== 'all'

  return (
    <div className="page package-library">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Onboarding</p>
          <h1>Onboarding Packages</h1>
          <p className="subtitle">Create reusable onboarding packages from published forms and required documents.</p>
        </div>

        <button type="button" onClick={handleCreatePackage} disabled={isCreating} className="btn btn-primary">
          <Plus style={{ width: 16, height: 16, marginRight: '0.4rem' }} />
          {isCreating ? 'Creating…' : 'New Package'}
        </button>
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          <p style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertCircle style={{ width: 16, height: 16, flexShrink: 0 }} /> {error}
          </p>
        </div>
      )}

      <div className="package-toolbar">
        <div className="search-input-wrap">
          <Search style={{ width: 16, height: 16 }} />
          <label htmlFor="package-search" className="sr-only">Search onboarding packages</label>
          <input
            id="package-search"
            type="search"
            placeholder="Search onboarding packages..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <div>
          <label htmlFor="package-status-filter" className="sr-only">Filter by status</label>
          <select
            id="package-status-filter"
            className="package-status-filter"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as OnboardingPackageStatusFilter)}
          >
            <option value="all">All Packages</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </div>

      {!isLoading && (
        <p className="package-result-count">
          Showing {filteredPackages.length} {filteredPackages.length === 1 ? 'package' : 'packages'}
        </p>
      )}

      {isLoading && (
        <div className="package-skeleton-list" aria-label="Loading onboarding packages" aria-busy="true">
          <div className="package-skeleton-card" />
          <div className="package-skeleton-card" />
          <div className="package-skeleton-card" />
        </div>
      )}

      {!isLoading && filteredPackages.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">
            <Package size={22} aria-hidden="true" />
          </div>
          {hasActiveFilters ? (
            <>
              <h2>No packages found</h2>
              <p>Try changing your search or filters.</p>
            </>
          ) : (
            <>
              <h2>No onboarding packages yet</h2>
              <p style={{ maxWidth: '46ch', marginInline: 'auto' }}>
                Create your first reusable onboarding package by combining published forms and required documents.
              </p>
              <button type="button" onClick={handleCreatePackage} disabled={isCreating} className="btn btn-primary" style={{ marginTop: '1rem' }}>
                <Plus style={{ width: 16, height: 16, marginRight: '0.4rem' }} /> Create First Package
              </button>
            </>
          )}
        </div>
      )}

      {!isLoading && filteredPackages.length > 0 && (
        <div className="package-list">
          {filteredPackages.map((pkg) => {
            const hasDraft = pkg.draftVersionNumber !== null
            const hasPublished = pkg.latestPublishedVersionNumber !== null

            return (
              <div key={pkg.id} className="package-card">
                <div className="package-card-top">
                  <div className="package-card-heading">
                    <h3 className="package-card-title">{pkg.title}</h3>
                    <p className="package-card-description">{pkg.description || 'No description provided.'}</p>
                  </div>

                  <div className="package-card-badges">
                    {pkg.archivedAt && <span className="badge badge-neutral">Archived</span>}
                    {hasDraft && (
                      <span className="badge badge-warning">
                        <Clock style={{ width: 12, height: 12 }} /> Draft V{pkg.draftVersionNumber}
                      </span>
                    )}
                    {hasPublished && (
                      <span className="badge badge-success">Published V{pkg.latestPublishedVersionNumber}</span>
                    )}
                  </div>
                </div>

                <div className="package-metrics">
                  <span className="package-metric">
                    <FileText style={{ width: 15, height: 15 }} />
                    {pkg.totalFormsCount} {pkg.totalFormsCount === 1 ? 'Published Form' : 'Published Forms'}
                  </span>
                  <span className="package-metric">
                    <Files style={{ width: 15, height: 15 }} />
                    {pkg.totalDocumentsCount} {pkg.totalDocumentsCount === 1 ? 'Document' : 'Documents'}
                  </span>
                </div>

                <div className="package-card-footer">
                  <span className="package-card-updated">Updated {formatPackageDate(pkg.updatedAt)}</span>
                  <div className="package-card-actions">
                    <button
                      type="button"
                      onClick={() => navigate(`/hr/onboarding-packages/${pkg.id}/edit`)}
                      className="btn btn-primary"
                    >
                      Manage Package <ArrowRight style={{ width: 15, height: 15, marginLeft: '0.4rem' }} />
                    </button>
                    {!pkg.archivedAt && (
                      <button
                        type="button"
                        onClick={() => void handleDelete(pkg)}
                        disabled={actionPackageId === pkg.id}
                        className="btn btn-danger"
                      >
                        <Trash2 style={{ width: 15, height: 15, marginRight: '0.4rem' }} /> Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
