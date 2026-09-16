import React from 'react'
import { History, CheckCircle2, Clock } from 'lucide-react'
import type { PackageVersion } from '../data/onboarding-packages-types'
import { formatPackageDate } from '../data/onboarding-packages-types'

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
    <div className="card">
      <div className="version-history-title">
        <History style={{ width: 16, height: 16 }} />
        Version History
      </div>

      <div className="version-history-list">
        {versions.map((ver) => {
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
    </div>
  )
}
