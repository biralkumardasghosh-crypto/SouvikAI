import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/server';
import { Database } from '@/types/database';
import { ADMIN_COOKIE_NAME, isAdminSessionValid } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

type AdminSettingsRow = Database['public']['Tables']['admin_settings']['Row'];

async function checkAdminAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get(ADMIN_COOKIE_NAME);
  return isAdminSessionValid(session?.value);
}

export async function GET() {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createServiceClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = await supabase
    .from('admin_settings')
    .select('*')
    .single();

  if (result.error || !result.data) {
    console.error('[GET /api/admin/settings] fetch error:', result.error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }

  const settings = result.data as AdminSettingsRow;

  return NextResponse.json({
    id: settings.id,
    temperature: settings.temperature,
    maxTokens: settings.max_tokens,
    modelName: settings.model_name,
    editMode: settings.edit_mode,
    updatedAt: settings.updated_at,
  });
}

export async function PUT(request: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = await createServiceClient();
  const body = await request.json();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: any = {};
  if (body.temperature !== undefined) updates.temperature = body.temperature;
  if (body.maxTokens !== undefined) updates.max_tokens = body.maxTokens;
  if (body.modelName !== undefined) updates.model_name = body.modelName;
  if (body.editMode !== undefined) updates.edit_mode = body.editMode;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = await supabase
    .from('admin_settings')
    .update(updates)
    .eq('id', 1)
    .select()
    .single();

  if (result.error || !result.data) {
    console.error('[PUT /api/admin/settings] update error:', result.error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }

  const settings = result.data as AdminSettingsRow;

  return NextResponse.json({
    id: settings.id,
    temperature: settings.temperature,
    maxTokens: settings.max_tokens,
    modelName: settings.model_name,
    editMode: settings.edit_mode,
    updatedAt: settings.updated_at,
  });
}
