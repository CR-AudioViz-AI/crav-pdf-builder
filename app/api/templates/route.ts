/**
 * PDF BUILDER PRO - TEMPLATE LIBRARY API
 * Professional document templates with customization
 * 
 * CR AudioViz AI - Fortune 50 Quality Standards
 * @version 2.0.0
 * @date December 27, 2025
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { secretKey, supabaseUrl } from "@craudioviz/platform-sdk";

const supabase = createClient(
  supabaseUrl(),
  secretKey()
);

// ============================================================================
// TEMPLATE CATEGORIES
// ============================================================================

const TEMPLATE_CATEGORIES = [
  {
    id: 'business',
    name: 'Business',
    icon: '💼',
    subcategories: [
      'Proposals',
      'Contracts',
      'Reports',
      'Presentations',
      'Letterheads',
      'Business Cards',
    ],
  },
  {
    id: 'legal',
    name: 'Legal',
    icon: '⚖️',
    subcategories: [
      'NDAs',
      'Employment Contracts',
      'Service Agreements',
      'Terms of Service',
      'Privacy Policies',
      'Waivers',
    ],
  },
  {
    id: 'finance',
    name: 'Finance',
    icon: '💰',
    subcategories: [
      'Invoices',
      'Quotes',
      'Purchase Orders',
      'Receipts',
      'Financial Reports',
      'Expense Reports',
    ],
  },
  {
    id: 'hr',
    name: 'HR & Employment',
    icon: '👥',
    subcategories: [
      'Offer Letters',
      'Employment Agreements',
      'Performance Reviews',
      'Onboarding Docs',
      'Policies',
      'Job Descriptions',
    ],
  },
  {
    id: 'marketing',
    name: 'Marketing',
    icon: '📣',
    subcategories: [
      'Brochures',
      'Flyers',
      'Case Studies',
      'Whitepapers',
      'Media Kits',
      'Sales Sheets',
    ],
  },
  {
    id: 'education',
    name: 'Education',
    icon: '📚',
    subcategories: [
      'Certificates',
      'Transcripts',
      'Lesson Plans',
      'Course Materials',
      'Syllabi',
      'Diplomas',
    ],
  },
  {
    id: 'real-estate',
    name: 'Real Estate',
    icon: '🏠',
    subcategories: [
      'Lease Agreements',
      'Purchase Agreements',
      'Disclosure Forms',
      'Inspection Reports',
      'Property Listings',
    ],
  },
  {
    id: 'healthcare',
    name: 'Healthcare',
    icon: '🏥',
    subcategories: [
      'Patient Forms',
      'Consent Forms',
      'Medical Records',
      'Prescriptions',
      'HIPAA Forms',
    ],
  },
  {
    id: 'personal',
    name: 'Personal',
    icon: '📝',
    subcategories: [
      'Resumes',
      'Cover Letters',
      'Reference Letters',
      'Wills',
      'Power of Attorney',
    ],
  },
];

// ============================================================================
// BUILT-IN TEMPLATES
// ============================================================================

const BUILT_IN_TEMPLATES = [
  // Business Templates
  {
    id: 'proposal-professional',
    name: 'Professional Proposal',
    category: 'business',
    subcategory: 'Proposals',
    description: 'Clean, modern business proposal template',
    thumbnail: '/templates/proposal-professional.png',
    pages: 5,
    fields: [
      { name: 'company_name', label: 'Your Company Name', type: 'text', required: true },
      { name: 'client_name', label: 'Client Name', type: 'text', required: true },
      { name: 'project_title', label: 'Project Title', type: 'text', required: true },
      { name: 'proposal_date', label: 'Date', type: 'date', required: true },
      { name: 'executive_summary', label: 'Executive Summary', type: 'textarea', required: true },
      { name: 'scope_of_work', label: 'Scope of Work', type: 'textarea', required: true },
      { name: 'timeline', label: 'Timeline', type: 'textarea' },
      { name: 'pricing', label: 'Pricing', type: 'number', required: true },
      { name: 'terms', label: 'Terms & Conditions', type: 'textarea' },
    ],
    premium: false,
  },
  {
    id: 'nda-mutual',
    name: 'Mutual NDA',
    category: 'legal',
    subcategory: 'NDAs',
    description: 'Standard mutual non-disclosure agreement',
    thumbnail: '/templates/nda-mutual.png',
    pages: 3,
    fields: [
      { name: 'party_a_name', label: 'Party A (Disclosing Party)', type: 'text', required: true },
      { name: 'party_a_address', label: 'Party A Address', type: 'textarea', required: true },
      { name: 'party_b_name', label: 'Party B (Receiving Party)', type: 'text', required: true },
      { name: 'party_b_address', label: 'Party B Address', type: 'textarea', required: true },
      { name: 'effective_date', label: 'Effective Date', type: 'date', required: true },
      { name: 'confidential_info', label: 'Definition of Confidential Info', type: 'textarea' },
      { name: 'term_years', label: 'Term (Years)', type: 'number', required: true },
      { name: 'governing_law', label: 'Governing Law (State)', type: 'text', required: true },
    ],
    premium: false,
  },
  {
    id: 'invoice-detailed',
    name: 'Detailed Invoice',
    category: 'finance',
    subcategory: 'Invoices',
    description: 'Professional invoice with itemized billing',
    thumbnail: '/templates/invoice-detailed.png',
    pages: 1,
    fields: [
      { name: 'invoice_number', label: 'Invoice Number', type: 'text', required: true },
      { name: 'invoice_date', label: 'Invoice Date', type: 'date', required: true },
      { name: 'due_date', label: 'Due Date', type: 'date', required: true },
      { name: 'from_company', label: 'From Company', type: 'text', required: true },
      { name: 'from_address', label: 'From Address', type: 'textarea', required: true },
      { name: 'to_company', label: 'Bill To', type: 'text', required: true },
      { name: 'to_address', label: 'Bill To Address', type: 'textarea', required: true },
      { name: 'items', label: 'Line Items', type: 'table', required: true },
      { name: 'subtotal', label: 'Subtotal', type: 'number', calculated: true },
      { name: 'tax_rate', label: 'Tax Rate (%)', type: 'number' },
      { name: 'total', label: 'Total', type: 'number', calculated: true },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
    premium: false,
  },
  {
    id: 'employment-offer',
    name: 'Employment Offer Letter',
    category: 'hr',
    subcategory: 'Offer Letters',
    description: 'Professional job offer letter template',
    thumbnail: '/templates/employment-offer.png',
    pages: 2,
    fields: [
      { name: 'company_name', label: 'Company Name', type: 'text', required: true },
      { name: 'candidate_name', label: 'Candidate Name', type: 'text', required: true },
      { name: 'position', label: 'Position Title', type: 'text', required: true },
      { name: 'department', label: 'Department', type: 'text' },
      { name: 'start_date', label: 'Start Date', type: 'date', required: true },
      { name: 'salary', label: 'Annual Salary', type: 'number', required: true },
      { name: 'pay_frequency', label: 'Pay Frequency', type: 'select', options: ['Weekly', 'Bi-weekly', 'Monthly'] },
      { name: 'benefits', label: 'Benefits Summary', type: 'textarea' },
      { name: 'reporting_to', label: 'Reports To', type: 'text' },
      { name: 'expiration_date', label: 'Offer Expires', type: 'date' },
    ],
    premium: true,
  },
  {
    id: 'lease-residential',
    name: 'Residential Lease Agreement',
    category: 'real-estate',
    subcategory: 'Lease Agreements',
    description: 'Standard residential rental agreement',
    thumbnail: '/templates/lease-residential.png',
    pages: 8,
    fields: [
      { name: 'landlord_name', label: 'Landlord Name', type: 'text', required: true },
      { name: 'tenant_name', label: 'Tenant Name', type: 'text', required: true },
      { name: 'property_address', label: 'Property Address', type: 'textarea', required: true },
      { name: 'lease_start', label: 'Lease Start Date', type: 'date', required: true },
      { name: 'lease_end', label: 'Lease End Date', type: 'date', required: true },
      { name: 'monthly_rent', label: 'Monthly Rent', type: 'number', required: true },
      { name: 'security_deposit', label: 'Security Deposit', type: 'number', required: true },
      { name: 'utilities', label: 'Utilities Included', type: 'textarea' },
      { name: 'pet_policy', label: 'Pet Policy', type: 'textarea' },
      { name: 'late_fee', label: 'Late Fee', type: 'number' },
    ],
    premium: true,
  },
  {
    id: 'resume-modern',
    name: 'Modern Resume',
    category: 'personal',
    subcategory: 'Resumes',
    description: 'Clean, ATS-friendly resume template',
    thumbnail: '/templates/resume-modern.png',
    pages: 1,
    fields: [
      { name: 'full_name', label: 'Full Name', type: 'text', required: true },
      { name: 'email', label: 'Email', type: 'email', required: true },
      { name: 'phone', label: 'Phone', type: 'text' },
      { name: 'location', label: 'Location', type: 'text' },
      { name: 'linkedin', label: 'LinkedIn URL', type: 'text' },
      { name: 'summary', label: 'Professional Summary', type: 'textarea' },
      { name: 'experience', label: 'Work Experience', type: 'repeater' },
      { name: 'education', label: 'Education', type: 'repeater' },
      { name: 'skills', label: 'Skills', type: 'tags' },
    ],
    premium: false,
  },
];

// ============================================================================
// GET - List templates and categories
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'list';
    const category = searchParams.get('category');
    const subcategory = searchParams.get('subcategory');
    const search = searchParams.get('search');
    const templateId = searchParams.get('id');
    const premium = searchParams.get('premium');

    // Return categories
    if (action === 'categories') {
      return NextResponse.json({ categories: TEMPLATE_CATEGORIES });
    }

    // Get single template
    if (templateId) {
      // Check built-in first
      const builtIn = BUILT_IN_TEMPLATES.find(t => t.id === templateId);
      if (builtIn) {
        return NextResponse.json({ template: builtIn });
      }

      // Check user templates
      const { data, error } = await supabase
        .from('pdf_templates')
        .select('*')
        .eq('id', templateId)
        .single();

      if (error || !data) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 });
      }

      return NextResponse.json({ template: data });
    }

    // List templates
    let templates = [...BUILT_IN_TEMPLATES];

    // Get user/community templates
    const { data: userTemplates } = await supabase
      .from('pdf_templates')
      .select('*')
      .eq('public', true)
      .order('downloads', { ascending: false });

    if (userTemplates) {
      templates = [...templates, ...userTemplates];
    }

    // Filter by category
    if (category) {
      templates = templates.filter(t => t.category === category);
    }

    // Filter by subcategory
    if (subcategory) {
      templates = templates.filter(t => t.subcategory === subcategory);
    }

    // Filter by premium
    if (premium === 'true') {
      templates = templates.filter(t => t.premium);
    } else if (premium === 'false') {
      templates = templates.filter(t => !t.premium);
    }

    // Search
    if (search) {
      const searchLower = search.toLowerCase();
      templates = templates.filter(t =>
        t.name.toLowerCase().includes(searchLower) ||
        t.description?.toLowerCase().includes(searchLower)
      );
    }

    return NextResponse.json({
      templates,
      total: templates.length,
      categories: TEMPLATE_CATEGORIES,
    });

  } catch (error: any) {
    console.error('Template error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ============================================================================
// POST - Create custom template or generate PDF from template
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
    const { action } = body;

    switch (action) {
      case 'create':
        return await createTemplate(user.id, body);
      case 'generate':
        return await generateFromTemplate(user.id, body);
      case 'duplicate':
        return await duplicateTemplate(user.id, body);
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

  } catch (error: any) {
    console.error('Template POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ============================================================================
// CREATE TEMPLATE
// ============================================================================

async function createTemplate(userId: string, body: any): Promise<NextResponse> {
  const {
    name,
    category,
    subcategory,
    description,
    fields,
    template_data,
    public: isPublic,
  } = body;

  if (!name || !category || !fields) {
    return NextResponse.json({
      error: 'name, category, and fields required'
    }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('pdf_templates')
    .insert({
      user_id: userId,
      name,
      category,
      subcategory,
      description,
      fields,
      template_data,
      public: isPublic || false,
      downloads: 0,
    })
    .select()
    .single();

  if (error) throw error;

  return NextResponse.json({
    success: true,
    template: data,
    message: 'Template created',
  });
}

// ============================================================================
// GENERATE FROM TEMPLATE
// ============================================================================

async function generateFromTemplate(userId: string, body: any): Promise<NextResponse> {
  const { template_id, field_values, output_format } = body;

  if (!template_id || !field_values) {
    return NextResponse.json({
      error: 'template_id and field_values required'
    }, { status: 400 });
  }

  // Get template
  let template = BUILT_IN_TEMPLATES.find(t => t.id === template_id);
  
  if (!template) {
    const { data } = await supabase
      .from('pdf_templates')
      .select('*')
      .eq('id', template_id)
      .single();
    template = data;
  }

  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  // Validate required fields
  const missingFields = template.fields
    .filter((f: any) => f.required && !field_values[f.name])
    .map((f: any) => f.label);

  if (missingFields.length > 0) {
    return NextResponse.json({
      error: `Missing required fields: ${missingFields.join(', ')}`
    }, { status: 400 });
  }

  // Generate PDF (this would call the actual PDF generation service)
  // For now, we return a mock response
  const generatedPdf = {
    id: `pdf_${Date.now()}`,
    template_id,
    user_id: userId,
    field_values,
    status: 'generated',
    url: `/generated/${template_id}_${Date.now()}.pdf`,
    created_at: new Date().toISOString(),
  };

  // Log generation
  await supabase.from('pdf_generations').insert({
    user_id: userId,
    template_id,
    field_values,
    output_format: output_format || 'pdf',
  });

  // Increment downloads
  await supabase
    .from('pdf_templates')
    .update({ downloads: supabase.rpc('increment') })
    .eq('id', template_id);

  return NextResponse.json({
    success: true,
    pdf: generatedPdf,
    message: 'PDF generated successfully',
  });
}

// ============================================================================
// DUPLICATE TEMPLATE
// ============================================================================

async function duplicateTemplate(userId: string, body: any): Promise<NextResponse> {
  const { template_id, new_name } = body;

  if (!template_id) {
    return NextResponse.json({ error: 'template_id required' }, { status: 400 });
  }

  // Get original template
  let template = BUILT_IN_TEMPLATES.find(t => t.id === template_id);
  
  if (!template) {
    const { data } = await supabase
      .from('pdf_templates')
      .select('*')
      .eq('id', template_id)
      .single();
    template = data;
  }

  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  // Create copy
  const { data, error } = await supabase
    .from('pdf_templates')
    .insert({
      user_id: userId,
      name: new_name || `${template.name} (Copy)`,
      category: template.category,
      subcategory: template.subcategory,
      description: template.description,
      fields: template.fields,
      template_data: template.template_data,
      public: false,
      downloads: 0,
    })
    .select()
    .single();

  if (error) throw error;

  return NextResponse.json({
    success: true,
    template: data,
    message: 'Template duplicated',
  });
}
