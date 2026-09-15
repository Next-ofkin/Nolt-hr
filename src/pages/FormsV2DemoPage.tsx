import { useState } from 'react'
import { NoltFormRenderer } from '../features/forms-v2/components/NoltFormRenderer'
import { employeeDataFormDefinition } from '../features/forms-v2/demo/employee-data-form.demo'

export default function FormsV2DemoPage() {
  const [submittedData, setSubmittedData] = useState<Record<string, unknown> | null>(null)

  return (
    <div className="min-h-screen bg-slate-50/80 py-8 px-4 sm:px-6 lg:px-12">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Subtle Page Shell Sub-Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-200/80 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-700 bg-blue-100/80 px-2.5 py-0.5 rounded-md">
                FORMS V2 RUNTIME
              </span>
              <span className="text-xs text-gray-500 font-medium">Internal Preview</span>
            </div>
            <h2 className="text-xl font-bold text-gray-900 tracking-tight mt-1">
              Employee Onboarding Portal
            </h2>
          </div>
          <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200/80 self-start sm:self-auto">
            React Hook Form + Zod Engine
          </span>
        </div>

        {/* Main Form Studio Renderer */}
        <NoltFormRenderer
          definition={employeeDataFormDefinition}
          onSaveDraft={(values) => {
            console.log('[Form Studio Draft Saved]:', values)
          }}
          onSubmit={(values) => {
            console.log('[Form Studio Submitted]:', values)
            setSubmittedData(values)
          }}
        />

        {/* DEV-Only Payload Inspector */}
        {import.meta.env.DEV && (
          <details className="mt-12 bg-slate-900 text-slate-100 rounded-2xl p-6 border border-slate-800 shadow-lg">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-slate-400 hover:text-white flex items-center justify-between">
              <span>Developer Preview: Submitted Payload Inspector (DEV Only)</span>
              <span className="text-[11px] bg-slate-800 px-2 py-0.5 rounded text-slate-300">
                Click to expand
              </span>
            </summary>
            <div className="mt-4 pt-4 border-t border-slate-800 space-y-3">
              <p className="text-xs text-slate-400">
                This raw JSON output is strictly rendered in development mode (`import.meta.env.DEV`) for verifying RHF payload shape.
              </p>
              {submittedData ? (
                <pre className="p-4 bg-slate-950 rounded-xl text-xs text-emerald-400 font-mono overflow-x-auto border border-slate-800">
                  {JSON.stringify(submittedData, null, 2)}
                </pre>
              ) : (
                <p className="text-xs text-slate-500 italic">
                  No payload submitted yet. Complete and submit the form above to inspect the validated JSON structure.
                </p>
              )}
            </div>
          </details>
        )}
      </div>
    </div>
  )
}
