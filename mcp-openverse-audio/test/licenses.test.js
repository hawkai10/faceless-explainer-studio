import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate, attributionText } from "../src/licenses.js";

const base = { id: "x", title: "T", creator: "C", foreign_landing_url: "https://example.org/t" };
const ok = (r, o) => evaluate({ ...base, ...r }, o);

test("public domain licenses are tier 0, no attribution", () => {
  for (const [license, version] of [["cc0", "1.0"], ["pdm", "1.0"], ["cc0", null]]) {
    const ev = ok({ license, license_version: version });
    assert.equal(ev.allowed, true, license);
    assert.equal(ev.tier, 0);
    assert.equal(ev.attributionRequired, false);
    assert.match(ev.url, /^https:\/\/creativecommons\.org\/publicdomain\//);
  }
});

test("CC BY is allowed with attribution; needs a version and a creator", () => {
  const ev = ok({ license: "by", license_version: "4.0" });
  assert.equal(ev.allowed, true);
  assert.equal(ev.tier, 1);
  assert.equal(ev.attributionRequired, true);
  assert.equal(ev.url, "https://creativecommons.org/licenses/by/4.0/");
  assert.equal(ok({ license: "by" }).allowed, false, "no version = unclear");
  assert.equal(ok({ license: "by", license_version: "3.0", creator: "" }).allowed, false, "no creator = cannot attribute");
});

test("share-alike only with explicit opt-in", () => {
  assert.equal(ok({ license: "by-sa", license_version: "4.0" }).allowed, false);
  const ev = ok({ license: "by-sa", license_version: "4.0" }, { allowShareAlike: true });
  assert.equal(ev.allowed, true);
  assert.equal(ev.shareAlike, true);
});

test("non-commercial, no-derivatives, sampling and unknown licenses are never allowed", () => {
  for (const license of ["by-nc", "by-nc-sa", "by-nc-nd", "by-nd", "sampling+", "nc-sampling+", "gpl", "", undefined]) {
    const ev = ok({ license, license_version: "3.0" }, { allowShareAlike: true });
    assert.equal(ev.allowed, false, String(license));
    assert.ok(ev.reasons.length > 0);
  }
});

test("unclear provenance is rejected", () => {
  assert.equal(ok({ license: "cc0", foreign_landing_url: "" }).allowed, false, "no source page");
  assert.equal(ok({ license: "cc0", id: "" }).allowed, false, "no id");
  assert.equal(ok({ license: "cc0", mature: true }).allowed, false, "mature");
  const mismatch = ok({ license: "cc0", license_url: "https://creativecommons.org/licenses/by-nc/4.0/" });
  assert.equal(mismatch.allowed, false, "license_url disagrees with license code");
});

test("attribution text prefers Openverse's own line, else builds one", () => {
  const rec = { ...base, license: "by", license_version: "4.0" };
  const ev = evaluate(rec);
  assert.match(attributionText(rec, ev), /"T" by C is licensed under CC BY 4\.0/);
  assert.equal(attributionText({ ...rec, attribution: "Given line." }, ev), "Given line.");
});
