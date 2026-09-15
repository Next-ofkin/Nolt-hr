import { NoltFormRenderer } from '../features/forms-v2/components/NoltFormRenderer'
import { employeeDataFormDefinition } from '../features/forms-v2/demo/employee-data-form.demo'

export default function FormsV2DemoPage() {
  return (
    <div className="page p-6 bg-slate-50/60 min-h-screen">
      <div className="max-w-3xl mx-auto mb-4 p-3 bg-blue-100/60 border border-blue-200 rounded-lg text-xs text-blue-900 flex items-center justify-between">
        <div>
          <strong className="font-semibold block">Forms V2 RHF & Zod Runtime Demo</strong>
          <span>This page demonstrates the dynamic React Hook Form questionnaire engine without database persistence.</span>
        </div>
        <span className="px-2 py-0.5 rounded bg-blue-600 text-white font-bold text-[10px] tracking-wide">
          DEV PREVIEW
        </span>
      </div>

      <NoltFormRenderer
        definition={employeeDataFormDefinition}
        onSaveDraft={(values) => {
          console.log('[Draft Saved]:', values)
          alert('Draft state captured locally in browser console!')
        }}
        onSubmit={(values) => {
          console.log('[Form Submitted]:', values)
        }}
      />
    </div>
  )
}
