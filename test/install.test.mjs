// GENERATED FILE. Source of truth: startup/skill-pkg/template/test/install.test.mjs
//
// The installer, spawned for real against this package's own skill. Nothing is
// mocked: the thing most likely to be wrong is what actually lands on disk, and
// a test that stubs the filesystem cannot see that.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BIN = join(ROOT, "bin", "install.mjs");
const NAME = readFileSync(join(ROOT, "SKILL.md"), "utf8").match(/^name:\s*(\S+)\s*$/m)[1];

const run = (args, cwd) =>
  spawnSync(process.execPath, [BIN, ...args], { cwd: cwd ?? ROOT, encoding: "utf8" });
const out = (r) => (r.stdout ?? "") + (r.stderr ?? "");
const tmp = () => mkdtempSync(join(tmpdir(), "skillpkg-"));

// What the package ships, computed the same way the installer does, so the
// expectation is not a number someone typed.
function shipped() {
  const files = [];
  const walk = (rel) => {
    const abs = join(ROOT, rel);
    if (!existsSync(abs)) return;
    if (statSync(abs).isDirectory()) for (const e of readdirSync(abs).sort()) walk(join(rel, e));
    else files.push(rel);
  };
  for (const p of ["SKILL.md", "references"]) walk(p);
  return files;
}

test("the package ships at least a SKILL.md", () => {
  const f = shipped();
  assert.ok(f.includes("SKILL.md"), "SKILL.md is the one file a skill cannot be without");
  assert.ok(f.length > 0);
});

test("install puts every shipped file where the agent reads it", () => {
  const dir = tmp();
  const r = run(["--dir", dir]);
  assert.equal(r.status, 0, out(r));
  for (const rel of shipped()) {
    const dest = join(dir, NAME, rel);
    assert.ok(existsSync(dest), `${rel} was not written`);
    assert.ok(readFileSync(dest).equals(readFileSync(join(ROOT, rel))), `${rel} landed with different bytes`);
  }
  rmSync(dir, { recursive: true, force: true });
});

test("it declares how many files it wrote", () => {
  const dir = tmp();
  const r = run(["--dir", dir]);
  const m = out(r).match(/^denominator: .+ files installed n=(\d+)$/m);
  assert.ok(m, "no denominator declaration in the output");
  assert.equal(Number(m[1]), shipped().length);
  rmSync(dir, { recursive: true, force: true });
});

test("installing twice is success, not a conflict", () => {
  const dir = tmp();
  assert.equal(run(["--dir", dir]).status, 0);
  const second = run(["--dir", dir]);
  assert.equal(second.status, 0, out(second));
  assert.match(out(second), /already installed and identical/);
  rmSync(dir, { recursive: true, force: true });
});

test("a modified install is exit 1 until --force", () => {
  const dir = tmp();
  run(["--dir", dir]);
  writeFileSync(join(dir, NAME, "SKILL.md"), "tampered\n");

  const blocked = run(["--dir", dir]);
  assert.equal(blocked.status, 1, out(blocked));
  assert.match(out(blocked), /exists and differs/);

  const forced = run(["--dir", dir, "--force"]);
  assert.equal(forced.status, 0, out(forced));
  assert.ok(readFileSync(join(dir, NAME, "SKILL.md")).equals(readFileSync(join(ROOT, "SKILL.md"))));
  rmSync(dir, { recursive: true, force: true });
});

test("a file the package no longer ships counts as out of date", () => {
  const dir = tmp();
  run(["--dir", dir]);
  writeFileSync(join(dir, NAME, "LEFTOVER.md"), "an old reference file\n");
  const r = run(["--dir", dir, "--check"]);
  assert.equal(r.status, 1);
  assert.match(out(r), /extra {4}LEFTOVER\.md/);
  rmSync(dir, { recursive: true, force: true });
});

test("--check is exit 1 when absent, 0 when current", () => {
  const dir = tmp();
  const missing = run(["--dir", dir, "--check"]);
  assert.equal(missing.status, 1);
  assert.match(out(missing), /not installed/);

  run(["--dir", dir]);
  const present = run(["--dir", dir, "--check"]);
  assert.equal(present.status, 0, out(present));
  assert.match(out(present), /installed and current/);
  rmSync(dir, { recursive: true, force: true });
});

test("--uninstall removes it and is quiet about nothing to remove", () => {
  const dir = tmp();
  run(["--dir", dir]);
  assert.equal(run(["--dir", dir, "--uninstall"]).status, 0);
  assert.ok(!existsSync(join(dir, NAME)));
  const again = run(["--dir", dir, "--uninstall"]);
  assert.equal(again.status, 0);
  assert.match(out(again), /nothing at/);
  rmSync(dir, { recursive: true, force: true });
});

test("--print emits the skill itself, frontmatter and all", () => {
  const r = run(["--print"]);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, readFileSync(join(ROOT, "SKILL.md"), "utf8"));
  assert.match(r.stdout, /^---/);
});

test("an unknown flag is exit 2, not a silent install", () => {
  const dir = tmp();
  const r = run(["--dir", dir, "--recursive"]);
  assert.equal(r.status, 2);
  assert.match(out(r), /unknown flag --recursive/);
  assert.ok(!existsSync(join(dir, NAME)), "nothing should have been written");
  rmSync(dir, { recursive: true, force: true });
});

test("--help and --version answer without touching the disk", () => {
  const h = run(["--help"]);
  assert.equal(h.status, 0);
  assert.match(h.stdout, new RegExp(`^${NAME} - install this Agent Skill`));
  for (const flag of ["--global", "--dir", "--print", "--check", "--uninstall", "--force"]) {
    assert.ok(h.stdout.includes(flag), `--help does not mention ${flag}`);
  }

  const v = run(["--version"]);
  assert.equal(v.status, 0);
  assert.equal(v.stdout.trim(), JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version);
});

// This test used to assert the opposite. It required `--help` to print
// `npx <name>`, which was a 404 for every package in this set on the day it was
// written: nothing was on npm. Code and test agreed, so nothing went red, which
// is carrier 5 in `claim-sweep` - an assertion encoding the old value makes the
// bug and the test agree. The help text names flags now, because this package
// can be reached three ways and cannot know which one you used.
test("--help does not advertise an install command it cannot verify", () => {
  const h = run(["--help"]);
  assert.ok(!/\bnpx\s/.test(h.stdout), `--help prints an npx line:\n${h.stdout}`);
  assert.ok(!/\bnpm\s+i\b|\bnpm\s+install\b/.test(h.stdout), `--help prints an npm install line:\n${h.stdout}`);
});

test("--dir with no path is a refusal, not an install somewhere else", () => {
  const dir = tmp();
  const r = run(["--dir"], dir);
  assert.equal(r.status, 2, out(r));
  assert.match(out(r), /needs a path/);
  // The failure this catches: falling through to the project default and
  // reporting success for a directory the caller never named.
  assert.ok(!existsSync(join(dir, ".claude")), "it installed into the default instead of refusing");
  rmSync(dir, { recursive: true, force: true });
});

test("--dir followed by a flag is a refusal, not a directory named --global", () => {
  const dir = tmp();
  const r = run(["--dir", "--global"], dir);
  assert.equal(r.status, 2, out(r));
  assert.match(out(r), /is a flag/);
  assert.ok(!existsSync(join(dir, "--global")), "it created a directory named after the flag");
  rmSync(dir, { recursive: true, force: true });
});

// The assertion is the installer's OWN sentence, not the word "directory".
// The first version matched /not a directory/, which is also what Node's ENOTDIR
// says, so it passed with the guard deleted: the crash handler caught the mkdir
// and produced a message containing the same words. Two fixes, one test, and no
// way to tell which one was doing the work. Found by deleting the guard and
// watching nothing go red.
test("--dir pointed at a file is refused before anything is attempted", () => {
  const dir = tmp();
  const f = join(dir, "afile");
  writeFileSync(f, "not a directory\n");
  const r = run(["--dir", f]);
  assert.equal(r.status, 2, out(r));
  assert.match(out(r), new RegExp(`--dir .*afile is not a directory`), out(r));
  assert.ok(!/ {4}at /.test(out(r)), `a stack trace reached the user:\n${out(r)}`);
  rmSync(dir, { recursive: true, force: true });
});

test("a filesystem error is exit 2, not exit 1 with a stack", () => {
  // --dir under a path whose PARENT is a file: the base does not exist, so the
  // is-it-a-directory guard cannot see it, and mkdir is where it breaks.
  const dir = tmp();
  const f = join(dir, "afile");
  writeFileSync(f, "not a directory\n");
  const r = run(["--dir", join(f, "sub")]);
  assert.equal(r.status, 2, out(r));
  assert.ok(!/ {4}at /.test(out(r)), `a stack trace reached the user:\n${out(r)}`);
  rmSync(dir, { recursive: true, force: true });
});

test("the package version and the skill's own version are one number", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  const fm = readFileSync(join(ROOT, "SKILL.md"), "utf8").match(/^---\r?\n([\s\S]*?)\r?\n---/)[1];
  const declared = fm.match(/^\s+version:\s*"([^"]+)"\s*$/m)?.[1];
  assert.ok(declared, "SKILL.md frontmatter has no metadata.version");
  assert.equal(pkg.version, declared, "package.json and SKILL.md disagree about the version");
  assert.equal(pkg.name, NAME, "package name and skill name have to be the same string");
});
