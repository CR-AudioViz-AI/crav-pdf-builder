import { NextRequest, NextResponse } from 'next/server'
import { deductCreditsAtomic } from '@/lib/supabase-client'
import { createSupabaseBrowserClient } from '@/lib/supabase-client'

// Rate limiting (simple in-memory for now)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT = 10 // requests per minute
const RATE_WINDOW = 60 * 1000 // 1 minute

function checkRateLimit(userId: string): boolean {
  const now = Date.now()
  const userLimit = rateLimitMap.get(userId)

  if (!userLimit || now > userLimit.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_WINDOW })
    return true
  }

  if (userLimit.count >= RATE_LIMIT) {
    return false
  }

  userLimit.count++
  return true
}

export async function POST(request: NextRequest) {
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

    // SECURITY: Rate limiting to prevent abuse
    if (!checkRateLimit(user.id)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Try again later.' },
        { status: 429 }
      )
    }

    // Parse request body
    const body = await request.json()
    const { amount, reason } = body

    // Validation
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json(
        { error: 'Invalid amount. Must be a positive number.' },
        { status: 400 }
      )
    }

    if (amount > 1000) {
      return NextResponse.json(
        { error: 'Amount exceeds maximum (1000 credits per transaction)' },
        { status: 400 }
      )
    }

    // SECURITY: Use authenticated user's ID, NOT from request body
    const result = await deductCreditsAtomic(
      user.id, // Use verified user ID, not client-provided
      amount,
      reason || 'Credit usage'
    )

    if (!result.success) {
      return NextResponse.json(
        { 
          error: result.error,
          remaining: result.remaining,
          required: result.required
        },
        { status: 402 } // Payment Required
      )
    }

    return NextResponse.json({
      success: true,
      remaining: result.remaining,
      deducted: amount
    })

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('Credit deduction error:', message)
    
    // Don't expose internal errors to client
    return NextResponse.json(
      { error: 'Internal server error. Please try again.' },
      { status: 500 }
    )
  }
}

export const dynamic = 'force-dynamic'
