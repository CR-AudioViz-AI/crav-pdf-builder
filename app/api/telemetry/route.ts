// 2026-09-05: import path corrected. createSupabaseServerClient and
// createSupabaseBrowserClient are exported by @/lib/supabase, not by
// @/lib/supabase-client, which exports createClient and createBrowserClient.
//
// The import has never been valid. Webpack built anyway and the route failed at
// runtime; Turbopack, the default builder from Next 16, refuses it outright. The
// upgrade did not break this - it revealed it.
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseBrowserClient, createSupabaseServerClient } from '@/lib/supabase'

interface TelemetryEvent {
  event_type: string // 'page_view', 'feature_used', 'error', 'conversion'
  event_name: string // Specific event name
  properties?: Record<string, any>
  user_id?: string
}

export async function POST(request: NextRequest) {
  try {
    // Optional authentication
    const authHeader = request.headers.get('authorization')
    let userId: string | null = null

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7)
      const supabase = createSupabaseBrowserClient()
      const { data: { user } } = await supabase.auth.getUser(token)
      userId = user?.id || null
    }

    const events: TelemetryEvent[] = await request.json()

    // Validate events array
    if (!Array.isArray(events) || events.length === 0) {
      return NextResponse.json(
        { error: 'Invalid events array' },
        { status: 400 }
      )
    }

    const supabase = createSupabaseServerClient()

    // Batch insert telemetry events
    const telemetryRecords = events.map(event => ({
      service: 'pdf-builder',
      user_id: userId || event.user_id || 'anonymous',
      event_type: event.event_type,
      event_name: event.event_name,
      properties: event.properties || {},
      created_at: new Date().toISOString()
    }))

    const { error: insertError } = await supabase
      .from('telemetry_events')
      .insert(telemetryRecords)

    if (insertError) {
      console.error('Failed to log telemetry:', insertError)
      return NextResponse.json(
        { success: false, error: insertError.message },
        { status: 500 }
      )
    }

    // Process high-value events for real-time insights
    await processHighValueEvents(events, userId)

    return NextResponse.json({
      success: true,
      events_logged: events.length
    })

  } catch (error) {
    console.error('Telemetry error:', error)
    return NextResponse.json(
      { error: 'Failed to log telemetry' },
      { status: 500 }
    )
  }
}

async function processHighValueEvents(events: TelemetryEvent[], userId: string | null) {
  const supabase = createSupabaseServerClient()

  for (const event of events) {
    // Track conversions (credit purchases)
    if (event.event_type === 'conversion' && event.event_name === 'credit_purchase') {
      await supabase.from('conversion_events').insert({
        user_id: userId || 'anonymous',
        event_name: event.event_name,
        revenue: event.properties?.amount || 0,
        credits: event.properties?.credits || 0,
        created_at: new Date().toISOString()
      })
    }

    // Track feature adoption
    if (event.event_type === 'feature_used') {
      await supabase.from('feature_usage').insert({
        user_id: userId || 'anonymous',
        feature_name: event.event_name,
        usage_count: 1,
        created_at: new Date().toISOString()
      })
    }

    // Track user journey milestones
    if (event.event_name === 'first_document_created' || 
        event.event_name === 'first_credit_purchase' ||
        event.event_name === 'power_user_threshold') {
      await supabase.from('user_milestones').insert({
        user_id: userId || 'anonymous',
        milestone: event.event_name,
        achieved_at: new Date().toISOString()
      })
    }
  }
}

// GET endpoint for retrieving telemetry analytics (admin only)
export async function GET(request: NextRequest) {
  try {
    // Require authentication for analytics
    const authHeader = request.headers.get('authorization')
    
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const token = authHeader.substring(7)
    const supabase = createSupabaseBrowserClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Check if user is admin (you'd want to add role checking here)
    // For now, just return basic analytics

    const serverSupabase = createSupabaseServerClient()

    // Get today's stats
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const { data: todayEvents } = await serverSupabase
      .from('telemetry_events')
      .select('event_type, event_name')
      .gte('created_at', today.toISOString())

    // Aggregate stats
    const stats = {
      today: {
        total_events: todayEvents?.length || 0,
        page_views: todayEvents?.filter(e => e.event_type === 'page_view').length || 0,
        features_used: todayEvents?.filter(e => e.event_type === 'feature_used').length || 0,
        errors: todayEvents?.filter(e => e.event_type === 'error').length || 0,
        conversions: todayEvents?.filter(e => e.event_type === 'conversion').length || 0
      }
    }

    return NextResponse.json(stats)

  } catch (error) {
    console.error('Analytics error:', error)
    return NextResponse.json(
      { error: 'Failed to get analytics' },
      { status: 500 }
    )
  }
}

export const dynamic = 'force-dynamic'
