import React, { useState } from 'react'
import { Ban, Calendar, ChevronDown, ChevronUp, FileCheck, FileText } from 'lucide-react'
import {
  calculateOnboardingProgress,
  formatOnboardingDate,
  type AssignmentState,
  type EmployeeOnboardingAssignment,
} from '../data/employee-onboarding-types'
import { OnboardingProgressBar } from './OnboardingProgress'
import { EmployeeOnboardingChecklist } from './EmployeeOnboardingChecklist'

const STATE_BADGE: Record<AssignmentState, { label: string; className: string }> = {
  assigned: { label: 'Assigned', className: 'badge-neutral' },
  in_progress: { label: 'In Progress', className: 'badge-warning' },
  completed: { label: 'Completed', className: 'badge-success' },
  cancelled: { label: 'Cancelled', className: 'badge-danger' },
}

interface EmployeeOnboardingCardProps {
  assignment: EmployeeOnboardingAssignment
  onCancel: (assignment: EmployeeOnboardingAssignment) => void
  isBusy?: boolean
}

export const EmployeeOnboardingCard: React.FC<EmployeeOnboardingCardProps> = ({
  assignment,
  onCancel,
  isBusy = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const progress = calculateOnboardingProgress(assignment.items)
  const formsCount = assignment.items.filter((item) => item.itemType === 'form').length
  const documentsCount = assignment.items.filter((item) => item.itemType === 'document').length
  const badge = STATE_BADGE[assignment.state]
  const canCancel = assignment.state === 'assigned' || assignment.state === 'in_progress'

  return (
    <div className="card onboarding-assignment-card">
      <div className="package-card-top">
        <div className="package-card-heading">
          <h3 className="package-card-title">{assignment.packageTitleSnapshot}</h3>
          <p className="package-card-description">Published Version {assignment.packageVersionNumber}</p>
        </div>
        <span className={`badge ${badge.className}`}>{badge.label}</span>
      </div>

      <OnboardingProgressBar progress={progress} />

      <dl className="detail-list onboarding-assignment-meta">
        <dt>Assigned</dt>
        <dd>{formatOnboardingDate(assignment.assignedAt)}</dd>
        <dt>Due</dt>
        <dd>
          {assignment.dueDate ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
              <Calendar style={{ width: 13, height: 13 }} /> {formatOnboardingDate(assignment.dueDate)}
            </span>
          ) : (
            '—'
          )}
        </dd>
      </dl>

      {assignment.state === 'cancelled' && assignment.cancellationReason && (
        <p className="onboarding-cancellation-reason">Cancelled: {assignment.cancellationReason}</p>
      )}

      <div className="package-metrics">
        <span className="package-metric">
          <FileText style={{ width: 15, height: 15 }} />
          {formsCount} {formsCount === 1 ? 'Form' : 'Forms'}
        </span>
        <span className="package-metric">
          <FileCheck style={{ width: 15, height: 15 }} />
          {documentsCount} {documentsCount === 1 ? 'Document' : 'Documents'}
        </span>
      </div>

      <div className="package-card-footer">
        <div className="package-card-actions">
          <button type="button" className="btn btn-primary" onClick={() => setIsExpanded((v) => !v)}>
            {isExpanded ? 'Hide Checklist' : 'View Onboarding'}
            {isExpanded ? (
              <ChevronUp style={{ width: 15, height: 15, marginLeft: '0.4rem' }} />
            ) : (
              <ChevronDown style={{ width: 15, height: 15, marginLeft: '0.4rem' }} />
            )}
          </button>
          {canCancel && (
            <button
              type="button"
              className="btn btn-danger"
              disabled={isBusy}
              onClick={() => onCancel(assignment)}
            >
              <Ban style={{ width: 15, height: 15, marginRight: '0.4rem' }} /> Cancel Assignment
            </button>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="onboarding-assignment-checklist-panel">
          <EmployeeOnboardingChecklist items={assignment.items} />
        </div>
      )}
    </div>
  )
}
