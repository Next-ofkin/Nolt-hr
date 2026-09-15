import { useFieldArray, useFormContext } from 'react-hook-form'
import { Plus, Trash2 } from 'lucide-react'
import type { NoltFormFieldDefinition } from '../domain/form-definition'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Label } from '../../../components/ui/label'

interface NoltRepeatingGroupProps {
  field: NoltFormFieldDefinition
}

export function NoltRepeatingGroup({ field }: NoltRepeatingGroupProps) {
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext()

  const { fields: items, append, remove } = useFieldArray({
    control,
    name: field.key,
  })

  const columns = field.repeatingGroup?.columns || []
  const minRows = field.repeatingGroup?.minRows || 0
  const maxRows = field.repeatingGroup?.maxRows || 99
  const rawError = errors[field.key] as { root?: { message?: string }; message?: string } | undefined
  const groupError =
    typeof rawError?.root?.message === 'string'
      ? rawError.root.message
      : typeof rawError?.message === 'string'
        ? rawError.message
        : null

  const handleAddRow = () => {
    if (items.length < maxRows) {
      const emptyRow: Record<string, string> = {}
      for (const col of columns) {
        emptyRow[col.key] = ''
      }
      append(emptyRow)
    }
  }

  return (
    <div className="space-y-4 pt-1">
      <div className="flex items-center justify-between border-b border-gray-100 pb-2">
        <div>
          <label className="text-base font-semibold text-gray-900 block">
            {field.label}
            {field.required && <span className="text-red-500 ml-1 font-bold">*</span>}
          </label>
          {field.description && <p className="text-xs text-gray-500 mt-0.5">{field.description}</p>}
        </div>
        <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-lg">
          {items.length} {items.length === 1 ? 'Entry' : 'Entries'}
        </span>
      </div>

      <div className="space-y-4">
        {items.map((item, index) => (
          <div
            key={item.id}
            className="bg-slate-50/80 border border-slate-200/90 rounded-2xl p-5 space-y-4 relative transition-all hover:border-slate-300 shadow-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-200/60 pb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-800 flex items-center justify-center text-[11px]">
                  {index + 1}
                </span>
                {field.label} #{index + 1}
              </span>
              {items.length > minRows && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(index)}
                  className="text-xs text-red-600 hover:text-red-700 hover:bg-red-100/60 h-8 px-2.5 rounded-lg font-medium"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" />
                  Remove
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {columns.map((col) => {
                const inputName = `${field.key}.${index}.${col.key}`
                const itemErrors = errors[field.key] as Record<string, unknown> | undefined
                const rowErrors = (Array.isArray(itemErrors) ? itemErrors[index] : null) as Record<
                  string,
                  { message?: string }
                > | null
                const colError = rowErrors?.[col.key]?.message

                return (
                  <div key={col.key} className="space-y-1.5">
                    <Label htmlFor={inputName} className="text-xs font-semibold text-gray-700">
                      {col.label}
                      {col.required && <span className="text-red-500 ml-0.5 font-bold">*</span>}
                    </Label>
                    <Input
                      id={inputName}
                      type={col.type === 'NUMBER' ? 'number' : col.type === 'DATE' ? 'date' : 'text'}
                      placeholder={col.placeholder || `Enter ${col.label.toLowerCase()}`}
                      className="h-10 text-sm bg-white border-gray-300 rounded-xl focus:border-blue-600 shadow-xs"
                      {...register(inputName)}
                    />
                    {colError && <p className="text-[11px] font-medium text-red-500">{colError}</p>}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {groupError && <p className="text-xs text-red-600 font-semibold mt-1">{groupError}</p>}

      {items.length < maxRows && (
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={handleAddRow}
          className="w-full h-11 border-dashed border-2 border-blue-200 text-blue-700 hover:bg-blue-50/80 font-semibold rounded-xl text-sm transition-all flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" /> Add another item
        </Button>
      )}
    </div>
  )
}
