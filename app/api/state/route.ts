import { withUser } from "@/lib/db/http";
import { loadState } from "@/lib/db/store";

export const dynamic = "force-dynamic";

/** The morning's books plus today's decisions, from the database. */
export async function GET() {
  return withUser(() => loadState());
}
