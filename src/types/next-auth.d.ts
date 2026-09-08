import type { Role } from "@/lib/users";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      role: Role;
      title: string;
    };
  }
  interface User {
    role: Role;
    title: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: Role;
    title: string;
  }
}
