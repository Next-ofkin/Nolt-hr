import React, { useState } from 'react'
import { Controller, useFormContext, useFieldArray, useWatch } from 'react-hook-form'
import type { Control, FieldValues } from 'react-hook-form'
import type { FormField } from '../domain/form-schema'
import { Upload, Plus, Trash2, ChevronDown, Check } from 'lucide-react'

interface DynamicFieldProps {
  field: FormField
}

export const DynamicField: React.FC<DynamicFieldProps> = ({ field }) => {
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext()

  // Evaluate conditional visibility via useWatch
  const watchedValue = useWatch({
    control,
    name: field.visibleIf?.fieldName || '',
  })

  if (field.visibleIf) {
    if (watchedValue !== field.visibleIf.equalsValue) {
      return null
    }
  }

  const errorMessage = errors[field.name]?.message as string | undefined

  // Handle Section Heading
  if (field.type === 'section_heading') {
    return (
      <div style={{ width: '100%', marginTop: '1.25rem', marginBottom: '0.5rem', borderBottom: '1px solid var(--border, #e2e5ea)', paddingBottom: '0.4rem' }}>
        <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-strong, #0f172a)' }}>
          {field.label}
        </h3>
        {field.helpText && (
          <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted, #64748b)' }}>
            {field.helpText}
          </p>
        )}
      </div>
    )
  }

  // Handle Paragraph / Info Note
  if (field.type === 'paragraph') {
    return (
      <div
        style={{
          width: '100%',
          padding: '0.85rem 1rem',
          background: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: '8px',
          color: '#1e40af',
          fontSize: '0.9rem',
          lineHeight: 1.5,
        }}
      >
        <div style={{ fontWeight: 600 }}>{field.label}</div>
        {field.helpText && <div style={{ marginTop: '0.2rem', color: '#1e3a8a' }}>{field.helpText}</div>}
      </div>
    )
  }

  // Handle Education Repeater Group
  if (field.type === 'education_repeater') {
    return <EducationRepeaterField field={field} />
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.4rem',
        width: field.width === 'half' ? 'calc(50% - 0.5rem)' : '100%',
        minWidth: '260px',
        flexGrow: 1,
      }}
    >
      <label
        htmlFor={`field-input-${field.id}`}
        style={{
          fontSize: '0.9rem',
          fontWeight: 600,
          color: 'var(--text-strong, #0f172a)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.25rem',
        }}
      >
        <span>{field.label}</span>
        {field.required && <span style={{ color: 'var(--danger, #dc2626)', fontWeight: 700 }}>*</span>}
      </label>

      {/* Control implementations */}
      {field.type === 'text' || field.type === 'email' || field.type === 'phone' || field.type === 'number' || field.type === 'date' ? (
        <input
          id={`field-input-${field.id}`}
          type={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
          placeholder={field.placeholder}
          {...register(field.name)}
          style={{
            minHeight: '44px',
            fontSize: '16px',
            padding: '0.65rem 0.85rem',
            borderRadius: '8px',
            border: errorMessage ? '1px solid var(--danger, #dc2626)' : '1px solid var(--border, #e2e5ea)',
            background: 'var(--surface, #ffffff)',
            color: 'var(--text-strong, #0f172a)',
            width: '100%',
          }}
        />
      ) : field.type === 'textarea' ? (
        <textarea
          id={`field-input-${field.id}`}
          rows={3}
          placeholder={field.placeholder}
          {...register(field.name)}
          style={{
            fontSize: '16px',
            padding: '0.65rem 0.85rem',
            borderRadius: '8px',
            border: errorMessage ? '1px solid var(--danger, #dc2626)' : '1px solid var(--border, #e2e5ea)',
            background: 'var(--surface, #ffffff)',
            color: 'var(--text-strong, #0f172a)',
            width: '100%',
          }}
        />
      ) : field.type === 'select' ? (
        <CustomSelectControl field={field} control={control} errorMessage={errorMessage} />
      ) : field.type === 'yesno' ? (
        <SegmentedYesNoControl field={field} control={control} errorMessage={errorMessage} />
      ) : field.type === 'radio' ? (
        <RadioGroupCardsControl field={field} control={control} errorMessage={errorMessage} />
      ) : field.type === 'checkbox' ? (
        <Controller
          name={field.name}
          control={control}
          render={({ field: controllerField }) => (
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                cursor: 'pointer',
                padding: '0.65rem 0.85rem',
                borderRadius: '8px',
                border: errorMessage ? '1px solid var(--danger, #dc2626)' : '1px solid var(--border, #e2e5ea)',
                background: 'var(--surface, #ffffff)',
              }}
            >
              <input
                type="checkbox"
                checked={!!controllerField.value}
                onChange={(e) => controllerField.onChange(e.target.checked)}
                style={{ width: '18px', height: '18px', accentColor: 'var(--primary, #2563eb)' }}
              />
              <span style={{ fontSize: '0.9rem', color: 'var(--text-strong, #0f172a)' }}>
                {field.placeholder || field.label}
              </span>
            </label>
          )}
        />
      ) : field.type === 'file' ? (
        <FileUploadControl field={field} control={control} errorMessage={errorMessage} />
      ) : null}

      {field.helpText && !errorMessage && (
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted, #64748b)' }}>
          {field.helpText}
        </div>
      )}

      {errorMessage && (
        <div style={{ fontSize: '0.825rem', color: 'var(--danger, #dc2626)', marginTop: '0.1rem', fontWeight: 500 }}>
          {errorMessage}
        </div>
      )}
    </div>
  )
}

// Custom Select Component (No native HTML <select>)
const CustomSelectControl: React.FC<{ field: FormField; control: Control<FieldValues>; errorMessage?: string }> = ({
  field,
  control,
  errorMessage,
}) => {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <Controller
      name={field.name}
      control={control}
      render={({ field: controllerField }) => {
        const selectedOption = (field.options || []).find((o) => o.value === controllerField.value)
        return (
          <div style={{ position: 'relative', width: '100%' }}>
            <button
              type="button"
              id={`custom-select-trigger-${field.id}`}
              onClick={() => setIsOpen(!isOpen)}
              style={{
                width: '100%',
                minHeight: '44px',
                padding: '0.65rem 0.85rem',
                borderRadius: '8px',
                border: errorMessage ? '1px solid var(--danger, #dc2626)' : '1px solid var(--border, #e2e5ea)',
                background: 'var(--surface, #ffffff)',
                color: selectedOption ? 'var(--text-strong, #0f172a)' : 'var(--text-muted, #64748b)',
                fontSize: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span>{selectedOption ? selectedOption.label : field.placeholder || 'Select an option...'}</span>
              <ChevronDown style={{ width: '16px', height: '16px', color: 'var(--text-muted, #64748b)' }} />
            </button>

            {isOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 4px)',
                  left: 0,
                  right: 0,
                  zIndex: 50,
                  background: 'var(--surface, #ffffff)',
                  border: '1px solid var(--border, #e2e5ea)',
                  borderRadius: '8px',
                  boxShadow: '0 8px 24px rgba(15, 23, 42, 0.12)',
                  maxHeight: '220px',
                  overflowY: 'auto',
                  padding: '0.35rem',
                }}
              >
                {(field.options || []).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      controllerField.onChange(opt.value)
                      setIsOpen(false)
                    }}
                    style={{
                      width: '100%',
                      padding: '0.55rem 0.75rem',
                      border: 0,
                      borderRadius: '6px',
                      background: controllerField.value === opt.value ? '#eff6ff' : 'transparent',
                      color: controllerField.value === opt.value ? 'var(--primary, #2563eb)' : 'var(--text-strong, #0f172a)',
                      fontWeight: controllerField.value === opt.value ? 600 : 400,
                      fontSize: '0.9rem',
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>{opt.label}</span>
                    {controllerField.value === opt.value && <Check style={{ width: '14px', height: '14px' }} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      }}
    />
  )
}

// Segmented Yes/No Button Control
const SegmentedYesNoControl: React.FC<{ field: FormField; control: Control<FieldValues>; errorMessage?: string }> = ({
  field,
  control,
}) => {
  return (
    <Controller
      name={field.name}
      control={control}
      render={({ field: controllerField }) => (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', width: '100%' }}>
          {['Yes', 'No'].map((opt) => {
            const isSelected = controllerField.value === opt
            return (
              <button
                key={opt}
                type="button"
                onClick={() => controllerField.onChange(opt)}
                style={{
                  minHeight: '44px',
                  padding: '0.65rem',
                  borderRadius: '8px',
                  border: isSelected ? '2px solid var(--primary, #2563eb)' : '1px solid var(--border, #e2e5ea)',
                  background: isSelected ? '#eff6ff' : 'var(--surface, #ffffff)',
                  color: isSelected ? 'var(--primary, #2563eb)' : 'var(--text-strong, #0f172a)',
                  fontWeight: isSelected ? 700 : 500,
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {opt}
              </button>
            )
          })}
        </div>
      )}
    />
  )
}

// RadioGroup Cards Control
const RadioGroupCardsControl: React.FC<{ field: FormField; control: Control<FieldValues>; errorMessage?: string }> = ({
  field,
  control,
}) => {
  return (
    <Controller
      name={field.name}
      control={control}
      render={({ field: controllerField }) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
          {(field.options || []).map((opt) => {
            const isSelected = controllerField.value === opt.value
            return (
              <label
                key={opt.value}
                onClick={() => controllerField.onChange(opt.value)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  border: isSelected ? '2px solid var(--primary, #2563eb)' : '1px solid var(--border, #e2e5ea)',
                  background: isSelected ? '#eff6ff' : 'var(--surface, #ffffff)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <div
                  style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    border: isSelected ? '5px solid var(--primary, #2563eb)' : '2px solid #94a3b8',
                    background: '#ffffff',
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: '0.925rem', fontWeight: isSelected ? 600 : 500, color: 'var(--text-strong, #0f172a)' }}>
                  {opt.label}
                </span>
              </label>
            )
          })}
        </div>
      )}
    />
  )
}

// File Upload Drag & Drop Component
const FileUploadControl: React.FC<{ field: FormField; control: Control<FieldValues>; errorMessage?: string }> = ({
  field,
  control,
  errorMessage,
}) => {
  return (
    <Controller
      name={field.name}
      control={control}
      render={({ field: controllerField }) => (
        <div
          style={{
            border: errorMessage ? '2px dashed var(--danger, #dc2626)' : '2px dashed var(--border, #e2e5ea)',
            borderRadius: '10px',
            padding: '1.5rem 1rem',
            textAlign: 'center',
            background: controllerField.value ? '#f0fdf4' : '#fafafa',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <Upload style={{ width: '28px', height: '28px', color: 'var(--primary, #2563eb)', margin: '0 auto 0.5rem' }} />
          <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-strong, #0f172a)' }}>
            {controllerField.value ? `File selected: ${controllerField.value.name || 'Passport_Photo.png'}` : 'Drag file here or choose a file'}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted, #64748b)', marginTop: '0.2rem' }}>
            PNG, JPG or PDF • Maximum 5 MB
          </div>

          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: '0.85rem',
              padding: '0.45rem 0.9rem',
              borderRadius: '6px',
              background: 'var(--surface, #ffffff)',
              border: '1px solid var(--border, #e2e5ea)',
              fontSize: '0.85rem',
              fontWeight: 600,
              color: 'var(--text, #334155)',
              cursor: 'pointer',
            }}
          >
            Choose File
            <input
              type="file"
              accept="image/*,.pdf"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) {
                  controllerField.onChange(file)
                }
              }}
            />
          </label>
        </div>
      )}
    />
  )
}

// Education History Repeatable Field Component
const EducationRepeaterField: React.FC<{ field: FormField }> = ({ field }) => {
  const { control, register } = useFormContext()
  const { fields, append, remove } = useFieldArray({
    control,
    name: field.name,
  })

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
      {fields.map((item, index) => (
        <div
          key={item.id}
          style={{
            background: 'var(--surface, #ffffff)',
            border: '1px solid var(--border, #e2e5ea)',
            borderRadius: '10px',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.85rem',
            position: 'relative',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted, #64748b)' }}>
              Education Record #{index + 1}
            </span>
            {fields.length > 1 && (
              <button
                type="button"
                onClick={() => remove(index)}
                style={{ border: 0, background: 'transparent', color: '#dc2626', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.85rem' }}
              >
                <Trash2 style={{ width: '14px', height: '14px' }} /> Remove
              </button>
            )}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.85rem' }}>
            <div style={{ flex: '1 1 240px' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-strong, #0f172a)' }}>
                School / Institution *
              </label>
              <input
                type="text"
                placeholder="e.g. University of Lagos"
                {...register(`${field.name}.${index}.school_institution`)}
                style={{ minHeight: '44px', fontSize: '16px', width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border, #e2e5ea)' }}
              />
            </div>
            <div style={{ flex: '1 1 200px' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-strong, #0f172a)' }}>
                Qualification *
              </label>
              <input
                type="text"
                placeholder="e.g. B.Sc. Computer Science"
                {...register(`${field.name}.${index}.qualification`)}
                style={{ minHeight: '44px', fontSize: '16px', width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border, #e2e5ea)' }}
              />
            </div>
            <div style={{ flex: '1 1 160px' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-strong, #0f172a)' }}>
                Completion Date
              </label>
              <input
                type="date"
                {...register(`${field.name}.${index}.completion_date`)}
                style={{ minHeight: '44px', fontSize: '16px', width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border, #e2e5ea)' }}
              />
            </div>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() => append({ school_institution: '', qualification: '', completion_date: '' })}
        className="btn btn-ghost"
        style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
      >
        <Plus style={{ width: '16px', height: '16px' }} /> Add another education
      </button>
    </div>
  )
}
