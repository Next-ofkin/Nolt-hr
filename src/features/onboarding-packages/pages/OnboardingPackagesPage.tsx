import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Archive,
  RefreshCw,
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
  archiveOnboardingPackage,
  unarchiveOnboardingPackage,
  deleteOnboardingPackage,
} from '../data/onboarding-packages-repository'
import { toast } from '../../../components/ui/use-toast'
import { ConfirmDialog } from '../../../components/ui/confirm-dialog'
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

  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean
    title: string
    description: string
    confirmText: string
    variant: 'danger' | 'warning' | 'primary'
    icon: 'trash' | 'archive' | 'warning' | 'restore'
    isLoading: boolean
    onConfirm: () => Promise<void>
  }>({
    isOpen: false,
    title: '',
    description: '',
    confirmText: 'Confirm',
    variant: 'danger',
    icon: 'warning',
    isLoading: false,
    onConfirm: async () => {},
  })

  const loadPackages = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await listOnboardingPackages()
      setPackages(data)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load onboarding packages.'
      setError(msg)
      toast.error('Loading Error', msg)
    } finally {
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
          const msg = err instanceof Error ? err.message : 'Failed to load onboarding packages.'
          setError(msg)
          toast.error('Loading Error', msg)
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
      toast.success('Package Draft Created', 'Navigating to package editor...')
      navigate(`/hr/onboarding-packages/${result.onboardingPackageId}/edit`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create new onboarding package.'
      setError(msg)
      toast.error('Creation Failed', msg)
      setIsCreating(false)
    }
  }

  const handleArchive = (pkg: OnboardingPackageSummary) => {
    setConfirmDialog({
      isOpen: true,
      title: `Archive "${pkg.title}"?`,
      description: 'It will be moved to the Archived list and hidden from active package selection.',
      confirmText: 'Archive Package',
      variant: 'warning',
      icon: 'archive',
      isLoading: false,
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, isLoading: true }))
        setActionPackageId(pkg.id)
        setError(null)
        try {
          await archiveOnboardingPackage(pkg.id)
          toast.success('Package Archived', `"${pkg.title}" moved to Archived.`)
          await loadPackages()
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unable to archive this package.'
          setError(msg)
          toast.error('Archive Failed', msg)
        } finally {
          setActionPackageId(null)
          setConfirmDialog((prev) => ({ ...prev, isOpen: false, isLoading: false }))
        }
      },
    })
  }

  const handleRestore = async (pkg: OnboardingPackageSummary) => {
    setActionPackageId(pkg.id)
    setError(null)
    try {
      await unarchiveOnboardingPackage(pkg.id)
      toast.success('Package Restored', `"${pkg.title}" restored to active library.`)
      await loadPackages()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to restore this package.'
      setError(msg)
      toast.error('Restore Failed', msg)
    } finally {
      setActionPackageId(null)
    }
  }

  const handleDelete = (pkg: OnboardingPackageSummary) => {
    setConfirmDialog({
      isOpen: true,
      title: `Permanently delete "${pkg.title}"?`,
      description: 'This action cannot be undone. The archived package and all associated metadata will be permanently deleted.',
      confirmText: 'Delete Permanently',
      variant: 'danger',
      icon: 'trash',
      isLoading: false,
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, isLoading: true }))
        setActionPackageId(pkg.id)
        setError(null)
        try {
          await deleteOnboardingPackage(pkg.id)
          toast.success('Package Deleted', `"${pkg.title}" permanently deleted.`)
          await loadPackages()
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unable to delete this package.'
          setError(msg)
          toast.error('Delete Failed', msg)
        } finally {
          setActionPackageId(null)
          setConfirmDialog((prev) => ({ ...prev, isOpen: false, isLoading: false }))
        }
      },
    })
  }

  const searchFiltered = filterOnboardingPackagesBySearch(packages, search)
  const filteredPackages = filterOnboardingPackagesByStatus(searchFiltered, statusFilter)
  const hasActiveFilters = search.trim() !== '' || statusFilter !== 'all'

  return (
    <div className="page package-library">
      <div className="page-heading">
        <div className="page-title-row">
          <div>
            <h1 className="title">Onboarding Packages</h1>
            <p className="subtitle">
              Create, update, publish, and manage reusable onboarding package definitions.
            </p>
          </div>
          <button
            type="button"
            onClick={handleCreatePackage}
            disabled={isCreating}
            className="btn btn-primary"
          >
            <Plus style={{ width: 16, height: 16, marginRight: '0.4rem' }} /> Create Package
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: '1.25rem' }}>
          <p style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertCircle style={{ width: 16, height: 16, flexShrink: 0 }} />
            <span>{error}</span>
          </p>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="card" style={{ marginBottom: '1.5rem', padding: '1rem 1.25rem' }}>
        <div className="package-filter-row">
          <div className="package-search-box">
            <Search style={{ width: 16, height: 16, color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search packages by title or description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as OnboardingPackageStatusFilter)}
              style={{ padding: '0.45rem 0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)' }}
            >
              <option value="all">All Statuses</option>
              <option value="draft">Draft Open</option>
              <option value="published">Published Only</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <p style={{ color: 'var(--text-muted)' }}>Loading onboarding packages...</p>
        </div>
      ) : filteredPackages.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3.5rem 1.5rem' }}>
          <Package style={{ width: 36, height: 36, color: 'var(--text-muted)', margin: '0 auto 0.75rem' }} />
          <h3 style={{ margin: 0, fontWeight: 600 }}>No onboarding packages found</h3>
          <p className="subtitle" style={{ margin: '0.35rem 0 1.25rem' }}>
            {hasActiveFilters ? 'Try adjusting your search or status filter.' : 'Get started by creating your first onboarding package.'}
          </p>
          {!hasActiveFilters && (
            <button type="button" onClick={handleCreatePackage} disabled={isCreating} className="btn btn-primary">
              <Plus style={{ width: 16, height: 16, marginRight: '0.4rem' }} /> Create First Package
            </button>
          )}
        </div>
      ) : (
        <div className="package-grid">
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
                    {!pkg.archivedAt ? (
                      <>
                        <button
                          type="button"
                          onClick={() => navigate(`/hr/onboarding-packages/${pkg.id}/edit`)}
                          className="btn btn-primary"
                        >
                          Manage Package <ArrowRight style={{ width: 15, height: 15, marginLeft: '0.4rem' }} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleArchive(pkg)}
                          disabled={actionPackageId === pkg.id}
                          className="btn btn-ghost"
                        >
                          <Archive style={{ width: 15, height: 15, marginRight: '0.4rem' }} /> Archive
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => void handleRestore(pkg)}
                          disabled={actionPackageId === pkg.id}
                          className="btn btn-ghost"
                        >
                          <RefreshCw style={{ width: 15, height: 15, marginRight: '0.4rem' }} /> Restore
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(pkg)}
                          disabled={actionPackageId === pkg.id}
                          className="btn btn-danger"
                        >
                          <Trash2 style={{ width: 15, height: 15, marginRight: '0.4rem' }} /> Delete Permanently
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        description={confirmDialog.description}
        confirmText={confirmDialog.confirmText}
        variant={confirmDialog.variant}
        icon={confirmDialog.icon}
        isLoading={confirmDialog.isLoading}
        onConfirm={() => void confirmDialog.onConfirm()}
        onClose={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  )
}
