import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import LoginScreen from "@/components/login/LoginScreen";
import { DEMO_LOGINS } from "@/lib/auth/demo";
import { currentUser } from "@/lib/auth/server";
import { LANG_COOKIE, langFrom } from "@/lib/lang-cookie";

export const metadata: Metadata = { title: "Sign in · Kaveri Desk" };

export default async function LoginPage() {
  if (await currentUser()) redirect("/");
  const lang = langFrom((await cookies()).get(LANG_COOKIE)?.value);
  return <LoginScreen initialLang={lang} demo={DEMO_LOGINS} />;
}
