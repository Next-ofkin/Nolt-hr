import type { FormField, FormVersion } from '../lib/database.types'
import type { ChoiceOption } from '../lib/form-builder-domain'

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
  presentation,
  selectedFieldId,
  onSelectField,
  flaggedFieldIds,
}: FormDocumentRendererProps) {
  const config: PresentationConfig = {
    mode: 'STANDARD',
    showHeader: true,
    showFooter: true,
    paperSize: 'A4',
    ...presentation,
    ...((version.presentation_config as Record<string, unknown>) || {}),
  }

  const mode = config.mode || 'STANDARD'
  const flaggedSet = new Set(Array.isArray(flaggedFieldIds) ? flaggedFieldIds : Array.from(flaggedFieldIds || []))

  // Separate header-aside fields (e.g. passport photo) from standard flow fields
  const headerAsideFields = fields.filter((f) => {
    const fieldConfig = (f.configuration as Record<string, unknown>) || {}
    const layout = (fieldConfig.layout as Record<string, unknown>) || {}
    return layout.placement === 'header_aside' || fieldConfig.displayVariant === 'photo'
  })

  const flowFields = fields.filter((f) => !headerAsideFields.includes(f))

  return (
    <div className={`form-document-container mode-${mode.toLowerCase()} bg-white p-8 rounded-lg shadow-sm border space-y-6`}>
      {/* Optional NOLT Brand Header Banner */}
      {config.showHeader && (
        <div className="flex items-center justify-between border-b pb-4 border-blue-900/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-blue-900 text-white font-bold flex items-center justify-center text-lg tracking-wider">
              NOLT
            </div>
            <div>
              <span className="font-bold text-gray-900 block text-base leading-tight">NOLT Financial Services</span>
              <span className="text-xs text-gray-500 uppercase tracking-widest block">HR Employee Portal</span>
            </div>
          </div>
          <div className="text-right text-xs text-gray-400 font-mono">
            <span>Doc Ref: NOLT-HR-{version.version_number}</span>
          </div>
        </div>
      )}

      {/* Document Header Title Block with optional Header-Aside Photo Area */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start pb-4 border-b">
        <div className={headerAsideFields.length > 0 ? 'md:col-span-9 space-y-2' : 'md:col-span-12 space-y-2'}>
          <h1 className="text-2xl font-extrabold text-gray-900 uppercase tracking-tight">{version.title}</h1>
          {version.description && <p className="text-sm text-gray-600">{version.description}</p>}
          {version.instructions && (
            <div className="p-3 bg-blue-50/70 border border-blue-100 rounded text-xs text-blue-900">
              <strong className="font-semibold">Instructions:</strong> {version.instructions}
            </div>
          )}
        </div>

        {headerAsideFields.length > 0 && (
          <div className="md:col-span-3 flex justify-end">
            {headerAsideFields.map((field) => (
              <div
                key={field.id}
                className={`cursor-pointer transition-all ${selectedFieldId === field.id ? 'ring-2 ring-blue-600 rounded' : ''}`}
                onClick={(e) => {
                  if (onSelectField) {
                    e.stopPropagation()
                    onSelectField(field.id)
                  }
                }}
              >
                {renderPassportPhotoField(field, flaggedSet.has(field.id))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Grid Layout Canvas */}
      <div className="grid grid-cols-12 gap-4 items-start">
        {flowFields.length === 0 ? (
          <div className="col-span-12 py-12 text-center text-gray-400 border border-dashed rounded-lg">
            <p className="text-sm">No fields in this document canvas yet.</p>
          </div>
        ) : (
          flowFields.map((field) => {
            const fieldConfig = (field.configuration as Record<string, unknown>) || {}
            const layout = (fieldConfig.layout as Record<string, unknown>) || {}
            const span = (layout.span as number) || 12
            const isSelected = selectedFieldId === field.id
            const isFlagged = flaggedSet.has(field.id)

            const spanClass = span === 4 ? 'col-span-12 md:col-span-4' : span === 6 ? 'col-span-12 md:col-span-6' : 'col-span-12'

            return (
              <div
                key={field.id}
                className={`document-field-wrapper ${spanClass} ${layout.newRow ? 'clear-both' : ''} p-2 rounded-md transition-all relative ${
                  isSelected
                    ? 'ring-2 ring-blue-600 bg-blue-50/20'
                    : isFlagged
                    ? 'ring-1 ring-amber-400 bg-amber-50/20'
                    : 'hover:bg-gray-50/70'
                } ${onSelectField ? 'cursor-pointer' : ''}`}
                onClick={(e) => {
                  if (onSelectField) {
                    e.stopPropagation()
                    onSelectField(field.id)
                  }
                }}
              >
                {/* Header Flag Badges */}
                <div className="flex items-center gap-1 absolute top-1 right-2 z-10">
                  {isFlagged && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                      Needs Review
                    </span>
                  )}
                  {fieldConfig.dataClassification === 'SENSITIVE_HEALTH' && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-800 border border-red-200">
                      Health
                    </span>
                  )}
                  {fieldConfig.dataClassification === 'SENSITIVE_FINANCIAL' && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-100 text-green-800 border border-green-200">
                      Financial
                    </span>
                  )}
                </div>

                {renderSingleField(field)}
              </div>
            )
          })
        )}
      </div>

      {/* Footer Banner for AGREEMENT & DOCUMENT Modes */}
      {config.showFooter && mode !== 'STANDARD' && (
        <div className="flex items-center justify-between border-t pt-4 text-xs text-gray-400">
          <p>NOLT HR Employee Portal — Official Internal Document</p>
          <span>Page 1 of 1</span>
        </div>
      )}
    </div>
  )
}

function renderPassportPhotoField(field: FormField, isFlagged: boolean) {
  return (
    <div className={`w-32 h-40 border-2 border-dashed rounded-md flex flex-col items-center justify-center p-2 text-center bg-gray-50 ${isFlagged ? 'border-amber-400 bg-amber-50/40' : 'border-gray-300'}`}>
      <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-400 mb-1">
        📷
      </div>
      <span className="text-[11px] font-semibold text-gray-700 leading-tight">
        {field.label || 'Attach Photo'}
      </span>
      <span className="text-[9px] text-gray-400 mt-1 uppercase">Passport Size</span>
    </div>
  )
}

function renderSingleField(field: FormField) {
  const config = (field.configuration as Record<string, unknown>) || {}
  const options = (config.options as ChoiceOption[]) || []
  const isContentField = ['HEADING', 'PARAGRAPH', 'DIVIDER'].includes(field.field_type)
  const visibilityRule = (config.visibilityRule as Record<string, unknown>) || null

  if (field.field_type === 'HEADING') {
    return (
      <div className="border-b border-gray-900/10 pb-1 mt-2 mb-1">
        <h2 className="text-sm font-bold text-blue-950 uppercase tracking-wide">
          {field.label || String(config.content || 'Section Heading')}
        </h2>
      </div>
    )
  }

  if (field.field_type === 'PARAGRAPH') {
    return (
      <div className="text-xs text-gray-700 leading-relaxed py-1">
        <p>{String(config.content || field.label || 'Paragraph copy text goes here.')}</p>
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
    <div className="space-y-1">
      {!isContentField && (
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-gray-800 block">
            {field.label || <em className="text-gray-400">Unlabeled Field</em>}
            {field.required && <span className="text-red-500 ml-0.5">*</span>}
          </label>
        </div>
      )}
      {field.description && <p className="text-[11px] text-gray-500">{field.description}</p>}

      {visibilityRule && (
        <div className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded inline-block">
          Shown when [{String(visibilityRule.fieldKey)}] = {String(visibilityRule.value)}
        </div>
      )}

      <div>
        {field.field_type === 'SHORT_TEXT' && (
          <input type="text" className="w-full h-8 px-2 text-xs border rounded bg-gray-50/50 text-gray-700" placeholder={field.placeholder || ''} disabled />
        )}

        {field.field_type === 'LONG_TEXT' && (
          <textarea className="w-full p-2 text-xs border rounded bg-gray-50/50 text-gray-700" rows={2} placeholder={field.placeholder || ''} disabled />
        )}

        {field.field_type === 'EMAIL' && (
          <input type="email" className="w-full h-8 px-2 text-xs border rounded bg-gray-50/50 text-gray-700" placeholder={field.placeholder || 'user@nolt.com'} disabled />
        )}

        {field.field_type === 'PHONE' && (
          <input type="tel" className="w-full h-8 px-2 text-xs border rounded bg-gray-50/50 text-gray-700" placeholder={field.placeholder || '+234 800 000 0000'} disabled />
        )}

        {field.field_type === 'NUMBER' && (
          <input type="number" className="w-full h-8 px-2 text-xs border rounded bg-gray-50/50 text-gray-700" placeholder={field.placeholder || '0'} disabled />
        )}

        {field.field_type === 'DATE' && (
          <input type="date" className="w-full h-8 px-2 text-xs border rounded bg-gray-50/50 text-gray-700" disabled />
        )}

        {field.field_type === 'DROPDOWN' && (
          <select className="w-full h-8 px-2 text-xs border rounded bg-gray-50/50 text-gray-700" disabled>
            <option value="">-- Select option --</option>
            {options.map((opt, idx) => (
              <option key={idx} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        )}

        {field.field_type === 'RADIO' && (
          <div className="flex flex-wrap gap-3 pt-1">
            {options.map((opt, idx) => (
              <label key={idx} className="flex items-center gap-1.5 text-xs text-gray-700">
                <input type="radio" disabled />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        )}

        {field.field_type === 'CHECKBOX' && (
          <div className="flex flex-wrap gap-3 pt-1">
            {options.map((opt, idx) => (
              <label key={idx} className="flex items-center gap-1.5 text-xs text-gray-700">
                <input type="checkbox" disabled />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        )}

        {field.field_type === 'YES_NO' && (
          <div className="flex items-center gap-4 pt-1">
            <label className="flex items-center gap-1 text-xs text-gray-700">
              <input type="radio" disabled />
              <span>Yes</span>
            </label>
            <label className="flex items-center gap-1 text-xs text-gray-700">
              <input type="radio" disabled />
              <span>No</span>
            </label>
          </div>
        )}

        {field.field_type === 'FILE_UPLOAD' && config.displayVariant !== 'photo' && (
          <div className="border border-dashed rounded p-3 text-center bg-gray-50 text-xs text-gray-500">
            <span>📄 Drag file to upload or click to select</span>
          </div>
        )}

        {field.field_type === 'SIGNATURE' && (
          <div className="border rounded p-2 bg-gray-50 space-y-1">
            <div className="h-12 border border-dashed rounded bg-white flex items-center justify-center text-[10px] text-gray-400">
              Sign here for: {String(config.signerRole || 'Employee')}
            </div>
          </div>
        )}

        {field.field_type === 'REPEATING_GROUP' && (
          <div className="border rounded overflow-hidden">
            <table className="w-full text-left text-[11px] border-collapse">
              <thead className="bg-gray-100 text-gray-600 border-b">
                <tr>
                  {(((config.columns as Array<{ name: string }>) || [{ name: 'Entry' }])).map((col, cIdx) => (
                    <th key={cIdx} className="p-1.5 font-medium">{col.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  {(((config.columns as Array<{ name: string }>) || [{ name: 'Entry' }])).map((_, cIdx) => (
                    <td key={cIdx} className="p-1.5">
                      <input type="text" className="w-full h-6 px-1 text-[10px] border rounded" disabled placeholder="Data" />
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
