import { NextResponse } from 'next/server';

export function middleware(request) {
  const { pathname } = request.nextUrl;
  if (pathname === '/' || pathname.startsWith('/tournament/')) {
    return NextResponse.redirect(new URL('/create', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/tournament/:path*'],
};
