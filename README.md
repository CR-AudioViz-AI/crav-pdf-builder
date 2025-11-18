# PDF Builder Pro

**Professional PDF creation with AI-powered content generation**

Built by CR AudioViz AI | Part of the CR AudioViz AI Suite

---

## 🚀 Features

- ✅ **Secure Authentication** - Supabase auth with session management
- ✅ **Credit System** - Pay-per-use model with atomic transactions
- ✅ **Payment Integration** - Stripe & PayPal support
- ✅ **AI Content Generation** - OpenAI-powered text generation
- ✅ **Professional Templates** - Business, technical, creative, and more
- ✅ **Real-time Monitoring** - Health checks and error reporting
- ✅ **Usage Analytics** - Telemetry tracking for optimization
- ✅ **Mobile Responsive** - Works on all devices
- ✅ **WCAG 2.2 AA** - Accessible to all users

---

## 📋 Prerequisites

- Node.js 18.0.0 or higher
- Supabase account with project created
- Stripe account (for payments)
- PayPal Business account (optional, for PayPal payments)
- Vercel account (for deployment)

---

## 🔧 Environment Variables

Create a `.env.local` file in the root directory:

```env
# Database
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# AI Providers
OPENAI_API_KEY=sk-your-openai-key
ANTHROPIC_API_KEY=sk-ant-your-anthropic-key

# Payment Processors
STRIPE_SECRET_KEY=sk_live_your-stripe-key
STRIPE_PUBLISHABLE_KEY=pk_live_your-stripe-key
STRIPE_WEBHOOK_SECRET=whsec_your-webhook-secret

PAYPAL_CLIENT_ID=your-paypal-client-id
PAYPAL_CLIENT_SECRET=your-paypal-secret
PAYPAL_WEBHOOK_ID=your-paypal-webhook-id

# App Configuration
NEXT_PUBLIC_APP_URL=https://your-app-url.vercel.app
NODE_ENV=production

# Javari AI Integration (optional)
JAVARI_WEBHOOK_URL=https://your-javari-webhook-url
```

---

## 📦 Installation

```bash
# Clone the repository
git clone https://github.com/CR-AudioViz-AI/crav-pdf-builder.git
cd crav-pdf-builder

# Install dependencies
npm install

# Run database migrations
# In Supabase SQL Editor, run:
# 1. supabase/migrations/001_create_pdf_documents.sql
# 2. supabase/migrations/002_payment_system.sql
# 3. supabase/migrations/003_telemetry_error_logs.sql

# Start development server
npm run dev
```

Visit `http://localhost:3000` to see the app.

---

## 🗄️ Database Setup

### 1. Run Migrations

In your Supabase SQL Editor, execute these migrations in order:

1. **001_create_pdf_documents.sql** - Core tables (PDF documents, user credits, transactions)
2. **002_payment_system.sql** - Payment tables (receipts, logs, subscriptions)
3. **003_telemetry_error_logs.sql** - Monitoring tables (errors, telemetry, analytics)

### 2. Initial Data

The migrations automatically create:
- Subscription plans (free, starter, pro, business, enterprise)
- RLS policies for security
- Indexes for performance
- Analytics views

---

## 💳 Payment Configuration

### Stripe Setup

1. **Create Products** in Stripe Dashboard:
   - Starter Pack: $9.99 → 100 credits (price_starter)
   - Pro Pack: $39.99 → 500 credits (price_pro)
   - Business Pack: $149.99 → 2000 credits (price_business)
   - Enterprise Pack: $499.99 → 10000 credits (price_enterprise)

2. **Configure Webhook**:
   - URL: `https://your-app.vercel.app/api/webhooks/stripe`
   - Events: `checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.payment_failed`

### PayPal Setup

1. **Create Plans** in PayPal Developer Dashboard
2. **Configure Webhook**:
   - URL: `https://your-app.vercel.app/api/webhooks/paypal`
   - Events: `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED`

---

## 🚀 Deployment

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod

# Configure environment variables in Vercel Dashboard
```

### Manual Deployment

```bash
# Build the project
npm run build

# Start production server
npm start
```

---

## 📊 API Endpoints

### Public Endpoints

- `GET /api/health` - Health check and system status
- `GET /api/credits/purchase` - Get available credit packages
- `POST /api/credits/purchase` - Initiate credit purchase

### Authenticated Endpoints

- `GET /api/credits/balance` - Get user's credit balance
- `POST /api/credits/deduct` - Deduct credits (internal use)
- `POST /api/telemetry` - Log usage analytics
- `POST /api/errors/report` - Report application errors

### Webhook Endpoints

- `POST /api/webhooks/stripe` - Stripe payment webhook
- `POST /api/webhooks/paypal` - PayPal payment webhook

---

## 🎯 Credit Costs

- **Save Document**: 5 credits per save
- **AI Content Generation**: Varies by length (5-20 credits)
- **Export PDF**: Free (no credits required)

---

## 🔒 Security Features

- ✅ Row-Level Security (RLS) on all database tables
- ✅ JWT-based authentication with Supabase
- ✅ Rate limiting (10 requests/minute per user)
- ✅ Webhook signature verification
- ✅ Server-side user verification (no client spoofing)
- ✅ Atomic credit transactions with rollback
- ✅ Error reporting without exposing sensitive data

---

## 📈 Monitoring

### Health Checks

```bash
curl https://your-app.vercel.app/api/health
```

Returns:
```json
{
  "status": "healthy",
  "timestamp": "2025-11-18T...",
  "service": "pdf-builder",
  "checks": {
    "database": { "status": "healthy", "latency_ms": 45 },
    "api": { "status": "healthy" }
  }
}
```

### Error Tracking

All errors are automatically logged to the `error_logs` table with:
- Severity level (low/medium/high/critical)
- Component/file location
- Stack trace
- User context

### Usage Analytics

Telemetry tracks:
- Page views
- Feature usage
- Conversion events
- User milestones

---

## 🧪 Testing

```bash
# Run linter
npm run lint

# Type checking
npx tsc --noEmit

# Build check
npm run build
```

---

## 🛠️ Development

### Project Structure

```
crav-pdf-builder/
├── app/
│   ├── api/               # API routes
│   │   ├── credits/       # Credit management
│   │   ├── health/        # Health monitoring
│   │   ├── webhooks/      # Payment webhooks
│   │   ├── telemetry/     # Usage tracking
│   │   └── errors/        # Error reporting
│   ├── layout.tsx         # Root layout with Error Boundary
│   └── page.tsx           # Main PDF builder interface
├── components/
│   └── ErrorBoundary.tsx  # Error boundary component
├── lib/
│   ├── supabase-client.ts # Supabase utilities
│   └── pdf-generator.ts   # PDF generation logic
├── supabase/
│   └── migrations/        # Database migrations
├── types/
│   └── pdf.ts             # TypeScript types
└── public/                # Static assets
```

---

## 🐛 Troubleshooting

### "Insufficient credits" error
- Check user's credit balance in `user_credits` table
- Verify credit transactions in `credit_transactions` table

### Payment not processing
- Check webhook logs in Stripe/PayPal dashboard
- Verify webhook secret matches environment variable
- Check `payment_logs` table for errors

### Database connection errors
- Verify Supabase credentials in `.env.local`
- Check RLS policies are correctly configured
- Ensure migrations have been run

---

## 📝 License

Proprietary - CR AudioViz AI, LLC

---

## 🤝 Support

- Website: https://craudiovizai.com
- Email: support@craudiovizai.com
- Documentation: https://docs.craudiovizai.com

---

## 🎉 Credits

Built with:
- [Next.js 14](https://nextjs.org)
- [Supabase](https://supabase.com)
- [Stripe](https://stripe.com)
- [PayPal](https://paypal.com)
- [OpenAI](https://openai.com)
- [Tailwind CSS](https://tailwindcss.com)

**Version:** 1.0.0  
**Last Updated:** November 18, 2025
