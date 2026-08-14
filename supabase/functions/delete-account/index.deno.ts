Deno.test("account deletion snapshot does not retain email", async () => {
  const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url))

  if (!source.includes("account_deletion")) throw new Error("account deletion snapshot is missing")
  if (!source.includes("requested_at")) throw new Error("deletion timestamp is missing")
  if (source.includes("email: profile.email") || source.includes("email: profile?.email")) {
    throw new Error("account deletion snapshot still includes profile email")
  }
})
