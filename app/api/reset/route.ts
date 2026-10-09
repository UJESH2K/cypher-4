import { withUser } from "@/lib/db/http";
import { resetBooks } from "@/lib/db/store";

export const dynamic = "force-dynamic";

/** Puts the books back to this morning and moves every date so that today is today. */
export async function POST() {
  return withUser((user) => resetBooks(user));
}
