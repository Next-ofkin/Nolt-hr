import type { NoltFormSectionDefinition } from '../domain/form-definition'
import { NoltFormField } from './NoltFormField'
import { Card } from '../../../components/ui/card'

interface NoltFormSectionProps {
  section: NoltFormSectionDefinition
}

export function NoltFormSection({ section }: NoltFormSectionProps) {
  return (
    <Card className="bg-white border rounded-xl shadow-sm p-6 space-y-6">
      <div className="border-b pb-3 space-y-1">
        <h2 className="text-lg font-bold text-gray-900">{section.title}</h2>
        {section.description && <p className="text-xs text-gray-500">{section.description}</p>}
      </div>

      <div className="space-y-6">
        {section.fields.map((field) => {
          const span = field.layout?.span || 12
          const spanClass =
            span === 4
              ? 'w-full md:w-[calc(33.333%-0.75rem)] inline-block align-top'
              : span === 6
              ? 'w-full md:w-[calc(50%-0.5rem)] inline-block align-top'
              : 'w-full block'

          return (
            <div key={field.id} className={`form-field-wrapper ${spanClass} p-2 rounded-lg`}>
              <NoltFormField field={field} />
            </div>
          )
        })}
      </div>
    </Card>
  )
}
