import { withUser } from "@/lib/db/http";
import { runAgent } from "@/lib/db/store";

export const dynamic = "force-dynamic";

/** Runs the agent on the server against the database and logs the run. */
export async function POST() {
  return withUser((user) => runAgent(user));
}
