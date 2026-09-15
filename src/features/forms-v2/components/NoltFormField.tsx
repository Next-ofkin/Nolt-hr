import React, { useState } from 'react'
import { Controller, useFormContext, useWatch } from 'react-hook-form'
import type { NoltFormFieldDefinition } from '../domain/form-definition'
import { NoltRepeatingGroup } from './NoltRepeatingGroup'
import { Input } from '../../../components/ui/input'
import { Textarea } from '../../../components/ui/textarea'
import { Label } from '../../../components/ui/label'

interface NoltFormFieldProps {
  field: NoltFormFieldDefinition
}

export function NoltFormField({ field }: NoltFormFieldProps) {
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext()

  const [selectedFileName, setSelectedFileName] = useState<string | null>(null)
  const [selectedFileSize, setSelectedFileSize] = useState<string | null>(null)

  // RHF useWatch for conditional visibility rules
  const watchedValue = useWatch({
    control,
    name: field.visibilityRule?.fieldKey || '',
  })

  if (field.visibilityRule) {
    const isVisible = String(watchedValue) === String(field.visibilityRule.value)
    if (!isVisible) {
      return null
    }
  }

  if (field.type === 'HEADING') {
    return null
  }

  if (field.type === 'PARAGRAPH') {
    return (
      <div className="text-sm text-gray-600 leading-relaxed py-1">
        <p>{field.content || field.label}</p>
      </div>
    )
  }

  if (field.type === 'DIVIDER') {
    return (
      <div className="py-2">
        <hr className="border-t border-gray-200" />
      </div>
    )
  }

  if (field.type === 'REPEATING_GROUP') {
    return <NoltRepeatingGroup field={field} />
  }

  const fieldError = errors[field.key]
  const errorMessage = typeof fieldError?.message === 'string' ? fieldError.message : null
  const fieldErrorId = `${field.id}-error`
  const fieldDescId = `${field.id}-desc`
  const describedBy = [
    errorMessage ? fieldErrorId : null,
    field.description ? fieldDescId : null,
  ]
    .filter(Boolean)
    .join(' ') || undefined

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={field.id} className="text-sm font-medium text-gray-900 flex items-center gap-1">
          <span>{field.label}</span>
          {field.required && <span className="text-red-500 font-semibold" aria-hidden="true">*</span>}
        </Label>
      </div>

      {field.description && (
        <p id={fieldDescId} className="text-xs text-gray-500">
          {field.description}
        </p>
      )}

      <div>
        {field.type === 'SHORT_TEXT' && (
          <Input
            id={field.id}
            type="text"
            placeholder={field.placeholder}
            aria-invalid={Boolean(fieldError)}
            aria-describedby={describedBy}
            {...register(field.key)}
          />
        )}

        {field.type === 'EMAIL' && (
          <Input
            id={field.id}
            type="email"
            placeholder={field.placeholder || 'name@example.com'}
            aria-invalid={Boolean(fieldError)}
            aria-describedby={describedBy}
            {...register(field.key)}
          />
        )}

        {field.type === 'PHONE' && (
          <Input
            id={field.id}
            type="tel"
            placeholder={field.placeholder || '+234...'}
            aria-invalid={Boolean(fieldError)}
            aria-describedby={describedBy}
            {...register(field.key)}
          />
        )}

        {field.type === 'NUMBER' && (
          <Input
            id={field.id}
            type="number"
            placeholder={field.placeholder}
            aria-invalid={Boolean(fieldError)}
            aria-describedby={describedBy}
            {...register(field.key, { valueAsNumber: true })}
          />
        )}

        {field.type === 'DATE' && (
          <Input
            id={field.id}
            type="date"
            aria-invalid={Boolean(fieldError)}
            aria-describedby={describedBy}
            {...register(field.key)}
          />
        )}

        {field.type === 'LONG_TEXT' && (
          <Textarea
            id={field.id}
            placeholder={field.placeholder}
            rows={3}
            aria-invalid={Boolean(fieldError)}
            aria-describedby={describedBy}
            {...register(field.key)}
          />
        )}

        {field.type === 'DROPDOWN' && (
          <select
            id={field.id}
            aria-invalid={Boolean(fieldError)}
            aria-describedby={describedBy}
            className="w-full h-10 px-3 text-sm border border-gray-300 rounded-md bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            {...register(field.key)}
          >
            <option value="">Choose option</option>
            {field.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        )}

        {field.type === 'RADIO' && (
          <Controller
            control={control}
            name={field.key}
            render={({ field: { onChange, value } }) => (
              <div className="space-y-2 pt-1">
                {field.options?.map((opt) => (
                  <div key={opt.value} className="flex items-center gap-2.5">
                    <input
                      type="radio"
                      id={`${field.id}-${opt.value}`}
                      name={field.key}
                      value={opt.value}
                      checked={value === opt.value}
                      onChange={() => onChange(opt.value)}
                      className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <Label htmlFor={`${field.id}-${opt.value}`} className="text-sm font-normal text-gray-700 cursor-pointer">
                      {opt.label}
                    </Label>
                  </div>
                ))}
              </div>
            )}
          />
        )}

        {field.type === 'YES_NO' && (
          <Controller
            control={control}
            name={field.key}
            render={({ field: { onChange, value } }) => (
              <div className="flex items-center gap-6 pt-1">
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    id={`${field.id}-yes`}
                    name={field.key}
                    value="Yes"
                    checked={String(value) === 'Yes'}
                    onChange={() => onChange('Yes')}
                    className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <Label htmlFor={`${field.id}-yes`} className="text-sm font-normal text-gray-700 cursor-pointer">
                    Yes
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    id={`${field.id}-no`}
                    name={field.key}
                    value="No"
                    checked={String(value) === 'No'}
                    onChange={() => onChange('No')}
                    className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <Label htmlFor={`${field.id}-no`} className="text-sm font-normal text-gray-700 cursor-pointer">
                    No
                  </Label>
                </div>
              </div>
            )}
          />
        )}

        {field.type === 'CHECKBOX' && (
          <Controller
            control={control}
            name={field.key}
            render={({ field: { onChange, value } }) => {
              const hasOptions = Array.isArray(field.options) && field.options.length > 0
              if (hasOptions) {
                const currentArr = Array.isArray(value) ? (value as string[]) : []
                return (
                  <div className="space-y-2 pt-1">
                    {field.options?.map((opt) => {
                      const isChecked = currentArr.includes(opt.value)
                      return (
                        <div key={opt.value} className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            id={`${field.id}-${opt.value}`}
                            checked={isChecked}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                              if (e.target.checked) {
                                onChange([...currentArr, opt.value])
                              } else {
                                onChange(currentArr.filter((val) => val !== opt.value))
                              }
                            }}
                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                          <Label htmlFor={`${field.id}-${opt.value}`} className="text-sm font-normal text-gray-700 cursor-pointer">
                            {opt.label}
                          </Label>
                        </div>
                      )
                    })}
                  </div>
                )
              } else {
                return (
                  <div className="flex items-center gap-2.5 pt-1">
                    <input
                      type="checkbox"
                      id={field.id}
                      checked={Boolean(value)}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <Label htmlFor={field.id} className="text-sm font-normal text-gray-700 cursor-pointer">
                      I agree
                    </Label>
                  </div>
                )
              }
            }}
          />
        )}

        {field.type === 'FILE_UPLOAD' && (
          <Controller
            control={control}
            name={field.key}
            render={({ field: { onChange } }) => (
              <label
                htmlFor={field.id}
                className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center bg-gray-50/50 hover:bg-gray-50 transition-colors cursor-pointer space-y-1 block"
              >
                <input
                  id={field.id}
                  type="file"
                  accept={field.fileUpload?.accept || 'image/png,image/jpeg,application/pdf'}
                  className="hidden"
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      setSelectedFileName(file.name)
                      setSelectedFileSize(`${(file.size / (1024 * 1024)).toFixed(2)} MB`)
                      onChange(file)
                    }
                  }}
                />
                <div className="text-sm text-gray-600 font-medium">
                  {selectedFileName ? selectedFileName : 'Click to select file or drag & drop'}
                </div>
                {selectedFileSize && <p className="text-xs text-gray-500">{selectedFileSize}</p>}
                {!selectedFileName && (
                  <p className="text-xs text-gray-500">
                    Supports PNG, JPG, PDF up to {field.fileUpload?.maxSizeMb || 10}MB
                  </p>
                )}
              </label>
            )}
          />
        )}

        {field.type === 'SIGNATURE' && (
          <Controller
            control={control}
            name={field.key}
            render={({ field: { onChange, value } }) => (
              <div className="space-y-2">
                <Input
                  id={field.id}
                  type="text"
                  placeholder="Type full legal name as digital signature"
                  value={String(value || '')}
                  onChange={(e) => onChange(e.target.value)}
                  className="font-serif italic"
                />
                <p className="text-xs text-gray-500">
                  By typing your full legal name, you declare this digital signature legally binding.
                </p>
              </div>
            )}
          />
        )}
      </div>

      {errorMessage && (
        <p id={fieldErrorId} role="alert" className="text-xs font-medium text-red-600">
          {errorMessage}
        </p>
      )}
    </div>
  )
}
