// 2026-09-05: import path corrected. createSupabaseServerClient and
// createSupabaseBrowserClient are exported by @/lib/supabase, not by
// @/lib/supabase-client, which exports createClient and createBrowserClient.
//
// The import has never been valid. Webpack built anyway and the route failed at
// runtime; Turbopack, the default builder from Next 16, refuses it outright. The
// upgrade did not break this - it revealed it.
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseBrowserClient, createSupabaseServerClient } from '@/lib/supabase'

interface ErrorReport {
  message: string
  stack?: string
  component?: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  context?: Record<string, any>
  user_id?: string
}

export async function POST(request: NextRequest) {
  try {
    // Optional authentication (errors can be reported anonymously)
    const authHeader = request.headers.get('authorization')
    let userId: string | null = null

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7)
      const supabase = createSupabaseBrowserClient()
      const { data: { user } } = await supabase.auth.getUser(token)
      userId = user?.id || null
    }

    const errorData: ErrorReport = await request.json()

    // Validate required fields
    if (!errorData.message || !errorData.severity) {
      return NextResponse.json(
        { error: 'Missing required fields: message, severity' },
        { status: 400 }
      )
    }

    const supabase = createSupabaseServerClient()

    // Log error to database
    const { error: logError } = await supabase
      .from('error_logs')
      .insert({
        service: 'pdf-builder',
        user_id: userId || errorData.user_id,
        message: errorData.message,
        stack: errorData.stack,
        component: errorData.component,
        severity: errorData.severity,
        context: errorData.context || {},
        created_at: new Date().toISOString()
      })

    if (logError) {
      console.error('Failed to log error:', logError)
    }

    // For critical errors, send immediate alert to Javari AI
    if (errorData.severity === 'critical') {
      await sendCriticalAlert(errorData, userId)
    }

    // Auto-recovery suggestions based on error patterns
    const suggestion = await generateRecoverySuggestion(errorData)

    return NextResponse.json({
      success: true,
      logged: !logError,
      suggestion
    })

  } catch (error) {
    console.error('Error reporting failed:', error)
    return NextResponse.json(
      { error: 'Failed to report error' },
      { status: 500 }
    )
  }
}

async function sendCriticalAlert(errorData: ErrorReport, userId: string | null) {
  try {
    // Send to Javari AI monitoring webhook
    const javariWebhook = process.env.JAVARI_WEBHOOK_URL
    
    if (!javariWebhook) {
      console.warn('JAVARI_WEBHOOK_URL not configured')
      return
    }

    await fetch(javariWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service: 'pdf-builder',
        alert_type: 'critical_error',
        timestamp: new Date().toISOString(),
        user_id: userId,
        error: {
          message: errorData.message,
          stack: errorData.stack,
          component: errorData.component,
          context: errorData.context
        }
      })
    })

    console.log('Critical alert sent to Javari AI')
  } catch (error) {
    console.error('Failed to send critical alert:', error)
  }
}

function generateRecoverySuggestion(errorData: ErrorReport): string {
  // Pattern matching for common errors
  const message = errorData.message.toLowerCase()

  if (message.includes('insufficient credits')) {
    return 'User needs to purchase more credits. Redirect to /credits/purchase'
  }

  if (message.includes('authentication') || message.includes('unauthorized')) {
    return 'Session expired. Clear localStorage and redirect to login'
  }

  if (message.includes('network') || message.includes('fetch')) {
    return 'Network connectivity issue. Retry with exponential backoff'
  }

  if (message.includes('rate limit')) {
    return 'Rate limit exceeded. Wait 60 seconds before retry'
  }

  if (message.includes('database') || message.includes('supabase')) {
    return 'Database connectivity issue. Retry operation after 5 seconds'
  }

  return 'Check logs and retry operation. If persists, contact support'
}

export const dynamic = 'force-dynamic'
