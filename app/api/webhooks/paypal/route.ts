import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-client'
import crypto from 'crypto'

const PAYPAL_WEBHOOK_ID = process.env.PAYPAL_WEBHOOK_ID!
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID!
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET!
const PAYPAL_API_URL = process.env.NODE_ENV === 'production' 
  ? 'https://api-m.paypal.com' 
  : 'https://api-m.sandbox.paypal.com'

// Credit packages (must match Stripe)
const CREDIT_PACKAGES: Record<string, number> = {
  'STARTER_PLAN': 100,     // $9.99 → 100 credits
  'PRO_PLAN': 500,         // $39.99 → 500 credits
  'BUSINESS_PLAN': 2000,   // $149.99 → 2000 credits
  'ENTERPRISE_PLAN': 10000 // $499.99 → 10000 credits
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const headers = {
      'paypal-transmission-id': request.headers.get('paypal-transmission-id') || '',
      'paypal-transmission-time': request.headers.get('paypal-transmission-time') || '',
      'paypal-transmission-sig': request.headers.get('paypal-transmission-sig') || '',
      'paypal-cert-url': request.headers.get('paypal-cert-url') || '',
      'paypal-auth-algo': request.headers.get('paypal-auth-algo') || ''
    }

    // Verify webhook signature
    const isValid = await verifyPayPalWebhook(body, headers)

    if (!isValid) {
      console.error('PayPal webhook signature verification failed')
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      )
    }

    const event = JSON.parse(body)

    // Handle different event types
    switch (event.event_type) {
      case 'PAYMENT.CAPTURE.COMPLETED':
        await handlePaymentCompleted(event)
        break

      case 'PAYMENT.CAPTURE.DENIED':
      case 'PAYMENT.CAPTURE.DECLINED':
        await handlePaymentFailed(event)
        break

      default:
        console.log(`Unhandled PayPal event: ${event.event_type}`)
    }

    return NextResponse.json({ received: true })

  } catch (error) {
    console.error('PayPal webhook error:', error)
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    )
  }
}

async function verifyPayPalWebhook(body: string, headers: any): Promise<boolean> {
  try {
    // Get PayPal access token
    const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64')
    
    const tokenResponse = await fetch(`${PAYPAL_API_URL}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    })

    const tokenData = await tokenResponse.json()
    const accessToken = tokenData.access_token

    // Verify webhook signature
    const verifyResponse = await fetch(`${PAYPAL_API_URL}/v1/notifications/verify-webhook-signature`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        transmission_id: headers['paypal-transmission-id'],
        transmission_time: headers['paypal-transmission-time'],
        cert_url: headers['paypal-cert-url'],
        auth_algo: headers['paypal-auth-algo'],
        transmission_sig: headers['paypal-transmission-sig'],
        webhook_id: PAYPAL_WEBHOOK_ID,
        webhook_event: JSON.parse(body)
      })
    })

    const verifyData = await verifyResponse.json()
    return verifyData.verification_status === 'SUCCESS'

  } catch (error) {
    console.error('PayPal verification error:', error)
    return false
  }
}

async function handlePaymentCompleted(event: any) {
  const supabase = createSupabaseServerClient()

  try {
    // Extract data from event
    const capture = event.resource
    const userId = capture.custom_id // User ID passed in custom_id
    const planId = capture.invoice_id // Plan ID passed in invoice_id

    if (!userId || !planId) {
      console.error('Missing user_id or plan_id in PayPal webhook')
      return
    }

    // Determine credit amount
    const creditsToAdd = CREDIT_PACKAGES[planId] || 0

    if (creditsToAdd === 0) {
      console.error('Unknown plan ID:', planId)
      return
    }

    // Get current credits
    const { data: currentData } = await supabase
      .from('user_credits')
      .select('credits')
      .eq('user_id', userId)
      .single()

    const currentCredits = currentData?.credits || 0
    const newTotal = currentCredits + creditsToAdd

    // Update credits
    await supabase
      .from('user_credits')
      .upsert({
        user_id: userId,
        credits: newTotal,
        updated_at: new Date().toISOString()
      })

    // Log transaction
    await supabase
      .from('credit_transactions')
      .insert({
        user_id: userId,
        amount: creditsToAdd,
        reason: `PayPal purchase: ${capture.id}`,
        metadata: {
          capture_id: capture.id,
          amount_paid: capture.amount.value,
          currency: capture.amount.currency_code,
          plan_id: planId
        },
        created_at: new Date().toISOString()
      })

    // Create receipt
    await supabase
      .from('receipts')
      .insert({
        user_id: userId,
        type: 'credit_purchase',
        amount: parseFloat(capture.amount.value) * 100, // Convert to cents
        currency: capture.amount.currency_code,
        credits: creditsToAdd,
        paypal_capture_id: capture.id,
        created_at: new Date().toISOString()
      })

    // Log payment
    await supabase
      .from('payment_logs')
      .insert({
        user_id: userId,
        provider: 'paypal',
        payment_id: capture.id,
        status: 'completed',
        amount: parseFloat(capture.amount.value) * 100,
        currency: capture.amount.currency_code,
        created_at: new Date().toISOString()
      })

    console.log(`PayPal: Credits added: ${creditsToAdd} for user ${userId}`)

  } catch (error) {
    console.error('Error processing PayPal payment:', error)
    throw error
  }
}

async function handlePaymentFailed(event: any) {
  const supabase = createSupabaseServerClient()

  try {
    const capture = event.resource
    const userId = capture.custom_id

    if (!userId) return

    // Log failed payment
    await supabase
      .from('payment_logs')
      .insert({
        user_id: userId,
        provider: 'paypal',
        payment_id: capture.id,
        status: 'failed',
        amount: parseFloat(capture.amount.value) * 100,
        currency: capture.amount.currency_code,
        created_at: new Date().toISOString()
      })

    console.log(`PayPal payment failed: ${capture.id}`)

  } catch (error) {
    console.error('Error logging PayPal payment failure:', error)
  }
}

export const dynamic = 'force-dynamic'
