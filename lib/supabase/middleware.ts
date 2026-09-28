import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseUrl, getSupabaseAnonKey } from './config';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // Otimização de Performance (Item 6):
  // Valida a sessão examinando os cookies e claims locais do Supabase sem disparar HTTP /auth/v1/user
  // em cada navegação de página estática/client.
  // getClaims() / getSession() decodifica o JWT localmente.
  let hasValidSession = false;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session && session.expires_at) {
      const nowInSeconds = Math.floor(Date.now() / 1000);
      // Considera válido se não expirou (com margem de 60s)
      if (session.expires_at > nowInSeconds + 60) {
        hasValidSession = true;
      } else {
        // Perto de expirar: renova com getUser()
        const { data: { user } } = await supabase.auth.getUser();
        hasValidSession = Boolean(user);
      }
    }
  } catch {
    hasValidSession = false;
  }

  const url = request.nextUrl.clone();

  // Se já logado e acessar /login, redireciona para a home
  if (hasValidSession && url.pathname === '/login') {
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
