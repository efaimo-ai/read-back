#!/usr/bin/env node
// Install this Agent Skill into a skills directory.
//
// GENERATED FILE. The source of truth is startup/skill-pkg/template/bin/install.mjs
// and `node skill-pkg/apply.mjs` writes it into every skill repo. Editing a copy
// makes the seven drift; `node skill-pkg/check-drift.mjs` goes red when they do.
//
// A skill is markdown, and putting markdown on npm is worth nothing by itself.
// The worth is the install path: Agent Skills have no standard distribution yet,
// and npm is the one every developer already has.
//
//   (no flag)      into ./.claude/skills/<name>/
//   --global       into ~/.claude/skills/<name>/
//   --dir <path>   into <path>/<name>/
//   --print        SKILL.md to stdout
//   --check        installed, and current?
//   --uninstall    remove it
//   --force        overwrite a directory whose contents differ
//
// Flags, not full command lines, and that is deliberate. This package can be
// reached as `npx <name>`, as `npx -y github:efaimo-ai/<name>` before it is on
// npm, or as a local `node_modules/.bin` entry, and the help text cannot know
// which. It used to print `npx <name>` unconditionally, which was a 404 for
// every one of these packages on the day it was written, and the test asserted
// that string so nothing went red. A tool tells you its flags; you already know
// how you invoked it.
//
// Exit codes are three, not two. "It is there and it differs" and "I could not
// do this at all" are different answers, and collapsing them is how a broken
// install reads as a clean one:
//   0  installed, or already identical, or --check found it current
//   1  present and different (needs --force), or --check found a mismatch
//   2  could not run (bad flag, missing source, a write that did not land)
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, rmSync } from "node:fs";
import { join, dirname, resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// The skill's own name, read out of the file it names. Nothing here hardcodes
// it, which is what lets one template serve every skill in the set.
function skillName() {
  const src = join(PKG, "SKILL.md");
  if (!existsSync(src)) fail2(`no SKILL.md beside the installer (looked in ${PKG}). The package is incomplete.`);
  const m = readFileSync(src, "utf8").match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const name = m?.[1].match(/^name:\s*(\S+)\s*$/m)?.[1];
  if (!name) fail2("SKILL.md has no `name:` in its frontmatter, so there is nothing to install it as.");
  return name;
}

// Everything a skill is made of, relative to the package root. A file that does
// not exist is skipped; a directory is walked. Nothing outside this list ships.
//
// `scripts/` is deliberately absent. In every repo in this set it holds one repo
// dev tool, and copying that into a user's skills directory would put a house
// style checker next to their skill for no reason. Runtime assets a skill needs
// belong in `references/`, which is where the Agent Skills convention already
// puts on-demand material.
const PARTS = ["SKILL.md", "references"];

function collect() {
  const files = [];
  const walk = (rel) => {
    const abs = join(PKG, rel);
    if (!existsSync(abs)) return;
    const st = statSync(abs);
    if (st.isDirectory()) {
      for (const e of readdirSync(abs).sort()) walk(join(rel, e));
    } else if (st.isFile()) {
      files.push(rel);
    }
  };
  for (const p of PARTS) walk(p);
  if (!files.length) fail2("the package contains no skill files at all; nothing would be installed");
  return files;
}

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
// A flag that takes a value has to actually get one. The first version returned
// `argv[i + 1]` and let the caller decide, so `--dir` with the path forgotten
// returned undefined, fell through the ternary below, and installed into the
// project default while printing a success line naming a directory the user had
// not asked for. `--dir --global` was worse: it took "--global" as the path and
// created a folder called `--global`. Both exited 0. That is this set's own
// read-back failure - a write that succeeded and applied something else - in the
// installer that ships the skill about it.
const opt = (f) => {
  const i = argv.indexOf(f);
  if (i === -1) return null;
  const v = argv[i + 1];
  if (v === undefined) fail2(`${f} needs a path after it, and there is nothing after it.\n\n${help()}`);
  if (v.startsWith("-")) fail2(`${f} needs a path, and "${v}" is a flag. Nothing was written.\n\n${help()}`);
  return v;
};
const KNOWN = new Set(["--global", "--dir", "--print", "--check", "--uninstall", "--force", "--help", "-h", "--version"]);

const NAME = skillName();

// Any filesystem error from here on is "I could not do this", which is exit 2.
// Left unhandled, Node prints a stack trace and exits 1, and 1 in this tool's
// contract means "present and different" - so a crash was arriving as a
// legitimate diff, with a stack trace where a sentence should be. Reached by
// pointing --dir at a path whose parent is a file.
process.on("uncaughtException", (e) => {
  console.error(`${NAME}: ${e?.message ?? e}`);
  process.exit(2);
});

if (has("--help") || has("-h")) {
  process.stdout.write(help());
  process.exit(0);
}
if (has("--version")) {
  console.log(JSON.parse(readFileSync(join(PKG, "package.json"), "utf8")).version);
  process.exit(0);
}
for (const a of argv) {
  if (a.startsWith("-") && !KNOWN.has(a)) fail2(`unknown flag ${a}\n\n${help()}`);
}

if (has("--print")) {
  process.stdout.write(readFileSync(join(PKG, "SKILL.md"), "utf8"));
  process.exit(0);
}

// Where it goes. `--dir` wins, then `--global`, then the project default, which
// is the location a project-scoped agent reads.
const dirOpt = opt("--dir");
const base = dirOpt
  ? resolve(dirOpt)
  : has("--global")
    ? join(homedir(), ".claude", "skills")
    : resolve(process.cwd(), ".claude", "skills");
const target = join(base, NAME);

// A base that exists and is not a directory cannot hold anything. Without this,
// `--dir` pointed at a file reached mkdirSync and died with a raw ENOTDIR stack
// trace and exit 1 - which in this tool's own contract means "present and
// different", so a could-not-run was reporting itself as a legitimate diff.
if (existsSync(base) && !statSync(base).isDirectory()) {
  fail2(`--dir ${base} is not a directory. Nothing was written.`);
}

// The target has to stay under the base. `NAME` comes out of SKILL.md's
// frontmatter, so this guards the package's own metadata rather than the user's
// input: a `name:` containing a separator or `..` would write outside the base a
// caller chose. It cannot fire for `--dir ../..`, which an earlier version of
// this comment claimed - `--dir` IS the base, and `join(base, NAME)` is under it
// by construction whatever the base is.
if (relative(base, target).startsWith("..") || relative(base, target).includes(`..${sep}`)) {
  fail2(`the skill name ${JSON.stringify(NAME)} would write outside ${base}`);
}

const files = collect();

if (has("--uninstall")) {
  if (!existsSync(target)) {
    console.log(`${NAME}: nothing at ${target}`);
    process.exit(0);
  }
  rmSync(target, { recursive: true, force: true });
  if (existsSync(target)) fail2(`could not remove ${target}`);
  console.log(`${NAME}: removed ${target}`);
  process.exit(0);
}

// What is already there, and how it compares. Three states, because "absent"
// and "present but different" want different answers.
const state = (() => {
  if (!existsSync(target)) return { kind: "absent", differing: [] };
  const differing = [];
  for (const rel of files) {
    const dest = join(target, rel);
    if (!existsSync(dest)) {
      differing.push(rel);
      continue;
    }
    if (!readFileSync(join(PKG, rel)).equals(readFileSync(dest))) differing.push(rel);
  }
  // Files present in the target that this package does not ship are drift too:
  // a stale reference file left behind is a file the agent still reads.
  const extra = [];
  const walkTarget = (rel) => {
    const abs = join(target, rel);
    if (!existsSync(abs)) return;
    if (statSync(abs).isDirectory()) for (const e of readdirSync(abs)) walkTarget(join(rel, e));
    else if (!files.includes(rel)) extra.push(rel);
  };
  for (const e of readdirSync(target)) walkTarget(e);
  return { kind: differing.length || extra.length ? "differs" : "same", differing, extra };
})();

if (has("--check")) {
  declare(files.length);
  if (state.kind === "absent") {
    console.log(`${NAME}: not installed at ${target}`);
    process.exit(1);
  }
  if (state.kind === "same") {
    console.log(`${NAME}: installed and current at ${target} (${files.length} files)`);
    process.exit(0);
  }
  console.log(`${NAME}: installed at ${target} but out of date`);
  for (const f of state.differing) console.log(`  differs  ${f}`);
  for (const f of state.extra ?? []) console.log(`  extra    ${f}`);
  process.exit(1);
}

if (state.kind === "same") {
  declare(files.length);
  console.log(`${NAME}: already installed and identical at ${target} (${files.length} files)`);
  process.exit(0);
}
if (state.kind === "differs" && !has("--force")) {
  console.error(
    `${NAME}: ${target} exists and differs from this version.\n` +
      state.differing.map((f) => `  differs  ${f}`).join("\n") +
      (state.extra?.length ? "\n" + state.extra.map((f) => `  extra    ${f}`).join("\n") : "") +
      `\n\nRe-run with --force to overwrite, or --check to see this without writing.`,
  );
  process.exit(1);
}

// Write, then read every byte back. A copy that reported success and landed
// something else is the failure `read-back` exists for, and an installer that
// exits 0 on it would be the worst possible advertisement for this set.
let written = 0;
for (const rel of files) {
  const dest = join(target, rel);
  mkdirSync(dirname(dest), { recursive: true });
  const bytes = readFileSync(join(PKG, rel));
  writeFileSync(dest, bytes);
  if (!existsSync(dest) || !readFileSync(dest).equals(bytes)) {
    fail2(`wrote ${dest} and read back something else; the install is not trustworthy, so it is a failure`);
  }
  written++;
}
if (written !== files.length) fail2(`expected to write ${files.length} files and wrote ${written}`);

declare(written);
console.log(`${NAME}: installed ${written} files into ${target}`);
console.log(`  the agent picks it up from there; nothing else to run.`);
process.exit(0);

function declare(n) {
  // The wire format from `denominator`, the sibling skill about exactly this:
  // a report of success that does not say how many things it covered.
  console.log(`denominator: ${NAME} files installed n=${n}`);
}

function fail2(msg) {
  console.error(`${NAME}: ${msg}`);
  process.exit(2);
}

function help() {
  // The repository, read out of package.json rather than assembled from NAME:
  // one place already knows it, and a URL built from a guess is a URL nobody
  // checked.
  let repo = "";
  try {
    const url = JSON.parse(readFileSync(join(PKG, "package.json"), "utf8")).repository?.url ?? "";
    repo = url.replace(/^git\+/, "").replace(/\.git$/, "");
  } catch {
    repo = "";
  }
  return `${NAME} - install this Agent Skill into a skills directory

Run it again with any of these:

  (no flag)       ./.claude/skills/${NAME}/   where a project's agent reads
  --global        ~/.claude/skills/${NAME}/   every project
  --dir <path>    <path>/${NAME}/
  --print         write SKILL.md to stdout and install nothing
  --check         is it installed, and is it this version?
  --uninstall     remove it
  --force         overwrite a directory whose contents differ
  --version       the version of this package
  --help          this

exit codes:
  0  installed, already identical, or --check found it current
  1  present and different (needs --force), or --check found a mismatch
  2  could not run at all
${repo ? `\n${repo}\n` : ""}`;
}
