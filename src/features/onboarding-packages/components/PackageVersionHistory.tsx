import React, { useState } from 'react'
import { History, CheckCircle2, Clock, ChevronDown, ChevronUp } from 'lucide-react'
import type { PackageVersion } from '../data/onboarding-packages-types'
import { formatPackageDate } from '../data/onboarding-packages-types'
import { splitVersionsForDisplay } from '../../../lib/utils'

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
  const [showAll, setShowAll] = useState(false)
  const { visible, hiddenCount } = splitVersionsForDisplay(versions, showAll)

  return (
    <div className="card">
      <div className="version-history-title">
        <History style={{ width: 16, height: 16 }} />
        Version History
      </div>

      <div className="version-history-list">
        {visible.map((ver) => {
          const isSelected = ver.id === activeVersionId
          const isDraft = ver.state === 'draft'

          return (
            <button
              key={ver.id}
              type="button"
              onClick={() => onSelectVersion(ver)}
              className={`version-history-item${isSelected ? ' active' : ''}`}
            >
              <span className={`version-history-icon ${isDraft ? 'version-history-icon-draft' : 'version-history-icon-published'}`}>
                {isDraft ? <Clock style={{ width: 14, height: 14 }} /> : <CheckCircle2 style={{ width: 14, height: 14 }} />}
              </span>

              <span className="version-history-info">
                <span className="version-history-info-top">
                  <span className="version-history-label">Version {ver.versionNumber}</span>
                  <span className={`badge ${isDraft ? 'badge-warning' : 'badge-success'}`}>
                    {isDraft ? `Draft (Rev ${ver.revision})` : 'Published'}
                  </span>
                </span>
                <span className="version-history-meta">
                  <span>
                    {isDraft
                      ? `Created ${formatPackageDate(ver.createdAt)}`
                      : `Published ${formatPackageDate(ver.publishedAt || ver.updatedAt)}`}
                  </span>
                  <span>• {ver.items.length} items</span>
                </span>
              </span>

              {isSelected && <span className="version-history-viewing">Viewing</span>}
            </button>
          )
        })}
      </div>

      {hiddenCount > 0 && (
        <button
          type="button"
          className="btn btn-ghost"
          style={{ marginTop: '0.75rem', width: '100%', justifyContent: 'center' }}
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? (
            <>Show fewer versions <ChevronUp style={{ width: 14, height: 14, marginLeft: '0.35rem' }} /></>
          ) : (
            <>Show {hiddenCount} older {hiddenCount === 1 ? 'version' : 'versions'} <ChevronDown style={{ width: 14, height: 14, marginLeft: '0.35rem' }} /></>
          )}
        </button>
      )}
    </div>
  )
}
