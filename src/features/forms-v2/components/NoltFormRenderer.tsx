import { useState, useMemo } from 'react'
import { useForm, FormProvider } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Check, Loader2 } from 'lucide-react'
import {
  type NoltFormDefinition,
  calculateFormProgress,
} from '../domain/form-definition'
import { buildZodSchemaFromFormDefinition } from '../domain/form-schema-builder'
import { buildDefaultValues } from '../domain/form-default-values'
import { NoltFormHeader } from './NoltFormHeader'
import { NoltFormNav } from './NoltFormNav'
import { NoltFormSection } from './NoltFormSection'
import { Button } from '../../../components/ui/button'

interface NoltFormRendererProps {
  definition: NoltFormDefinition
  onSubmit?: (data: Record<string, unknown>) => void | Promise<void>
  onSaveDraft?: (data: Record<string, unknown>) => void
}

export function NoltFormRenderer({ definition, onSubmit, onSaveDraft }: NoltFormRendererProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activeSectionId, setActiveSectionId] = useState<string>(
    definition.sections[0]?.id || '',
  )
  const [isDraftSaved, setIsDraftSaved] = useState(false)

  // Dynamically build Zod schema from form definition
  const validationSchema = useMemo(
    () => buildZodSchemaFromFormDefinition(definition),
    [definition],
  )

  // Dynamically generate default values for form fields
  const defaultValues = useMemo(
    () => buildDefaultValues(definition),
    [definition],
  )

  const methods = useForm<Record<string, unknown>>({
    resolver: zodResolver(validationSchema),
    defaultValues,
    mode: 'onBlur',
  })

  const formValues = methods.watch()

  // Calculate completion progress
  const progressStats = useMemo(
    () => calculateFormProgress(definition, formValues),
    [definition, formValues],
  )

  const handleSelectSection = (sectionId: string) => {
    setActiveSectionId(sectionId)
    const element = document.getElementById(`section-${sectionId}`)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const handleFormSubmit = methods.handleSubmit(
    async (data) => {
      setIsSubmitting(true)
      try {
        if (onSubmit) {
          await onSubmit(data)
        }
      } finally {
        setIsSubmitting(false)
      }
    },
    (errors) => {
      // Scroll to first invalid field
      const firstErrorKey = Object.keys(errors)[0]
      if (firstErrorKey) {
        const firstErrorField = definition.sections
          .flatMap((s) => s.fields)
          .find((f) => f.key === firstErrorKey)

        if (firstErrorField) {
          const element = document.getElementById(firstErrorField.id)
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' })
            element.focus()
          }
        }
      }
    },
  )

  const handleDraftClick = () => {
    const currentValues = methods.getValues()
    if (onSaveDraft) {
      onSaveDraft(currentValues)
    }
    setIsDraftSaved(true)
    setTimeout(() => setIsDraftSaved(false), 3000)
  }

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleFormSubmit} className="space-y-8">
        {/* Form Header Card */}
        <NoltFormHeader definition={definition} progress={progressStats} />

        {/* 2-Column Application Shell Layout */}
        <div className="flex flex-col lg:flex-row gap-8 items-start">
          {/* Sticky Section Navigation */}
          <NoltFormNav
            sections={definition.sections}
            activeSectionId={activeSectionId}
            onSelectSection={handleSelectSection}
            formValues={formValues}
            progress={progressStats}
          />

          {/* Form Content Sections */}
          <main className="flex-1 w-full min-w-0">
            {definition.sections.map((section) => (
              <NoltFormSection key={section.id} section={section} />
            ))}

            {/* Sticky Action Bar */}
            <div className="sticky bottom-4 z-30 py-4 px-6 bg-white/95 backdrop-blur-md border border-gray-200/90 shadow-xl rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 mt-10">
              <div className="text-xs text-gray-500 text-center sm:text-left">
                {isDraftSaved ? (
                  <span className="text-emerald-600 font-semibold flex items-center gap-1.5">
                    <Check className="w-4 h-4" /> Draft saved successfully!
                  </span>
                ) : (
                  <span>All responses are validated dynamically before submission.</span>
                )}
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={handleDraftClick}
                  className="h-11 md:h-12 px-6 rounded-xl font-medium border-gray-300 text-gray-700 hover:bg-gray-50 flex-1 sm:flex-initial"
                >
                  Save Draft
                </Button>

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="h-11 md:h-12 px-8 rounded-xl font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20 flex-1 sm:flex-initial text-base flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Submitting...
                    </>
                  ) : (
                    'Submit Form'
                  )}
                </Button>
              </div>
            </div>
          </main>
        </div>
      </form>
    </FormProvider>
  )
}
