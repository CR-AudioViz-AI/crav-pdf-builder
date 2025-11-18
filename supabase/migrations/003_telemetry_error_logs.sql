-- ============================================================================
-- CR AUDIOVIZ AI - TELEMETRY & ERROR LOGGING MIGRATION
-- ============================================================================
-- Created: November 18, 2025
-- Purpose: Add telemetry tracking, error logging, and analytics tables
-- ============================================================================

-- ============================================================================
-- ERROR LOGS TABLE - Track all application errors
-- ============================================================================
CREATE TABLE IF NOT EXISTS error_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service TEXT NOT NULL, -- 'pdf-builder', 'market-oracle', etc
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Error details
  message TEXT NOT NULL,
  stack TEXT,
  component TEXT, -- Component/file where error occurred
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  
  -- Context
  context JSONB DEFAULT '{}',
  
  -- Resolution
  resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolution_notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_error_logs_service ON error_logs(service);
CREATE INDEX IF NOT EXISTS idx_error_logs_severity ON error_logs(severity);
CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_resolved ON error_logs(resolved);
CREATE INDEX IF NOT EXISTS idx_error_logs_user_id ON error_logs(user_id) WHERE user_id IS NOT NULL;

-- Enable RLS
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

-- Users can view their own errors
CREATE POLICY "Users can view own errors"
  ON error_logs FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can do everything
GRANT ALL ON error_logs TO service_role;
GRANT SELECT ON error_logs TO authenticated;

-- ============================================================================
-- TELEMETRY EVENTS TABLE - Track user behavior and feature usage
-- ============================================================================
CREATE TABLE IF NOT EXISTS telemetry_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service TEXT NOT NULL,
  user_id TEXT NOT NULL, -- Can be 'anonymous' or actual UUID
  
  -- Event details
  event_type TEXT NOT NULL, -- 'page_view', 'feature_used', 'error', 'conversion'
  event_name TEXT NOT NULL, -- Specific event identifier
  properties JSONB DEFAULT '{}',
  
  -- Session tracking
  session_id TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_telemetry_service ON telemetry_events(service);
CREATE INDEX IF NOT EXISTS idx_telemetry_user_id ON telemetry_events(user_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_event_type ON telemetry_events(event_type);
CREATE INDEX IF NOT EXISTS idx_telemetry_event_name ON telemetry_events(event_name);
CREATE INDEX IF NOT EXISTS idx_telemetry_created_at ON telemetry_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_properties ON telemetry_events USING gin(properties);

-- Enable RLS
ALTER TABLE telemetry_events ENABLE ROW LEVEL SECURITY;

-- Users can insert their own events
CREATE POLICY "Users can insert own telemetry"
  ON telemetry_events FOR INSERT
  WITH CHECK (true); -- Allow anonymous telemetry

-- Users can view their own telemetry
CREATE POLICY "Users can view own telemetry"
  ON telemetry_events FOR SELECT
  USING (user_id = auth.uid()::text OR auth.uid() IS NULL);

GRANT ALL ON telemetry_events TO service_role;
GRANT INSERT ON telemetry_events TO authenticated;
GRANT INSERT ON telemetry_events TO anon;

-- ============================================================================
-- CONVERSION EVENTS TABLE - Track revenue-generating actions
-- ============================================================================
CREATE TABLE IF NOT EXISTS conversion_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL,
  event_name TEXT NOT NULL,
  revenue INTEGER DEFAULT 0, -- Revenue in cents
  credits INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversion_user_id ON conversion_events(user_id);
CREATE INDEX IF NOT EXISTS idx_conversion_created_at ON conversion_events(created_at DESC);

-- Enable RLS
ALTER TABLE conversion_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only"
  ON conversion_events FOR ALL
  USING (auth.uid() IS NOT NULL);

GRANT ALL ON conversion_events TO service_role;

-- ============================================================================
-- FEATURE USAGE TABLE - Track which features are being used
-- ============================================================================
CREATE TABLE IF NOT EXISTS feature_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL,
  feature_name TEXT NOT NULL,
  usage_count INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feature_usage_user_id ON feature_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_feature_usage_feature_name ON feature_usage(feature_name);
CREATE INDEX IF NOT EXISTS idx_feature_usage_created_at ON feature_usage(created_at DESC);

-- Enable RLS
ALTER TABLE feature_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only for feature usage"
  ON feature_usage FOR ALL
  USING (auth.uid() IS NOT NULL);

GRANT ALL ON feature_usage TO service_role;

-- ============================================================================
-- USER MILESTONES TABLE - Track user journey achievements
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_milestones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL,
  milestone TEXT NOT NULL,
  achieved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_milestones_user_id ON user_milestones(user_id);
CREATE INDEX IF NOT EXISTS idx_milestones_milestone ON user_milestones(milestone);
CREATE INDEX IF NOT EXISTS idx_milestones_achieved_at ON user_milestones(achieved_at DESC);

-- Enable RLS
ALTER TABLE user_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own milestones"
  ON user_milestones FOR SELECT
  USING (user_id = auth.uid()::text);

GRANT ALL ON user_milestones TO service_role;
GRANT SELECT ON user_milestones TO authenticated;

-- ============================================================================
-- ANALYTICS VIEWS
-- ============================================================================

-- Daily error summary
CREATE OR REPLACE VIEW daily_error_summary AS
SELECT 
  DATE_TRUNC('day', created_at) as date,
  service,
  severity,
  COUNT(*) as error_count,
  COUNT(DISTINCT user_id) as affected_users
FROM error_logs
GROUP BY DATE_TRUNC('day', created_at), service, severity
ORDER BY date DESC;

GRANT SELECT ON daily_error_summary TO service_role;

-- Feature popularity
CREATE OR REPLACE VIEW feature_popularity AS
SELECT 
  feature_name,
  COUNT(*) as total_uses,
  COUNT(DISTINCT user_id) as unique_users,
  MAX(created_at) as last_used
FROM feature_usage
GROUP BY feature_name
ORDER BY total_uses DESC;

GRANT SELECT ON feature_popularity TO service_role;

-- User engagement metrics
CREATE OR REPLACE VIEW user_engagement_metrics AS
SELECT 
  user_id,
  COUNT(*) as total_events,
  COUNT(DISTINCT event_type) as unique_event_types,
  MIN(created_at) as first_seen,
  MAX(created_at) as last_seen
FROM telemetry_events
WHERE user_id != 'anonymous'
GROUP BY user_id;

GRANT SELECT ON user_engagement_metrics TO service_role;

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '✅ Telemetry & error logging migration completed!';
  RAISE NOTICE '   - error_logs table created';
  RAISE NOTICE '   - telemetry_events table created';
  RAISE NOTICE '   - conversion_events table created';
  RAISE NOTICE '   - feature_usage table created';
  RAISE NOTICE '   - user_milestones table created';
  RAISE NOTICE '   - Analytics views created';
END $$;
