import { useState } from 'react'
import { ExternalLink, FileSpreadsheet, Loader2, Sparkles } from 'lucide-react'
import { createGoogleFormPoc, type CreateGoogleFormResult } from '../features/google-forms'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'

export default function GoogleFormsPocPage() {
  const [title, setTitle] = useState('Employee Data Form')
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<CreateGoogleFormResult | null>(null)

  const handleCreateForm = async () => {
    setIsLoading(true)
    setResult(null)

    try {
      const res = await createGoogleFormPoc(title)
      setResult(res)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto space-y-8">
      {/* Page Header */}
      <div className="space-y-2 border-b border-gray-200 pb-6">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" /> Google Forms API POC
          </span>
          <span className="text-xs text-gray-500 font-medium">Server-Side Integration</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">
          Google Forms Creation Engine
        </h1>
        <p className="text-sm text-gray-600 max-w-2xl leading-relaxed">
          Programmatically generate real Google Forms for employee questionnaires. NOLT HR drives the workflow while Google Forms provides the respondent interface.
        </p>
      </div>

      {/* Creation Form Card */}
      <Card className="p-6 md:p-8 space-y-6 bg-white border-gray-200/80 rounded-2xl shadow-sm">
        <div className="space-y-2">
          <Label htmlFor="form-title" className="text-sm font-semibold text-gray-900">
            Form Title
          </Label>
          <Input
            id="form-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter form title..."
            className="h-11 md:h-12 px-4 text-base border-gray-300 rounded-xl focus:border-blue-600 shadow-xs"
          />
          <p className="text-xs text-gray-500">
            This title will be assigned to the generated Google Form and its first section.
          </p>
        </div>

        <div className="pt-2">
          <Button
            type="button"
            onClick={handleCreateForm}
            disabled={isLoading || !title.trim()}
            className="h-12 px-8 rounded-xl font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20 text-base flex items-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Creating Google Form...
              </>
            ) : (
              <>
                <FileSpreadsheet className="w-5 h-5" /> Create Google Form
              </>
            )}
          </Button>
        </div>
      </Card>

      {/* Results Display */}
      {result && (
        <Card className={`p-6 md:p-8 rounded-2xl border space-y-6 shadow-sm ${
          result.ok ? 'bg-emerald-50/40 border-emerald-200' : 'bg-red-50/40 border-red-200'
        }`}>
          {result.ok ? (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-lg">
                  ✓
                </div>
                <div>
                  <h3 className="text-lg font-bold text-emerald-950">
                    Google Form Created Successfully!
                  </h3>
                  <p className="text-xs text-emerald-700">
                    Form ID: <code className="font-mono bg-emerald-100/80 px-2 py-0.5 rounded text-emerald-900 font-semibold">{result.formId}</code>
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <a
                  href={result.responderUri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-xl font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm text-sm transition-colors"
                >
                  Open Form <ExternalLink className="w-4 h-4" />
                </a>

                {result.editUri && (
                  <a
                    href={result.editUri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-xl font-semibold bg-white border border-emerald-300 text-emerald-900 hover:bg-emerald-100/50 shadow-xs text-sm transition-colors"
                  >
                    Open in Google Forms Editor <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1">
                <h3 className="text-base font-bold text-red-900 flex items-center gap-2">
                  <span>Creation Failed</span>
                  {result.errorCode && (
                    <span className="text-xs bg-red-100 text-red-800 px-2.5 py-0.5 rounded-md font-mono">
                      {result.errorCode}
                    </span>
                  )}
                </h3>
                <p className="text-sm text-red-700">{result.error}</p>
              </div>

              {result.errorCode === 'GOOGLE_AUTH_NOT_CONFIGURED' && (
                <div className="text-xs text-red-900 bg-white/80 p-4 rounded-xl border border-red-200 space-y-2">
                  <p className="font-semibold">Supabase Secret Setup Instructions:</p>
                  <p>
                    Please configure the following environment variables in Supabase project secrets:
                  </p>
                  <ul className="list-disc pl-5 font-mono text-[11px] space-y-1 text-red-800">
                    <li>GOOGLE_FORMS_CLIENT_ID</li>
                    <li>GOOGLE_FORMS_CLIENT_SECRET</li>
                    <li>GOOGLE_FORMS_REFRESH_TOKEN</li>
                  </ul>
                </div>
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
