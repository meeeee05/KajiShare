import NextAuth, { NextAuthConfig, DefaultSession } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import "next-auth/jwt";
import { backendOrigin } from "@/lib/backend-origin";
import { backendServerHeaders } from "@/lib/backend-server-headers";

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
};

const pickString = (
  obj: Record<string, unknown> | null,
  keys: string[],
): string | undefined => {
  if (!obj) {
    return undefined;
  }

  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
    if (typeof value === "number") {
      return String(value);
    }
  }

  return undefined;
};

const resolveGuestTokenFromPayload = (payload: unknown): string | undefined => {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const record = payload as Record<string, unknown>;
  const direct =
    record.id_token ?? record.idToken ?? record.access_token ?? record.token;

  if (typeof direct === "string" && direct.trim()) {
    return direct;
  }

  const data = record.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return undefined;
  }

  const nested = data as Record<string, unknown>;
  const nestedToken =
    nested.id_token ?? nested.idToken ?? nested.access_token ?? nested.token;

  if (typeof nestedToken === "string" && nestedToken.trim()) {
    return nestedToken;
  }

  return undefined;
};

const resolveGuestUserFromPayload = (
  payload: unknown,
): { id?: string; name?: string; email?: string } => {
  const root = asRecord(payload);
  const data = asRecord(root?.data);
  const user = asRecord(data?.user) ?? asRecord(root?.user);

  return {
    id: pickString(user, ["id", "user_id", "userId"]),
    name: pickString(user, ["name"]),
    email: pickString(user, ["email", "mail"]),
  };
};

export const config: NextAuthConfig = {
  theme: {
    logo: "https://next-auth.js.org/img/logo/logo-sm.png",
  },
  providers: [
    Credentials({
      id: "guest",
      name: "Guest",
      credentials: {
        mode: { label: "mode", type: "text" },
      },
      authorize: async (credentials) => {
        if (credentials?.mode !== "guest") {
          return null;
        }

        const apiUrl = process.env.API_URL?.replace(/\/+$/, "");
        if (!apiUrl) {
          return null;
        }

        const v1ApiUrl = apiUrl.endsWith("/api/v1")
          ? apiUrl
          : `${apiUrl}/api/v1`;

        let payload: unknown = null;

        try {
          const res = await fetch(`${v1ApiUrl}/auth/guest`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Origin: backendOrigin(),
              ...backendServerHeaders(),
            },
            cache: "no-store",
          });

          if (!res.ok) {
            return null;
          }

          payload = await res.json().catch(() => null);
        } catch {
          return null;
        }

        const guestIdToken = resolveGuestTokenFromPayload(payload);
        if (!guestIdToken) {
          return null;
        }

        const guestUser = resolveGuestUserFromPayload(payload);

        return {
          id: guestUser.id ?? "guest-user",
          name: guestUser.name ?? "ゲストユーザー",
          email: guestUser.email ?? "guest@kajishare.local",
          idToken: guestIdToken ?? undefined,
          account_type: "guest",
        };
      },
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  pages: {
    signIn: "/auth/signin",
    signOut: "/auth/signin",
    error: "/auth/error",
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

    async jwt({ token, account, trigger, user }) {
      if (account?.provider === "guest") {
        const guestUser = user as
          | {
              idToken?: string;
              account_type?: string;
              id?: string;
              name?: string | null;
              email?: string | null;
            }
          | undefined;

        if (!guestUser?.idToken) {
          return token;
        }

        token.idToken = guestUser.idToken;
        token.isGuest = true;
        token.account_type = guestUser?.account_type || "guest";

        if (guestUser.id) {
          token.sub = guestUser.id;
        }

        if (typeof guestUser.name === "string") {
          token.name = guestUser.name;
        }

        if (typeof guestUser.email === "string") {
          token.email = guestUser.email;
        }

        return token;
      }

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
              Origin: backendOrigin(),
              ...backendServerHeaders(),
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
      session.user.isGuest = token.isGuest === true;
      session.user.account_type =
        typeof token.account_type === "string"
          ? token.account_type
          : token.isGuest === true
            ? "guest"
            : undefined;

      if (token.isGuest === true) {
        if (typeof token.sub === "string" && token.sub.trim()) {
          session.user.id = token.sub;
        }

        if (typeof token.name === "string") {
          session.user.name = token.name;
        }

        if (typeof token.email === "string") {
          session.user.email = token.email;
        }
      }

      return session;
    },
  },
};

//JWT拡張（idTokenプロパティを追加）
declare module "next-auth/jwt" {
  interface JWT {
    idToken?: string;
    isGuest?: boolean;
    account_type?: string;
  }
}

//Session拡張（idTokenをフロントエンドで確認）
declare module "next-auth" {
  interface Session {
    user: {
      id?: string;
      idToken?: string;
      isGuest?: boolean;
      account_type?: string;
    } & DefaultSession["user"];
  }
}

//APIハンドラ取得
export const { handlers, auth, signIn, signOut } = NextAuth(config);
