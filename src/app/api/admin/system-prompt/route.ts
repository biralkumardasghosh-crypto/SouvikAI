import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import * as fs from 'fs';
import * as path from 'path';
import { ADMIN_COOKIE_NAME, isAdminSessionValid } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

async function checkAdminAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get(ADMIN_COOKIE_NAME);
  return isAdminSessionValid(session?.value);
}

export async function GET() {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const systemPromptPath = path.join(process.cwd(), 'system_prompt.txt');

  try {
    const content = fs.readFileSync(systemPromptPath, 'utf-8');
    return NextResponse.json({ content });
  } catch {
    return NextResponse.json({ content: '' });
  }
}

export async function PUT(request: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { content } = await request.json();
  const systemPromptPath = path.join(process.cwd(), 'system_prompt.txt');

  try {
    fs.writeFileSync(systemPromptPath, content, 'utf-8');
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to save system prompt' }, { status: 500 });
  }
}
