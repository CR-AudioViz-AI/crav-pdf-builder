// 2026-09-05: rewired to the central credits API.
//
// This route imported checkUserCredits from
// @/lib/supabase-client. Neither function exists in that module or anywhere else
// in this repository - they were never written. The route has therefore never
// worked: it returns 401 to anonymous callers, and would throw for any
// authenticated one.
//
// Webpack built it anyway. Turbopack, the default builder from Next 16, refuses
// the import outright, which is the only reason anybody noticed.
//
// The correct home for this was always the central API. A satellite must not
// implement its own atomic credit deduction - one ledger, one place it is
// written, or two apps disagree about a customer's balance. CentralCredits was
// already present in this repository and already points at /credits/spend.
// 2026-09-05: import path corrected. createSupabaseServerClient and
// createSupabaseBrowserClient are exported by @/lib/supabase, not by
// @/lib/supabase-client, which exports createClient and createBrowserClient.
//
// The import has never been valid. Webpack built anyway and the route failed at
// runtime; Turbopack, the default builder from Next 16, refuses it outright. The
// upgrade did not break this - it revealed it.
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseBrowserClient } from '@/lib/supabase'
import { CentralCredits } from '@/lib/central-services'

export async function GET(request: NextRequest) {
  try {
    // SECURITY: Get auth token from header
    const authHeader = request.headers.get('authorization')
    
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized - No auth token provided' },
        { status: 401 }
      )
    }

    // SECURITY: Verify the token is valid
    const token = authHeader.substring(7)
    const supabase = createSupabaseBrowserClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized - Invalid token' },
        { status: 401 }
      )
    }

    // Get user's credit balance
    const { current } = await CentralCredits.getBalance()

    return NextResponse.json({
      credits: current,
      user_id: user.id
    })

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('Get balance error:', message)
    
    return NextResponse.json(
      { error: 'Internal server error. Please try again.' },
      { status: 500 }
    )
  }
}

export const dynamic = 'force-dynamic'
