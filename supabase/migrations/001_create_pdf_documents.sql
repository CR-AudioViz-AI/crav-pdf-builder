-- Create pdf_documents table for storing user PDFs
CREATE TABLE IF NOT EXISTS pdf_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  template TEXT NOT NULL DEFAULT 'blank',
  content JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on user_id for faster queries
CREATE INDEX IF NOT EXISTS idx_pdf_documents_user_id ON pdf_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_pdf_documents_created_at ON pdf_documents(created_at DESC);

-- Enable Row Level Security
ALTER TABLE pdf_documents ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view own PDF documents"
  ON pdf_documents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own PDF documents"
  ON pdf_documents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own PDF documents"
  ON pdf_documents FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own PDF documents"
  ON pdf_documents FOR DELETE
  USING (auth.uid() = user_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_pdf_documents_updated_at
  BEFORE UPDATE ON pdf_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions
GRANT ALL ON pdf_documents TO authenticated;
GRANT ALL ON pdf_documents TO service_role;

-- Create user_credits table if it doesn't exist
CREATE TABLE IF NOT EXISTS user_credits (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  credits INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create credit_transactions table if it doesn't exist
CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on credits tables
ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

-- RLS policies for user_credits
CREATE POLICY "Users can view own credits"
  ON user_credits FOR SELECT
  USING (auth.uid() = user_id);

-- RLS policies for credit_transactions
CREATE POLICY "Users can view own transactions"
  ON credit_transactions FOR SELECT
  USING (auth.uid() = user_id);

-- Grant permissions
GRANT ALL ON user_credits TO authenticated;
GRANT ALL ON user_credits TO service_role;
GRANT ALL ON credit_transactions TO authenticated;
GRANT ALL ON credit_transactions TO service_role;