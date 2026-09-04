// 2026-09-05: import path corrected. createSupabaseServerClient and
// createSupabaseBrowserClient are exported by @/lib/supabase, not by
// @/lib/supabase-client, which exports createClient and createBrowserClient.
//
// The import has never been valid. Webpack built anyway and the route failed at
// runtime; Turbopack, the default builder from Next 16, refuses it outright. The
// upgrade did not break this - it revealed it.
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
    
    // Check database connectivity
    const dbStart = Date.now()
    const { error: dbError } = await supabase
      .from('user_credits')
      .select('count')
      .limit(1)
    const dbLatency = Date.now() - dbStart

    // Check if we can read from all critical tables
    const tables = ['user_credits', 'credit_transactions', 'receipts', 'payment_logs']
    const tableHealth = await Promise.all(
      tables.map(async (table) => {
        try {
          const { error } = await supabase.from(table).select('count').limit(1)
          return { table, status: error ? 'unhealthy' : 'healthy', error: error?.message }
        } catch (err) {
          return { table, status: 'unhealthy', error: String(err) }
        }
      })
    )

    const allHealthy = tableHealth.every(t => t.status === 'healthy')

    // Overall health status
    const health = {
      status: allHealthy && !dbError ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'pdf-builder',
      version: '1.0.0',
      checks: {
        database: {
          status: dbError ? 'unhealthy' : 'healthy',
          latency_ms: dbLatency,
          error: dbError?.message
        },
        tables: tableHealth,
        api: {
          status: 'healthy',
          message: 'API is responding'
        }
      },
      uptime: process.uptime(),
      memory: {
        used: process.memoryUsage().heapUsed,
        total: process.memoryUsage().heapTotal,
        percentage: Math.round((process.memoryUsage().heapUsed / process.memoryUsage().heapTotal) * 100)
      }
    }

    // Return appropriate status code
    const statusCode = health.status === 'healthy' ? 200 : 503

    return NextResponse.json(health, { status: statusCode })

  } catch (error) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        service: 'pdf-builder',
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 503 }
    )
  }
}

export const dynamic = 'force-dynamic'
