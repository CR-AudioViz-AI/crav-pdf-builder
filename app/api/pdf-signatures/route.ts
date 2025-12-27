/**
 * PDF BUILDER PRO - DIGITAL SIGNATURE API
 * Sign PDFs with drawn, typed, or uploaded signatures
 * 
 * CR AudioViz AI - Fortune 50 Quality Standards
 * @version 2.0.0
 * @date December 27, 2025
 * 
 * Credit Costs:
 * - Sign PDF: 3 credits
 * - Add certificate: 5 credits
 * - Verify signature: 1 credit
 */

import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { createClient } from '@supabase/supabase-js';

const CREDIT_COSTS = {
  sign: 3,
  add_initials: 2,
  add_date_stamp: 1,
  add_certificate: 5,
  verify: 1,
};

type SignatureOperation = keyof typeof CREDIT_COSTS;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ============================================================================
// SIGNATURE TYPES
// ============================================================================

interface SignatureConfig {
  type: 'draw' | 'type' | 'image';
  data: string; // Base64 for draw/image, text for type
  x: number;
  y: number;
  width?: number;
  height?: number;
  page: number;
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  includeDate?: boolean;
  includeTime?: boolean;
  dateFormat?: string;
  name?: string;
  title?: string;
  reason?: string;
}

interface InitialsConfig {
  text: string;
  x: number;
  y: number;
  page: number;
  fontSize?: number;
  color?: string;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const operation = searchParams.get('operation') as SignatureOperation;

    if (!operation || !CREDIT_COSTS[operation]) {
      return NextResponse.json(
        { error: 'Invalid operation', validOperations: Object.keys(CREDIT_COSTS) },
        { status: 400 }
      );
    }

    // Authenticate
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Check credits
    const { data: creditData } = await supabase
      .from('user_credits')
      .select('balance')
      .eq('user_id', user.id)
      .single();

    const balance = creditData?.balance || 0;
    const cost = CREDIT_COSTS[operation];

    if (balance < cost) {
      return NextResponse.json({
        error: 'Insufficient credits',
        required: cost,
        available: balance
      }, { status: 402 });
    }

    let result: { pdfBytes?: Uint8Array; data?: any; filename?: string; message: string };

    switch (operation) {
      case 'sign':
        result = await handleSign(request, user);
        break;
      case 'add_initials':
        result = await handleAddInitials(request);
        break;
      case 'add_date_stamp':
        result = await handleAddDateStamp(request);
        break;
      case 'add_certificate':
        result = await handleAddCertificate(request, user);
        break;
      case 'verify':
        result = await handleVerifySignature(request);
        break;
      default:
        return NextResponse.json({ error: 'Operation not implemented' }, { status: 501 });
    }

    // Deduct credits
    await supabase.rpc('deduct_credits', {
      p_user_id: user.id,
      p_amount: cost,
      p_reason: `PDF Signature ${operation}`
    });

    // Log signature for audit
    if (operation === 'sign' || operation === 'add_certificate') {
      await supabase.from('signature_audit_log').insert({
        user_id: user.id,
        operation,
        timestamp: new Date().toISOString(),
        ip_address: request.headers.get('x-forwarded-for') || 'unknown',
        user_agent: request.headers.get('user-agent') || 'unknown',
      });
    }

    // Return result
    if (result.pdfBytes) {
      return new NextResponse(result.pdfBytes, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${result.filename || 'signed.pdf'}"`,
          'X-Credits-Used': cost.toString(),
          'X-Message': result.message,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: result.data,
      message: result.message,
      creditsUsed: cost
    });

  } catch (error: any) {
    console.error('Signature operation error:', error);
    return NextResponse.json(
      { error: error.message || 'Signature operation failed' },
      { status: 500 }
    );
  }
}

// ============================================================================
// SIGN PDF
// ============================================================================

async function handleSign(request: NextRequest, user: any): Promise<{ pdfBytes: Uint8Array; filename: string; message: string }> {
  const formData = await request.formData();
  const file = formData.get('file') as File;
  const signatureJson = formData.get('signature') as string;

  if (!file) {
    throw new Error('PDF file required');
  }

  if (!signatureJson) {
    throw new Error('Signature configuration required');
  }

  const signature: SignatureConfig = JSON.parse(signatureJson);
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await PDFDocument.load(arrayBuffer);

  const pageIndex = (signature.page || 1) - 1;
  if (pageIndex < 0 || pageIndex >= pdf.getPageCount()) {
    throw new Error(`Invalid page number: ${signature.page}`);
  }

  const page = pdf.getPage(pageIndex);
  const { width: pageWidth, height: pageHeight } = page.getSize();

  // Handle different signature types
  switch (signature.type) {
    case 'draw':
    case 'image':
      // Embed signature image
      if (signature.data) {
        const imageData = signature.data.replace(/^data:image\/\w+;base64,/, '');
        const imageBytes = Uint8Array.from(atob(imageData), c => c.charCodeAt(0));
        
        let image;
        if (signature.data.includes('image/png')) {
          image = await pdf.embedPng(imageBytes);
        } else {
          image = await pdf.embedJpg(imageBytes);
        }

        const sigWidth = signature.width || 150;
        const sigHeight = signature.height || 50;

        page.drawImage(image, {
          x: signature.x,
          y: signature.y,
          width: sigWidth,
          height: sigHeight,
        });
      }
      break;

    case 'type':
      // Draw typed signature
      const font = await pdf.embedFont(StandardFonts.TimesRomanItalic);
      const fontSize = signature.fontSize || 24;
      const color = parseColor(signature.color || '#000080');

      page.drawText(signature.data, {
        x: signature.x,
        y: signature.y,
        size: fontSize,
        font,
        color: rgb(color.r / 255, color.g / 255, color.b / 255),
      });
      break;
  }

  // Add signature line
  const lineFont = await pdf.embedFont(StandardFonts.Helvetica);
  const signatureY = signature.y - 15;

  // Draw signature line
  page.drawLine({
    start: { x: signature.x, y: signatureY },
    end: { x: signature.x + (signature.width || 150), y: signatureY },
    thickness: 0.5,
    color: rgb(0.4, 0.4, 0.4),
  });

  // Add signer info below line
  let infoY = signatureY - 12;

  if (signature.name) {
    page.drawText(signature.name, {
      x: signature.x,
      y: infoY,
      size: 9,
      font: lineFont,
      color: rgb(0.3, 0.3, 0.3),
    });
    infoY -= 11;
  }

  if (signature.title) {
    page.drawText(signature.title, {
      x: signature.x,
      y: infoY,
      size: 8,
      font: lineFont,
      color: rgb(0.4, 0.4, 0.4),
    });
    infoY -= 11;
  }

  // Add date/time if requested
  if (signature.includeDate) {
    const now = new Date();
    let dateStr = now.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    if (signature.includeTime) {
      dateStr += ' ' + now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
      });
    }

    page.drawText(`Signed: ${dateStr}`, {
      x: signature.x,
      y: infoY,
      size: 8,
      font: lineFont,
      color: rgb(0.5, 0.5, 0.5),
    });
  }

  // Add signature reason if provided
  if (signature.reason) {
    infoY -= 11;
    page.drawText(`Reason: ${signature.reason}`, {
      x: signature.x,
      y: infoY,
      size: 7,
      font: lineFont,
      color: rgb(0.5, 0.5, 0.5),
    });
  }

  const pdfBytes = await pdf.save();
  const originalName = file.name.replace('.pdf', '');

  return {
    pdfBytes,
    filename: `${originalName}_signed.pdf`,
    message: `Document signed on page ${signature.page}`
  };
}

// ============================================================================
// ADD INITIALS
// ============================================================================

async function handleAddInitials(request: NextRequest): Promise<{ pdfBytes: Uint8Array; filename: string; message: string }> {
  const formData = await request.formData();
  const file = formData.get('file') as File;
  const initialsJson = formData.get('initials') as string;

  if (!file || !initialsJson) {
    throw new Error('PDF file and initials configuration required');
  }

  const initialsConfig: InitialsConfig[] = JSON.parse(initialsJson);
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await PDFDocument.load(arrayBuffer);

  const font = await pdf.embedFont(StandardFonts.TimesRomanBold);

  for (const initials of initialsConfig) {
    const pageIndex = (initials.page || 1) - 1;
    if (pageIndex >= 0 && pageIndex < pdf.getPageCount()) {
      const page = pdf.getPage(pageIndex);
      const fontSize = initials.fontSize || 14;
      const color = parseColor(initials.color || '#000080');

      // Draw circle around initials
      const textWidth = font.widthOfTextAtSize(initials.text, fontSize);
      const circleRadius = Math.max(textWidth, fontSize) / 2 + 5;

      page.drawCircle({
        x: initials.x + textWidth / 2,
        y: initials.y + fontSize / 3,
        size: circleRadius,
        borderColor: rgb(color.r / 255, color.g / 255, color.b / 255),
        borderWidth: 1,
      });

      // Draw initials
      page.drawText(initials.text, {
        x: initials.x,
        y: initials.y,
        size: fontSize,
        font,
        color: rgb(color.r / 255, color.g / 255, color.b / 255),
      });
    }
  }

  const pdfBytes = await pdf.save();
  const originalName = file.name.replace('.pdf', '');

  return {
    pdfBytes,
    filename: `${originalName}_initialed.pdf`,
    message: `Added initials to ${initialsConfig.length} location(s)`
  };
}

// ============================================================================
// ADD DATE STAMP
// ============================================================================

async function handleAddDateStamp(request: NextRequest): Promise<{ pdfBytes: Uint8Array; filename: string; message: string }> {
  const formData = await request.formData();
  const file = formData.get('file') as File;
  const x = parseFloat(formData.get('x') as string) || 400;
  const y = parseFloat(formData.get('y') as string) || 50;
  const page = parseInt(formData.get('page') as string) || 1;
  const format = formData.get('format') as string || 'full';
  const includeTime = formData.get('includeTime') === 'true';

  if (!file) {
    throw new Error('PDF file required');
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await PDFDocument.load(arrayBuffer);
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  const pageIndex = page - 1;
  if (pageIndex < 0 || pageIndex >= pdf.getPageCount()) {
    throw new Error(`Invalid page number: ${page}`);
  }

  const pdfPage = pdf.getPage(pageIndex);
  const now = new Date();

  let dateStr: string;
  switch (format) {
    case 'short':
      dateStr = now.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' });
      break;
    case 'iso':
      dateStr = now.toISOString().split('T')[0];
      break;
    case 'full':
    default:
      dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }

  if (includeTime) {
    dateStr += ' at ' + now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  // Draw date stamp box
  const textWidth = font.widthOfTextAtSize(dateStr, 10);
  const boxPadding = 8;

  pdfPage.drawRectangle({
    x: x - boxPadding,
    y: y - 5,
    width: textWidth + boxPadding * 2,
    height: 20,
    borderColor: rgb(0.4, 0.4, 0.4),
    borderWidth: 0.5,
    color: rgb(0.98, 0.98, 0.98),
  });

  pdfPage.drawText(dateStr, {
    x: x,
    y: y,
    size: 10,
    font,
    color: rgb(0.2, 0.2, 0.2),
  });

  const pdfBytes = await pdf.save();
  const originalName = file.name.replace('.pdf', '');

  return {
    pdfBytes,
    filename: `${originalName}_dated.pdf`,
    message: `Added date stamp: ${dateStr}`
  };
}

// ============================================================================
// ADD CERTIFICATE (Visual certificate stamp)
// ============================================================================

async function handleAddCertificate(request: NextRequest, user: any): Promise<{ pdfBytes: Uint8Array; filename: string; message: string }> {
  const formData = await request.formData();
  const file = formData.get('file') as File;
  const x = parseFloat(formData.get('x') as string) || 400;
  const y = parseFloat(formData.get('y') as string) || 100;
  const page = parseInt(formData.get('page') as string) || 1;
  const signerName = formData.get('signerName') as string || user.email;
  const reason = formData.get('reason') as string || 'Document certification';

  if (!file) {
    throw new Error('PDF file required');
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await PDFDocument.load(arrayBuffer);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pageIndex = page - 1;
  if (pageIndex < 0 || pageIndex >= pdf.getPageCount()) {
    throw new Error(`Invalid page number: ${page}`);
  }

  const pdfPage = pdf.getPage(pageIndex);
  const now = new Date();

  // Certificate box dimensions
  const boxWidth = 180;
  const boxHeight = 80;

  // Draw certificate box
  pdfPage.drawRectangle({
    x: x,
    y: y,
    width: boxWidth,
    height: boxHeight,
    borderColor: rgb(0.2, 0.4, 0.8),
    borderWidth: 2,
    color: rgb(0.95, 0.97, 1),
  });

  // Draw certificate header
  pdfPage.drawText('DIGITALLY CERTIFIED', {
    x: x + 10,
    y: y + boxHeight - 18,
    size: 10,
    font: boldFont,
    color: rgb(0.2, 0.4, 0.8),
  });

  // Draw separator line
  pdfPage.drawLine({
    start: { x: x + 10, y: y + boxHeight - 22 },
    end: { x: x + boxWidth - 10, y: y + boxHeight - 22 },
    thickness: 0.5,
    color: rgb(0.6, 0.7, 0.9),
  });

  // Signer info
  pdfPage.drawText(`Signed by: ${signerName.substring(0, 25)}`, {
    x: x + 10,
    y: y + boxHeight - 38,
    size: 8,
    font,
    color: rgb(0.3, 0.3, 0.3),
  });

  // Date
  pdfPage.drawText(`Date: ${now.toLocaleDateString()}`, {
    x: x + 10,
    y: y + boxHeight - 50,
    size: 8,
    font,
    color: rgb(0.3, 0.3, 0.3),
  });

  // Reason
  const reasonText = reason.length > 30 ? reason.substring(0, 27) + '...' : reason;
  pdfPage.drawText(`Reason: ${reasonText}`, {
    x: x + 10,
    y: y + boxHeight - 62,
    size: 8,
    font,
    color: rgb(0.3, 0.3, 0.3),
  });

  // Certificate ID (for tracking)
  const certId = generateCertificateId();
  pdfPage.drawText(`Cert ID: ${certId}`, {
    x: x + 10,
    y: y + 8,
    size: 6,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });

  // Store certificate record
  await supabase.from('certificate_records').insert({
    certificate_id: certId,
    user_id: user.id,
    signer_name: signerName,
    reason,
    document_hash: await hashDocument(arrayBuffer),
    created_at: now.toISOString(),
  });

  const pdfBytes = await pdf.save();
  const originalName = file.name.replace('.pdf', '');

  return {
    pdfBytes,
    filename: `${originalName}_certified.pdf`,
    message: `Document certified. Certificate ID: ${certId}`
  };
}

// ============================================================================
// VERIFY SIGNATURE
// ============================================================================

async function handleVerifySignature(request: NextRequest): Promise<{ data: any; message: string }> {
  const formData = await request.formData();
  const file = formData.get('file') as File;
  const certificateId = formData.get('certificateId') as string;

  if (!file) {
    throw new Error('PDF file required');
  }

  const arrayBuffer = await file.arrayBuffer();
  const documentHash = await hashDocument(arrayBuffer);

  // Check if certificate exists
  if (certificateId) {
    const { data: cert, error } = await supabase
      .from('certificate_records')
      .select('*')
      .eq('certificate_id', certificateId)
      .single();

    if (error || !cert) {
      return {
        data: {
          valid: false,
          reason: 'Certificate not found',
          certificateId,
        },
        message: 'Certificate verification failed'
      };
    }

    // Check document hash
    const hashMatch = cert.document_hash === documentHash;

    return {
      data: {
        valid: hashMatch,
        certificateId,
        signerName: cert.signer_name,
        signedAt: cert.created_at,
        reason: cert.reason,
        hashMatch,
        warning: hashMatch ? null : 'Document has been modified since signing',
      },
      message: hashMatch ? 'Certificate verified successfully' : 'Document modified since signing'
    };
  }

  // General signature check (look for any certificates matching this document)
  const { data: certs } = await supabase
    .from('certificate_records')
    .select('*')
    .eq('document_hash', documentHash);

  if (certs && certs.length > 0) {
    return {
      data: {
        hasSignatures: true,
        certificates: certs.map(c => ({
          certificateId: c.certificate_id,
          signerName: c.signer_name,
          signedAt: c.created_at,
          reason: c.reason,
        })),
      },
      message: `Found ${certs.length} certificate(s) for this document`
    };
  }

  return {
    data: {
      hasSignatures: false,
      message: 'No certificates found for this document',
    },
    message: 'No signatures found'
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function parseColor(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 0, g: 0, b: 128 };
}

function generateCertificateId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'CERT-';
  for (let i = 0; i < 12; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
    if (i === 3 || i === 7) result += '-';
  }
  return result;
}

async function hashDocument(arrayBuffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============================================================================
// GET - Return signature operation info
// ============================================================================

export async function GET() {
  return NextResponse.json({
    operations: CREDIT_COSTS,
    usage: {
      sign: {
        description: 'Add signature to PDF',
        parameters: ['file', 'signature (JSON)'],
        signatureTypes: ['draw', 'type', 'image'],
        example: {
          signature: {
            type: 'type',
            data: 'John Doe',
            x: 100,
            y: 100,
            page: 1,
            includeDate: true,
            name: 'John Doe',
            title: 'CEO'
          }
        }
      },
      add_initials: {
        description: 'Add initials to multiple locations',
        parameters: ['file', 'initials (JSON array)'],
        example: {
          initials: '[{"text": "JD", "x": 50, "y": 700, "page": 1}]'
        }
      },
      add_date_stamp: {
        description: 'Add date stamp to PDF',
        parameters: ['file', 'x', 'y', 'page', 'format', 'includeTime'],
        formats: ['short', 'full', 'iso']
      },
      add_certificate: {
        description: 'Add digital certificate stamp',
        parameters: ['file', 'x', 'y', 'page', 'signerName', 'reason'],
        note: 'Creates verifiable certificate record'
      },
      verify: {
        description: 'Verify document certificate',
        parameters: ['file', 'certificateId (optional)'],
        returns: 'Certificate validity and document integrity'
      }
    }
  });
}
