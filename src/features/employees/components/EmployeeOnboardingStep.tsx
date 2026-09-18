import { useEffect, useState } from 'react'
import { FileCheck, FileText } from 'lucide-react'
import {
  getPackageVersionPreview,
  type PackageVersionPreviewItem,
  type PublishedPackageVersionOption,
} from '../../employee-onboarding/data/employee-onboarding-repository'
import type { OnboardingMode } from '../data/employee-wizard'

interface EmployeeOnboardingStepProps {
  onboardingMode: OnboardingMode
  packageVersionId: string | null
  dueDate: string | null
  options: PublishedPackageVersionOption[]
  optionsError: string | null
  onChangeOnboardingMode: (mode: OnboardingMode) => void
  onChangePackageVersionId: (id: string | null) => void
  onChangeDueDate: (date: string | null) => void
}

export function EmployeeOnboardingStep({
  onboardingMode,
  packageVersionId,
  dueDate,
  options,
  optionsError,
  onChangeOnboardingMode,
  onChangePackageVersionId,
  onChangeDueDate,
}: EmployeeOnboardingStepProps) {
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [preview, setPreview] = useState<PackageVersionPreviewItem[]>([])

  useEffect(() => {
    if (!packageVersionId) return
    let isMounted = true
    getPackageVersionPreview(packageVersionId)
      .then((items) => {
        if (isMounted) setPreview(items)
      })
      .catch((err) => {
        if (isMounted) setPreviewError(err instanceof Error ? err.message : 'Failed to load package preview.')
      })
    return () => {
      isMounted = false
    }
  }, [packageVersionId])

  const selectedOption = options.find((o) => o.packageVersionId === packageVersionId)

  return (
    <div>
      <h2 className="dynamic-form-step-title">Onboarding</h2>
      <p className="dynamic-form-step-desc">Assign this employee's onboarding checklist now, or leave it for later.</p>

      <div className="wizard-choice-group" role="radiogroup" aria-label="Onboarding assignment timing">
        <label
          role="radio"
          tabIndex={0}
          aria-checked={onboardingMode === 'assign_now'}
          onClick={() => onChangeOnboardingMode('assign_now')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onChangeOnboardingMode('assign_now')
            }
          }}
          className={`wizard-choice-card${onboardingMode === 'assign_now' ? ' selected' : ''}`}
        >
          <span className="wizard-choice-dot" />
          <div>
            <span className="wizard-choice-title">Assign an onboarding package now</span>
            <p className="wizard-choice-desc">Choose a published package to start this employee's onboarding checklist.</p>
          </div>
        </label>

        <label
          role="radio"
          tabIndex={0}
          aria-checked={onboardingMode === 'assign_later'}
          onClick={() => onChangeOnboardingMode('assign_later')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onChangeOnboardingMode('assign_later')
            }
          }}
          className={`wizard-choice-card${onboardingMode === 'assign_later' ? ' selected' : ''}`}
        >
          <span className="wizard-choice-dot" />
          <div>
            <span className="wizard-choice-title">Assign onboarding later</span>
            <p className="wizard-choice-desc">You can assign a package from the employee's Onboarding tab at any time.</p>
          </div>
        </label>
      </div>

      {onboardingMode === 'assign_now' && (
        <div className="mt-4" style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          {(optionsError || previewError) && (
            <div className="alert alert-error" role="alert">
              <p style={{ margin: 0 }}>{optionsError || previewError}</p>
            </div>
          )}

          <div className="field">
            <label htmlFor="wiz_package_select">Package</label>
            {options.length === 0 ? (
              <p className="subtitle" style={{ margin: '0.4rem 0 0' }}>
                {optionsError ? 'Unable to load published packages.' : 'Loading published packages…'}
              </p>
            ) : (
              <select
                id="wiz_package_select"
                value={packageVersionId ?? ''}
                onChange={(e) => onChangePackageVersionId(e.target.value || null)}
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

          <div className="field">
            <label htmlFor="wiz_due_date">Due Date (optional)</label>
            <input
              id="wiz_due_date"
              type="date"
              value={dueDate ?? ''}
              onChange={(e) => onChangeDueDate(e.target.value || null)}
            />
          </div>

          {selectedOption && (
            <div>
              <p className="package-editor-field-label" style={{ marginBottom: '0.6rem' }}>Package Preview</p>
              {preview.length === 0 ? (
                <p className="subtitle">Loading package contents…</p>
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
      )}
    </div>
  )
}
