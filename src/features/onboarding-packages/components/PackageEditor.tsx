import React, { useState } from 'react'
import {
  Save,
  Sparkles,
  Lock,
  Clock,
  Plus,
  AlertCircle,
  CheckCircle2,
  Eye,
  PlusCircle,
} from 'lucide-react'
import {
  saveOnboardingPackageDraft,
  publishOnboardingPackageDraft,
  createOnboardingPackageDraft,
} from '../data/onboarding-packages-repository'
import {
  onboardingPackagePersistenceMessage,
  type OnboardingPackageDetail,
  type PackageFormItemInput,
  type PackageItemInput,
  type PackageVersion,
} from '../data/onboarding-packages-types'
import { supabase } from '../../../lib/supabase'
import type { FormSchema } from '../../shadcn-form-poc/domain/form-schema'

import { PackageFormPicker } from './PackageFormPicker'
import { PackageDocumentModal } from './PackageDocumentModal'
import { PackagePublishDialog } from './PackagePublishDialog'
import { PackageItemsList } from './PackageItemsList'
import { PackageVersionHistory } from './PackageVersionHistory'
import { PackagePreviewModal } from './PackagePreviewModal'

interface PackageEditorProps {
  initialDetail: OnboardingPackageDetail
  onPackageUpdated: (updatedDetail: OnboardingPackageDetail) => void
}

export const PackageEditor: React.FC<PackageEditorProps> = ({
  initialDetail,
  onPackageUpdated,
}) => {
  const [detail, setDetail] = useState<OnboardingPackageDetail>(initialDetail)

  const activeVersionIndex = detail.versions.findIndex((v) => v.state === 'draft')
  const initialActiveVersion =
    activeVersionIndex !== -1 ? detail.versions[activeVersionIndex] : detail.versions[0]

  const [activeVersion, setActiveVersion] = useState<PackageVersion>(initialActiveVersion)

  const [title, setTitle] = useState(detail.title)
  const [description, setDescription] = useState(detail.description || '')
  const [items, setItems] = useState<PackageItemInput[]>(
    activeVersion?.items.map((item) => {
      if (item.itemType === 'form') {
        return {
          id: item.id,
          itemType: 'form',
          sortOrder: item.sortOrder,
          required: item.required,
          formVersionId: item.formVersionId,
          formTitle: item.formTitle,
          formVersionNumber: item.formVersionNumber,
        }
      }
      return {
        id: item.id,
        itemType: 'document',
        sortOrder: item.sortOrder,
        required: item.required,
        documentTitle: item.documentTitle,
        documentDescription: item.documentDescription,
      }
    }) || [],
  )

  const [expectedRevision, setExpectedRevision] = useState(activeVersion?.revision || 1)

  const [isFormPickerOpen, setIsFormPickerOpen] = useState(false)
  const [isDocModalOpen, setIsDocModalOpen] = useState(false)
  const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [previewFocus, setPreviewFocus] = useState<{ schema: FormSchema; title: string } | null>(null)
  const [previewSessionId, setPreviewSessionId] = useState(0)
  const [isLoadingItemPreview, setIsLoadingItemPreview] = useState<string | null>(null)
  const [itemPreviewError, setItemPreviewError] = useState<string | null>(null)

  const [isSaving, setIsSaving] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [isCreatingDraft, setIsCreatingDraft] = useState(false)

  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const isDraft = activeVersion?.state === 'draft'
  const isReadOnly = !isDraft || !!detail.archivedAt

  const handleAddFormVersion = (option: { formVersionId: string; title: string; versionNumber: number }) => {
    setErrorMessage(null)
    setSuccessMessage(null)

    if (items.some((i) => i.itemType === 'form' && i.formVersionId === option.formVersionId)) {
      setErrorMessage('A package cannot contain the same form version multiple times.')
      return
    }

    const newItem: PackageItemInput = {
      itemType: 'form',
      sortOrder: items.length,
      required: true,
      formVersionId: option.formVersionId,
      formTitle: option.title,
      formVersionNumber: option.versionNumber,
    }

    setItems([...items, newItem])
  }

  const handleAddDocument = (doc: { documentTitle: string; documentDescription: string; required: boolean }) => {
    setErrorMessage(null)
    setSuccessMessage(null)

    const newItem: PackageItemInput = {
      itemType: 'document',
      sortOrder: items.length,
      required: doc.required,
      documentTitle: doc.documentTitle,
      documentDescription: doc.documentDescription || null,
    }

    setItems([...items, newItem])
  }

  const handleMoveUp = (index: number) => {
    if (index === 0) return
    const updated = [...items]
    const temp = updated[index - 1]
    updated[index - 1] = updated[index]
    updated[index] = temp
    setItems(updated)
  }

  const handleMoveDown = (index: number) => {
    if (index === items.length - 1) return
    const updated = [...items]
    const temp = updated[index + 1]
    updated[index + 1] = updated[index]
    updated[index] = temp
    setItems(updated)
  }

  const handleRemoveItem = (index: number) => {
    const updated = items.filter((_, i) => i !== index)
    setItems(updated)
  }

  const handleSaveDraft = async () => {
    if (!isDraft) return
    setIsSaving(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      const result = await saveOnboardingPackageDraft({
        onboardingPackageId: detail.id,
        title,
        description,
        items,
        expectedRevision,
      })

      setExpectedRevision(result.revision)
      setSuccessMessage('Draft saved successfully.')

      const updatedVersion = {
        ...activeVersion,
        revision: result.revision,
      }
      setActiveVersion(updatedVersion)

      const updatedDetail: OnboardingPackageDetail = {
        ...detail,
        title,
        description,
        versions: detail.versions.map((v) => (v.id === updatedVersion.id ? updatedVersion : v)),
      }
      setDetail(updatedDetail)
      onPackageUpdated(updatedDetail)
    } catch (err) {
      setErrorMessage(onboardingPackagePersistenceMessage(err))
    } finally {
      setIsSaving(false)
    }
  }

  const handleConfirmPublish = async () => {
    if (!isDraft) return
    setIsPublishing(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      await saveOnboardingPackageDraft({
        onboardingPackageId: detail.id,
        title,
        description,
        items,
        expectedRevision,
      })

      const publishRes = await publishOnboardingPackageDraft(detail.id)

      setSuccessMessage(`Package Version ${publishRes.versionNumber} published successfully.`)
      setIsPublishDialogOpen(false)

      const publishedVer: PackageVersion = {
        ...activeVersion,
        state: 'published',
        publishedAt: new Date().toISOString(),
      }
      setActiveVersion(publishedVer)

      const updatedDetail: OnboardingPackageDetail = {
        ...detail,
        title,
        description,
        versions: detail.versions.map((v) => (v.id === publishedVer.id ? publishedVer : v)),
      }
      setDetail(updatedDetail)
      onPackageUpdated(updatedDetail)
    } catch (err) {
      setErrorMessage(onboardingPackagePersistenceMessage(err))
      setIsPublishDialogOpen(false)
    } finally {
      setIsPublishing(false)
    }
  }

  const handleCreateNewDraft = async () => {
    setIsCreatingDraft(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      const draftRes = await createOnboardingPackageDraft(detail.id)
      setSuccessMessage(
        draftRes.createdNew
          ? `Branched Version ${draftRes.versionNumber} Draft.`
          : `Switched to open Version ${draftRes.versionNumber} Draft.`,
      )

      window.location.reload()
    } catch (err) {
      setErrorMessage(onboardingPackagePersistenceMessage(err))
    } finally {
      setIsCreatingDraft(false)
    }
  }

  const handleSelectVersion = (version: PackageVersion) => {
    setActiveVersion(version)
    setExpectedRevision(version.revision)
    setItems(
      version.items.map((item) => {
        if (item.itemType === 'form') {
          return {
            id: item.id,
            itemType: 'form',
            sortOrder: item.sortOrder,
            required: item.required,
            formVersionId: item.formVersionId,
            formTitle: item.formTitle,
            formVersionNumber: item.formVersionNumber,
          }
        }
        return {
          id: item.id,
          itemType: 'document',
          sortOrder: item.sortOrder,
          required: item.required,
          documentTitle: item.documentTitle,
          documentDescription: item.documentDescription,
        }
      }),
    )
    setErrorMessage(null)
    setSuccessMessage(null)
  }

  const handlePreviewFormItem = async (formVersionId: string, formTitle?: string) => {
    setIsLoadingItemPreview(formVersionId)
    setItemPreviewError(null)
    try {
      const { data, error } = await supabase
        .from('form_definition_versions')
        .select('definition')
        .eq('id', formVersionId)
        .single()
      if (error) throw error
      if (!data?.definition) throw new Error('This form version has no content to preview.')

      setPreviewFocus({ schema: data.definition as unknown as FormSchema, title: formTitle || 'Form Preview' })
      setPreviewSessionId((id) => id + 1)
      setIsPreviewOpen(true)
    } catch (err) {
      setItemPreviewError(err instanceof Error ? err.message : 'Unable to load this form for preview.')
    } finally {
      setIsLoadingItemPreview(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {errorMessage && (
        <div className="alert alert-error">
          <p style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertCircle style={{ width: 16, height: 16, flexShrink: 0 }} />
            <span><strong>Save error: </strong>{errorMessage}</span>
          </p>
        </div>
      )}

      {successMessage && (
        <div className="alert alert-success">
          <p style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckCircle2 style={{ width: 16, height: 16, flexShrink: 0 }} /> {successMessage}
          </p>
        </div>
      )}

      <div className="package-editor-grid">
        <div className="package-editor-main">
          <div className="card">
            <div className="package-editor-card-top">
              <div className="package-editor-badges">
                <span className={`badge ${isDraft ? 'badge-warning' : 'badge-success'}`}>
                  {isDraft ? <Clock style={{ width: 12, height: 12 }} /> : <Lock style={{ width: 12, height: 12 }} />}
                  {isDraft ? `Version ${activeVersion?.versionNumber} Draft (Rev ${expectedRevision})` : `Version ${activeVersion?.versionNumber} Published`}
                </span>
                {detail.archivedAt && <span className="badge badge-neutral">Archived</span>}
              </div>

              <button
                type="button"
                onClick={() => {
                  setPreviewFocus(null)
                  setPreviewSessionId((id) => id + 1)
                  setIsPreviewOpen(true)
                }}
                className="btn btn-ghost"
              >
                <Eye style={{ width: 15, height: 15, marginRight: '0.4rem' }} /> Preview Package
              </button>
            </div>

            <div style={{ marginTop: '1.1rem' }}>
              <span className="package-editor-field-label">Package Title</span>
              {isReadOnly ? (
                <h2 className="package-editor-readonly-title">{title}</h2>
              ) : (
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Standard UK New Starter Package"
                  style={{ fontSize: '1rem', fontWeight: 600 }}
                />
              )}
            </div>

            <div style={{ marginTop: '1rem' }}>
              <span className="package-editor-field-label">Description / Purpose</span>
              {isReadOnly ? (
                <p className="package-editor-readonly-desc">{description || 'No description provided.'}</p>
              ) : (
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe which employee roles or departments this onboarding package is designed for..."
                  rows={2}
                />
              )}
            </div>
          </div>

          <div className="card">
            <div className="package-items-header">
              <div>
                <h3>Package Items &amp; Requirements</h3>
                <p>Group exact published form versions and required document specifications.</p>
              </div>

              {!isReadOnly && (
                <div className="package-items-actions">
                  <button type="button" onClick={() => setIsFormPickerOpen(true)} className="btn-tinted btn-tinted-primary">
                    <Plus style={{ width: 14, height: 14, marginRight: '0.35rem' }} /> Add Published Form
                  </button>
                  <button type="button" onClick={() => setIsDocModalOpen(true)} className="btn-tinted btn-tinted-amber">
                    <Plus style={{ width: 14, height: 14, marginRight: '0.35rem' }} /> Add Document Requirement
                  </button>
                </div>
              )}
            </div>

            {itemPreviewError && (
              <div className="alert alert-error" style={{ marginTop: '1rem' }} role="alert">
                <p style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                  <AlertCircle style={{ width: 16, height: 16, flexShrink: 0 }} /> {itemPreviewError}
                </p>
              </div>
            )}

            <div style={{ marginTop: '1.1rem' }}>
              <PackageItemsList
                items={items}
                isReadOnly={isReadOnly}
                onMoveUp={handleMoveUp}
                onMoveDown={handleMoveDown}
                onRemove={handleRemoveItem}
                onPreviewForm={(formVersionId, formTitle) => void handlePreviewFormItem(formVersionId, formTitle)}
                previewLoadingFormVersionId={isLoadingItemPreview}
              />
            </div>
          </div>

          <div className="card package-editor-footer">
            <span className="package-editor-footer-note">
              {isDraft
                ? `Unsaved changes will be stored as revision ${expectedRevision + 1}.`
                : 'Published versions cannot be modified. Branch a new draft to edit.'}
            </span>

            <div className="package-editor-footer-actions">
              {isDraft ? (
                <>
                  <button type="button" onClick={handleSaveDraft} disabled={isSaving || isPublishing} className="btn btn-ghost">
                    <Save style={{ width: 15, height: 15, marginRight: '0.4rem' }} />
                    {isSaving ? 'Saving…' : 'Save Draft'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsPublishDialogOpen(true)}
                    disabled={isSaving || isPublishing || items.length === 0}
                    className="btn btn-primary"
                  >
                    <Sparkles style={{ width: 15, height: 15, marginRight: '0.4rem' }} />
                    Publish Version {activeVersion?.versionNumber}
                  </button>
                </>
              ) : (
                <button type="button" onClick={handleCreateNewDraft} disabled={isCreatingDraft} className="btn btn-primary">
                  {isCreatingDraft ? (
                    <>Creating Draft…</>
                  ) : (
                    <>
                      <PlusCircle style={{ width: 15, height: 15, marginRight: '0.4rem' }} />
                      Create Version {(activeVersion?.versionNumber || 1) + 1} Draft
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        <div>
          <PackageVersionHistory
            versions={detail.versions}
            activeVersionId={activeVersion?.id || ''}
            onSelectVersion={handleSelectVersion}
          />
        </div>
      </div>

      <PackageFormPicker
        isOpen={isFormPickerOpen}
        onClose={() => setIsFormPickerOpen(false)}
        onSelectFormVersion={handleAddFormVersion}
        existingFormVersionIds={items
          .filter((i): i is PackageFormItemInput => i.itemType === 'form' && !!i.formVersionId)
          .map((i) => i.formVersionId)}
      />

      <PackageDocumentModal
        isOpen={isDocModalOpen}
        onClose={() => setIsDocModalOpen(false)}
        onAddDocument={handleAddDocument}
      />

      <PackagePublishDialog
        isOpen={isPublishDialogOpen}
        versionNumber={activeVersion?.versionNumber || 1}
        isPublishing={isPublishing}
        onClose={() => setIsPublishDialogOpen(false)}
        onConfirmPublish={handleConfirmPublish}
      />

      <PackagePreviewModal
        key={previewSessionId}
        isOpen={isPreviewOpen}
        onClose={() => {
          setIsPreviewOpen(false)
          setPreviewFocus(null)
        }}
        packageTitle={title}
        packageDescription={description}
        versionNumber={activeVersion?.versionNumber || 1}
        items={items}
        initialFocus={previewFocus}
      />
    </div>
  )
}
