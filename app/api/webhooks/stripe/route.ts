import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { createSupabaseServerClient } from '@/lib/supabase-client'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-11-20.acacia'
})

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!

// Credit packages
const CREDIT_PACKAGES: Record<string, number> = {
  'price_starter': 100,     // $9.99 → 100 credits
  'price_pro': 500,         // $39.99 → 500 credits  
  'price_business': 2000,   // $149.99 → 2000 credits
  'price_enterprise': 10000 // $499.99 → 10000 credits
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const signature = headers().get('stripe-signature')

    if (!signature) {
      return NextResponse.json(
        { error: 'Missing stripe-signature header' },
        { status: 400 }
      )
    }

    // Verify webhook signature
    let event: Stripe.Event
    try {
      event = stripe.webhooks.constructEvent(
        body,
        signature,
        webhookSecret
      )
    } catch (err) {
      console.error('Webhook signature verification failed:', err)
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      )
    }

    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session)
        break

      case 'payment_intent.succeeded':
        await handlePaymentSucceeded(event.data.object as Stripe.PaymentIntent)
        break

      case 'payment_intent.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.PaymentIntent)
        break

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    return NextResponse.json({ received: true })

  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    )
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const supabase = createSupabaseServerClient()

  try {
    // Get user ID from metadata
    const userId = session.metadata?.user_id
    const priceId = session.metadata?.price_id

    if (!userId || !priceId) {
      console.error('Missing metadata in checkout session')
      return
    }

    // Determine credit amount based on price ID
    const creditsToAdd = CREDIT_PACKAGES[priceId] || 0

    if (creditsToAdd === 0) {
      console.error('Unknown price ID:', priceId)
      return
    }

    // Get current credit balance
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
        reason: `Stripe purchase: ${session.id}`,
        metadata: {
          session_id: session.id,
          amount_paid: session.amount_total,
          currency: session.currency,
          price_id: priceId
        },
        created_at: new Date().toISOString()
      })

    // Create receipt record
    await supabase
      .from('receipts')
      .insert({
        user_id: userId,
        type: 'credit_purchase',
        amount: session.amount_total,
        currency: session.currency,
        credits: creditsToAdd,
        stripe_session_id: session.id,
        stripe_payment_intent: session.payment_intent as string,
        created_at: new Date().toISOString()
      })

    console.log(`Credits added: ${creditsToAdd} for user ${userId}`)

  } catch (error) {
    console.error('Error processing checkout:', error)
    throw error
  }
}

async function handlePaymentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  const supabase = createSupabaseServerClient()

  try {
    const userId = paymentIntent.metadata?.user_id

    if (!userId) return

    // Log successful payment
    await supabase
      .from('payment_logs')
      .insert({
        user_id: userId,
        provider: 'stripe',
        payment_id: paymentIntent.id,
        status: 'succeeded',
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        created_at: new Date().toISOString()
      })

    console.log(`Payment succeeded: ${paymentIntent.id}`)

  } catch (error) {
    console.error('Error logging payment success:', error)
  }
}

async function handlePaymentFailed(paymentIntent: Stripe.PaymentIntent) {
  const supabase = createSupabaseServerClient()

  try {
    const userId = paymentIntent.metadata?.user_id

    if (!userId) return

    // Log failed payment
    await supabase
      .from('payment_logs')
      .insert({
        user_id: userId,
        provider: 'stripe',
        payment_id: paymentIntent.id,
        status: 'failed',
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        error_message: paymentIntent.last_payment_error?.message,
        created_at: new Date().toISOString()
      })

    console.log(`Payment failed: ${paymentIntent.id}`)

  } catch (error) {
    console.error('Error logging payment failure:', error)
  }
}

export const dynamic = 'force-dynamic'
