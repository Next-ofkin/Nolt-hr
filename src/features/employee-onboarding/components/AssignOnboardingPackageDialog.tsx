import React, { useEffect, useState } from 'react'
import { AlertCircle, FileCheck, FileText, Loader2, Package } from 'lucide-react'
import {
  assignOnboardingPackage,
  getPackageVersionPreview,
  listPublishedPackageVersions,
  type PackageVersionPreviewItem,
  type PublishedPackageVersionOption,
} from '../data/employee-onboarding-repository'
import {
  employeeOnboardingPersistenceMessage,
  type AssignOnboardingPackageResult,
} from '../data/employee-onboarding-types'

interface AssignOnboardingPackageDialogProps {
  employeeId: string
  employeeName: string
  onClose: () => void
  onAssigned: (result: AssignOnboardingPackageResult) => void
}

/**
 * The parent only mounts this component while the dialog is open (see
 * EmployeeOnboardingSection), so every field starts fresh on each open —
 * the same key-remount convention PackagePreviewModal documents, used here
 * instead of an isOpen-triggered reset effect.
 */
export const AssignOnboardingPackageDialog: React.FC<AssignOnboardingPackageDialogProps> = ({
  employeeId,
  employeeName,
  onClose,
  onAssigned,
}) => {
  const [options, setOptions] = useState<PublishedPackageVersionOption[]>([])
  const [isLoadingOptions, setIsLoadingOptions] = useState(true)
  const [selectedVersionId, setSelectedVersionId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [preview, setPreview] = useState<PackageVersionPreviewItem[]>([])
  const [isAssigning, setIsAssigning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true
    listPublishedPackageVersions()
      .then((data) => {
        if (isMounted) setOptions(data)
      })
      .catch((err) => {
        if (isMounted) setError(err instanceof Error ? err.message : 'Failed to load published packages.')
      })
      .finally(() => {
        if (isMounted) setIsLoadingOptions(false)
      })
    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (!selectedVersionId) return
    let isMounted = true
    getPackageVersionPreview(selectedVersionId)
      .then((items) => {
        if (isMounted) setPreview(items)
      })
      .catch((err) => {
        if (isMounted) setError(err instanceof Error ? err.message : 'Failed to load package preview.')
      })
    return () => {
      isMounted = false
    }
  }, [selectedVersionId])

  const selectedOption = options.find((o) => o.packageVersionId === selectedVersionId)

  const handleAssign = async () => {
    if (!selectedVersionId) {
      setError('Choose a published onboarding package to assign.')
      return
    }
    setIsAssigning(true)
    setError(null)
    try {
      const result = await assignOnboardingPackage({
        employeeId,
        packageVersionId: selectedVersionId,
        dueDate: dueDate || null,
      })
      onAssigned(result)
    } catch (err) {
      setError(employeeOnboardingPersistenceMessage(err, 'Unable to assign this onboarding package.'))
    } finally {
      setIsAssigning(false)
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card modal-card-xl">
        <div className="modal-header">
          <div className="modal-header-info">
            <span className="modal-header-icon">
              <Package style={{ width: 18, height: 18 }} />
            </span>
            <div>
              <h3>Assign Onboarding Package</h3>
              <p>To {employeeName}</p>
            </div>
          </div>
        </div>

        <div className="modal-body">
          {error && (
            <div className="alert alert-error" role="alert" style={{ marginBottom: '1rem' }}>
              <p style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                <AlertCircle style={{ width: 16, height: 16, flexShrink: 0 }} /> {error}
              </p>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
            <div>
              <label className="package-editor-field-label" htmlFor="assign-package-select">Package</label>
              {isLoadingOptions ? (
                <p className="subtitle" style={{ margin: '0.4rem 0 0' }}>Loading published packages…</p>
              ) : options.length === 0 ? (
                <p className="subtitle" style={{ margin: '0.4rem 0 0' }}>
                  No published onboarding packages are available yet.
                </p>
              ) : (
                <select
                  id="assign-package-select"
                  value={selectedVersionId}
                  onChange={(e) => setSelectedVersionId(e.target.value)}
                  style={{ width: '100%', marginTop: '0.4rem' }}
                >
                  <option value="">Select a published package…</option>
                  {options.map((option) => (
                    <option key={option.packageVersionId} value={option.packageVersionId}>
                      {option.title} — Published V{option.versionNumber} ({option.formsCount} forms, {option.documentsCount} documents)
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="package-editor-field-label" htmlFor="assign-due-date">Due Date (optional)</label>
              <input
                id="assign-due-date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                style={{ marginTop: '0.4rem' }}
              />
            </div>

            {selectedOption && (
              <div>
                <p className="package-editor-field-label" style={{ marginBottom: '0.6rem' }}>Package Preview</p>
                {preview.length === 0 ? (
                  <div className="package-items-empty" style={{ border: 'none' }}>
                    <Loader2 style={{ width: 20, height: 20 }} className="spin" />
                    <div className="package-items-empty-hint">Loading package contents…</div>
                  </div>
                ) : (
                  <div className="package-item-list">
                    {preview.map((item, idx) => {
                      const isForm = item.itemType === 'form'
                      return (
                        <div key={idx} className="package-item-row">
                          <div className="package-item-info">
                            <span className="package-item-index">{idx + 1}</span>
                            <span className={`package-item-icon ${isForm ? 'package-item-icon-form' : 'package-item-icon-document'}`}>
                              {isForm ? <FileText style={{ width: 16, height: 16 }} /> : <FileCheck style={{ width: 16, height: 16 }} />}
                            </span>
                            <div className="package-item-details">
                              <div className="package-item-title-row">
                                <span className="package-item-title">{item.title}</span>
                                <span className={`package-item-tag ${isForm ? 'package-item-tag-form' : 'package-item-tag-document'}`}>
                                  {isForm ? `Form (Version ${item.versionNumber ?? 1})` : 'Document Requirement'}
                                </span>
                                <span className={`package-item-tag ${item.required ? 'package-item-tag-required' : 'package-item-tag-optional'}`}>
                                  {item.required ? 'Required' : 'Optional'}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={isAssigning}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleAssign()}
            disabled={isAssigning || !selectedVersionId}
          >
            {isAssigning && <Loader2 style={{ width: 16, height: 16, marginRight: '0.4rem' }} className="spin" />}
            Assign Package
          </button>
        </div>
      </div>
    </div>
  )
}
