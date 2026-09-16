import React, { useEffect, useRef, useState } from 'react'
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

  if (field.type === 'section_heading') {
    return (
      <div className="field-section-heading">
        <h3>{field.label}</h3>
        {field.helpText && <p>{field.helpText}</p>}
      </div>
    )
  }

  if (field.type === 'paragraph') {
    return (
      <div className="field-note">
        <div className="field-note-title">{field.label}</div>
        {field.helpText && <div className="field-note-body">{field.helpText}</div>}
      </div>
    )
  }

  if (field.type === 'education_repeater') {
    return <EducationRepeaterField field={field} />
  }

  return (
    <div className={`dynamic-field${field.width === 'half' ? ' half' : ''}${errorMessage ? ' has-error' : ''}`}>
      <label htmlFor={`field-input-${field.id}`}>
        <span>{field.label}</span>
        {field.required && <span className="dynamic-field-required">*</span>}
      </label>

      {field.type === 'text' || field.type === 'email' || field.type === 'phone' || field.type === 'number' || field.type === 'date' ? (
        <input
          id={`field-input-${field.id}`}
          type={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
          placeholder={field.placeholder}
          {...register(field.name)}
        />
      ) : field.type === 'textarea' ? (
        <textarea
          id={`field-input-${field.id}`}
          rows={3}
          placeholder={field.placeholder}
          {...register(field.name)}
        />
      ) : field.type === 'select' ? (
        <CustomSelectControl field={field} control={control} errorMessage={errorMessage} />
      ) : field.type === 'yesno' ? (
        <SegmentedYesNoControl field={field} control={control} />
      ) : field.type === 'radio' ? (
        <RadioGroupCardsControl field={field} control={control} />
      ) : field.type === 'checkbox' ? (
        <Controller
          name={field.name}
          control={control}
          render={({ field: controllerField }) => (
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={!!controllerField.value}
                onChange={(e) => controllerField.onChange(e.target.checked)}
              />
              <span>{field.placeholder || field.label}</span>
            </label>
          )}
        />
      ) : field.type === 'file' ? (
        <FileUploadControl field={field} control={control} />
      ) : null}

      {field.helpText && !errorMessage && <div className="dynamic-field-hint">{field.helpText}</div>}
      {errorMessage && <div className="dynamic-field-error">{errorMessage}</div>}
    </div>
  )
}

const CustomSelectControl: React.FC<{ field: FormField; control: Control<FieldValues>; errorMessage?: string }> = ({
  field,
  control,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const options = field.options || []

  useEffect(() => {
    if (!isOpen) return
    const handlePointerDown = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [isOpen])

  return (
    <Controller
      name={field.name}
      control={control}
      render={({ field: controllerField }) => {
        const selectedOption = options.find((o) => o.value === controllerField.value)

        const openAt = (index: number) => {
          setHighlightedIndex(Math.max(0, Math.min(index, options.length - 1)))
          setIsOpen(true)
        }

        const handleTriggerKeyDown = (event: React.KeyboardEvent) => {
          if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            const currentIndex = selectedOption ? options.findIndex((o) => o.value === selectedOption.value) : 0
            openAt(currentIndex)
          }
        }

        const handlePopoverKeyDown = (event: React.KeyboardEvent) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setHighlightedIndex((i) => Math.min(i + 1, options.length - 1))
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            setHighlightedIndex((i) => Math.max(i - 1, 0))
          } else if (event.key === 'Enter') {
            event.preventDefault()
            const opt = options[highlightedIndex]
            if (opt) {
              controllerField.onChange(opt.value)
              setIsOpen(false)
            }
          } else if (event.key === 'Escape' || event.key === 'Tab') {
            setIsOpen(false)
          }
        }

        return (
          <div className="select-wrap" ref={wrapRef} onKeyDown={isOpen ? handlePopoverKeyDown : undefined}>
            <button
              type="button"
              id={`custom-select-trigger-${field.id}`}
              aria-haspopup="listbox"
              aria-expanded={isOpen}
              onClick={() => (isOpen ? setIsOpen(false) : openAt(selectedOption ? options.findIndex((o) => o.value === selectedOption.value) : 0))}
              onKeyDown={handleTriggerKeyDown}
              className={`select-trigger${selectedOption ? '' : ' placeholder'}`}
            >
              <span>{selectedOption ? selectedOption.label : field.placeholder || 'Select an option...'}</span>
              <ChevronDown style={{ width: 16, height: 16 }} />
            </button>

            {isOpen && (
              <div className="select-popover" role="listbox">
                {options.map((opt, index) => (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={controllerField.value === opt.value}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onClick={() => {
                      controllerField.onChange(opt.value)
                      setIsOpen(false)
                    }}
                    className={`select-option${controllerField.value === opt.value ? ' selected' : ''}${index === highlightedIndex ? ' highlighted' : ''}`}
                  >
                    <span>{opt.label}</span>
                    {controllerField.value === opt.value && <Check style={{ width: 14, height: 14 }} />}
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

const SegmentedYesNoControl: React.FC<{ field: FormField; control: Control<FieldValues> }> = ({
  field,
  control,
}) => {
  return (
    <Controller
      name={field.name}
      control={control}
      render={({ field: controllerField }) => (
        <div className="segmented-control">
          {['Yes', 'No'].map((opt) => {
            const isSelected = controllerField.value === opt
            return (
              <button
                key={opt}
                type="button"
                onClick={() => controllerField.onChange(opt)}
                className={`segmented-option${isSelected ? ' selected' : ''}`}
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

const RadioGroupCardsControl: React.FC<{ field: FormField; control: Control<FieldValues> }> = ({
  field,
  control,
}) => {
  return (
    <Controller
      name={field.name}
      control={control}
      render={({ field: controllerField }) => (
        <div className="radio-card-list">
          {(field.options || []).map((opt) => {
            const isSelected = controllerField.value === opt.value
            return (
              <label
                key={opt.value}
                onClick={() => controllerField.onChange(opt.value)}
                className={`radio-card${isSelected ? ' selected' : ''}`}
              >
                <span className="radio-card-dot" />
                <span className="radio-card-label">{opt.label}</span>
              </label>
            )
          })}
        </div>
      )}
    />
  )
}

const FileUploadControl: React.FC<{ field: FormField; control: Control<FieldValues> }> = ({
  field,
  control,
}) => {
  return (
    <Controller
      name={field.name}
      control={control}
      render={({ field: controllerField }) => (
        <div className={`file-dropzone${controllerField.value ? ' has-file' : ''}`}>
          <Upload className="file-dropzone-icon" style={{ width: 22, height: 22 }} />
          <div className="file-dropzone-title">
            {controllerField.value ? `File selected: ${controllerField.value.name || 'Passport_Photo.png'}` : 'Drag and drop your image here'}
          </div>
          <div className="file-dropzone-hint">PNG, JPG or PDF • Maximum 5 MB</div>

          <label className="file-dropzone-btn">
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

const EducationRepeaterField: React.FC<{ field: FormField }> = ({ field }) => {
  const { control, register } = useFormContext()
  const { fields, append, remove } = useFieldArray({
    control,
    name: field.name,
  })

  return (
    <div className="repeater-list">
      {fields.map((item, index) => (
        <div key={item.id} className="repeater-item">
          <div className="repeater-item-header">
            <span className="repeater-item-title">Education Record #{index + 1}</span>
            {fields.length > 1 && (
              <button type="button" onClick={() => remove(index)} className="repeater-remove-btn">
                <Trash2 style={{ width: 14, height: 14 }} /> Remove
              </button>
            )}
          </div>

          <div className="repeater-fields">
            <div className="repeater-field">
              <label>School / Institution *</label>
              <input
                type="text"
                placeholder="e.g. University of Lagos"
                {...register(`${field.name}.${index}.school_institution`)}
              />
            </div>
            <div className="repeater-field">
              <label>Qualification *</label>
              <input
                type="text"
                placeholder="e.g. B.Sc. Computer Science"
                {...register(`${field.name}.${index}.qualification`)}
              />
            </div>
            <div className="repeater-field">
              <label>Completion Date</label>
              <input type="date" {...register(`${field.name}.${index}.completion_date`)} />
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
        <Plus style={{ width: 16, height: 16 }} /> Add another education
      </button>
    </div>
  )
}
