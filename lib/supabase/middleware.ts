// Refreshes the Supabase session cookie on every request and does lightweight
// route guarding. Role checks here are a routing convenience only — RLS in
// Postgres is the real access boundary.
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { ROLE_DASHBOARDS } from '@/lib/nav';
import type { Role } from '@/lib/types';

/** Routes reachable without a session. */
const PUBLIC_PATHS = ['/', '/login', '/register', '/forgot-password', '/auth'];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => (p === '/' ? pathname === '/' : pathname.startsWith(p)));
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not insert code between createServerClient and getClaims() — it can
  // log users out at random.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const { pathname } = request.nextUrl;

  if (!claims) {
    // API routes answer for themselves (return their own 401), never redirect.
    if (pathname.startsWith('/api/')) return supabaseResponse;
    if (isPublic(pathname)) return supabaseResponse;
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  // Signed-in users bounced off register/forgot to their dashboard; /login is
  // left open so they can switch accounts.
  if (pathname === '/register' || pathname === '/forgot-password') {
    const role = (claims.user_metadata as { role?: string } | undefined)?.role;
    const url = request.nextUrl.clone();
    url.pathname = (role && ROLE_DASHBOARDS[role as Role]) || '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
