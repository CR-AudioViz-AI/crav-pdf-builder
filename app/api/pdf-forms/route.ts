/**
 * PDF BUILDER PRO - FORM BUILDER & FILLER API
 * Create fillable PDFs and fill existing PDF forms
 * 
 * CR AudioViz AI - Fortune 50 Quality Standards
 * @version 2.0.0
 * @date December 27, 2025
 * 
 * Credit Costs:
 * - Fill form: 3 credits
 * - Create form: 5 credits
 * - Flatten form: 2 credits
 */

import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup, rgb, StandardFonts } from 'pdf-lib';
import { createClient } from '@supabase/supabase-js';
import { secretKey, supabaseUrl } from "@craudioviz/platform-sdk";

const CREDIT_COSTS = {
  fill: 3,
  create: 5,
  flatten: 2,
  extract_fields: 1,
};

type FormOperation = keyof typeof CREDIT_COSTS;

const supabase = createClient(
  supabaseUrl(),
  secretKey()
);

// ============================================================================
// FORM FIELD TYPES
// ============================================================================

interface FormFieldDefinition {
  name: string;
  type: 'text' | 'checkbox' | 'dropdown' | 'radio' | 'signature' | 'date';
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
  required?: boolean;
  defaultValue?: string;
  options?: string[]; // For dropdown/radio
  maxLength?: number;
  fontSize?: number;
  multiline?: boolean;
}

interface FormFieldValue {
  name: string;
  value: string | boolean;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const operation = searchParams.get('operation') as FormOperation;

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
      case 'fill':
        result = await handleFillForm(request);
        break;
      case 'create':
        result = await handleCreateForm(request);
        break;
      case 'flatten':
        result = await handleFlattenForm(request);
        break;
      case 'extract_fields':
        result = await handleExtractFields(request);
        break;
      default:
        return NextResponse.json({ error: 'Operation not implemented' }, { status: 501 });
    }

    // Deduct credits
    await supabase.rpc('deduct_credits', {
      p_user_id: user.id,
      p_amount: cost,
      p_reason: `PDF Form ${operation}`
    });

    // Return result
    if (result.pdfBytes) {
      return new NextResponse(Buffer.from(result.pdfBytes), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${result.filename || 'form.pdf'}"`,
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
    console.error('Form operation error:', error);
    return NextResponse.json(
      { error: error.message || 'Form operation failed' },
      { status: 500 }
    );
  }
}

// ============================================================================
// FILL EXISTING PDF FORM
// ============================================================================

async function handleFillForm(request: NextRequest): Promise<{ pdfBytes: Uint8Array; filename: string; message: string }> {
  const formData = await request.formData();
  const file = formData.get('file') as File;
  const fieldsJson = formData.get('fields') as string;

  if (!file) {
    throw new Error('PDF file required');
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await PDFDocument.load(arrayBuffer);
  const form = pdf.getForm();

  let filledCount = 0;

  if (fieldsJson) {
    const fields: FormFieldValue[] = JSON.parse(fieldsJson);

    for (const field of fields) {
      try {
        const pdfField = form.getField(field.name);

        if (pdfField instanceof PDFTextField) {
          pdfField.setText(String(field.value));
          filledCount++;
        } else if (pdfField instanceof PDFCheckBox) {
          if (field.value === true || field.value === 'true' || field.value === 'yes') {
            pdfField.check();
          } else {
            pdfField.uncheck();
          }
          filledCount++;
        } else if (pdfField instanceof PDFDropdown) {
          pdfField.select(String(field.value));
          filledCount++;
        } else if (pdfField instanceof PDFRadioGroup) {
          pdfField.select(String(field.value));
          filledCount++;
        }
      } catch (e) {
        console.warn(`Field "${field.name}" not found or could not be filled`);
      }
    }
  } else {
    // Fill from individual form fields
    const formFields = form.getFields();
    
    for (const pdfField of formFields) {
      const fieldName = pdfField.getName();
      const value = formData.get(fieldName);

      if (value !== null) {
        try {
          if (pdfField instanceof PDFTextField) {
            pdfField.setText(String(value));
            filledCount++;
          } else if (pdfField instanceof PDFCheckBox) {
            if (value === 'true' || value === 'yes' || value === '1') {
              pdfField.check();
            }
            filledCount++;
          } else if (pdfField instanceof PDFDropdown) {
            pdfField.select(String(value));
            filledCount++;
          }
        } catch (e) {
          console.warn(`Could not fill field "${fieldName}"`);
        }
      }
    }
  }

  const pdfBytes = await pdf.save();
  const originalName = file.name.replace('.pdf', '');

  return {
    pdfBytes,
    filename: `${originalName}_filled.pdf`,
    message: `Filled ${filledCount} form fields`
  };
}

// ============================================================================
// CREATE FILLABLE PDF FORM
// ============================================================================

async function handleCreateForm(request: NextRequest): Promise<{ pdfBytes: Uint8Array; filename: string; message: string }> {
  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const fieldsJson = formData.get('fields') as string;
  const title = formData.get('title') as string || 'Form';

  if (!fieldsJson) {
    throw new Error('Form field definitions required');
  }

  const fields: FormFieldDefinition[] = JSON.parse(fieldsJson);

  // Create PDF or use uploaded one
  let pdf: PDFDocument;
  if (file) {
    const arrayBuffer = await file.arrayBuffer();
    pdf = await PDFDocument.load(arrayBuffer);
  } else {
    pdf = await PDFDocument.create();
    // Add a default page if creating new
    const page = pdf.addPage([612, 792]); // Letter size
    
    // Add title
    const font = await pdf.embedFont(StandardFonts.HelveticaBold);
    page.drawText(title, {
      x: 50,
      y: 742,
      size: 24,
      font,
      color: rgb(0, 0, 0),
    });
  }

  const form = pdf.getForm();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  let createdCount = 0;

  for (const fieldDef of fields) {
    const pageIndex = (fieldDef.page || 1) - 1;
    
    // Ensure page exists
    while (pdf.getPageCount() <= pageIndex) {
      pdf.addPage([612, 792]);
    }
    
    const page = pdf.getPage(pageIndex);

    try {
      switch (fieldDef.type) {
        case 'text':
        case 'date':
          const textField = form.createTextField(fieldDef.name);
          textField.addToPage(page, {
            x: fieldDef.x,
            y: fieldDef.y,
            width: fieldDef.width,
            height: fieldDef.height,
            borderColor: rgb(0.6, 0.6, 0.6),
            backgroundColor: rgb(1, 1, 1),
          });
          if (fieldDef.defaultValue) {
            textField.setText(fieldDef.defaultValue);
          }
          if (fieldDef.maxLength) {
            textField.setMaxLength(fieldDef.maxLength);
          }
          if (fieldDef.multiline) {
            textField.enableMultiline();
          }
          createdCount++;
          break;

        case 'checkbox':
          const checkbox = form.createCheckBox(fieldDef.name);
          checkbox.addToPage(page, {
            x: fieldDef.x,
            y: fieldDef.y,
            width: fieldDef.width || 20,
            height: fieldDef.height || 20,
            borderColor: rgb(0.6, 0.6, 0.6),
            backgroundColor: rgb(1, 1, 1),
          });
          if (fieldDef.defaultValue === 'true' || fieldDef.defaultValue === 'checked') {
            checkbox.check();
          }
          createdCount++;
          break;

        case 'dropdown':
          if (fieldDef.options && fieldDef.options.length > 0) {
            const dropdown = form.createDropdown(fieldDef.name);
            dropdown.addToPage(page, {
              x: fieldDef.x,
              y: fieldDef.y,
              width: fieldDef.width,
              height: fieldDef.height,
              borderColor: rgb(0.6, 0.6, 0.6),
              backgroundColor: rgb(1, 1, 1),
            });
            dropdown.addOptions(fieldDef.options);
            if (fieldDef.defaultValue) {
              dropdown.select(fieldDef.defaultValue);
            }
            createdCount++;
          }
          break;

        case 'radio':
          if (fieldDef.options && fieldDef.options.length > 0) {
            const radioGroup = form.createRadioGroup(fieldDef.name);
            fieldDef.options.forEach((option, idx) => {
              radioGroup.addOptionToPage(option, page, {
                x: fieldDef.x,
                y: fieldDef.y - (idx * 25),
                width: 15,
                height: 15,
                borderColor: rgb(0.6, 0.6, 0.6),
                backgroundColor: rgb(1, 1, 1),
              });
            });
            if (fieldDef.defaultValue) {
              radioGroup.select(fieldDef.defaultValue);
            }
            createdCount++;
          }
          break;

        case 'signature':
          // Create signature field as a text field with specific styling
          const sigField = form.createTextField(fieldDef.name);
          sigField.addToPage(page, {
            x: fieldDef.x,
            y: fieldDef.y,
            width: fieldDef.width || 200,
            height: fieldDef.height || 50,
            borderColor: rgb(0, 0, 0),
            borderWidth: 1,
            backgroundColor: rgb(0.98, 0.98, 0.98),
          });
          
          // Add "Sign here" text below the field
          const labelFont = await pdf.embedFont(StandardFonts.Helvetica);
          page.drawText('Sign Here', {
            x: fieldDef.x,
            y: fieldDef.y - 15,
            size: 8,
            font: labelFont,
            color: rgb(0.5, 0.5, 0.5),
          });
          createdCount++;
          break;
      }

      // Add label if field has a name
      if (fieldDef.name) {
        const labelText = fieldDef.name.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim();
        page.drawText(labelText + ':', {
          x: fieldDef.x,
          y: fieldDef.y + fieldDef.height + 5,
          size: 10,
          font,
          color: rgb(0.3, 0.3, 0.3),
        });
      }

    } catch (e: any) {
      console.warn(`Could not create field "${fieldDef.name}": ${e.message}`);
    }
  }

  const pdfBytes = await pdf.save();

  return {
    pdfBytes,
    filename: `${title.replace(/\s+/g, '_')}_form.pdf`,
    message: `Created fillable form with ${createdCount} fields`
  };
}

// ============================================================================
// FLATTEN PDF FORM (Make non-editable)
// ============================================================================

async function handleFlattenForm(request: NextRequest): Promise<{ pdfBytes: Uint8Array; filename: string; message: string }> {
  const formData = await request.formData();
  const file = formData.get('file') as File;

  if (!file) {
    throw new Error('PDF file required');
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await PDFDocument.load(arrayBuffer);
  const form = pdf.getForm();

  const fields = form.getFields();
  const fieldCount = fields.length;

  // Flatten all form fields
  form.flatten();

  const pdfBytes = await pdf.save();
  const originalName = file.name.replace('.pdf', '');

  return {
    pdfBytes,
    filename: `${originalName}_flattened.pdf`,
    message: `Flattened ${fieldCount} form fields (now non-editable)`
  };
}

// ============================================================================
// EXTRACT FORM FIELDS
// ============================================================================

async function handleExtractFields(request: NextRequest): Promise<{ data: any; message: string }> {
  const formData = await request.formData();
  const file = formData.get('file') as File;

  if (!file) {
    throw new Error('PDF file required');
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await PDFDocument.load(arrayBuffer);
  const form = pdf.getForm();
  const fields = form.getFields();

  const extractedFields = fields.map(field => {
    const fieldInfo: any = {
      name: field.getName(),
      type: getFieldType(field),
    };

    if (field instanceof PDFTextField) {
      fieldInfo.value = field.getText() || '';
      fieldInfo.maxLength = field.getMaxLength();
      fieldInfo.multiline = field.isMultiline();
    } else if (field instanceof PDFCheckBox) {
      fieldInfo.value = field.isChecked();
    } else if (field instanceof PDFDropdown) {
      fieldInfo.options = field.getOptions();
      fieldInfo.value = field.getSelected();
    } else if (field instanceof PDFRadioGroup) {
      fieldInfo.options = field.getOptions();
      fieldInfo.value = field.getSelected();
    }

    // Get field position if available
    try {
      const widgets = field.acroField.getWidgets();
      if (widgets.length > 0) {
        const rect = widgets[0].getRectangle();
        fieldInfo.position = {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        };
      }
    } catch (e) {
      // Position not available
    }

    return fieldInfo;
  });

  return {
    data: {
      fileName: file.name,
      pageCount: pdf.getPageCount(),
      fieldCount: fields.length,
      fields: extractedFields,
    },
    message: `Extracted ${fields.length} form fields`
  };
}

function getFieldType(field: any): string {
  if (field instanceof PDFTextField) return 'text';
  if (field instanceof PDFCheckBox) return 'checkbox';
  if (field instanceof PDFDropdown) return 'dropdown';
  if (field instanceof PDFRadioGroup) return 'radio';
  return 'unknown';
}

// ============================================================================
// GET - Return form operation info
// ============================================================================

export async function GET() {
  return NextResponse.json({
    operations: CREDIT_COSTS,
    usage: {
      fill: {
        description: 'Fill existing PDF form fields',
        parameters: ['file', 'fields (JSON array of {name, value})'],
        example: {
          file: 'form.pdf',
          fields: '[{"name": "firstName", "value": "John"}, {"name": "lastName", "value": "Doe"}]'
        }
      },
      create: {
        description: 'Create fillable PDF form',
        parameters: ['file (optional base PDF)', 'fields (JSON array)', 'title'],
        fieldTypes: ['text', 'checkbox', 'dropdown', 'radio', 'signature', 'date'],
        example: {
          title: 'Contact Form',
          fields: '[{"name": "name", "type": "text", "x": 50, "y": 700, "width": 200, "height": 25, "page": 1}]'
        }
      },
      flatten: {
        description: 'Make form fields non-editable (permanent)',
        parameters: ['file']
      },
      extract_fields: {
        description: 'Get all form fields and their values',
        parameters: ['file'],
        returns: 'JSON with field names, types, values, positions'
      }
    }
  });
}
