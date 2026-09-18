import { Check } from 'lucide-react'
import { WIZARD_STEPS } from '../data/employee-wizard'

interface WizardStepperProps {
  activeIndex: number
}

/** Reuses the exact stepper/progress-bar CSS approved for the multi-step form renderer (form-stepper, form-progress-bar) instead of inventing new styling. */
export function WizardStepper({ activeIndex }: WizardStepperProps) {
  const progressPercent = ((activeIndex + 1) / WIZARD_STEPS.length) * 100

  return (
    <>
      <div className="form-stepper">
        {WIZARD_STEPS.map((step, idx) => {
          const isDone = idx < activeIndex
          const isCurrent = idx === activeIndex
          return (
            <div key={step} className={`form-stepper-step${isCurrent ? ' current' : ''}${isDone ? ' completed' : ''}`}>
              <span className="form-stepper-track" />
              <span className="form-stepper-circle">
                {isDone ? <Check style={{ width: 13, height: 13 }} /> : idx + 1}
              </span>
              <span className="form-stepper-label">{step}</span>
            </div>
          )
        })}
      </div>

      <div className="form-progress-bar">
        <div className="form-progress-bar-fill" style={{ width: `${progressPercent}%` }} />
      </div>
    </>
  )
}
