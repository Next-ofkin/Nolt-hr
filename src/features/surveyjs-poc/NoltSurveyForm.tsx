import React, { useMemo, useState } from 'react'
import { Model } from 'survey-core'
import { Survey } from 'survey-react-ui'

import 'survey-core/survey-core.css'
import 'survey-core/themes/adapters/shadcn-default.css'
import './nolt-survey-theme.css'

import { employeeSurveyJson } from './survey-definition'

export const NoltSurveyForm: React.FC = () => {
  const [completedData, setCompletedData] = useState<Record<string, unknown> | null>(null)

  const survey = useMemo(() => {
    const model = new Model(employeeSurveyJson)
    model.onComplete.add((sender) => {
      setCompletedData(sender.data)
    })
    return model
  }, [])

  if (completedData) {
    return (
      <div
        className="card"
        style={{
          textAlign: 'center',
          padding: '3rem 1.5rem',
          maxWidth: '640px',
          margin: '2rem auto',
        }}
      >
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: '#dcfce7',
            color: '#16a34a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.25rem',
            fontSize: '1.75rem',
            fontWeight: 700,
          }}
        >
          ✓
        </div>
        <h2
          style={{
            fontSize: '1.5rem',
            fontWeight: 700,
            color: 'var(--text-strong, #0f172a)',
            margin: '0 0 0.5rem',
          }}
        >
          Form completed successfully.
        </h2>
        <p
          style={{
            color: 'var(--text-muted, #64748b)',
            marginTop: '0.5rem',
            marginBottom: '1.5rem',
            fontSize: '0.95rem',
          }}
        >
          Thank you for providing your employee information. Your responses have been recorded for this proof of concept.
        </p>

        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            survey.clear(true)
            setCompletedData(null)
          }}
        >
          Reset Form POC
        </button>

        {import.meta.env.DEV && (
          <details
            style={{
              marginTop: '2rem',
              textAlign: 'left',
              background: '#f8fafc',
              padding: '1rem',
              borderRadius: '8px',
              border: '1px solid var(--border, #e2e5ea)',
            }}
          >
            <summary
              style={{
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.85rem',
                color: 'var(--text-muted, #64748b)',
              }}
            >
              Developer Data
            </summary>
            <pre
              style={{
                fontSize: '0.8rem',
                overflowX: 'auto',
                marginTop: '0.75rem',
                marginBottom: 0,
                color: 'var(--text, #334155)',
              }}
            >
              {JSON.stringify(completedData, null, 2)}
            </pre>
          </details>
        )}
      </div>
    )
  }

  return (
    <div className="sjs-theme-overrides">
      <Survey model={survey} />
    </div>
  )
}

export default NoltSurveyForm
