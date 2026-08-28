/**
 * PDF BUILDER PRO - PDF OPERATIONS API
 * Comprehensive PDF manipulation: Merge, Split, Rotate, Compress, Watermark
 * 
 * CR AudioViz AI - Fortune 50 Quality Standards
 * @version 2.0.0
 * @date December 27, 2025
 * 
 * Credit Costs:
 * - Merge: 2 credits
 * - Split: 2 credits  
 * - Rotate: 1 credit
 * - Compress: 3 credits
 * - Watermark: 2 credits
 */

import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, degrees, rgb, StandardFonts } from 'pdf-lib';
import { createClient } from '@supabase/supabase-js';
import { secretKey, supabaseUrl } from "@craudioviz/platform-sdk";

// Credit costs per operation
const CREDIT_COSTS = {
  merge: 2,
  split: 2,
  rotate: 1,
  compress: 3,
  watermark: 2,
  protect: 2,
  unlock: 3,
  extract_pages: 1,
  add_page_numbers: 1,
  delete_pages: 1,
  reorder_pages: 1,
};

type OperationType = keyof typeof CREDIT_COSTS;

// Initialize Supabase
const supabase = createClient(
  supabaseUrl(),
  secretKey()
);

// ============================================================================
// AUTHENTICATION & CREDITS
// ============================================================================

async function authenticateAndCheckCredits(
  request: NextRequest,
  operation: OperationType
): Promise<{ userId: string; error?: NextResponse }> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { 
      userId: '', 
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) 
    };
  }

  const token = authHeader.substring(7);
  
  // Verify token and get user
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  
  if (authError || !user) {
    return { 
      userId: '', 
      error: NextResponse.json({ error: 'Invalid token' }, { status: 401 }) 
    };
  }

  // Check credit balance
  const { data: creditData, error: creditError } = await supabase
    .from('user_credits')
    .select('balance')
    .eq('user_id', user.id)
    .single();

  const balance = creditData?.balance || 0;
  const cost = CREDIT_COSTS[operation];

  if (balance < cost) {
    return {
      userId: user.id,
      error: NextResponse.json({
        error: 'Insufficient credits',
        required: cost,
        available: balance,
        operation
      }, { status: 402 })
    };
  }

  return { userId: user.id };
}

async function deductCredits(
  userId: string,
  operation: OperationType,
  description: string
): Promise<void> {
  const cost = CREDIT_COSTS[operation];
  
  // Deduct credits
  const { error: updateError } = await supabase.rpc('deduct_credits', {
    p_user_id: userId,
    p_amount: cost,
    p_reason: `PDF ${operation}: ${description}`
  });

  if (updateError) {
    console.error('Credit deduction error:', updateError);
    throw new Error('Failed to deduct credits');
  }

  // Log transaction
  await supabase.from('credit_transactions').insert({
    user_id: userId,
    amount: -cost,
    type: 'usage',
    description: `PDF ${operation}: ${description}`,
    app: 'pdf-builder-pro'
  });
}

// ============================================================================
// MERGE PDFs
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const operation = searchParams.get('operation') as OperationType;

    if (!operation || !CREDIT_COSTS[operation]) {
      return NextResponse.json(
        { error: 'Invalid operation', validOperations: Object.keys(CREDIT_COSTS) },
        { status: 400 }
      );
    }

    // Authenticate and check credits
    const { userId, error } = await authenticateAndCheckCredits(request, operation);
    if (error) return error;

    const formData = await request.formData();

    let result: { pdfBytes: Uint8Array; filename: string; message: string };

    switch (operation) {
      case 'merge':
        result = await handleMerge(formData);
        break;
      case 'split':
        result = await handleSplit(formData);
        break;
      case 'rotate':
        result = await handleRotate(formData);
        break;
      case 'compress':
        result = await handleCompress(formData);
        break;
      case 'watermark':
        result = await handleWatermark(formData);
        break;
      case 'extract_pages':
        result = await handleExtractPages(formData);
        break;
      case 'add_page_numbers':
        result = await handleAddPageNumbers(formData);
        break;
      case 'delete_pages':
        result = await handleDeletePages(formData);
        break;
      case 'reorder_pages':
        result = await handleReorderPages(formData);
        break;
      default:
        return NextResponse.json({ error: 'Operation not implemented' }, { status: 501 });
    }

    // Deduct credits after successful operation
    await deductCredits(userId, operation, result.filename);

    // Return the processed PDF
    return new NextResponse(Buffer.from(result.pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${result.filename}"`,
        'X-Operation': operation,
        'X-Credits-Used': CREDIT_COSTS[operation].toString(),
        'X-Message': result.message,
      },
    });

  } catch (error: any) {
    console.error('PDF operation error:', error);
    return NextResponse.json(
      { error: error.message || 'PDF operation failed' },
      { status: 500 }
    );
  }
}

// ============================================================================
// OPERATION HANDLERS
// ============================================================================

async function handleMerge(formData: FormData): Promise<{ pdfBytes: Uint8Array; filename: string; message: string }> {
  const files = formData.getAll('files') as File[];
  
  if (files.length < 2) {
    throw new Error('At least 2 PDF files required for merge');
  }

  const mergedPdf = await PDFDocument.create();
  let totalPages = 0;

  for (const file of files) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await PDFDocument.load(arrayBuffer);
    const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
    pages.forEach(page => mergedPdf.addPage(page));
    totalPages += pages.length;
  }

  const pdfBytes = await mergedPdf.save();

  return {
    pdfBytes,
    filename: `merged_${files.length}_documents.pdf`,
    message: `Successfully merged ${files.length} PDFs (${totalPages} total pages)`
  };
}

async function handleSplit(formData: FormData): Promise<{ pdfBytes: Uint8Array; filename: string; message: string }> {
  const file = formData.get('file') as File;
  const mode = formData.get('mode') as string || 'all'; // 'all', 'range', 'every-n'
  const range = formData.get('range') as string; // e.g., "1-3,5,7-9"
  const everyN = parseInt(formData.get('everyN') as string) || 1;
  const pageNumber = parseInt(formData.get('pageNumber') as string) || 1;

  if (!file) {
    throw new Error('PDF file required');
  }

  const arrayBuffer = await file.arrayBuffer();
  const sourcePdf = await PDFDocument.load(arrayBuffer);
  const totalPages = sourcePdf.getPageCount();

  // For single page extraction
  if (mode === 'single' && pageNumber >= 1 && pageNumber <= totalPages) {
    const newPdf = await PDFDocument.create();
    const [page] = await newPdf.copyPages(sourcePdf, [pageNumber - 1]);
    newPdf.addPage(page);
    const pdfBytes = await newPdf.save();
    
    return {
      pdfBytes,
      filename: `page_${pageNumber}.pdf`,
      message: `Extracted page ${pageNumber} of ${totalPages}`
    };
  }

  // For range extraction
  if (mode === 'range' && range) {
    const pageIndices = parsePageRange(range, totalPages);
    const newPdf = await PDFDocument.create();
    const pages = await newPdf.copyPages(sourcePdf, pageIndices);
    pages.forEach(page => newPdf.addPage(page));
    const pdfBytes = await newPdf.save();
    
    return {
      pdfBytes,
      filename: `pages_${range.replace(/,/g, '_')}.pdf`,
      message: `Extracted ${pageIndices.length} pages`
    };
  }

  // Default: return first page for preview (full split would return ZIP)
  const newPdf = await PDFDocument.create();
  const [page] = await newPdf.copyPages(sourcePdf, [0]);
  newPdf.addPage(page);
  const pdfBytes = await newPdf.save();

  return {
    pdfBytes,
    filename: 'page_1.pdf',
    message: `Split preview: Document has ${totalPages} pages. Use range parameter for specific pages.`
  };
}

async function handleRotate(formData: FormData): Promise<{ pdfBytes: Uint8Array; filename: string; message: string }> {
  const file = formData.get('file') as File;
  const angle = parseInt(formData.get('angle') as string) || 90;
  const pages = formData.get('pages') as string || 'all'; // 'all', 'odd', 'even', or specific like "1,3,5"

  if (!file) {
    throw new Error('PDF file required');
  }

  if (![90, 180, 270, -90, -180, -270].includes(angle)) {
    throw new Error('Invalid rotation angle. Use 90, 180, or 270 degrees');
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await PDFDocument.load(arrayBuffer);
  const totalPages = pdf.getPageCount();

  let pageIndices: number[];

  if (pages === 'all') {
    pageIndices = Array.from({ length: totalPages }, (_, i) => i);
  } else if (pages === 'odd') {
    pageIndices = Array.from({ length: totalPages }, (_, i) => i).filter(i => i % 2 === 0);
  } else if (pages === 'even') {
    pageIndices = Array.from({ length: totalPages }, (_, i) => i).filter(i => i % 2 === 1);
  } else {
    pageIndices = parsePageRange(pages, totalPages);
  }

  pageIndices.forEach(index => {
    const page = pdf.getPage(index);
    const currentRotation = page.getRotation().angle;
    page.setRotation(degrees(currentRotation + angle));
  });

  const pdfBytes = await pdf.save();
  const originalName = file.name.replace('.pdf', '');

  return {
    pdfBytes,
    filename: `${originalName}_rotated_${angle}deg.pdf`,
    message: `Rotated ${pageIndices.length} pages by ${angle}°`
  };
}

async function handleCompress(formData: FormData): Promise<{ pdfBytes: Uint8Array; filename: string; message: string }> {
  const file = formData.get('file') as File;
  const quality = formData.get('quality') as string || 'medium'; // 'low', 'medium', 'high'

  if (!file) {
    throw new Error('PDF file required');
  }

  const originalSize = file.size;
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await PDFDocument.load(arrayBuffer);

  // PDF-lib doesn't support direct compression, but we can:
  // 1. Remove metadata
  // 2. Flatten forms
  // 3. Use object streams
  
  // Remove metadata for better compression
  pdf.setTitle('');
  pdf.setAuthor('');
  pdf.setSubject('');
  pdf.setKeywords([]);
  pdf.setProducer('PDF Builder Pro');
  pdf.setCreator('CR AudioViz AI');

  const pdfBytes = await pdf.save({
    useObjectStreams: true, // Enables object streams for smaller file
  });

  const compressedSize = pdfBytes.length;
  const reduction = ((originalSize - compressedSize) / originalSize * 100).toFixed(1);
  const originalName = file.name.replace('.pdf', '');

  return {
    pdfBytes,
    filename: `${originalName}_compressed.pdf`,
    message: `Compressed from ${formatBytes(originalSize)} to ${formatBytes(compressedSize)} (${reduction}% reduction)`
  };
}

async function handleWatermark(formData: FormData): Promise<{ pdfBytes: Uint8Array; filename: string; message: string }> {
  const file = formData.get('file') as File;
  const text = formData.get('text') as string || 'CONFIDENTIAL';
  const position = formData.get('position') as string || 'center'; // 'center', 'diagonal', 'header', 'footer'
  const opacity = parseFloat(formData.get('opacity') as string) || 0.3;
  const fontSize = parseInt(formData.get('fontSize') as string) || 48;
  const color = formData.get('color') as string || '#888888';
  const pages = formData.get('pages') as string || 'all';

  if (!file) {
    throw new Error('PDF file required');
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await PDFDocument.load(arrayBuffer);
  const totalPages = pdf.getPageCount();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  // Parse color
  const colorRgb = hexToRgbValues(color);

  let pageIndices: number[];
  if (pages === 'all') {
    pageIndices = Array.from({ length: totalPages }, (_, i) => i);
  } else if (pages === 'odd') {
    pageIndices = Array.from({ length: totalPages }, (_, i) => i).filter(i => i % 2 === 0);
  } else if (pages === 'even') {
    pageIndices = Array.from({ length: totalPages }, (_, i) => i).filter(i => i % 2 === 1);
  } else {
    pageIndices = parsePageRange(pages, totalPages);
  }

  pageIndices.forEach(index => {
    const page = pdf.getPage(index);
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(text, fontSize);

    let x: number, y: number, rotate: number;

    switch (position) {
      case 'diagonal':
        x = width / 2 - textWidth / 2;
        y = height / 2;
        rotate = -45;
        break;
      case 'header':
        x = width / 2 - textWidth / 2;
        y = height - 50;
        rotate = 0;
        break;
      case 'footer':
        x = width / 2 - textWidth / 2;
        y = 30;
        rotate = 0;
        break;
      case 'center':
      default:
        x = width / 2 - textWidth / 2;
        y = height / 2;
        rotate = 0;
    }

    page.drawText(text, {
      x,
      y,
      size: fontSize,
      font,
      color: rgb(colorRgb.r / 255, colorRgb.g / 255, colorRgb.b / 255),
      opacity,
      rotate: degrees(rotate),
    });
  });

  const pdfBytes = await pdf.save();
  const originalName = file.name.replace('.pdf', '');

  return {
    pdfBytes,
    filename: `${originalName}_watermarked.pdf`,
    message: `Added "${text}" watermark to ${pageIndices.length} pages`
  };
}

async function handleExtractPages(formData: FormData): Promise<{ pdfBytes: Uint8Array; filename: string; message: string }> {
  const file = formData.get('file') as File;
  const range = formData.get('range') as string;

  if (!file || !range) {
    throw new Error('PDF file and page range required');
  }

  const arrayBuffer = await file.arrayBuffer();
  const sourcePdf = await PDFDocument.load(arrayBuffer);
  const totalPages = sourcePdf.getPageCount();
  const pageIndices = parsePageRange(range, totalPages);

  const newPdf = await PDFDocument.create();
  const pages = await newPdf.copyPages(sourcePdf, pageIndices);
  pages.forEach(page => newPdf.addPage(page));

  const pdfBytes = await newPdf.save();
  const originalName = file.name.replace('.pdf', '');

  return {
    pdfBytes,
    filename: `${originalName}_extracted.pdf`,
    message: `Extracted ${pageIndices.length} pages from ${totalPages} total`
  };
}

async function handleAddPageNumbers(formData: FormData): Promise<{ pdfBytes: Uint8Array; filename: string; message: string }> {
  const file = formData.get('file') as File;
  const position = formData.get('position') as string || 'bottom-center';
  const format = formData.get('format') as string || 'Page {n} of {total}';
  const startNumber = parseInt(formData.get('startNumber') as string) || 1;

  if (!file) {
    throw new Error('PDF file required');
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await PDFDocument.load(arrayBuffer);
  const totalPages = pdf.getPageCount();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  for (let i = 0; i < totalPages; i++) {
    const page = pdf.getPage(i);
    const { width, height } = page.getSize();
    const pageNum = startNumber + i;
    
    const text = format
      .replace('{n}', pageNum.toString())
      .replace('{total}', (totalPages + startNumber - 1).toString());
    
    const textWidth = font.widthOfTextAtSize(text, 10);
    
    let x: number, y: number;
    
    switch (position) {
      case 'bottom-left':
        x = 40;
        y = 30;
        break;
      case 'bottom-right':
        x = width - textWidth - 40;
        y = 30;
        break;
      case 'top-center':
        x = width / 2 - textWidth / 2;
        y = height - 30;
        break;
      case 'top-left':
        x = 40;
        y = height - 30;
        break;
      case 'top-right':
        x = width - textWidth - 40;
        y = height - 30;
        break;
      case 'bottom-center':
      default:
        x = width / 2 - textWidth / 2;
        y = 30;
    }

    page.drawText(text, {
      x,
      y,
      size: 10,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
  }

  const pdfBytes = await pdf.save();
  const originalName = file.name.replace('.pdf', '');

  return {
    pdfBytes,
    filename: `${originalName}_numbered.pdf`,
    message: `Added page numbers to ${totalPages} pages`
  };
}

async function handleDeletePages(formData: FormData): Promise<{ pdfBytes: Uint8Array; filename: string; message: string }> {
  const file = formData.get('file') as File;
  const pagesToDelete = formData.get('pages') as string;

  if (!file || !pagesToDelete) {
    throw new Error('PDF file and pages to delete required');
  }

  const arrayBuffer = await file.arrayBuffer();
  const sourcePdf = await PDFDocument.load(arrayBuffer);
  const totalPages = sourcePdf.getPageCount();
  const deleteIndices = parsePageRange(pagesToDelete, totalPages);

  // Get indices to keep
  const keepIndices = Array.from({ length: totalPages }, (_, i) => i)
    .filter(i => !deleteIndices.includes(i));

  if (keepIndices.length === 0) {
    throw new Error('Cannot delete all pages');
  }

  const newPdf = await PDFDocument.create();
  const pages = await newPdf.copyPages(sourcePdf, keepIndices);
  pages.forEach(page => newPdf.addPage(page));

  const pdfBytes = await newPdf.save();
  const originalName = file.name.replace('.pdf', '');

  return {
    pdfBytes,
    filename: `${originalName}_modified.pdf`,
    message: `Deleted ${deleteIndices.length} pages, ${keepIndices.length} remaining`
  };
}

async function handleReorderPages(formData: FormData): Promise<{ pdfBytes: Uint8Array; filename: string; message: string }> {
  const file = formData.get('file') as File;
  const newOrder = formData.get('order') as string; // e.g., "3,1,2,4"

  if (!file || !newOrder) {
    throw new Error('PDF file and new page order required');
  }

  const arrayBuffer = await file.arrayBuffer();
  const sourcePdf = await PDFDocument.load(arrayBuffer);
  const totalPages = sourcePdf.getPageCount();

  const orderIndices = newOrder.split(',').map(n => parseInt(n.trim()) - 1);

  // Validate order
  if (orderIndices.length !== totalPages) {
    throw new Error(`Order must include all ${totalPages} pages`);
  }
  if (orderIndices.some(i => i < 0 || i >= totalPages)) {
    throw new Error('Invalid page number in order');
  }

  const newPdf = await PDFDocument.create();
  const pages = await newPdf.copyPages(sourcePdf, orderIndices);
  pages.forEach(page => newPdf.addPage(page));

  const pdfBytes = await newPdf.save();
  const originalName = file.name.replace('.pdf', '');

  return {
    pdfBytes,
    filename: `${originalName}_reordered.pdf`,
    message: `Reordered ${totalPages} pages`
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function parsePageRange(range: string, totalPages: number): number[] {
  const indices: number[] = [];
  const parts = range.split(',');

  for (const part of parts) {
    const trimmed = part.trim();
    
    if (trimmed.includes('-')) {
      const [start, end] = trimmed.split('-').map(n => parseInt(n.trim()));
      for (let i = start; i <= end && i <= totalPages; i++) {
        if (i >= 1) indices.push(i - 1); // Convert to 0-indexed
      }
    } else {
      const num = parseInt(trimmed);
      if (num >= 1 && num <= totalPages) {
        indices.push(num - 1);
      }
    }
  }

  return [...new Set(indices)].sort((a, b) => a - b);
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function hexToRgbValues(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 128, g: 128, b: 128 };
}

// ============================================================================
// GET - Return available operations and their costs
// ============================================================================

export async function GET() {
  return NextResponse.json({
    operations: CREDIT_COSTS,
    usage: {
      merge: {
        description: 'Combine multiple PDFs into one',
        parameters: ['files (multiple)'],
        example: 'FormData with files[]'
      },
      split: {
        description: 'Split PDF into separate pages or ranges',
        parameters: ['file', 'mode (all/range/single)', 'range', 'pageNumber'],
        example: 'mode=range&range=1-3,5,7-9'
      },
      rotate: {
        description: 'Rotate PDF pages',
        parameters: ['file', 'angle (90/180/270)', 'pages (all/odd/even/1,3,5)'],
        example: 'angle=90&pages=all'
      },
      compress: {
        description: 'Reduce PDF file size',
        parameters: ['file', 'quality (low/medium/high)'],
        example: 'quality=medium'
      },
      watermark: {
        description: 'Add text watermark to PDF',
        parameters: ['file', 'text', 'position', 'opacity', 'fontSize', 'color', 'pages'],
        example: 'text=CONFIDENTIAL&position=diagonal&opacity=0.3'
      },
      extract_pages: {
        description: 'Extract specific pages from PDF',
        parameters: ['file', 'range'],
        example: 'range=1-3,5,7-9'
      },
      add_page_numbers: {
        description: 'Add page numbers to PDF',
        parameters: ['file', 'position', 'format', 'startNumber'],
        example: 'position=bottom-center&format=Page {n} of {total}'
      },
      delete_pages: {
        description: 'Remove pages from PDF',
        parameters: ['file', 'pages'],
        example: 'pages=2,4,6'
      },
      reorder_pages: {
        description: 'Rearrange page order',
        parameters: ['file', 'order'],
        example: 'order=3,1,2,4'
      }
    }
  });
}
