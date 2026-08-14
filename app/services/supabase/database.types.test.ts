import { readFileSync } from "node:fs"
import { join } from "node:path"

describe("generated notification claim types", () => {
  it("keeps nullable source columns nullable in TypeScript", () => {
    const root = join(__dirname, "../../..")
    const types = readFileSync(join(root, "app/services/supabase/database.types.ts"), "utf8")
    const migration = readFileSync(
      join(root, "supabase/migrations/20260814145000_tably_notification_identity.sql"),
      "utf8",
    )

    expect(migration).toContain(
      "returns table(id uuid, recipient_id uuid, table_id uuid, table_message_id uuid,",
    )
    expect(types).toMatch(
      /claim_notification_events:[\s\S]*?table_id: string \| null[\s\S]*?table_message_id: string \| null/,
    )
  })
})
