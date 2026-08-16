import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

// 简易 bcrypt 包装（运行时安装）
async function hashPassword(password: string): Promise<string> {
  const { default: b } = await import("bcryptjs");
  return b.hash(password, 10);
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const { default: b } = await import("bcryptjs");
  return b.compare(password, hash);
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/auth/login",
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "邮箱", type: "email" },
        password: { label: "密码", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null;
        // 登录限流:同一 IP + 邮箱 15 分钟最多 10 次尝试,防暴力破解
        const ip =
          req?.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
        const emailKey = credentials.email.toLowerCase();
        if (
          !rateLimit(`login:${emailKey}`, 10, 900_000) ||
          !rateLimit(`login-ip:${ip}`, 30, 900_000)
        ) {
          throw new Error("尝试次数过多,请 15 分钟后再试");
        }
        const user = await db.user.findUnique({
          where: { email: emailKey },
        });
        if (!user) return null;
        const ok = await verifyPassword(credentials.password, user.passwordHash);
        if (!ok) return null;
        return { id: user.id, email: user.email, name: user.name ?? undefined };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.id as string;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export { hashPassword, verifyPassword };
