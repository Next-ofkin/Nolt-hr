import React from 'react'
import { CheckCircle2, Circle, CircleDot } from 'lucide-react'
import type { EmployeeOnboardingItem, OnboardingItemState } from '../data/employee-onboarding-types'

const STATE_LABELS: Record<OnboardingItemState, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  submitted: 'Submitted',
  under_review: 'Under review',
  changes_requested: 'Changes requested',
  approved: 'Approved',
  waived: 'Waived',
}

function ItemStatusIcon({ state }: { state: OnboardingItemState }) {
  if (state === 'approved' || state === 'waived') {
    return <CheckCircle2 style={{ width: 18, height: 18, color: '#16a34a', flexShrink: 0 }} />
  }
  if (state === 'not_started') {
    return <Circle style={{ width: 18, height: 18, color: 'var(--text-muted)', flexShrink: 0 }} />
  }
  return <CircleDot style={{ width: 18, height: 18, color: '#d97706', flexShrink: 0 }} />
}

function ChecklistRow({ item }: { item: EmployeeOnboardingItem }) {
  const title = item.itemType === 'form' ? `${item.formTitle} — Version ${item.formVersionNumber}` : item.documentTitle

  return (
    <div className="onboarding-checklist-row">
      <ItemStatusIcon state={item.state} />
      <div className="onboarding-checklist-row-info">
        <div className="package-item-title-row">
          <span className="onboarding-checklist-row-title">{title}</span>
          {item.required && <span className="package-item-tag package-item-tag-required">Required</span>}
        </div>
        <span className="onboarding-checklist-row-state">{STATE_LABELS[item.state]}</span>
        {item.itemType === 'document' && item.documentDescription && (
          <p className="package-item-desc">{item.documentDescription}</p>
        )}
      </div>
    </div>
  )
}

interface EmployeeOnboardingChecklistProps {
  items: EmployeeOnboardingItem[]
}

export const EmployeeOnboardingChecklist: React.FC<EmployeeOnboardingChecklistProps> = ({ items }) => {
  const forms = items.filter((item): item is Extract<EmployeeOnboardingItem, { itemType: 'form' }> => item.itemType === 'form')
  const documents = items.filter((item): item is Extract<EmployeeOnboardingItem, { itemType: 'document' }> => item.itemType === 'document')

  return (
    <div className="onboarding-checklist">
      {forms.length > 0 && (
        <div className="onboarding-checklist-section">
          <h4 className="onboarding-checklist-section-title">Forms</h4>
          {forms.map((item) => (
            <ChecklistRow key={item.id} item={item} />
          ))}
        </div>
      )}

      {documents.length > 0 && (
        <div className="onboarding-checklist-section">
          <h4 className="onboarding-checklist-section-title">Documents</h4>
          {documents.map((item) => (
            <ChecklistRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}
