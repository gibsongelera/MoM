import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Run on everything except static assets, image files and provider
     * webhooks, so the Supabase auth cookie is refreshed on every real
     * navigation. Webhooks carry no session, and running the proxy on them
     * would cap their (large, signed) request bodies at 10 MB.
     */
    '/((?!_next/static|_next/image|favicon.ico|api/webhooks/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf)$).*)',
  ],
};
