import React from 'react'
import { NoltSurveyForm } from '../features/surveyjs-poc/NoltSurveyForm'

export const SurveyJsPocPage: React.FC = () => {
  return (
    <div
      className="page employee-page"
      style={{
        width: '100%',
        maxWidth: '1200px',
        margin: '0 auto',
        paddingInline: 'clamp(16px, 3vw, 24px)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '0.25rem',
        }}
      >
        <div
          style={{
            fontSize: '0.75rem',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--text-muted, #64748b)',
          }}
        >
          SurveyJS Visual POC
        </div>
      </div>
      <NoltSurveyForm />
    </div>
  )
}

export default SurveyJsPocPage
