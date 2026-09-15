import { Lock, ShieldCheck } from 'lucide-react'
import type { NoltFormSectionDefinition } from '../domain/form-definition'
import { NoltFormField } from './NoltFormField'

interface NoltFormSectionProps {
  section: NoltFormSectionDefinition
}

export function NoltFormSection({ section }: NoltFormSectionProps) {
  const isHealth = section.id.toLowerCase().includes('health') || section.title.toLowerCase().includes('health')
  const isFinancial = section.id.toLowerCase().includes('financial') || section.title.toLowerCase().includes('financial') || section.title.toLowerCase().includes('bank')

  return (
    <section
      id={`section-${section.id}`}
      className="bg-white border border-gray-200/80 rounded-2xl p-6 md:p-8 shadow-sm transition-all hover:shadow-md space-y-6 scroll-mt-8 mb-8"
    >
      <div className="border-b border-gray-100 pb-5 space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">
            {section.title}
          </h2>

          {isHealth && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200/70 self-start sm:self-auto">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              Strictly Confidential
            </span>
          )}

          {isFinancial && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-800 border border-blue-200/70 self-start sm:self-auto">
              <Lock className="w-3.5 h-3.5 text-blue-600" />
              Payroll Security Encrypted
            </span>
          )}
        </div>

        {section.description && (
          <p className="text-sm text-gray-500 max-w-3xl leading-relaxed">
            {section.description}
          </p>
        )}

        {isHealth && (
          <p className="text-xs text-gray-500 bg-emerald-50/50 p-2.5 rounded-xl border border-emerald-100 text-emerald-900 mt-2">
            Health answers are handled confidentially by HR medical officers in accordance with data privacy regulations.
          </p>
        )}

        {isFinancial && (
          <p className="text-xs text-gray-500 bg-blue-50/50 p-2.5 rounded-xl border border-blue-100 text-blue-900 mt-2">
            Bank and tax identification details are used exclusively for payroll computation and statutory remittances.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {section.fields.map((field) => {
          const span = field.layout?.span
          const colClass =
            field.type === 'REPEATING_GROUP' ||
            field.type === 'FILE_UPLOAD' ||
            field.type === 'LONG_TEXT' ||
            field.type === 'PARAGRAPH' ||
            field.type === 'HEADING' ||
            field.type === 'DIVIDER' ||
            span === 12
              ? 'col-span-12'
              : span === 4
                ? 'col-span-12 md:col-span-4'
                : 'col-span-12 md:col-span-6'

          return (
            <div key={field.id} className={colClass}>
              <NoltFormField field={field} />
            </div>
          )
        })}
      </div>
    </section>
  )
}
