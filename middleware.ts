import { type NextRequest } from 'next/server';
import { updateSession } from './lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sw.js, site.webmanifest (PWA & service worker files)
     * - assets / public files (*.svg, *.png, *.jpg, *.webp, *.js, *.json, *.webmanifest)
     */
    '/((?!_next/static|_next/image|favicon.ico|sw.js|site.webmanifest|manifest.json|robots.txt|assets/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|js|json|webmanifest|ico|txt)$).*)',
  ],
};
