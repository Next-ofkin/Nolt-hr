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
}

export function FormDocumentRenderer({
  version,
  fields,
  presentation,
  selectedFieldId,
  onSelectField,
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

  return (
    <div className={`form-document-container mode-${mode.toLowerCase()}`}>
      {/* Optional NOLT Brand Header Banner */}
      {config.showHeader && (
        <div className="nolt-document-header">
          <div className="brand-logo-area">
            <span className="brand-badge">NOLT</span>
            <span className="brand-title">NOLT Financial Services</span>
          </div>
          <div className="document-meta-code">
            <span>Doc Ref: NOLT-HR-{version.version_number}</span>
          </div>
        </div>
      )}

      {/* Document Header Title & Instructions */}
      <div className="document-title-block">
        <h1 className="document-main-title">{version.title}</h1>
        {version.description && <p className="document-subtitle">{version.description}</p>}
        {version.instructions && (
          <div className="document-instructions-box">
            <strong>Instructions:</strong> {version.instructions}
          </div>
        )}
      </div>

      {/* Grid Layout Canvas */}
      <div className="document-grid-layout">
        {fields.length === 0 ? (
          <div className="empty-document-placeholder">
            <p>No fields in this document canvas yet.</p>
          </div>
        ) : (
          fields.map((field) => {
            const fieldConfig = (field.configuration as Record<string, unknown>) || {}
            const layout = (fieldConfig.layout as Record<string, unknown>) || {}
            const span = (layout.span as number) || 12
            const isSelected = selectedFieldId === field.id

            const spanClass = span === 4 ? 'col-span-4' : span === 6 ? 'col-span-6' : 'col-span-12'

            return (
              <div
                key={field.id}
                className={`document-field-wrapper ${spanClass} ${isSelected ? 'selected-field-frame' : ''}`}
                onClick={(e) => {
                  if (onSelectField) {
                    e.stopPropagation()
                    onSelectField(field.id)
                  }
                }}
              >
                {renderSingleField(field)}
              </div>
            )
          })
        )}
      </div>

      {/* Footer Banner for AGREEMENT & DOCUMENT Modes */}
      {config.showFooter && mode !== 'STANDARD' && (
        <div className="nolt-document-footer">
          <p>NOLT HR Employee Portal — Official Internal Document</p>
          <span>Page 1 of 1</span>
        </div>
      )}
    </div>
  )
}

function renderSingleField(field: FormField) {
  const config = (field.configuration as Record<string, unknown>) || {}
  const options = (config.options as ChoiceOption[]) || []
  const isContentField = ['HEADING', 'PARAGRAPH', 'DIVIDER'].includes(field.field_type)

  if (field.field_type === 'HEADING') {
    return (
      <div className="document-heading-block">
        <h2>{field.label || String(config.content || 'Section Heading')}</h2>
      </div>
    )
  }

  if (field.field_type === 'PARAGRAPH') {
    return (
      <div className="document-paragraph-block">
        <p>{String(config.content || field.label || 'Paragraph copy text goes here.')}</p>
      </div>
    )
  }

  if (field.field_type === 'DIVIDER') {
    return (
      <div className="document-divider-block">
        <hr />
      </div>
    )
  }

  return (
    <div className="document-input-block">
      {!isContentField && (
        <label className="document-field-label">
          {field.label || <em>Unlabeled Field</em>}
          {field.required && <span className="required-star">*</span>}
        </label>
      )}
      {field.description && <p className="document-field-desc">{field.description}</p>}

      <div className="document-input-control">
        {field.field_type === 'SHORT_TEXT' && (
          <input type="text" className="input" placeholder={field.placeholder || ''} disabled />
        )}

        {field.field_type === 'LONG_TEXT' && (
          <textarea className="input" rows={3} placeholder={field.placeholder || ''} disabled />
        )}

        {field.field_type === 'EMAIL' && (
          <input type="email" className="input" placeholder={field.placeholder || 'user@nolt.com'} disabled />
        )}

        {field.field_type === 'PHONE' && (
          <input type="tel" className="input" placeholder={field.placeholder || '+234 800 000 0000'} disabled />
        )}

        {field.field_type === 'NUMBER' && (
          <input type="number" className="input" placeholder={field.placeholder || '0'} disabled />
        )}

        {field.field_type === 'DATE' && <input type="date" className="input" disabled />}

        {field.field_type === 'DROPDOWN' && (
          <select className="input" disabled>
            <option value="">-- Select option --</option>
            {options.map((opt, idx) => (
              <option key={idx} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        )}

        {field.field_type === 'RADIO' && (
          <div className="document-choices-list">
            {options.map((opt, idx) => (
              <label key={idx} className="document-choice-item">
                <input type="radio" disabled />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        )}

        {field.field_type === 'CHECKBOX' && (
          <div className="document-choices-list">
            {options.map((opt, idx) => (
              <label key={idx} className="document-choice-item">
                <input type="checkbox" disabled />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        )}

        {field.field_type === 'YES_NO' && (
          <div className="document-choices-list flex-row">
            <label className="document-choice-item">
              <input type="radio" disabled />
              <span>Yes</span>
            </label>
            <label className="document-choice-item">
              <input type="radio" disabled />
              <span>No</span>
            </label>
          </div>
        )}

        {field.field_type === 'FILE_UPLOAD' && (
          <div className="document-upload-dropzone">
            <div className="upload-icon">📄</div>
            <p className="upload-title">Click or drag file to upload</p>
            <span className="upload-meta">
              Allowed: {String(config.allowedTypes || 'PDF, DOCX, PNG')} (Max: {String(config.maxSizeMb || 10)}MB)
            </span>
          </div>
        )}

        {field.field_type === 'SIGNATURE' && (
          <div className="document-signature-box">
            <div className="signature-pad-preview">
              <span className="signature-placeholder-text">Sign here for: {String(config.signerRole || 'Employee')}</span>
            </div>
            <div className="signature-meta-row">
              <span>Role: {String(config.signerRole || 'Employee')}</span>
              <button type="button" className="btn btn-ghost btn-sm" disabled>Clear</button>
            </div>
          </div>
        )}

        {field.field_type === 'REPEATING_GROUP' && (
          <div className="document-repeating-table-container">
            <table className="table table-bordered repeating-table">
              <thead>
                <tr>
                  {(((config.columns as Array<{ label: string }>) || [])).map((col, cIdx) => (
                    <th key={cIdx}>{col.label}</th>
                  ))}
                  <th style={{ width: '40px' }}></th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  {(((config.columns as Array<{ label: string }>) || [])).map((_, cIdx) => (
                    <td key={cIdx}>
                      <input type="text" className="input input-sm" disabled placeholder="Data" />
                    </td>
                  ))}
                  <td>
                    <button type="button" className="btn-icon danger" disabled>✕</button>
                  </td>
                </tr>
              </tbody>
            </table>
            <button type="button" className="btn btn-ghost btn-sm mt-2" disabled>+ Add Row</button>
          </div>
        )}
      </div>
    </div>
  )
}
