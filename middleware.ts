import { NextResponse } from "next/server";
import { auth } from "@/auth";

const PUBLIC_PATHS = ["/auth/timeout", "/auth/signin"];

export default auth((req) => {
    const { pathname } = req.nextUrl;
    const isPublicPath = PUBLIC_PATHS.some((path) => pathname === path);

    if (!req.auth && !isPublicPath) {
        return NextResponse.redirect(new URL("/auth/timeout", req.nextUrl));
    }

    return NextResponse.next();
});

export const config = {
    matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};