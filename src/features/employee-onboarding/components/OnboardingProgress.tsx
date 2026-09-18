import React from 'react'
import type { OnboardingProgress as OnboardingProgressData } from '../data/employee-onboarding-types'

interface OnboardingProgressBarProps {
  progress: OnboardingProgressData
}

export const OnboardingProgressBar: React.FC<OnboardingProgressBarProps> = ({ progress }) => {
  return (
    <div className="onboarding-progress">
      <div className="onboarding-progress-label">
        <span>{progress.completed} of {progress.total} completed</span>
        <span>{progress.percent}%</span>
      </div>
      <div className="onboarding-progress-bar">
        <div className="onboarding-progress-bar-fill" style={{ width: `${progress.percent}%` }} />
      </div>
    </div>
  )
}
