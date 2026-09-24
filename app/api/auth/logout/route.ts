import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseUrl, getSupabaseAnonKey } from '@/lib/supabase/config';

export async function POST(req: NextRequest) {
  try {
    const cookiesToSetList: { name: string; value: string; options?: any }[] = [];

    const ssrClient = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach((c) => cookiesToSetList.push(c));
        },
      },
    });

    await ssrClient.auth.signOut({ scope: 'local' });

    const response = NextResponse.json({ success: true });

    // 1. Remove cookie admin
    response.cookies.delete('appchurch_admin_session');
    response.cookies.set('appchurch_admin_session', '', { path: '/', maxAge: 0, expires: new Date(0) });

    // 2. Aplica cookies emitidos pelo Supabase SSR signOut
    cookiesToSetList.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, {
        ...options,
        path: '/',
        maxAge: 0,
        expires: new Date(0),
      });
    });

    // 3. Garante expiração imediata de quaisquer cookies sb-* e tokens de autenticação
    const allCookies = req.cookies.getAll();
    allCookies.forEach((cookie) => {
      if (
        cookie.name.startsWith('sb-') ||
        cookie.name.includes('token') ||
        cookie.name.includes('appchurch') ||
        cookie.name.includes('auth')
      ) {
        response.cookies.delete(cookie.name);
        response.cookies.set(cookie.name, '', {
          path: '/',
          maxAge: 0,
          expires: new Date(0),
        });
      }
    });

    // Headers anti-cache
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    response.headers.set('Pragma', 'no-cache');

    return response;
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message }, { status: 500 });
  }
}
