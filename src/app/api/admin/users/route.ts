import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/server';
import { Database } from '@/types/database';

export const dynamic = 'force-dynamic';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];

async function checkAdminAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get('admin_session');
  return !!session?.value;
}

export async function GET() {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createServiceClient();

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }

  return NextResponse.json(
    (data as ProfileRow[]).map((u) => ({
      id: u.id,
      email: u.email,
      createdAt: u.created_at,
      suspendedUntil: u.suspended_until,
      suspensionReason: u.suspension_reason,
      isDeleted: u.is_deleted,
      deletionReason: u.deletion_reason,
      isKicked: u.is_kicked,
    }))
  );
}
