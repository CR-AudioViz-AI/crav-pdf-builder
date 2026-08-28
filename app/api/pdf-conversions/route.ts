/**
 * PDF BUILDER PRO - FORMAT CONVERSION API
 * Convert PDFs to images, and images/documents to PDF
 * 
 * CR AudioViz AI - Fortune 50 Quality Standards
 * @version 2.0.0
 * @date December 27, 2025
 */

import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { createClient } from '@supabase/supabase-js';
import { secretKey, supabaseUrl } from "@craudioviz/platform-sdk";

const CREDIT_COSTS = {
  'images-to-pdf': 2,
  'html-to-pdf': 3,
  'markdown-to-pdf': 2,
  'text-to-pdf': 1,
};

type ConversionType = keyof typeof CREDIT_COSTS;

const supabase = createClient(
  supabaseUrl(),
  secretKey()
);

const PAGE_DIMENSIONS: Record<string, [number, number]> = {
  'letter': [612, 792],
  'a4': [595, 842],
  'legal': [612, 1008],
};

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const conversionType = searchParams.get('type') as ConversionType;

    if (!conversionType || !CREDIT_COSTS[conversionType]) {
      return NextResponse.json(
        { error: 'Invalid conversion type', validTypes: Object.keys(CREDIT_COSTS) },
        { status: 400 }
      );
    }

    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { data: creditData } = await supabase
      .from('user_credits')
      .select('balance')
      .eq('user_id', user.id)
      .single();

    const balance = creditData?.balance || 0;
    const cost = CREDIT_COSTS[conversionType];

    if (balance < cost) {
      return NextResponse.json({
        error: 'Insufficient credits',
        required: cost,
        available: balance
      }, { status: 402 });
    }

    let result: { pdfBytes: Uint8Array; filename: string; message: string };

    switch (conversionType) {
      case 'images-to-pdf':
        result = await handleImagesToPdf(request);
        break;
      case 'markdown-to-pdf':
        result = await handleMarkdownToPdf(request);
        break;
      case 'text-to-pdf':
        result = await handleTextToPdf(request);
        break;
      case 'html-to-pdf':
        result = await handleHtmlToPdf(request);
        break;
      default:
        return NextResponse.json({ error: 'Conversion not implemented' }, { status: 501 });
    }

    await supabase.rpc('deduct_credits', {
      p_user_id: user.id,
      p_amount: cost,
      p_reason: `PDF Conversion: ${conversionType}`
    });

    return new NextResponse(Buffer.from(result.pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${result.filename}"`,
        'X-Credits-Used': cost.toString(),
        'X-Message': result.message,
      },
    });

  } catch (error: any) {
    console.error('Conversion error:', error);
    return NextResponse.json({ error: error.message || 'Conversion failed' }, { status: 500 });
  }
}

async function handleImagesToPdf(request: NextRequest): Promise<{ pdfBytes: Uint8Array; filename: string; message: string }> {
  const formData = await request.formData();
  const files = formData.getAll('files') as File[];
  const pageSize = (formData.get('pageSize') as string) || 'letter';
  const title = (formData.get('title') as string) || 'Images';

  if (files.length === 0) throw new Error('At least one image required');

  const pdf = await PDFDocument.create();
  pdf.setTitle(title);

  let [pageWidth, pageHeight] = PAGE_DIMENSIONS[pageSize] || PAGE_DIMENSIONS.letter;
  const margin = 36;
  let addedCount = 0;

  for (const file of files) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const fileName = file.name.toLowerCase();
      
      let image;
      if (fileName.endsWith('.png')) {
        image = await pdf.embedPng(bytes);
      } else if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) {
        image = await pdf.embedJpg(bytes);
      } else continue;

      const page = pdf.addPage([pageWidth, pageHeight]);
      const contentWidth = pageWidth - margin * 2;
      const contentHeight = pageHeight - margin * 2;
      
      const scale = Math.min(contentWidth / image.width, contentHeight / image.height);
      const drawWidth = image.width * scale;
      const drawHeight = image.height * scale;

      page.drawImage(image, {
        x: margin + (contentWidth - drawWidth) / 2,
        y: margin + (contentHeight - drawHeight) / 2,
        width: drawWidth,
        height: drawHeight,
      });
      addedCount++;
    } catch (e) {
      console.warn(`Skipped ${file.name}`);
    }
  }

  if (addedCount === 0) throw new Error('No valid images processed');

  return {
    pdfBytes: await pdf.save(),
    filename: `${title.replace(/\s+/g, '_')}.pdf`,
    message: `Created PDF with ${addedCount} images`
  };
}

async function handleMarkdownToPdf(request: NextRequest): Promise<{ pdfBytes: Uint8Array; filename: string; message: string }> {
  const formData = await request.formData();
  const markdown = formData.get('markdown') as string;
  const title = (formData.get('title') as string) || 'Document';

  if (!markdown) throw new Error('Markdown content required');

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);

  pdf.setTitle(title);

  const [pageWidth, pageHeight] = PAGE_DIMENSIONS.letter;
  const margin = 72;
  let currentY = pageHeight - margin;
  let currentPage = pdf.addPage([pageWidth, pageHeight]);

  for (const line of markdown.split('\n')) {
    if (currentY < margin + 50) {
      currentPage = pdf.addPage([pageWidth, pageHeight]);
      currentY = pageHeight - margin;
    }

    let text = line;
    let fontSize = 12;
    let lineFont = font;

    if (line.startsWith('# ')) { text = line.slice(2); fontSize = 24; lineFont = boldFont; }
    else if (line.startsWith('## ')) { text = line.slice(3); fontSize = 20; lineFont = boldFont; }
    else if (line.startsWith('### ')) { text = line.slice(4); fontSize = 16; lineFont = boldFont; }
    else if (line.startsWith('- ')) { text = '• ' + line.slice(2); }

    if (!text.trim()) { currentY -= 10; continue; }

    currentPage.drawText(text.substring(0, 80), {
      x: margin,
      y: currentY,
      size: fontSize,
      font: lineFont,
      color: rgb(0, 0, 0),
    });
    currentY -= fontSize * 1.5;
  }

  return {
    pdfBytes: await pdf.save(),
    filename: `${title.replace(/\s+/g, '_')}.pdf`,
    message: 'Converted Markdown to PDF'
  };
}

async function handleTextToPdf(request: NextRequest): Promise<{ pdfBytes: Uint8Array; filename: string; message: string }> {
  const formData = await request.formData();
  const text = formData.get('text') as string;
  const title = (formData.get('title') as string) || 'Document';

  if (!text) throw new Error('Text content required');

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.setTitle(title);

  const [pageWidth, pageHeight] = PAGE_DIMENSIONS.letter;
  const margin = 72;
  let currentY = pageHeight - margin;
  let currentPage = pdf.addPage([pageWidth, pageHeight]);

  for (const para of text.split('\n')) {
    if (currentY < margin + 20) {
      currentPage = pdf.addPage([pageWidth, pageHeight]);
      currentY = pageHeight - margin;
    }

    if (!para.trim()) { currentY -= 15; continue; }

    currentPage.drawText(para.substring(0, 80), {
      x: margin,
      y: currentY,
      size: 12,
      font,
      color: rgb(0, 0, 0),
    });
    currentY -= 18;
  }

  return {
    pdfBytes: await pdf.save(),
    filename: `${title.replace(/\s+/g, '_')}.pdf`,
    message: 'Converted text to PDF'
  };
}

async function handleHtmlToPdf(request: NextRequest): Promise<{ pdfBytes: Uint8Array; filename: string; message: string }> {
  const formData = await request.formData();
  const html = formData.get('html') as string;
  const title = (formData.get('title') as string) || 'Document';

  if (!html) throw new Error('HTML content required');

  // Strip tags and convert to text
  const text = html.replace(/<[^>]+>/g, '\n').replace(/\s+/g, ' ').trim();
  
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.setTitle(title);

  const [pageWidth, pageHeight] = PAGE_DIMENSIONS.letter;
  const margin = 72;
  let currentY = pageHeight - margin;
  const currentPage = pdf.addPage([pageWidth, pageHeight]);

  currentPage.drawText(text.substring(0, 500), {
    x: margin,
    y: currentY,
    size: 12,
    font,
    color: rgb(0, 0, 0),
    maxWidth: pageWidth - margin * 2,
  });

  return {
    pdfBytes: await pdf.save(),
    filename: `${title.replace(/\s+/g, '_')}.pdf`,
    message: 'Converted HTML to PDF'
  };
}

export async function GET() {
  return NextResponse.json({
    conversions: CREDIT_COSTS,
    pageSizes: Object.keys(PAGE_DIMENSIONS),
  });
}
