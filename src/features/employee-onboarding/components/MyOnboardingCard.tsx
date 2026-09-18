import React from 'react'
import { AlertCircle, Calendar, PlayCircle } from 'lucide-react'
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

interface MyOnboardingCardProps {
  assignment: EmployeeOnboardingAssignment
  onStart: (assignment: EmployeeOnboardingAssignment) => void
  isStarting?: boolean
}

export const MyOnboardingCard: React.FC<MyOnboardingCardProps> = ({ assignment, onStart, isStarting = false }) => {
  const progress = calculateOnboardingProgress(assignment.items)
  const badge = STATE_BADGE[assignment.state]

  return (
    <section className="card onboarding-assignment-card">
      <div className="package-card-top">
        <div className="package-card-heading">
          <h3 className="package-card-title">{assignment.packageTitleSnapshot}</h3>
          <p className="package-card-description">Published Version {assignment.packageVersionNumber}</p>
        </div>
        <span className={`badge ${badge.className}`}>{badge.label}</span>
      </div>

      {assignment.state !== 'cancelled' && <OnboardingProgressBar progress={progress} />}

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

      {assignment.state === 'cancelled' ? (
        <p className="onboarding-cancellation-reason" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <AlertCircle style={{ width: 14, height: 14 }} /> This onboarding assignment was cancelled.
        </p>
      ) : assignment.state === 'assigned' ? (
        <button type="button" className="btn btn-primary" onClick={() => onStart(assignment)} disabled={isStarting}>
          <PlayCircle style={{ width: 16, height: 16, marginRight: '0.4rem' }} />
          {isStarting ? 'Starting…' : 'Start Onboarding'}
        </button>
      ) : (
        <EmployeeOnboardingChecklist items={assignment.items} />
      )}
    </section>
  )
}
