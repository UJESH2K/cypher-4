import { withUser } from "@/lib/db/http";
import { stats } from "@/lib/db/store";

export const dynamic = "force-dynamic";

/** Row counts, demand classes, supplier scorecards and the last agent run. */
export async function GET() {
  return withUser(() => stats());
}
