declare module "next-auth" {
  interface Session {
    user: { id: string; name: string; email?: string | null; businessId: string };
  }
  interface User {
    businessId: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    businessId: string;
  }
}

export {};
