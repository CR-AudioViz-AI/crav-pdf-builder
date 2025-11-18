-- ============================================================================
-- CR AUDIOVIZ AI - PAYMENT SYSTEM DATABASE MIGRATION
-- ============================================================================
-- Created: November 18, 2025
-- Purpose: Add receipts, payment logs, and enhanced credit tracking
-- ============================================================================

-- ============================================================================
-- RECEIPTS TABLE - Store all purchase receipts
-- ============================================================================
CREATE TABLE IF NOT EXISTS receipts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'credit_purchase', 'subscription', 'one_time'
  amount INTEGER NOT NULL, -- Amount in cents (or minor currency unit)
  currency TEXT NOT NULL DEFAULT 'usd',
  credits INTEGER, -- Number of credits purchased (if applicable)
  
  -- Payment provider details
  stripe_session_id TEXT,
  stripe_payment_intent TEXT,
  paypal_capture_id TEXT,
  paypal_order_id TEXT,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for receipts
CREATE INDEX IF NOT EXISTS idx_receipts_user_id ON receipts(user_id);
CREATE INDEX IF NOT EXISTS idx_receipts_created_at ON receipts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_receipts_stripe_session ON receipts(stripe_session_id) WHERE stripe_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_receipts_paypal_capture ON receipts(paypal_capture_id) WHERE paypal_capture_id IS NOT NULL;

-- Enable RLS
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for receipts
CREATE POLICY "Users can view own receipts"
  ON receipts FOR SELECT
  USING (auth.uid() = user_id);

-- Grant permissions
GRANT ALL ON receipts TO authenticated;
GRANT ALL ON receipts TO service_role;

-- ============================================================================
-- PAYMENT LOGS TABLE - Detailed payment tracking and debugging
-- ============================================================================
CREATE TABLE IF NOT EXISTS payment_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL, -- 'stripe', 'paypal'
  payment_id TEXT NOT NULL, -- Provider's payment ID
  status TEXT NOT NULL, -- 'pending', 'succeeded', 'failed', 'refunded'
  
  -- Amount details
  amount INTEGER NOT NULL, -- Amount in cents
  currency TEXT NOT NULL DEFAULT 'usd',
  
  -- Error tracking
  error_message TEXT,
  error_code TEXT,
  
  -- Additional data
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for payment_logs
CREATE INDEX IF NOT EXISTS idx_payment_logs_user_id ON payment_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_logs_payment_id ON payment_logs(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_logs_status ON payment_logs(status);
CREATE INDEX IF NOT EXISTS idx_payment_logs_created_at ON payment_logs(created_at DESC);

-- Enable RLS
ALTER TABLE payment_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for payment_logs
CREATE POLICY "Users can view own payment logs"
  ON payment_logs FOR SELECT
  USING (auth.uid() = user_id);

-- Grant permissions
GRANT ALL ON payment_logs TO authenticated;
GRANT ALL ON payment_logs TO service_role;

-- ============================================================================
-- ENHANCE CREDIT_TRANSACTIONS - Add metadata column if not exists
-- ============================================================================
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'credit_transactions' 
    AND column_name = 'metadata'
  ) THEN
    ALTER TABLE credit_transactions ADD COLUMN metadata JSONB DEFAULT '{}';
  END IF;
END $$;

-- Add index on metadata for faster queries
CREATE INDEX IF NOT EXISTS idx_credit_transactions_metadata ON credit_transactions USING gin(metadata);

-- ============================================================================
-- SUBSCRIPTION PLANS TABLE - For future subscription management
-- ============================================================================
CREATE TABLE IF NOT EXISTS subscription_plans (
  id TEXT PRIMARY KEY, -- 'starter', 'pro', 'business', 'enterprise'
  name TEXT NOT NULL,
  description TEXT,
  price INTEGER NOT NULL, -- Price in cents
  currency TEXT NOT NULL DEFAULT 'usd',
  credits_per_month INTEGER NOT NULL,
  features JSONB DEFAULT '[]',
  stripe_price_id TEXT,
  paypal_plan_id TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS (read-only for all authenticated users)
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active subscription plans"
  ON subscription_plans FOR SELECT
  USING (active = true);

-- Grant permissions
GRANT SELECT ON subscription_plans TO authenticated;
GRANT ALL ON subscription_plans TO service_role;

-- Insert default subscription plans
INSERT INTO subscription_plans (id, name, description, price, credits_per_month, stripe_price_id, features) VALUES
  ('free', 'Free', 'Get started with basic features', 0, 10, NULL, '["10 credits/month", "Basic support", "Community access"]'),
  ('starter', 'Starter', 'Perfect for individuals', 999, 100, 'price_starter', '["100 credits/month", "Email support", "All basic features"]'),
  ('pro', 'Professional', 'For power users', 3999, 500, 'price_pro', '["500 credits/month", "Priority support", "Advanced features", "API access"]'),
  ('business', 'Business', 'For growing teams', 14999, 2000, 'price_business', '["2000 credits/month", "24/7 support", "Team collaboration", "Custom integrations"]'),
  ('enterprise', 'Enterprise', 'Custom solutions', 49999, 10000, 'price_enterprise', '["10,000 credits/month", "Dedicated support", "White-label options", "SLA guarantee"]')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- USER SUBSCRIPTIONS TABLE - Track active subscriptions
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES subscription_plans(id),
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'cancelled', 'past_due', 'expired'
  
  -- Provider details
  stripe_subscription_id TEXT,
  paypal_subscription_id TEXT,
  
  -- Billing cycle
  current_period_start TIMESTAMP WITH TIME ZONE,
  current_period_end TIMESTAMP WITH TIME ZONE,
  cancel_at_period_end BOOLEAN DEFAULT false,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  cancelled_at TIMESTAMP WITH TIME ZONE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status ON user_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_stripe_id ON user_subscriptions(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

-- Enable RLS
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscriptions"
  ON user_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Grant permissions
GRANT ALL ON user_subscriptions TO authenticated;
GRANT ALL ON user_subscriptions TO service_role;

-- ============================================================================
-- UPDATE TRIGGER FOR TIMESTAMP COLUMNS
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
DROP TRIGGER IF EXISTS update_receipts_updated_at ON receipts;
CREATE TRIGGER update_receipts_updated_at
  BEFORE UPDATE ON receipts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_subscription_plans_updated_at ON subscription_plans;
CREATE TRIGGER update_subscription_plans_updated_at
  BEFORE UPDATE ON subscription_plans
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_subscriptions_updated_at ON user_subscriptions;
CREATE TRIGGER update_user_subscriptions_updated_at
  BEFORE UPDATE ON user_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- HELPER VIEWS FOR REPORTING
-- ============================================================================

-- User payment summary view
CREATE OR REPLACE VIEW user_payment_summary AS
SELECT 
  u.id as user_id,
  u.email,
  uc.credits as current_credits,
  COUNT(DISTINCT r.id) as total_purchases,
  COALESCE(SUM(r.amount), 0) as lifetime_spend,
  COALESCE(SUM(r.credits), 0) as lifetime_credits_purchased,
  MAX(r.created_at) as last_purchase_date
FROM auth.users u
LEFT JOIN user_credits uc ON u.id = uc.user_id
LEFT JOIN receipts r ON u.id = r.user_id
GROUP BY u.id, u.email, uc.credits;

-- Grant view access
GRANT SELECT ON user_payment_summary TO authenticated;
GRANT SELECT ON user_payment_summary TO service_role;

-- ============================================================================
-- ADMIN ANALYTICS VIEWS (service_role only)
-- ============================================================================

-- Revenue analytics view
CREATE OR REPLACE VIEW revenue_analytics AS
SELECT 
  DATE_TRUNC('day', created_at) as date,
  COUNT(*) as transaction_count,
  SUM(amount) as total_revenue,
  SUM(credits) as credits_sold,
  AVG(amount) as avg_transaction_value
FROM receipts
WHERE type = 'credit_purchase'
GROUP BY DATE_TRUNC('day', created_at)
ORDER BY date DESC;

GRANT SELECT ON revenue_analytics TO service_role;

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '✅ Payment system migration completed successfully!';
  RAISE NOTICE '   - receipts table created';
  RAISE NOTICE '   - payment_logs table created';
  RAISE NOTICE '   - subscription_plans table created';
  RAISE NOTICE '   - user_subscriptions table created';
  RAISE NOTICE '   - Analytics views created';
  RAISE NOTICE '   - All RLS policies configured';
END $$;
