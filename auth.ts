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
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  pages: {
    signIn: "/auth/signin",
    signOut: "/auth/signin",
  },
  basePath: "/api/auth",
  callbacks: {
    authorized: ({ request, auth }) => {
      try {
        //リクエストされたパスを取得
        const { pathname } = request.nextUrl;
        if (pathname === "/protected.page") {
          //真偽値に変換（パスが"/protected.page"完全一致の時だけ通す）
          return !!auth;
        }
        return true;
      } catch (error) {
        console.log(error);
      }
    },

    async jwt({ token, account, trigger }) {
      const idToken = account?.id_token;

      if (idToken === undefined) {
        return token;
      }

      token.idToken = idToken;

      if (trigger === "signIn") {
        const apiUrl = process.env.API_URL;

        if (apiUrl === undefined) {
          throw new Error("API_URL is not configured");
        }

        try {
          const response = await fetch(`${apiUrl}/auth/google`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${idToken}`,
            },
          });

          if (!response.ok) {
            console.error(
              "API authentication failed:",
              response.status,
              response.statusText,
            );
            throw new Error(`Authentication failed: ${response.status}`);
          }
        } catch (error) {
          console.error("API connection error:", error);
          throw error;
        }
      }

      return token;
    },
    session({ session, token }) {
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
export const { handlers, auth, signIn, signOut } = NextAuth(config);
