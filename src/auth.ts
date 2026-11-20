import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authenticate } from "@/lib/db";

// Sign-in is identifier + password only: an email, phone or username belongs to exactly one user,
// and that user carries its business and role, so nobody picks a role at the door.
export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  pages: { signIn: "/signin" },
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      credentials: { identifier: {}, password: {} },
      async authorize(creds) {
        const u = await authenticate(String(creds?.identifier ?? ""), String(creds?.password ?? ""));
        return u ? { id: u.id, name: u.name, email: u.email ?? null, businessId: u.businessId } : null;
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.businessId = user.businessId;
      return token;
    },
    session({ session, token }) {
      session.user.id = token.sub ?? "";
      session.user.businessId = String(token.businessId ?? "");
      return session;
    },
  },
});
