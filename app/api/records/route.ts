import { readJson, withUser } from "@/lib/db/http";
import { saveRecords, saveSettings, StoreError } from "@/lib/db/store";

export const dynamic = "force-dynamic";

// Edits from the Records screen: a changed version of the books, or new assumptions.
// Only roles that may edit records get through; the server writes just the difference.
export async function POST(req: Request) {
  return withUser(async (user) => {
    const b = await readJson(req);
    if (b.settings) return saveSettings(user, b.settings);
    if (b.data) return saveRecords(user, b.data);
    throw new StoreError(400, "nothing_to_save");
  });
}
