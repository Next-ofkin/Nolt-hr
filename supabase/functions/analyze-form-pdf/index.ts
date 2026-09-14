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

export interface FormImportAIProvider {
  name: string
  model: string
  isConfigured(): boolean
  getMissingKeyError(): string
  analyze(base64Pdf: string, promptText: string): Promise<ProviderResult>
}

export class GeminiFormImportProvider implements FormImportAIProvider {
  name = 'gemini'
  model: string
  private apiKey: string | undefined

  constructor() {
    this.apiKey = Deno.env.get('GEMINI_API_KEY')
    this.model = Deno.env.get('FORM_IMPORT_MODEL') || 'gemini-3.8-flash'
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim() !== '')
  }

  getMissingKeyError(): string {
    return 'Gemini PDF import is not configured.'
  }

  async analyze(base64Pdf: string, promptText: string): Promise<ProviderResult> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`
    const res = await fetch(url, {
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

    if (!res.ok) {
      const errText = await res.text()
      console.error('Gemini API Error:', errText)
      throw new Error('Gemini AI provider analysis failed.')
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
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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

    if (!res.ok) {
      const errText = await res.text()
      console.error('OpenRouter API Error:', errText)
      throw new Error('OpenRouter AI provider analysis failed.')
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
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
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

    if (!res.ok) {
      const errText = await res.text()
      console.error('OpenAI API Error:', errText)
      throw new Error('OpenAI AI provider analysis failed.')
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
      await adminClient
        .from('form_import_jobs')
        .update({
          status: 'FAILED',
          error_code: 'AI_NOT_CONFIGURED',
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
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Convert file to base64
    const arrayBuffer = await fileData.arrayBuffer()
    const base64Pdf = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))

    // Canonical prompt text
    const promptText = `You are an expert HR form analyzer. Analyze this blank HR form PDF document and extract its structured digital template schema.
CRITICAL INSTRUCTIONS:
1. EXTRACT and STRUCTURE the document accurately.
2. DO NOT rewrite legal wording, summarize contractual clauses, or alter agreement text. Preserve legal content verbatim as PARAGRAPH or HEADING fields.
3. DO NOT invent employee questions or declarations not present in the source document.
4. Identify document title, category, section headings, short text fields, long text areas, dates, email, phone, numbers, yes/no, dropdown/radio/checkbox options, file upload requests, signature areas, repeating groups (e.g. beneficiaries, dependants), and signer roles.
5. Infer the appropriate presentation mode ("STANDARD", "DOCUMENT", or "AGREEMENT") and field layout spans (12 for full width, 6 for half, 4 for third).
6. Set "needs_review": true on any field where confidence or field type interpretation is uncertain.

Return ONLY a JSON object matching this strict schema:
{
  "form": {
    "name": "Extracted Title",
    "category": "General",
    "description": "Brief description of the form",
    "instructions": "Instructions or guidance text",
    "presentation": { "mode": "DOCUMENT" }
  },
  "fields": [
    {
      "field_type": "SHORT_TEXT",
      "label": "Full Name",
      "field_key": "full_name",
      "required": false,
      "description": null,
      "placeholder": null,
      "configuration": { "layout": { "span": 12 } },
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
    } catch (err) {
      console.error(`${provider.name} analysis error:`, err)
      await adminClient
        .from('form_import_jobs')
        .update({
          status: 'FAILED',
          error_code: 'AI_PROVIDER_ERROR',
          error_message: `${provider.name} AI provider analysis failed.`,
        })
        .eq('id', importJobId)

      return new Response(
        JSON.stringify({ ok: false, error: `${provider.name} AI provider analysis failed.` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const parsedSchema = JSON.parse(providerResult.rawContent)

    // Canonical normalization across all providers
    const validFieldTypes = new Set([
      'SHORT_TEXT', 'LONG_TEXT', 'EMAIL', 'PHONE', 'NUMBER', 'DATE',
      'DROPDOWN', 'RADIO', 'CHECKBOX', 'YES_NO', 'FILE_UPLOAD',
      'SIGNATURE', 'HEADING', 'PARAGRAPH', 'DIVIDER', 'REPEATING_GROUP',
    ])

    const normalizedFields = (parsedSchema.fields || []).map((f: Record<string, unknown>, idx: number) => {
      let type = String(f.field_type || 'SHORT_TEXT').toUpperCase()
      if (!validFieldTypes.has(type)) type = 'SHORT_TEXT'

      let key = String(f.field_key || `field_${idx}`).toLowerCase().trim()
      key = key.replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '')
      if (!key || !/^[a-z]/.test(key)) {
        key = `field_${idx}`
      }

      return {
        field_type: type,
        label: String(f.label || `Field ${idx + 1}`),
        field_key: key,
        required: Boolean(f.required),
        description: f.description ? String(f.description) : null,
        placeholder: f.placeholder ? String(f.placeholder) : null,
        configuration: typeof f.configuration === 'object' && f.configuration ? f.configuration : {},
        position: idx,
        needs_review: Boolean(f.needs_review),
        review_note: f.review_note ? String(f.review_note) : null,
      }
    })

    const proposedSchema = {
      form: {
        name: String(parsedSchema.form?.name || job.original_filename.replace(/\.pdf$/i, '')),
        category: String(parsedSchema.form?.category || 'General'),
        description: parsedSchema.form?.description ? String(parsedSchema.form.description) : null,
        instructions: parsedSchema.form?.instructions ? String(parsedSchema.form.instructions) : null,
        presentation: parsedSchema.form?.presentation || { mode: 'DOCUMENT' },
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
