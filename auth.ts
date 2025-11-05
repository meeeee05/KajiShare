import { request } from "http";
import NextAuth, { NextAuthConfig, DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";
import GoogleProvider from "next-auth/providers/google";
import "next-auth/jwt";

export const config: NextAuthConfig = {
    theme: {
        logo: "https://next-auth.js.org/img/logo/logo-sm.png",
    },
    providers: [
    GoogleProvider({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET
  })
],
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

         async jwt({ token, trigger, session, account }) {
            //Google認証時にid_tokenをJWTに格納
            if (account && account.id_token) {
                token.idToken = account.id_token;
            }
            //セッション更新時にnameをJWTに格納
            if (trigger === "update" && session?.user?.name) {
                token.name = session.user.name;
            }
            return token;
        },

        async session({ session, token }) 
        {
            session.user.idToken = token.idToken;
            return session;
        },
  },
        
};

//JWT拡張（idTokenプロパティを追加）
declare module "next-auth/jwt" {
    interface JWT {
        idToken?: string;
    }
}

//Session拡張（idTokenをフロントエンドで確認）
declare module "next-auth" {
    interface Session {
        user: {
            idToken?: string;
        } & DefaultSession["user"];
    }
}

//APIハンドラ取得
export const {handlers, auth, signIn, signOut, } = NextAuth(config);