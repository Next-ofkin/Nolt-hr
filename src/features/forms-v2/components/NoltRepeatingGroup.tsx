import { useFieldArray, useFormContext } from 'react-hook-form'
import type { NoltFormFieldDefinition } from '../domain/form-definition'
import { Card } from '../../../components/ui/card'
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
    <div className="space-y-4">
      <div>
        <label className="text-sm font-semibold text-gray-900 block">
          {field.label}
          {field.required && <span className="text-red-500 ml-1 font-bold">*</span>}
        </label>
        {field.description && <p className="text-xs text-gray-500 mt-0.5">{field.description}</p>}
      </div>

      <div className="space-y-3">
        {items.map((item, index) => (
          <Card key={item.id} className="p-4 bg-slate-50/70 border border-gray-200 rounded-xl space-y-3">
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">
                Item {index + 1}
              </span>
              {items.length > minRows && (
                <button
                  type="button"
                  onClick={() => remove(index)}
                  className="text-xs text-red-600 font-medium hover:underline focus:outline-none"
                >
                  Remove
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {columns.map((col) => {
                const inputName = `${field.key}.${index}.${col.key}`
                const itemErrors = errors[field.key] as Record<string, unknown> | undefined
                const rowErrors = (Array.isArray(itemErrors) ? itemErrors[index] : null) as Record<string, { message?: string }> | null
                const colError = rowErrors?.[col.key]?.message

                return (
                  <div key={col.key} className="space-y-1">
                    <Label htmlFor={inputName} className="text-xs font-medium text-gray-700">
                      {col.label}
                      {col.required && <span className="text-red-500 ml-0.5">*</span>}
                    </Label>
                    <Input
                      id={inputName}
                      type={col.type === 'NUMBER' ? 'number' : col.type === 'DATE' ? 'date' : 'text'}
                      placeholder={col.placeholder || `Enter ${col.label.toLowerCase()}`}
                      className="h-8 text-xs bg-white border-gray-300 shadow-sm"
                      {...register(inputName)}
                    />
                    {colError && <p className="text-[11px] text-red-500">{colError}</p>}
                  </div>
                )
              })}
            </div>
          </Card>
        ))}
      </div>

      {groupError && <p className="text-xs text-red-500 font-medium">{groupError}</p>}

      {items.length < maxRows && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddRow}
          className="w-full text-xs text-blue-700 border-blue-200 hover:bg-blue-50/80 font-medium h-9"
        >
          + Add another item
        </Button>
      )}
    </div>
  )
}
