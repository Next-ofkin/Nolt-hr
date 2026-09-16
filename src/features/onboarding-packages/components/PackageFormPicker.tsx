import React, { useState, useEffect } from 'react'
import { FileText, Search, Check, AlertCircle, Loader2 } from 'lucide-react'
import {
  listPublishedFormVersions,
  type PublishedFormVersionOption,
} from '../data/onboarding-packages-repository'
import { formatPackageDate } from '../data/onboarding-packages-types'

interface PackageFormPickerProps {
  isOpen: boolean
  onClose: () => void
  onSelectFormVersion: (option: PublishedFormVersionOption) => void
  existingFormVersionIds: string[]
}

export const PackageFormPicker: React.FC<PackageFormPickerProps> = ({
  isOpen,
  onClose,
  onSelectFormVersion,
  existingFormVersionIds,
}) => {
  const [options, setOptions] = useState<PublishedFormVersionOption[]>([])
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    let isMounted = true

    const loadOptions = async () => {
      try {
        const data = await listPublishedFormVersions()
        if (isMounted) {
          setOptions(data)
          setIsLoading(false)
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load published forms.')
          setIsLoading(false)
        }
      }
    }
    loadOptions()

    return () => {
      isMounted = false
    }
  }, [isOpen])

  if (!isOpen) return null

  const filteredOptions = options.filter(
    (opt) =>
      opt.title.toLowerCase().includes(search.toLowerCase()) ||
      `v${opt.versionNumber}`.includes(search.toLowerCase()),
  )

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card modal-card-wide no-padding">
        <div className="modal-header">
          <div>
            <h3>Add Published Form</h3>
            <p>Select an immutable published form version to pin to this package.</p>
          </div>
        </div>

        <div className="picker-search">
          <div className="search-input-wrap">
            <Search style={{ width: 15, height: 15 }} />
            <label htmlFor="form-picker-search" className="sr-only">Search published forms</label>
            <input
              id="form-picker-search"
              type="search"
              placeholder="Search published forms..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        <div className="modal-body">
          {isLoading && (
            <div className="package-items-empty" style={{ border: 'none', padding: '1.5rem' }}>
              <Loader2 style={{ width: 22, height: 22 }} className="spin" />
              <div className="package-items-empty-hint">Loading published forms…</div>
            </div>
          )}

          {error && (
            <div className="alert alert-error">
              <p style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertCircle style={{ width: 15, height: 15 }} /> {error}
              </p>
            </div>
          )}

          {!isLoading && !error && filteredOptions.length === 0 && (
            <p className="package-items-empty-hint" style={{ textAlign: 'center', padding: '1.5rem' }}>
              No published form versions found matching your search.
            </p>
          )}

          {!isLoading && !error && filteredOptions.length > 0 && (
            <div className="picker-option-list">
              {filteredOptions.map((opt) => {
                const isSelected = existingFormVersionIds.includes(opt.formVersionId)
                return (
                  <button
                    type="button"
                    key={opt.formVersionId}
                    className={`picker-option${isSelected ? ' picker-option-added' : ''}`}
                    disabled={isSelected}
                    onClick={() => {
                      onSelectFormVersion(opt)
                      onClose()
                    }}
                  >
                    <span className="picker-option-info">
                      <span className="picker-option-icon">
                        <FileText style={{ width: 15, height: 15 }} />
                      </span>
                      <span>
                        <span className="picker-option-title">{opt.title}</span>
                        <span className="picker-option-meta">
                          <span className="badge badge-success">Version {opt.versionNumber}</span>
                          {opt.publishedAt && <span>Published {formatPackageDate(opt.publishedAt)}</span>}
                        </span>
                      </span>
                    </span>

                    {isSelected ? (
                      <span className="picker-option-check">
                        <Check style={{ width: 14, height: 14 }} /> Added
                      </span>
                    ) : (
                      <span className="picker-option-select">Select</span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" onClick={onClose} className="btn btn-ghost">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
