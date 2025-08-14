import crypto from "crypto";

export function logUnifiedPromptDebugOnce(label: string, messages: any[]) {
  if (process.env.DEBUG_UNIFIED_PROMPT !== "1") return;

  const sys = messages.find((m: any) => m.role === "system");
  const sysText = typeof sys?.content === "string" ? sys.content : JSON.stringify(sys?.content ?? "");
  const sysHash = crypto.createHash("sha256").update(sysText).digest("hex").slice(0, 12);

  const user = messages.find((m: any) => m.role === "user");
  const imgCount =
    (Array.isArray(user?.content) ? user.content.filter((p: any) => p.type === "image_url").length : 0);

  console.log("\n════════ UNIFIED PROMPT DEBUG:", label);
  console.log("System.len:", sysText.length, "System.hash:", sysHash);
  console.log("System.head:", sysText.slice(0, 220).replace(/\s+/g, " "));
  console.log("User.parts:", Array.isArray(user?.content) ? user.content.length : 0, "Images:", imgCount);
  console.log("User.text.head:", Array.isArray(user?.content)
    ? (user.content.find((p: any) => p.type === "text")?.text ?? "").slice(0, 160).replace(/\s+/g, " ")
    : "");
  console.log("════════ END UNIFIED PROMPT DEBUG\n");
}