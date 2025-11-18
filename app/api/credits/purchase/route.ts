import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseBrowserClient } from '@/lib/supabase-client'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-11-20.acacia'
})

// Credit packages with pricing
const CREDIT_PACKAGES = [
  {
    id: 'starter',
    name: 'Starter Pack',
    credits: 100,
    price: 999, // $9.99 in cents
    stripePriceId: 'price_starter',
    popular: false
  },
  {
    id: 'pro',
    name: 'Pro Pack',
    credits: 500,
    price: 3999, // $39.99 in cents
    stripePriceId: 'price_pro',
    popular: true
  },
  {
    id: 'business',
    name: 'Business Pack',
    credits: 2000,
    price: 14999, // $149.99 in cents
    stripePriceId: 'price_business',
    popular: false
  },
  {
    id: 'enterprise',
    name: 'Enterprise Pack',
    credits: 10000,
    price: 49999, // $499.99 in cents
    stripePriceId: 'price_enterprise',
    popular: false
  }
]

export async function GET(request: NextRequest) {
  // Return available packages
  return NextResponse.json({
    packages: CREDIT_PACKAGES
  })
}

export async function POST(request: NextRequest) {
  try {
    // SECURITY: Get auth token
    const authHeader = request.headers.get('authorization')
    
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Verify user
    const token = authHeader.substring(7)
    const supabase = createSupabaseBrowserClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { packageId, provider = 'stripe' } = body

    // Find package
    const selectedPackage = CREDIT_PACKAGES.find(pkg => pkg.id === packageId)

    if (!selectedPackage) {
      return NextResponse.json(
        { error: 'Invalid package' },
        { status: 400 }
      )
    }

    // Create payment based on provider
    if (provider === 'stripe') {
      return await createStripeCheckout(user.id, selectedPackage)
    } else if (provider === 'paypal') {
      return await createPayPalPayment(user.id, selectedPackage)
    } else {
      return NextResponse.json(
        { error: 'Invalid payment provider' },
        { status: 400 }
      )
    }

  } catch (error) {
    console.error('Purchase error:', error)
    return NextResponse.json(
      { error: 'Failed to create payment' },
      { status: 500 }
    )
  }
}

async function createStripeCheckout(userId: string, package: any) {
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${package.name} - ${package.credits} Credits`,
              description: `Purchase ${package.credits} credits for CR AudioViz AI apps`,
            },
            unit_amount: package.price,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/apps/pdf-builder?payment=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/apps/pdf-builder?payment=cancelled`,
      metadata: {
        user_id: userId,
        price_id: package.stripePriceId,
        credits: package.credits.toString()
      }
    })

    return NextResponse.json({
      provider: 'stripe',
      checkoutUrl: session.url,
      sessionId: session.id
    })

  } catch (error) {
    console.error('Stripe checkout error:', error)
    throw error
  }
}

async function createPayPalPayment(userId: string, package: any) {
  try {
    // Get PayPal access token
    const auth = Buffer.from(
      `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
    ).toString('base64')

    const PAYPAL_API_URL = process.env.NODE_ENV === 'production'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com'

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

    // Create order
    const orderResponse = await fetch(`${PAYPAL_API_URL}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            amount: {
              currency_code: 'USD',
              value: (package.price / 100).toFixed(2)
            },
            description: `${package.name} - ${package.credits} Credits`,
            custom_id: userId,
            invoice_id: package.id.toUpperCase() + '_PLAN'
          }
        ],
        application_context: {
          return_url: `${process.env.NEXT_PUBLIC_APP_URL}/apps/pdf-builder?payment=success`,
          cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/apps/pdf-builder?payment=cancelled`,
          brand_name: 'CR AudioViz AI',
          user_action: 'PAY_NOW'
        }
      })
    })

    const orderData = await orderResponse.json()
    
    // Find approval URL
    const approvalUrl = orderData.links.find(
      (link: any) => link.rel === 'approve'
    )?.href

    return NextResponse.json({
      provider: 'paypal',
      checkoutUrl: approvalUrl,
      orderId: orderData.id
    })

  } catch (error) {
    console.error('PayPal payment error:', error)
    throw error
  }
}

export const dynamic = 'force-dynamic'
