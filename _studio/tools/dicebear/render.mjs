// stdin {style, seed, options} → stdout SVG. Style names are kebab-case (notionists, open-peeps, lorelei…).
import { createAvatar } from "@dicebear/core";
import * as collection from "@dicebear/collection";
let raw = ""; for await (const c of process.stdin) raw += c;
const { style, seed, options } = JSON.parse(raw);
const key = style.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
if (!collection[key]) { console.error("unknown DiceBear style: " + style + " (have: " + Object.keys(collection).join(", ") + ")"); process.exit(1); }
process.stdout.write(createAvatar(collection[key], { seed, ...(options || {}) }).toString());
