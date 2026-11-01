import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC = ['/login', '/tv', '/api/sync', '/api/weekly', '/api/order-digest', '/api/onec-probe', '/api/canteens/notify', '/o/', '/api/o/', '/api/tv/'];

/** connect-src должен пускать и REST, и Realtime (wss) запросы к тому же проекту Supabase. */
function supabaseConnectSrc() {
  try {
    const host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).host;
    return `https://${host} wss://${host}`;
  } catch {
    return '';
  }
}

function buildCsp(nonce: string) {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    `connect-src 'self' ${supabaseConnectSrc()}`,
    "object-src 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
}

/** Заголовки на любой ответ — и на обычную страницу, и на редирект в /login. */
function withSecurityHeaders(response: NextResponse, csp: string) {
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  return response;
}

export async function middleware(request: NextRequest) {
  // Next сам добавляет этот nonce к своим скриптам (стриминг RSC, чанки), когда видит его в script-src.
  // Наш THEME_SCRIPT в layout.tsx читает его из заголовка x-nonce через next/headers.
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(list) {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request: { headers: requestHeaders } });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  if (!user && !PUBLIC.some((p) => path.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return withSecurityHeaders(NextResponse.redirect(url), csp);
  }
  return withSecurityHeaders(response, csp);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)'],
};
