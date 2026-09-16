import React, { useState, useEffect } from 'react'
import { FileText, Search, Check, AlertCircle, Loader2, X } from 'lucide-react'
import {
  listPublishedFormVersions,
  type PublishedFormVersionOption,
} from '../data/onboarding-packages-repository'

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Add Published Form</h3>
            <p className="text-xs text-slate-500">Select an immutable published form version to pin to this package.</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-4 border-b border-slate-100 bg-white">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search published forms..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-200 pl-9 pr-4 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Content */}
        <div className="max-h-80 overflow-y-auto p-4 space-y-2">
          {isLoading && (
            <div className="flex items-center justify-center py-8 text-sm text-slate-500 space-x-2">
              <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
              <span>Loading published forms...</span>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-xs text-red-600 flex items-center space-x-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!isLoading && !error && filteredOptions.length === 0 && (
            <div className="text-center py-8 text-slate-500 text-sm">
              No published form versions found matching your search.
            </div>
          )}

          {!isLoading &&
            !error &&
            filteredOptions.map((opt) => {
              const isSelected = existingFormVersionIds.includes(opt.formVersionId)
              return (
                <div
                  key={opt.formVersionId}
                  className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                    isSelected
                      ? 'border-slate-200 bg-slate-50 opacity-60'
                      : 'border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30 cursor-pointer'
                  }`}
                  onClick={() => {
                    if (!isSelected) {
                      onSelectFormVersion(opt)
                      onClose()
                    }
                  }}
                >
                  <div className="flex items-start space-x-3">
                    <div className="rounded-md bg-indigo-50 p-2 text-indigo-600 mt-0.5">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-slate-900">{opt.title}</h4>
                      <div className="flex items-center space-x-2 text-xs text-slate-500 mt-0.5">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                          Version {opt.versionNumber}
                        </span>
                        {opt.publishedAt && (
                          <span>
                            Published {new Date(opt.publishedAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {isSelected ? (
                    <span className="inline-flex items-center space-x-1 text-xs text-slate-400 font-medium">
                      <Check className="h-3.5 w-3.5" />
                      <span>Added</span>
                    </span>
                  ) : (
                    <span className="text-xs text-indigo-600 font-semibold group-hover:underline">
                      Select
                    </span>
                  )}
                </div>
              )
            })}
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-slate-100 bg-slate-50 px-6 py-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
