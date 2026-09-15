// @ts-expect-error: Deno module URL import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

declare const Deno: {
  env: {
    get(key: string): string | undefined
  }
  serve(handler: (req: Request) => Promise<Response> | Response): void
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export interface ProviderResult {
  rawContent: string
  providerName: string
  modelName: string
}

export class ProviderAnalysisError extends Error {
  code: string
  userMessage: string
  httpStatus: number

  constructor(code: string, userMessage: string, httpStatus = 400) {
    super(userMessage)
    this.name = 'ProviderAnalysisError'
    this.code = code
    this.userMessage = userMessage
    this.httpStatus = httpStatus
  }
}

export interface FormImportAIProvider {
  name: string
  model: string
  isConfigured(): boolean
  getMissingKeyError(): string
  analyze(base64Pdf: string, promptText: string): Promise<ProviderResult>
}

export function mapHttpErrorToSafeDiagnostic(providerName: string, status: number, errText: string): ProviderAnalysisError {
  const prov = providerName.toUpperCase()
  console.error(`${providerName} Upstream HTTP ${status}:`, errText)

  if (status === 400) {
    return new ProviderAnalysisError(
      `${prov}_BAD_REQUEST`,
      `${providerName === 'gemini' ? 'Gemini' : providerName} could not process this form request.`
    )
  }
  if (status === 401) {
    return new ProviderAnalysisError(
      `${prov}_AUTH`,
      `${providerName === 'gemini' ? 'Gemini' : providerName} authentication failed. Please contact the system administrator.`
    )
  }
  if (status === 403) {
    return new ProviderAnalysisError(
      `${prov}_PERMISSION`,
      `${providerName === 'gemini' ? 'Gemini' : providerName} API access is not permitted for the configured project.`
    )
  }
  if (status === 404) {
    return new ProviderAnalysisError(
      `${prov}_MODEL_NOT_FOUND`,
      `The configured ${providerName === 'gemini' ? 'Gemini' : providerName} model is unavailable.`
    )
  }
  if (status === 429) {
    return new ProviderAnalysisError(
      `${prov}_RATE_LIMIT`,
      `${providerName === 'gemini' ? 'Gemini' : providerName}'s current usage limit has been reached. Please try again later.`
    )
  }

  return new ProviderAnalysisError(
    `${prov}_UPSTREAM_ERROR`,
    `${providerName === 'gemini' ? 'Gemini' : providerName} is temporarily unavailable. Please try again.`
  )
}

export class GeminiFormImportProvider implements FormImportAIProvider {
  name = 'gemini'
  model: string
  private apiKey: string | undefined

  constructor() {
    this.apiKey = Deno.env.get('GEMINI_API_KEY')
    this.model = Deno.env.get('FORM_IMPORT_MODEL') || 'gemini-2.5-flash'
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim() !== '')
  }

  getMissingKeyError(): string {
    return 'Gemini PDF import is not configured.'
  }

  async analyze(base64Pdf: string, promptText: string): Promise<ProviderResult> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`
    let res: Response
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inlineData: {
                    mimeType: 'application/pdf',
                    data: base64Pdf,
                  },
                },
                { text: promptText },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
          },
        }),
      })
    } catch (fetchErr) {
      console.error('Gemini fetch failure:', fetchErr)
      throw new ProviderAnalysisError('GEMINI_UPSTREAM_ERROR', 'Gemini network request failed. Please try again.')
    }

    if (!res.ok) {
      const errText = await res.text()
      throw mapHttpErrorToSafeDiagnostic(this.name, res.status, errText)
    }

    const data = await res.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
    return {
      rawContent: text,
      providerName: this.name,
      modelName: this.model,
    }
  }
}

export class OpenRouterFormImportProvider implements FormImportAIProvider {
  name = 'openrouter'
  model: string
  private apiKey: string | undefined

  constructor() {
    this.apiKey = Deno.env.get('OPENROUTER_API_KEY')
    this.model = Deno.env.get('FORM_IMPORT_MODEL') || 'openrouter/free'
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim() !== '')
  }

  getMissingKeyError(): string {
    return 'OpenRouter PDF import is not configured.'
  }

  async analyze(base64Pdf: string, promptText: string): Promise<ProviderResult> {
    let res: Response
    try {
      res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: 'You extract HR forms into JSON structures without altering legal wording.' },
            {
              role: 'user',
              content: [
                { type: 'text', text: promptText },
                {
                  type: 'image_url',
                  image_url: { url: `data:application/pdf;base64,${base64Pdf}` },
                },
              ],
            },
          ],
        }),
      })
    } catch (fetchErr) {
      console.error('OpenRouter fetch failure:', fetchErr)
      throw new ProviderAnalysisError('OPENROUTER_UPSTREAM_ERROR', 'OpenRouter network request failed. Please try again.')
    }

    if (!res.ok) {
      const errText = await res.text()
      throw mapHttpErrorToSafeDiagnostic(this.name, res.status, errText)
    }

    const data = await res.json()
    const text = data.choices?.[0]?.message?.content || '{}'
    return {
      rawContent: text,
      providerName: this.name,
      modelName: this.model,
    }
  }
}

export class OpenAIFormImportProvider implements FormImportAIProvider {
  name = 'openai'
  model: string
  private apiKey: string | undefined

  constructor() {
    this.apiKey = Deno.env.get('OPENAI_API_KEY')
    this.model = Deno.env.get('FORM_IMPORT_MODEL') || 'gpt-5.6-terra'
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim() !== '')
  }

  getMissingKeyError(): string {
    return 'OpenAI PDF import is not configured.'
  }

  async analyze(base64Pdf: string, promptText: string): Promise<ProviderResult> {
    let res: Response
    try {
      res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          store: false,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: 'You extract HR forms into JSON structures without altering legal wording.' },
            {
              role: 'user',
              content: [
                { type: 'text', text: promptText },
                {
                  type: 'image_url',
                  image_url: { url: `data:application/pdf;base64,${base64Pdf}` },
                },
              ],
            },
          ],
        }),
      })
    } catch (fetchErr) {
      console.error('OpenAI fetch failure:', fetchErr)
      throw new ProviderAnalysisError('OPENAI_UPSTREAM_ERROR', 'OpenAI network request failed. Please try again.')
    }

    if (!res.ok) {
      const errText = await res.text()
      throw mapHttpErrorToSafeDiagnostic(this.name, res.status, errText)
    }

    const data = await res.json()
    const text = data.choices?.[0]?.message?.content || '{}'
    return {
      rawContent: text,
      providerName: this.name,
      modelName: this.model,
    }
  }
}

export function selectAIProvider(providerName?: string): FormImportAIProvider {
  const selected = (providerName || Deno.env.get('FORM_IMPORT_PROVIDER') || 'gemini').toLowerCase().trim()
  switch (selected) {
    case 'openrouter':
      return new OpenRouterFormImportProvider()
    case 'openai':
      return new OpenAIFormImportProvider()
    case 'gemini':
    default:
      return new GeminiFormImportProvider()
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''

    // User client for auth verification
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized user' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Admin client for DB & Storage ops
    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    // Check caller role
    const { data: profile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'hr'].includes(profile.role)) {
      return new Response(JSON.stringify({ error: 'Forbidden: Admin or HR required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json().catch(() => ({}))
    const importJobId = body.import_job_id

    if (!importJobId) {
      return new Response(JSON.stringify({ error: 'Missing import_job_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Load import job record
    const { data: job, error: jobErr } = await adminClient
      .from('form_import_jobs')
      .select('*')
      .eq('id', importJobId)
      .single()

    if (jobErr || !job) {
      return new Response(JSON.stringify({ error: 'Import job not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Mark job as ANALYZING
    await adminClient
      .from('form_import_jobs')
      .update({ status: 'ANALYZING' })
      .eq('id', importJobId)

    // Provider selection
    const provider = selectAIProvider()

    if (!provider.isConfigured()) {
      const errorMessage = provider.getMissingKeyError()
      const provUpper = provider.name.toUpperCase()
      await adminClient
        .from('form_import_jobs')
        .update({
          status: 'FAILED',
          error_code: `${provUpper}_NOT_CONFIGURED`,
          error_message: errorMessage,
        })
        .eq('id', importJobId)

      return new Response(
        JSON.stringify({ ok: false, error: errorMessage }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Read PDF file from private bucket
    const { data: fileData, error: fileErr } = await adminClient.storage
      .from('form-imports')
      .download(job.source_object_path)

    if (fileErr || !fileData) {
      await adminClient
        .from('form_import_jobs')
        .update({
          status: 'FAILED',
          error_code: 'FILE_READ_ERROR',
          error_message: 'Failed to read source PDF file from storage.',
        })
        .eq('id', importJobId)

      return new Response(
        JSON.stringify({ ok: false, error: 'Failed to read source PDF file.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Convert file to base64
    const arrayBuffer = await fileData.arrayBuffer()
    const base64Pdf = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))

    // Canonical prompt text
    const promptText = `You are an expert HR form analyzer. Analyze this blank HR form PDF document and extract its semantic structured questionnaire schema for a modern web form.
CRITICAL INSTRUCTIONS:
1. EXTRACT questions, sections, options, required flags, repeating groups, and conditional rules.
2. DO NOT spend effort trying to reproduce physical PDF paper layout, x/y coordinates, page borders, header-aside boxes, or table grid coordinates. Focus on converting the document into a clean, logical online questionnaire.
3. Group questions into meaningful sections using HEADING fields (e.g., "Personal Information", "Contact Information", "Financial Information", "Next of Kin", "Health Information").
4. Field keys MUST be snake_case with clear word boundaries (e.g. "place_of_birth" NOT "placeofbirth", "date_employed" NOT "dateemployed").
5. Default field layout span is 12 (full-width single-column). Assign span = 6 ONLY for short logically-related pairs (e.g. First Name / Last Name, Start Date / Employment Type).
6. Passport/photograph attachment requests MUST be extracted as FILE_UPLOAD with label "Passport Photograph".
7. Numbered lists or multi-row entries (e.g. Education history, Previous Employment) MUST be extracted as REPEATING_GROUP with "configuration.repeatingGroup": { "columns": [{ "name": "Institution", "type": "SHORT_TEXT" }, ...] }.
8. Conditional Fields: Questions that depend on a previous answer (e.g. "If YES, explain below") MUST include "configuration.visibilityRule": { "fieldKey": "parent_field_key", "operator": "equals", "value": "Yes" }.
9. Data Classification: Assign "configuration.dataClassification" = "SENSITIVE_HEALTH" for health questions/medical data, "SENSITIVE_FINANCIAL" for bank/tax/pension fields, or "GENERAL" for standard biodata.
10. Set "needs_review": true on any field where question wording or field type interpretation is uncertain.

Return ONLY a JSON object matching this strict schema:
{
  "form": {
    "name": "Extracted Title",
    "category": "General",
    "description": "Brief description of the form",
    "instructions": "Instructions or guidance text",
    "presentation": { "mode": "STANDARD" }
  },
  "fields": [
    {
      "field_type": "SHORT_TEXT",
      "label": "Full Name",
      "field_key": "full_name",
      "required": false,
      "description": null,
      "placeholder": null,
      "configuration": {
        "layout": { "span": 12 },
        "dataClassification": "GENERAL"
      },
      "position": 0,
      "needs_review": false,
      "review_note": null
    }
  ],
  "warnings": []
}

Allowed field_type values: SHORT_TEXT, LONG_TEXT, EMAIL, PHONE, NUMBER, DATE, DROPDOWN, RADIO, CHECKBOX, YES_NO, FILE_UPLOAD, SIGNATURE, HEADING, PARAGRAPH, DIVIDER, REPEATING_GROUP.
Ensure field_key starts with a lowercase letter (^[a-z][a-z0-9_]*$).`

    let providerResult: ProviderResult
    try {
      providerResult = await provider.analyze(base64Pdf, promptText)
    } catch (analysisErr) {
      const isDiagnostic = analysisErr instanceof ProviderAnalysisError
      const errorCode = isDiagnostic ? analysisErr.code : `${provider.name.toUpperCase()}_UPSTREAM_ERROR`
      const errorMessage = isDiagnostic ? analysisErr.userMessage : `${provider.name === 'gemini' ? 'Gemini' : provider.name} AI provider analysis failed.`

      await adminClient
        .from('form_import_jobs')
        .update({
          status: 'FAILED',
          error_code: errorCode,
          error_message: errorMessage,
          provider: provider.name,
          model: provider.model,
        })
        .eq('id', importJobId)

      return new Response(
        JSON.stringify({ ok: false, error: errorMessage, error_code: errorCode }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let parsedSchema: Record<string, unknown>
    try {
      parsedSchema = JSON.parse(providerResult.rawContent)
    } catch (jsonErr) {
      console.error('JSON Parse error:', jsonErr)
      const provUpper = provider.name.toUpperCase()
      const errorCode = `${provUpper}_INVALID_JSON`
      const errorMessage = `${provider.name === 'gemini' ? 'Gemini' : provider.name} returned an invalid JSON response structure.`

      await adminClient
        .from('form_import_jobs')
        .update({
          status: 'FAILED',
          error_code: errorCode,
          error_message: errorMessage,
          provider: providerResult.providerName,
          model: providerResult.modelName,
        })
        .eq('id', importJobId)

      return new Response(
        JSON.stringify({ ok: false, error: errorMessage, error_code: errorCode }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Canonical normalization across all providers
    const validFieldTypes = new Set([
      'SHORT_TEXT', 'LONG_TEXT', 'EMAIL', 'PHONE', 'NUMBER', 'DATE',
      'DROPDOWN', 'RADIO', 'CHECKBOX', 'YES_NO', 'FILE_UPLOAD',
      'SIGNATURE', 'HEADING', 'PARAGRAPH', 'DIVIDER', 'REPEATING_GROUP',
    ])

    const rawFields = Array.isArray(parsedSchema.fields) ? parsedSchema.fields : []
    const normalizedFields = rawFields.map((f: Record<string, unknown>, idx: number) => {
      let type = String(f?.field_type || 'SHORT_TEXT').toUpperCase()
      if (!validFieldTypes.has(type)) type = 'SHORT_TEXT'

      let key = String(f?.field_key || `field_${idx}`).toLowerCase().trim()
      key = key.replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '')
      if (!key || !/^[a-z]/.test(key)) {
        key = `field_${idx}`
      }

      return {
        field_type: type,
        label: String(f?.label || `Field ${idx + 1}`),
        field_key: key,
        required: Boolean(f?.required),
        description: f?.description ? String(f.description) : null,
        placeholder: f?.placeholder ? String(f.placeholder) : null,
        configuration: typeof f?.configuration === 'object' && f.configuration ? f.configuration : {},
        position: idx,
        needs_review: Boolean(f?.needs_review),
        review_note: f?.review_note ? String(f.review_note) : null,
      }
    })

    const rawForm = (typeof parsedSchema.form === 'object' && parsedSchema.form) ? parsedSchema.form as Record<string, unknown> : {}
    const proposedSchema = {
      form: {
        name: String(rawForm.name || job.original_filename.replace(/\.pdf$/i, '')),
        category: String(rawForm.category || 'General'),
        description: rawForm.description ? String(rawForm.description) : null,
        instructions: rawForm.instructions ? String(rawForm.instructions) : null,
        presentation: rawForm.presentation || { mode: 'DOCUMENT' },
      },
      fields: normalizedFields,
      warnings: Array.isArray(parsedSchema.warnings) ? parsedSchema.warnings : [],
    }

    // Save proposed schema & update status to READY_FOR_REVIEW
    await adminClient
      .from('form_import_jobs')
      .update({
        status: 'READY_FOR_REVIEW',
        proposed_schema: proposedSchema,
        provider: providerResult.providerName,
        model: providerResult.modelName,
        completed_at: new Date().toISOString(),
      })
      .eq('id', importJobId)

    return new Response(
      JSON.stringify({ ok: true, job_id: importJobId }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Unhandled Edge Function Error:', err)
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal Server Error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
