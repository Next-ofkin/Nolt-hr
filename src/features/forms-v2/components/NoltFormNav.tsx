import { CheckCircle2, Circle } from 'lucide-react'
import {
  type NoltFormSectionDefinition,
  type FormProgressStats,
  calculateSectionCompletion,
} from '../domain/form-definition'

interface NoltFormNavProps {
  sections: NoltFormSectionDefinition[]
  activeSectionId: string
  onSelectSection: (sectionId: string) => void
  formValues: Record<string, unknown>
  progress: FormProgressStats
}

export function NoltFormNav({
  sections,
  activeSectionId,
  onSelectSection,
  formValues,
  progress,
}: NoltFormNavProps) {
  return (
    <>
      {/* Desktop Sticky Navigation Sidebar */}
      <aside className="w-64 flex-shrink-0 sticky top-6 self-start hidden lg:block space-y-4">
        <div className="bg-white border border-gray-200/80 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Form Sections
            </h2>
            <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
              {progress.percentComplete}%
            </span>
          </div>

          <nav className="space-y-1">
            {sections.map((section) => {
              const { isComplete, isStarted } = calculateSectionCompletion(section, formValues)
              const isActive = section.id === activeSectionId

              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => onSelectSection(section.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2.5 ${
                    isActive
                      ? 'bg-blue-50/90 text-blue-900 font-semibold shadow-xs border-l-4 border-blue-600 pl-2.5'
                      : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  {isComplete ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  ) : isStarted ? (
                    <span className="w-4 h-4 rounded-full border-2 border-blue-600 flex items-center justify-center flex-shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                    </span>
                  ) : (
                    <Circle className="w-4 h-4 text-gray-300 flex-shrink-0" />
                  )}
                  <span className="truncate">{section.title}</span>
                </button>
              )
            })}
          </nav>
        </div>

        {/* Sidebar Summary Card */}
        <div className="bg-gradient-to-br from-blue-900 to-slate-900 rounded-2xl p-5 text-white shadow-md space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-blue-300">
            Submission Status
          </div>
          <p className="text-sm text-gray-200">
            {progress.completedRequiredFields} of {progress.totalRequiredFields} required questions answered.
          </p>
          <div className="w-full bg-blue-950/80 h-2 rounded-full overflow-hidden mt-2">
            <div
              className="bg-blue-400 h-full transition-all duration-300 rounded-full"
              style={{ width: `${progress.percentComplete}%` }}
            />
          </div>
        </div>
      </aside>

      {/* Mobile / Tablet Horizontal Navigation */}
      <div className="lg:hidden mb-6 space-y-3">
        <div className="flex items-center justify-between bg-white p-3 border border-gray-200 rounded-xl shadow-xs">
          <span className="text-xs font-semibold text-gray-500">Progress</span>
          <span className="text-xs font-bold text-blue-700">{progress.percentComplete}% Complete</span>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          {sections.map((section) => {
            const { isComplete } = calculateSectionCompletion(section, formValues)
            const isActive = section.id === activeSectionId

            return (
              <button
                key={section.id}
                type="button"
                onClick={() => onSelectSection(section.id)}
                className={`flex-shrink-0 px-3.5 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-blue-600 text-white font-semibold shadow-xs'
                    : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                {isComplete && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                <span>{section.title}</span>
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}
