import { request } from "http";
import NextAuth, { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

export const config: NextAuthConfig = {
    providers: [Google],
    basePath: "/api/auth",
    callbacks: {
        authorized: ({ request, auth }) => {
            try {
                //リクエストされたパスを取得
                const {pathname} = request.nextUrl;
                if (pathname === "/protected.page") {

                    //真偽値に変換（パスが"/protected.page"完全一致の時だけ通す）
                    return !!auth;
                }
                return true;
            } 
            catch (error) {
                console.log(error);
            }
         },

         jwt({token, trigger, session}) {
            if (trigger === "update") token.name = session.user.name;
            return token;
        },
 },
        
};

//APIハンドラ取得
export const {handlers, auth, signIn, signOut, } = NextAuth(config);