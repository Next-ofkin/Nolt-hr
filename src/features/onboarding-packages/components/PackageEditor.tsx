import React, { useState } from 'react'
import {
  Save,
  Sparkles,
  Lock,
  Clock,
  Plus,
  AlertCircle,
  CheckCircle2,
  Loader2,
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

  // Select active draft or highest version
  const activeVersionIndex = detail.versions.findIndex((v) => v.state === 'draft')
  const initialActiveVersion =
    activeVersionIndex !== -1 ? detail.versions[activeVersionIndex] : detail.versions[0]

  const [activeVersion, setActiveVersion] = useState<PackageVersion>(initialActiveVersion)

  // Editor State
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

  // Dialog & Feedback state
  const [isFormPickerOpen, setIsFormPickerOpen] = useState(false)
  const [isDocModalOpen, setIsDocModalOpen] = useState(false)
  const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)

  const [isSaving, setIsSaving] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [isCreatingDraft, setIsCreatingDraft] = useState(false)

  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const isDraft = activeVersion?.state === 'draft'
  const isReadOnly = !isDraft || !!detail.archivedAt

  // Item Handlers
  const handleAddFormVersion = (option: { formVersionId: string; title: string; versionNumber: number }) => {
    setErrorMessage(null)
    setSuccessMessage(null)

    // Check duplicate
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

  // Save Draft Handler
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

      // Sync active version revision
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

  // Publish Handler
  const handleConfirmPublish = async () => {
    if (!isDraft) return
    setIsPublishing(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      // First save latest edits
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

      // Reload detail or update state to published
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

  // Create New Draft Handler
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

      // Reload page state via parent refresh or construct draft version
      window.location.reload()
    } catch (err) {
      setErrorMessage(onboardingPackagePersistenceMessage(err))
    } finally {
      setIsCreatingDraft(false)
    }
  }

  // Switch Active Version Handler
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

  return (
    <div className="space-y-6">
      {/* Messages */}
      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-start space-x-3 shadow-sm">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold">Save Error: </span>
            <span>{errorMessage}</span>
          </div>
        </div>
      )}

      {successMessage && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 flex items-center space-x-3 shadow-sm">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <span className="font-medium">{successMessage}</span>
        </div>
      )}

      {/* Primary Editor Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Section (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Metadata Card */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span
                  className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                    isDraft ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {isDraft ? (
                    <>
                      <Clock className="h-3 w-3 mr-1" />
                      Version {activeVersion?.versionNumber} Draft (Rev {expectedRevision})
                    </>
                  ) : (
                    <>
                      <Lock className="h-3 w-3 mr-1" />
                      Version {activeVersion?.versionNumber} Published
                    </>
                  )}
                </span>
                {detail.archivedAt && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-slate-200 text-slate-700">
                    Archived
                  </span>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setIsPreviewOpen(true)}
                  className="inline-flex items-center space-x-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span>Preview Package</span>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Package Title
              </label>
              {isReadOnly ? (
                <h2 className="text-xl font-bold text-slate-900">{title}</h2>
              ) : (
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Standard UK New Starter Package"
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-base font-semibold text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Description / Purpose
              </label>
              {isReadOnly ? (
                <p className="text-sm text-slate-600">{description || 'No description provided.'}</p>
              ) : (
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe which employee roles or departments this onboarding package is designed for..."
                  rows={2}
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              )}
            </div>
          </div>

          {/* Included Items Card */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Package Items & Requirements</h3>
                <p className="text-xs text-slate-500">
                  Group exact published form versions and required document specifications.
                </p>
              </div>

              {!isReadOnly && (
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setIsFormPickerOpen(true)}
                    className="inline-flex items-center space-x-1.5 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-100 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Published Form</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsDocModalOpen(true)}
                    className="inline-flex items-center space-x-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Document Requirement</span>
                  </button>
                </div>
              )}
            </div>

            <PackageItemsList
              items={items}
              isReadOnly={isReadOnly}
              onMoveUp={handleMoveUp}
              onMoveDown={handleMoveDown}
              onRemove={handleRemoveItem}
            />
          </div>

          {/* Action Footer */}
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs text-slate-500">
              {isDraft ? (
                <span>Unsaved changes will be stored as revision {expectedRevision + 1}.</span>
              ) : (
                <span>Published versions cannot be modified. Branch a new draft to edit.</span>
              )}
            </div>

            <div className="flex items-center space-x-3">
              {isDraft ? (
                <>
                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    disabled={isSaving || isPublishing}
                    className="inline-flex items-center space-x-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors shadow-sm"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <Save className="h-3.5 w-3.5 text-slate-500" />
                        <span>Save Draft</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsPublishDialogOpen(true)}
                    disabled={isSaving || isPublishing || items.length === 0}
                    className="inline-flex items-center space-x-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Publish Version {activeVersion?.versionNumber}</span>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleCreateNewDraft}
                  disabled={isCreatingDraft}
                  className="inline-flex items-center space-x-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
                >
                  {isCreatingDraft ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Creating Draft...</span>
                    </>
                  ) : (
                    <>
                      <PlusCircle className="h-3.5 w-3.5" />
                      <span>Create Version {(activeVersion?.versionNumber || 1) + 1} Draft</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar (1 col) */}
        <div className="space-y-6">
          <PackageVersionHistory
            versions={detail.versions}
            activeVersionId={activeVersion?.id || ''}
            onSelectVersion={handleSelectVersion}
          />
        </div>
      </div>

      {/* Modals */}
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
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        packageTitle={title}
        packageDescription={description}
        versionNumber={activeVersion?.versionNumber || 1}
        items={items}
      />
    </div>
  )
}
