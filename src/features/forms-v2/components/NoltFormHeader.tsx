import type { NoltFormDefinition, FormProgressStats } from '../domain/form-definition'

interface NoltFormHeaderProps {
  definition: NoltFormDefinition
  progress: FormProgressStats
}

export function NoltFormHeader({ definition, progress }: NoltFormHeaderProps) {
  return (
    <div className="bg-white border border-gray-200/80 rounded-2xl p-6 md:p-8 shadow-sm space-y-6 mb-8">
      <div className="flex items-center justify-between gap-4 border-b border-gray-100 pb-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200/60 uppercase tracking-wider">
            NOLT FINANCE
          </span>
          <span className="text-xs font-medium text-gray-400">|</span>
          <span className="text-xs font-medium text-gray-500">Official HR Form</span>
        </div>
        <span className="text-xs font-medium text-gray-500 bg-gray-100/80 px-2.5 py-1 rounded-md">
          {progress.completedRequiredFields} of {progress.totalRequiredFields} Required
        </span>
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">
          {definition.title}
        </h1>
        {definition.description && (
          <p className="text-sm md:text-base text-gray-600 max-w-3xl leading-relaxed">
            {definition.description}
          </p>
        )}
        {definition.instructions && (
          <p className="text-xs md:text-sm text-gray-500 leading-relaxed mt-1">
            {definition.instructions}
          </p>
        )}
      </div>

      <div className="space-y-2 pt-2 border-t border-gray-100">
        <div className="flex items-center justify-between text-xs md:text-sm font-medium text-gray-700">
          <span>Overall Completion</span>
          <span className="font-semibold text-blue-700">
            {progress.percentComplete}% ({progress.completedInputFields} of {progress.totalInputFields} fields)
          </span>
        </div>
        <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-600 transition-all duration-500 ease-out rounded-full"
            style={{ width: `${progress.percentComplete}%` }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500 pt-1">
        <p className="flex items-center gap-1">
          <span className="text-red-500 font-bold" aria-hidden="true">*</span>
          Fields marked with an asterisk are required.
        </p>
        <span className="text-gray-400 hidden sm:inline">Auto-saved locally</span>
      </div>
    </div>
  )
}
