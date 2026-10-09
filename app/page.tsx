import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Workspace from "@/components/workspace/Workspace";
import { currentUser } from "@/lib/auth/server";
import { LANG_COOKIE, langFrom } from "@/lib/lang-cookie";

export default async function Page() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const lang = langFrom((await cookies()).get(LANG_COOKIE)?.value);
  return <Workspace user={user} initialLang={lang} />;
}
