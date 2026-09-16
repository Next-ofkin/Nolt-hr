import React from 'react'
import { NoltSurveyForm } from '../features/surveyjs-poc/NoltSurveyForm'

export const SurveyJsPocPage: React.FC = () => {
  return (
    <div className="page employee-page">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '0.5rem',
        }}
      >
        <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
          SurveyJS Visual POC
        </div>
      </div>
      <NoltSurveyForm />
    </div>
  )
}

export default SurveyJsPocPage
