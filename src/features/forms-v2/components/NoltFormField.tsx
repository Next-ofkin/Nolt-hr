import React, { useState } from 'react'
import { Controller, useFormContext, useWatch } from 'react-hook-form'
import { Check, FileText, UploadCloud, X } from 'lucide-react'
import type { NoltFormFieldDefinition } from '../domain/form-definition'
import { NoltRepeatingGroup } from './NoltRepeatingGroup'
import { Input } from '../../../components/ui/input'
import { Textarea } from '../../../components/ui/textarea'
import { Label } from '../../../components/ui/label'
import { Button } from '../../../components/ui/button'

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
    return (
      <div className="pt-2 pb-1">
        <h3 className="text-lg font-bold text-gray-900 tracking-tight">{field.label}</h3>
        {field.content && <p className="text-xs text-gray-500 mt-0.5">{field.content}</p>}
      </div>
    )
  }

  if (field.type === 'PARAGRAPH') {
    return (
      <div className="text-sm text-gray-600 leading-relaxed py-1 bg-gray-50/70 p-4 rounded-xl border border-gray-100">
        <p>{field.content || field.label}</p>
      </div>
    )
  }

  if (field.type === 'DIVIDER') {
    return (
      <div className="py-2">
        <hr className="border-t border-gray-200/80" />
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
        <Label htmlFor={field.id} className="text-sm font-semibold text-gray-900 flex items-center gap-1">
          <span>{field.label}</span>
          {field.required && (
            <span className="text-red-500 font-bold" aria-hidden="true">
              *
            </span>
          )}
        </Label>
      </div>

      {field.description && (
        <p id={fieldDescId} className="text-xs md:text-sm text-gray-500 leading-relaxed">
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
            className="h-11 md:h-12 px-4 text-base border-gray-300 rounded-xl focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 bg-white shadow-xs"
            {...register(field.key)}
          />
        )}

        {field.type === 'EMAIL' && (
          <Input
            id={field.id}
            type="email"
            placeholder={field.placeholder || 'name@noltfinance.com'}
            aria-invalid={Boolean(fieldError)}
            aria-describedby={describedBy}
            className="h-11 md:h-12 px-4 text-base border-gray-300 rounded-xl focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 bg-white shadow-xs"
            {...register(field.key)}
          />
        )}

        {field.type === 'PHONE' && (
          <Input
            id={field.id}
            type="tel"
            placeholder={field.placeholder || '+234 800 000 0000'}
            aria-invalid={Boolean(fieldError)}
            aria-describedby={describedBy}
            className="h-11 md:h-12 px-4 text-base border-gray-300 rounded-xl focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 bg-white shadow-xs"
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
            className="h-11 md:h-12 px-4 text-base border-gray-300 rounded-xl focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 bg-white shadow-xs"
            {...register(field.key, { valueAsNumber: true })}
          />
        )}

        {field.type === 'DATE' && (
          <Input
            id={field.id}
            type="date"
            aria-invalid={Boolean(fieldError)}
            aria-describedby={describedBy}
            className="h-11 md:h-12 px-4 text-base border-gray-300 rounded-xl focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 bg-white shadow-xs"
            {...register(field.key)}
          />
        )}

        {field.type === 'LONG_TEXT' && (
          <Textarea
            id={field.id}
            placeholder={field.placeholder}
            rows={4}
            aria-invalid={Boolean(fieldError)}
            aria-describedby={describedBy}
            className="min-h-[110px] p-4 text-base border-gray-300 rounded-xl focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 bg-white shadow-xs"
            {...register(field.key)}
          />
        )}

        {field.type === 'DROPDOWN' && (
          <select
            id={field.id}
            aria-invalid={Boolean(fieldError)}
            aria-describedby={describedBy}
            className="w-full h-11 md:h-12 px-4 text-base border border-gray-300 rounded-xl bg-white shadow-xs focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all cursor-pointer"
            {...register(field.key)}
          >
            <option value="">Select an option...</option>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {field.options?.map((opt) => {
                  const isSelected = value === opt.value
                  return (
                    <div
                      key={opt.value}
                      onClick={() => onChange(opt.value)}
                      className={`flex items-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50/70 text-blue-950 font-semibold shadow-xs'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <span
                        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                          isSelected ? 'border-blue-600 bg-blue-600' : 'border-gray-300'
                        }`}
                      >
                        {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </span>
                      <span className="text-sm font-medium">{opt.label}</span>
                    </div>
                  )
                })}
              </div>
            )}
          />
        )}

        {field.type === 'YES_NO' && (
          <Controller
            control={control}
            name={field.key}
            render={({ field: { onChange, value } }) => (
              <div className="grid grid-cols-2 gap-4 pt-1">
                {['Yes', 'No'].map((optVal) => {
                  const isSelected = String(value) === optVal
                  return (
                    <div
                      key={optVal}
                      onClick={() => onChange(optVal)}
                      className={`flex items-center justify-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50/70 text-blue-950 font-semibold shadow-xs'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <span
                        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                          isSelected ? 'border-blue-600 bg-blue-600' : 'border-gray-300'
                        }`}
                      >
                        {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </span>
                      <span className="text-base font-semibold">{optVal}</span>
                    </div>
                  )
                })}
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    {field.options?.map((opt) => {
                      const isChecked = currentArr.includes(opt.value)
                      return (
                        <div
                          key={opt.value}
                          onClick={() => {
                            if (isChecked) {
                              onChange(currentArr.filter((v) => v !== opt.value))
                            } else {
                              onChange([...currentArr, opt.value])
                            }
                          }}
                          className={`flex items-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                            isChecked
                              ? 'border-blue-600 bg-blue-50/70 text-blue-950 font-semibold shadow-xs'
                              : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          <span
                            className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                              isChecked ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-white'
                            }`}
                          >
                            {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                          </span>
                          <span className="text-sm font-medium">{opt.label}</span>
                        </div>
                      )
                    })}
                  </div>
                )
              } else {
                const isChecked = Boolean(value)
                return (
                  <div
                    onClick={() => onChange(!isChecked)}
                    className={`flex items-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                      isChecked
                        ? 'border-blue-600 bg-blue-50/70 text-blue-950 font-semibold shadow-xs'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                        isChecked ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-white'
                      }`}
                    >
                      {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                    </span>
                    <span className="text-sm font-medium text-gray-800">
                      I confirm and agree to this statement
                    </span>
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
            render={({ field: { onChange, value } }) => (
              <div className="pt-1">
                {selectedFileName || value ? (
                  <div className="border-2 border-blue-500 bg-blue-50/50 rounded-2xl p-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center flex-shrink-0">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div className="truncate">
                        <p className="text-sm font-semibold text-gray-900 truncate">
                          {selectedFileName || 'Attached Document'}
                        </p>
                        {selectedFileSize && <p className="text-xs text-gray-500">{selectedFileSize}</p>}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedFileName(null)
                        setSelectedFileSize(null)
                        onChange(null)
                      }}
                      className="text-red-600 hover:text-red-700 hover:bg-red-100/50 h-9 px-3 rounded-xl flex-shrink-0 text-xs font-semibold"
                    >
                      <X className="w-4 h-4 mr-1" /> Remove
                    </Button>
                  </div>
                ) : (
                  <label
                    htmlFor={field.id}
                    className="border-2 border-dashed border-gray-300 hover:border-blue-500 rounded-2xl p-6 md:p-8 text-center bg-gray-50/50 hover:bg-blue-50/20 transition-all cursor-pointer space-y-3 block group"
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
                    <div className="w-12 h-12 rounded-2xl bg-white border border-gray-200 text-blue-600 flex items-center justify-center mx-auto shadow-xs group-hover:scale-105 transition-transform">
                      <UploadCloud className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-gray-900">
                        {field.label || 'Upload Document'}
                      </p>
                      <p className="text-xs text-gray-500">
                        PNG, JPG, or PDF up to {field.fileUpload?.maxSizeMb || 5} MB
                      </p>
                    </div>
                    <div>
                      <span className="inline-flex items-center justify-center px-4 py-2 rounded-xl text-xs font-semibold border border-gray-300 bg-white text-gray-700 group-hover:border-blue-500 group-hover:text-blue-600 transition-colors shadow-xs">
                        Choose file
                      </span>
                    </div>
                  </label>
                )}
              </div>
            )}
          />
        )}

        {field.type === 'SIGNATURE' && (
          <Controller
            control={control}
            name={field.key}
            render={({ field: { onChange, value } }) => (
              <div className="border border-slate-200 bg-slate-50/50 rounded-2xl p-5 space-y-4 pt-2">
                <div className="space-y-1">
                  <p className="text-xs text-slate-600">
                    By typing your full legal name below, you confirm that all statements made in this document are true, accurate, and complete.
                  </p>
                </div>
                <Input
                  id={field.id}
                  type="text"
                  placeholder="Type your full legal name here"
                  value={String(value || '')}
                  onChange={(e) => onChange(e.target.value)}
                  className="font-serif italic text-lg md:text-xl h-12 bg-white rounded-xl border-slate-300 focus:border-blue-600 px-4 text-slate-900 shadow-xs"
                />
                <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                  <span>Digital Signature Authentication</span>
                  <span className="bg-slate-200/80 px-2.5 py-1 rounded-md text-[11px] font-medium text-slate-700">
                    Graphic Signature: Phase 2
                  </span>
                </div>
              </div>
            )}
          />
        )}
      </div>

      {errorMessage && (
        <p id={fieldErrorId} role="alert" className="text-xs md:text-sm font-medium text-red-600 mt-1.5 flex items-center gap-1">
          <span>{errorMessage}</span>
        </p>
      )}
    </div>
  )
}
