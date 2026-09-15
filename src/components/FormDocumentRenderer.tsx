import type { FormField, FormVersion } from '../lib/database.types'
import { groupFieldsIntoSections, type ChoiceOption } from '../lib/form-builder-domain'
import { Card } from './ui/card'
import { Button } from './ui/button'

export interface PresentationConfig {
  mode?: 'STANDARD' | 'DOCUMENT' | 'AGREEMENT'
  brandStyle?: string
  showHeader?: boolean
  showFooter?: boolean
  paperSize?: string
  contentWidth?: string
}

interface FormDocumentRendererProps {
  version: FormVersion
  fields: FormField[]
  presentation?: PresentationConfig
  readOnly?: boolean
  selectedFieldId?: string | null
  onSelectField?: (fieldId: string) => void
  onValuesChange?: (values: Record<string, unknown>) => void
  flaggedFieldIds?: Set<string> | string[]
}

export function FormDocumentRenderer({
  version,
  fields,
  selectedFieldId,
  onSelectField,
  flaggedFieldIds,
}: FormDocumentRendererProps) {
  const flaggedSet = new Set(Array.isArray(flaggedFieldIds) ? flaggedFieldIds : Array.from(flaggedFieldIds || []))
  const sections = groupFieldsIntoSections(fields)

  return (
    <div className="nolt-form-renderer max-w-3xl mx-auto space-y-6 font-sans text-gray-900 pb-12">
      {/* Polished Header Card with subtle top NOLT blue accent border */}
      <Card className="bg-white border rounded-xl shadow-sm border-t-4 border-t-blue-600 p-6 space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-blue-900 uppercase tracking-widest">
          <div className="w-5 h-5 rounded bg-blue-900 text-white flex items-center justify-center text-[10px] font-extrabold">
            N
          </div>
          <span>NOLT FINANCE</span>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{version.title || 'Untitled Form'}</h1>

        {version.description && <p className="text-sm text-gray-600 leading-relaxed">{version.description}</p>}

        {version.instructions && (
          <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-md text-xs text-blue-950">
            <strong className="font-semibold block mb-0.5">Instructions:</strong>
            <span>{version.instructions}</span>
          </div>
        )}

        <div className="pt-2 text-xs text-gray-500 border-t border-gray-100 flex items-center gap-1">
          <span className="text-red-500 font-bold">*</span>
          <span>Indicates required question</span>
        </div>
      </Card>

      {/* Form Section Cards */}
      {sections.length === 0 ? (
        <Card className="p-12 text-center text-gray-400 border border-dashed rounded-xl bg-white">
          <p className="text-sm">No questions in this form yet.</p>
        </Card>
      ) : (
        sections.map((section) => (
          <Card key={section.id} className="bg-white border rounded-xl shadow-sm p-6 space-y-6">
            <div className="border-b pb-3 space-y-1">
              <h2 className="text-lg font-bold text-gray-900">{section.title}</h2>
              {section.description && <p className="text-xs text-gray-500">{section.description}</p>}
            </div>

            <div className="space-y-6">
              {section.fields.map((field) => {
                const fieldConfig = (field.configuration as Record<string, unknown>) || {}
                const layout = (fieldConfig.layout as Record<string, unknown>) || {}
                const span = (layout.span as number) || 12
                const isSelected = selectedFieldId === field.id
                const isFlagged = flaggedSet.has(field.id)

                const spanClass =
                  span === 4
                    ? 'w-full md:w-[calc(33.333%-0.75rem)] inline-block align-top'
                    : span === 6
                    ? 'w-full md:w-[calc(50%-0.5rem)] inline-block align-top'
                    : 'w-full block'

                return (
                  <div
                    key={field.id}
                    className={`form-field-wrapper ${spanClass} p-3 rounded-lg transition-all relative ${
                      isSelected
                        ? 'ring-2 ring-blue-600 bg-blue-50/20'
                        : isFlagged
                        ? 'ring-1 ring-amber-400 bg-amber-50/20'
                        : 'hover:bg-gray-50/50'
                    } ${onSelectField ? 'cursor-pointer' : ''}`}
                    onClick={(e) => {
                      if (onSelectField) {
                        e.stopPropagation()
                        onSelectField(field.id)
                      }
                    }}
                  >
                    {/* HR Review Flag Badge only when interactive inspector is active */}
                    {onSelectField && isFlagged && (
                      <div className="absolute top-2 right-2 z-10">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                          Needs Review
                        </span>
                      </div>
                    )}

                    {renderFieldComponent(field)}
                  </div>
                )
              })}
            </div>
          </Card>
        ))
      )}

      {/* Bottom Form Actions Bar */}
      <Card className="bg-white border rounded-xl shadow-sm p-4 flex items-center justify-between">
        <Button variant="outline" className="text-xs h-9 px-4 text-gray-600">
          Save Draft
        </Button>
        <Button className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-9 px-6 font-medium shadow-sm">
          Submit Form
        </Button>
      </Card>
    </div>
  )
}

function renderFieldComponent(field: FormField) {
  const config = (field.configuration as Record<string, unknown>) || {}
  const options = (config.options as ChoiceOption[]) || []
  const isContentField = ['HEADING', 'PARAGRAPH', 'DIVIDER'].includes(field.field_type)

  if (field.field_type === 'PARAGRAPH') {
    return (
      <div className="text-sm text-gray-600 leading-relaxed py-1">
        <p>{String(config.content || field.label || '')}</p>
      </div>
    )
  }

  if (field.field_type === 'DIVIDER') {
    return (
      <div className="py-2">
        <hr className="border-gray-200" />
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {!isContentField && (
        <div>
          <label className="text-sm font-semibold text-gray-900 block">
            {field.label || <em className="text-gray-400">Unlabeled Question</em>}
            {field.required && <span className="text-red-500 ml-1 font-bold">*</span>}
          </label>
          {field.description && <p className="text-xs text-gray-500 mt-0.5">{field.description}</p>}
        </div>
      )}

      <div>
        {field.field_type === 'SHORT_TEXT' && (
          <input
            type="text"
            className="w-full h-10 px-3 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent shadow-sm"
            placeholder={field.placeholder || 'Your answer'}
            disabled
          />
        )}

        {field.field_type === 'LONG_TEXT' && (
          <textarea
            className="w-full p-3 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent shadow-sm"
            rows={3}
            placeholder={field.placeholder || 'Your answer'}
            disabled
          />
        )}

        {field.field_type === 'EMAIL' && (
          <input
            type="email"
            className="w-full h-10 px-3 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent shadow-sm"
            placeholder={field.placeholder || 'name@example.com'}
            disabled
          />
        )}

        {field.field_type === 'PHONE' && (
          <input
            type="tel"
            className="w-full h-10 px-3 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent shadow-sm"
            placeholder={field.placeholder || '+234 800 000 0000'}
            disabled
          />
        )}

        {field.field_type === 'NUMBER' && (
          <input
            type="number"
            className="w-full h-10 px-3 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent shadow-sm"
            placeholder={field.placeholder || '0'}
            disabled
          />
        )}

        {field.field_type === 'DATE' && (
          <input
            type="date"
            className="w-full h-10 px-3 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent shadow-sm"
            disabled
          />
        )}

        {field.field_type === 'DROPDOWN' && (
          <select
            className="w-full h-10 px-3 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent shadow-sm"
            disabled
          >
            <option value="">Choose option</option>
            {options.map((opt, idx) => (
              <option key={idx} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        )}

        {field.field_type === 'RADIO' && (
          <div className="space-y-2 pt-1">
            {options.map((opt, idx) => (
              <label key={idx} className="flex items-center gap-2.5 text-sm text-gray-700 cursor-pointer">
                <input type="radio" name={field.id} className="w-4 h-4 text-blue-600 border-gray-300" disabled />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        )}

        {field.field_type === 'CHECKBOX' && (
          <div className="space-y-2 pt-1">
            {options.map((opt, idx) => (
              <label key={idx} className="flex items-center gap-2.5 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded text-blue-600 border-gray-300" disabled />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        )}

        {field.field_type === 'YES_NO' && (
          <div className="flex items-center gap-6 pt-1">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="radio" name={field.id} className="w-4 h-4 text-blue-600 border-gray-300" disabled />
              <span>Yes</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="radio" name={field.id} className="w-4 h-4 text-blue-600 border-gray-300" disabled />
              <span>No</span>
            </label>
          </div>
        )}

        {field.field_type === 'FILE_UPLOAD' && (
          <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center bg-gray-50/50 hover:bg-gray-50 transition-colors space-y-1">
            <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-1 text-base">
              📄
            </div>
            <span className="text-sm font-semibold text-gray-700 block">Click to upload or drag file here</span>
            <span className="text-xs text-gray-400 block">PNG, JPG, or PDF up to 5MB</span>
          </div>
        )}

        {field.field_type === 'SIGNATURE' && (
          <div className="border border-dashed border-gray-300 rounded-xl p-4 bg-gray-50/50 space-y-2">
            <div className="h-20 border rounded-lg bg-white flex items-center justify-center text-xs text-gray-400 italic">
              Draw signature or click to sign ({String(config.signerRole || 'Employee')})
            </div>
          </div>
        )}

        {field.field_type === 'REPEATING_GROUP' && (
          <div className="space-y-3">
            <div className="border rounded-xl p-4 bg-slate-50/60 space-y-3">
              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Item 1</span>
                <button className="text-xs text-red-500 hover:underline">Remove</button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(((config.columns as Array<{ name: string }>) || [{ name: 'Entry' }])).map((col, cIdx) => (
                  <div key={cIdx} className="space-y-1">
                    <label className="text-xs font-medium text-gray-700">{col.name}</label>
                    <input
                      type="text"
                      className="w-full h-8 px-2.5 text-xs border rounded-md bg-white border-gray-300"
                      placeholder={`Enter ${col.name.toLowerCase()}`}
                      disabled
                    />
                  </div>
                ))}
              </div>
            </div>
            <Button variant="outline" size="sm" className="w-full text-xs text-blue-600 border-blue-200 hover:bg-blue-50">
              + Add another item
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
