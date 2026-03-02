import { NextRequest, NextResponse } from 'next/server'

/**
 * Next.js Edge Middleware — Route Protection
 *
 * Protects /dashboard/* and /admin/* routes server-side.
 * Checks for _session cookie or Authorization header with a Firebase ID token.
 * Note: Full token verification happens in API middleware (lib/auth.ts);
 * this middleware provides a fast first-pass guard at the edge.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ─── Protected route patterns ────────────────────────────
  const isProtected =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/admin')

  if (!isProtected) {
    return NextResponse.next()
  }

  // Check for auth indicators (cookie or header)
  const hasSession =
    request.cookies.has('auth-session') ||
    request.cookies.has('__session') ||
    request.cookies.has('firebase-auth') ||
    !!request.headers.get('authorization')

  // If no auth indicator, redirect to login
  if (!hasSession) {
    const loginUrl = new URL('/auth/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Block non-admin access to /admin/* by checking a role cookie
  // (set by the client after auth sync — full verification in API layer)
  if (pathname.startsWith('/admin')) {
    const role = request.cookies.get('user-role')?.value
    if (role && role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*'],
}
