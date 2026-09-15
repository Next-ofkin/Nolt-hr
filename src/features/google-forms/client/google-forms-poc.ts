import { supabase } from '../../../lib/supabase'
import type { GoogleFormPocSafeResult, GoogleFormPocErrorResult } from '../domain/google-form-definition'

export type CreateGoogleFormResult = GoogleFormPocSafeResult | GoogleFormPocErrorResult

export async function createGoogleFormPoc(title: string): Promise<CreateGoogleFormResult> {
  try {
    const { data, error } = await supabase.functions.invoke<CreateGoogleFormResult>(
      'google-forms-poc',
      {
        body: { title },
      },
    )

    if (error) {
      return {
        ok: false,
        error: error.message || 'Failed to invoke Google Forms API Edge Function.',
        errorCode: 'GOOGLE_FORMS_CREATE_FAILED',
      }
    }

    if (!data) {
      return {
        ok: false,
        error: 'Edge Function returned empty response.',
        errorCode: 'GOOGLE_FORMS_CREATE_FAILED',
      }
    }

    return data
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown network or Edge Function error.'
    return {
      ok: false,
      error: msg,
      errorCode: 'GOOGLE_FORMS_CREATE_FAILED',
    }
  }
}
