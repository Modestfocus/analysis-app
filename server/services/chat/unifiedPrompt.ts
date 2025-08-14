import fs from "node:fs";
import path from "node:path";

export function logUnifiedPromptDebug(opts: {
  messages: Array<any>;
  label?: string;
  imagesAttached?: Array<{
    kind: "target" | "similar-original" | "similar-depth" | "similar-edge" | "similar-gradient";
    id?: number;
    url?: string;
  }>;
}) {
  if (process.env.DEBUG_UNIFIED_PROMPT !== "1") return;

  const { messages, imagesAttached = [], label = "" } = opts;
  const redact = (s: string, n = 800) =>
    (s || "").replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g, "[[BASE64_IMAGE]]").slice(0, n);

  const lines: string[] = [];
  lines.push("════════ UNIFIED PROMPT DEBUG ════════", label ? `Label: ${label}` : "");

  const sys = messages.find(m => m.role === "system");
  lines.push("\n— SYSTEM PROMPT —");
  lines.push(sys?.content ? redact(typeof sys.content === "string" ? sys.content : JSON.stringify(sys.content)) : "(none)");

  const user = messages.find(m => m.role === "user");
  lines.push("\n— USER CONTENT —");
  if (user?.content && Array.isArray(user.content)) {
    user.content.forEach((part: any, i: number) => {
      if (part?.type === "text") {
        lines.push(`  [${i}] text: ${redact(part.text, 1200)}`);
      } else if (part?.type === "image_url") {
        const url = part.image_url?.url ?? "";
        lines.push(`  [${i}] image_url: ${typeof url === "string" ? url.slice(0, 80) : JSON.stringify(url).slice(0, 80)}...`);
      } else {
        lines.push(`  [${i}] ${JSON.stringify(part).slice(0, 200)}...`);
      }
    });
  } else {
    lines.push("(user content missing or not array)");
  }

  lines.push("\n— IMAGES ATTACHED —");
  if (imagesAttached.length) {
    imagesAttached.forEach((im, i) => {
      lines.push(`  [${i}] kind=${im.kind} id=${im.id ?? "-"} url=${im.url ? im.url.slice(0, 100) + "..." : "(inline/base64)"}`);
    });
  } else {
    lines.push("(none listed)");
  }

  const out = lines.join("\n") + "\n════════════════════════════════════\n";
  console.log(out);

  try {
    const fname = `unified_prompt_${Date.now()}.txt`;
    const fpath = path.join("/tmp", fname);
    fs.writeFileSync(fpath, out, "utf8");
    console.log(`[DEBUG] Unified prompt saved: ${fpath}`);
  } catch {}
}