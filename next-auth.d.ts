import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: "USER" | "EDITOR" | "ADMIN";
      isTrustedPublisher?: boolean;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: "USER" | "EDITOR" | "ADMIN";
    isTrustedPublisher?: boolean;
  }
}
