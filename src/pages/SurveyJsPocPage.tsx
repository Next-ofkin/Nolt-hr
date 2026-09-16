import React from 'react'
import { NoltSurveyForm } from '../features/surveyjs-poc/NoltSurveyForm'

export const SurveyJsPocPage: React.FC = () => {
  return (
    <div className="page employee-page">
      <p className="eyebrow" style={{ margin: 0 }}>Form builder</p>
      <NoltSurveyForm />
    </div>
  )
}

export default SurveyJsPocPage
