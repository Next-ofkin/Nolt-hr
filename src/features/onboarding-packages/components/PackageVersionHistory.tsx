import React from 'react'
import { History, CheckCircle2, Clock, Calendar } from 'lucide-react'
import type { PackageVersion } from '../data/onboarding-packages-types'

interface PackageVersionHistoryProps {
  versions: PackageVersion[]
  activeVersionId: string
  onSelectVersion: (version: PackageVersion) => void
}

export const PackageVersionHistory: React.FC<PackageVersionHistoryProps> = ({
  versions,
  activeVersionId,
  onSelectVersion,
}) => {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5 space-y-4">
      <div className="flex items-center space-x-2 border-b border-slate-100 pb-3">
        <History className="h-4 w-4 text-slate-500" />
        <h3 className="text-sm font-semibold text-slate-900">Version History</h3>
      </div>

      <div className="space-y-2">
        {versions.map((ver) => {
          const isSelected = ver.id === activeVersionId
          const isDraft = ver.state === 'draft'

          return (
            <div
              key={ver.id}
              onClick={() => onSelectVersion(ver)}
              className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${
                isSelected
                  ? 'border-indigo-500 bg-indigo-50/50 shadow-sm'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center space-x-3">
                {isDraft ? (
                  <div className="rounded-md bg-amber-100 p-1.5 text-amber-700">
                    <Clock className="h-4 w-4" />
                  </div>
                ) : (
                  <div className="rounded-md bg-emerald-100 p-1.5 text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                )}
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold text-slate-900">
                      Version {ver.versionNumber}
                    </span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                        isDraft
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {isDraft ? `Draft (Rev ${ver.revision})` : 'Published'}
                    </span>
                  </div>
                  <div className="flex items-center space-x-3 text-[11px] text-slate-500 mt-1">
                    <span className="flex items-center space-x-1">
                      <Calendar className="h-3 w-3" />
                      <span>
                        {isDraft
                          ? `Created ${new Date(ver.createdAt).toLocaleDateString()}`
                          : `Published ${new Date(ver.publishedAt || ver.updatedAt).toLocaleDateString()}`}
                      </span>
                    </span>
                    <span>• {ver.items.length} items</span>
                  </div>
                </div>
              </div>

              {isSelected && (
                <span className="text-xs font-semibold text-indigo-600 bg-indigo-100/60 px-2 py-0.5 rounded">
                  Viewing
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
