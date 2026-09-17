import React, { useState } from 'react'
import { History, CheckCircle2, Clock, Archive, ChevronDown, ChevronUp } from 'lucide-react'
import type { PackageVersion } from '../data/onboarding-packages-types'
import { formatPackageDate } from '../data/onboarding-packages-types'
import { splitVersionsForDisplay } from '../../../lib/utils'

function versionIcon(state: PackageVersion['state']) {
  if (state === 'draft') return <Clock style={{ width: 14, height: 14 }} />
  if (state === 'superseded') return <Archive style={{ width: 14, height: 14 }} />
  return <CheckCircle2 style={{ width: 14, height: 14 }} />
}

function versionIconClass(state: PackageVersion['state']) {
  if (state === 'draft') return 'version-history-icon-draft'
  if (state === 'superseded') return 'version-history-icon-superseded'
  return 'version-history-icon-published'
}

function versionBadgeClass(state: PackageVersion['state']) {
  if (state === 'draft') return 'badge-warning'
  if (state === 'superseded') return 'badge-neutral'
  return 'badge-success'
}

function versionBadgeLabel(state: PackageVersion['state'], revision: number) {
  if (state === 'draft') return `Draft (Rev ${revision})`
  if (state === 'superseded') return 'Superseded'
  return 'Published'
}

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
              <span className={`version-history-icon ${versionIconClass(ver.state)}`}>
                {versionIcon(ver.state)}
              </span>

              <span className="version-history-info">
                <span className="version-history-info-top">
                  <span className="version-history-label">Version {ver.versionNumber}</span>
                  <span className={`badge ${versionBadgeClass(ver.state)}`}>
                    {versionBadgeLabel(ver.state, ver.revision)}
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
