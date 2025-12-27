/**
 * PDF BUILDER PRO - BATCH PROCESSING API
 * Process multiple PDFs in a single operation
 * 
 * CR AudioViz AI - Fortune 50 Quality Standards
 * @version 2.0.0
 * @date December 27, 2025
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ============================================================================
// TYPES
// ============================================================================

type BatchOperation = 
  | 'merge'
  | 'split'
  | 'compress'
  | 'convert'
  | 'watermark'
  | 'password_protect'
  | 'remove_password'
  | 'rotate'
  | 'extract_pages'
  | 'add_page_numbers'
  | 'ocr';

interface BatchFile {
  input_url: string;
  output_url?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
}

const CREDIT_COSTS: Record<BatchOperation, number> = {
  merge: 1,
  split: 1,
  compress: 1,
  convert: 2,
  watermark: 1,
  password_protect: 1,
  remove_password: 1,
  rotate: 1,
  extract_pages: 1,
  add_page_numbers: 1,
  ocr: 3,
};

// ============================================================================
// GET - Get batch job status
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('id');
    const action = searchParams.get('action') || 'list';

    if (action === 'operations') {
      return NextResponse.json({
        operations: Object.entries(CREDIT_COSTS).map(([op, cost]) => ({
          id: op,
          name: op.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          credit_cost: cost,
          description: getOperationDescription(op as BatchOperation),
        })),
      });
    }

    if (jobId) {
      const { data, error } = await supabase
        .from('batch_jobs')
        .select('*')
        .eq('id', jobId)
        .eq('user_id', user.id)
        .single();

      if (error || !data) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }

      return NextResponse.json({ job: data });
    }

    const { data, error } = await supabase
      .from('batch_jobs')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    return NextResponse.json({ jobs: data || [] });

  } catch (error: any) {
    console.error('Batch job error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ============================================================================
// POST - Create batch job
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const body = await request.json();
    const { operation, files, options } = body;

    if (!operation || !files || files.length === 0) {
      return NextResponse.json({
        error: 'operation and files required'
      }, { status: 400 });
    }

    if (!CREDIT_COSTS[operation as BatchOperation]) {
      return NextResponse.json({
        error: `Invalid operation. Valid: ${Object.keys(CREDIT_COSTS).join(', ')}`
      }, { status: 400 });
    }

    const creditCost = CREDIT_COSTS[operation as BatchOperation] * files.length;

    const { data: creditData } = await supabase
      .from('user_credits')
      .select('balance')
      .eq('user_id', user.id)
      .single();

    const balance = creditData?.balance || 0;
    if (balance < creditCost) {
      return NextResponse.json({
        error: 'Insufficient credits',
        required: creditCost,
        available: balance,
      }, { status: 402 });
    }

    const { data: createdJob, error: createError } = await supabase
      .from('batch_jobs')
      .insert({
        user_id: user.id,
        operation,
        status: 'pending',
        files: files.map((f: string) => ({ input_url: f, status: 'pending' })),
        options: options || {},
        progress: 0,
      })
      .select()
      .single();

    if (createError) throw createError;

    await supabase.rpc('deduct_credits', {
      p_user_id: user.id,
      p_amount: creditCost,
      p_reason: `Batch ${operation}: ${files.length} files`
    });

    // Queue for background processing
    await supabase.from('job_queue').insert({
      job_id: createdJob.id,
      job_type: 'batch_pdf',
      status: 'pending',
    });

    return NextResponse.json({
      success: true,
      job: createdJob,
      credits_used: creditCost,
      message: `Processing ${files.length} files.`,
    });

  } catch (error: any) {
    console.error('Batch job error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getOperationDescription(op: BatchOperation): string {
  const descriptions: Record<BatchOperation, string> = {
    merge: 'Combine multiple PDFs into one document',
    split: 'Split PDF into individual pages or ranges',
    compress: 'Reduce PDF file size while maintaining quality',
    convert: 'Convert PDFs to/from other formats (Word, Image, etc)',
    watermark: 'Add text or image watermarks to PDFs',
    password_protect: 'Add password protection to PDFs',
    remove_password: 'Remove password from protected PDFs',
    rotate: 'Rotate PDF pages (90°, 180°, 270°)',
    extract_pages: 'Extract specific pages from PDFs',
    add_page_numbers: 'Add page numbers to PDF documents',
    ocr: 'Extract text from scanned PDFs using OCR',
  };
  return descriptions[op];
}
