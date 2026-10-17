// Render Open Peeps figures (CC0, Pablo Stanley — openpeeps.com) to static SVG files.
// Called by `studio build` (bin/lib/frames.mjs) with a job file; `--list` prints the part names.
//   node render.cjs <jobs.json>   jobs: [{ out, body, face, hair, facialHair, accessory, stroke, fill }]
//   node render.cjs --list [filter]
const fs = require("fs");
const path = require("path");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const Peep = require("react-peeps").default;

const LIB = path.join(__dirname, "node_modules", "react-peeps", "lib", "peeps");
function names(dir) {
  const out = [];
  (function walk(d) {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      if (f.isDirectory()) walk(path.join(d, f.name));
      else if (/^[A-Z].*\.js$/.test(f.name)) out.push(f.name.slice(0, -3));
    }
  })(path.join(LIB, dir));
  return [...new Set(out)].sort();
}

if (process.argv[2] === "--list") {
  const q = (process.argv[3] || "").toLowerCase();
  const groups = { body: names("pose"), face: names("face"), hair: names("hair"), facialHair: names("facialHair"), accessory: names("accessories") };
  for (const [k, v] of Object.entries(groups)) {
    const hit = v.filter((n) => !q || n.toLowerCase().includes(q) || k.toLowerCase().includes(q));
    if (hit.length) console.log(`${k.padEnd(11)} ${hit.join(" ")}`);
  }
  process.exit(0);
}

const jobs = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
for (const j of jobs) {
  let svg = renderToStaticMarkup(React.createElement(Peep, {
    body: j.body, face: j.face, hair: j.hair, facialHair: j.facialHair || "None", accessory: j.accessory || "None",
    strokeColor: j.stroke, backgroundColor: j.fill,
  }));
  svg = svg
    .replace(/<svg[^>]*viewBox="([^"]*)"[^>]*>/, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="$1">')
    .replace(/#4F66AF/gi, j.stroke) // a few parts ship a hard-coded blue; keep the figure two-colour
    .replace(/(\d+\.\d{2})\d+/g, "$1"); // trim path precision (~35% smaller, invisible at video scale)
  fs.mkdirSync(path.dirname(j.out), { recursive: true });
  fs.writeFileSync(j.out, svg);
}
console.log(`peeps: rendered ${jobs.length} figure(s)`);
