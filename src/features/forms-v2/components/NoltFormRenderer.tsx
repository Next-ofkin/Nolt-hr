import { useState } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { NoltFormDefinition } from '../domain/form-definition'
import { buildZodSchemaFromFormDefinition } from '../domain/form-schema-builder'
import { buildDefaultValues } from '../domain/form-default-values'
import { NoltFormSection } from './NoltFormSection'
import { Card } from '../../../components/ui/card'
import { Button } from '../../../components/ui/button'

interface NoltFormRendererProps {
  definition: NoltFormDefinition
  initialValues?: Record<string, unknown>
  onSaveDraft?: (values: Record<string, unknown>) => void
  onSubmit: (values: Record<string, unknown>) => void
}

export function NoltFormRenderer({
  definition,
  initialValues,
  onSaveDraft,
  onSubmit,
}: NoltFormRendererProps) {
  const [submittedData, setSubmittedData] = useState<Record<string, unknown> | null>(null)

  const schema = buildZodSchemaFromFormDefinition(definition)
  const defaultValues = {
    ...buildDefaultValues(definition),
    ...initialValues,
  }

  const methods = useForm({
    resolver: zodResolver(schema),
    defaultValues,
    mode: 'onTouched',
  })

  const {
    handleSubmit,
    getValues,
    formState: { isSubmitting },
  } = methods

  const handleFormSubmit = (data: Record<string, unknown>) => {
    setSubmittedData(data)
    onSubmit(data)
  }

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(handleFormSubmit)} className="nolt-form-v2 max-w-3xl mx-auto space-y-6 font-sans text-gray-900 pb-12">
        {/* Polished Header Card */}
        <Card className="bg-white border rounded-xl shadow-sm border-t-4 border-t-blue-600 p-6 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-blue-900 uppercase tracking-widest">
            <div className="w-5 h-5 rounded bg-blue-900 text-white flex items-center justify-center text-[10px] font-extrabold">
              N
            </div>
            <span>NOLT FINANCE</span>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{definition.title}</h1>

          {definition.description && <p className="text-sm text-gray-600 leading-relaxed">{definition.description}</p>}

          {definition.instructions && (
            <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-md text-xs text-blue-950">
              <strong className="font-semibold block mb-0.5">Instructions:</strong>
              <span>{definition.instructions}</span>
            </div>
          )}

          <div className="pt-2 text-xs text-gray-500 border-t border-gray-100 flex items-center gap-1">
            <span className="text-red-500 font-bold">*</span>
            <span>Indicates required question</span>
          </div>
        </Card>

        {/* Render Form Sections */}
        {definition.sections.map((section) => (
          <NoltFormSection key={section.id} section={section} />
        ))}

        {/* Bottom Form Actions */}
        <Card className="bg-white border rounded-xl shadow-sm p-4 flex items-center justify-between">
          <div>
            {onSaveDraft && (
              <Button
                type="button"
                variant="outline"
                onClick={() => onSaveDraft(getValues())}
                className="text-xs h-9 px-4 text-gray-600"
              >
                Save Draft
              </Button>
            )}
          </div>
          <Button
            type="submit"
            disabled={isSubmitting}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-9 px-6 font-medium shadow-sm"
          >
            {isSubmitting ? 'Submitting...' : 'Submit Form'}
          </Button>
        </Card>

        {/* Dev Submitted Result Panel */}
        {submittedData && (
          <Card className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
            <h3 className="text-xs font-bold text-emerald-900 uppercase tracking-wide">
              ✓ Demo Submission Data Captured (RHF Validated)
            </h3>
            <pre className="text-[11px] font-mono bg-white p-3 border rounded text-emerald-950 overflow-x-auto max-h-60">
              {JSON.stringify(submittedData, null, 2)}
            </pre>
          </Card>
        )}
      </form>
    </FormProvider>
  )
}
