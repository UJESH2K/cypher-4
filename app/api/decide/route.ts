import { readJson, withUser } from "@/lib/db/http";
import { cleanReason, decide, StoreError } from "@/lib/db/store";

export const dynamic = "force-dynamic";

// Approve, reject or request approval for one option of one problem. The body
// names the problem and the option; the server re-runs the agent on the stored
// books, checks the user's rights, and only then writes anything.
export async function POST(req: Request) {
  return withUser(async (user) => {
    const b = await readJson(req, 10_000);
    const action = b.action;
    if (action !== "approve" && action !== "reject" && action !== "request") throw new StoreError(400, "bad_action");
    if (typeof b.issueId !== "string" || typeof b.optionId !== "string") throw new StoreError(400, "bad_ids");
    return decide(user, { issueId: b.issueId.slice(0, 200), optionId: b.optionId.slice(0, 200), action, reason: cleanReason(b.reason) });
  });
}
