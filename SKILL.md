---
name: read-back
description: Use immediately after any write a tool reported as successful and before running anything that depends on it or calling the change done - a file edited through a shell command, a patch applied with sed or perl, a heredoc, an inline script that does a string replacement, a config rewritten in place, a bulk rename, a generated file. A shell rewrites the payload it carries, and a replacement that matches nothing exits 0, so a command can succeed having written something other than what you wrote, or nothing at all.
license: Apache-2.0
metadata:
  version: "0.1.0"
  homepage: "https://efaimo.ai"
  verified_against: "2026-09-03"
---

# read-back

`red-before-green` is about instruments: a check that passed may never have
checked. This is about actuators: **a write that succeeded may never have
applied, or may have applied something other than what you wrote.**

They are not the same problem, and the second one is quieter. A suspicious green
is at least a result you can interrogate. A failed write leaves you an exit code
of 0, a success line you printed yourself, and a file that has silently become
something you did not author. Nothing in that sequence looks wrong until much
later, when the thing you thought you fixed is still broken and you go looking
in the wrong place, because you are certain that edit landed.

## Why a write is not a write

**The shell is not a pipe. It is a compiler.** Everything on a command line is
parsed and rewritten before your program is handed a single byte: backticks
become command substitution, `$name` expands, backslashes fold, `!` may history
expand, quotes are consumed, and newlines separate statements. From the shell's
own point of view it did exactly what it was told, so it reports success. Your
payload arrives modified and nobody says so.

The second mechanism needs no shell at all. **A replacement that matches nothing
is not an error to most tools.** `sed -i`, `perl -pi`, and a plain
`text.replace(old, new)` all exit 0 and return happily when the pattern was
never there. So does an edit aimed at a file that has moved. "I replaced it" and
"there was nothing to replace" are the same output, which is the same shape as
the vacuous pass that `red-before-green` is about, just pointed the other way.

## The move

1. **Make the write assert its own preconditions.** Not "replace A with B" but
   "replace A with B, and fail unless A appears exactly the number of times I
   expect." Zero matches is a failure, not a no-op; so is three when you meant
   one. This single habit converts the silent miss into a stop, and it is worth
   more than the other four together.
2. **Keep the payload off the command line.** Write it to a file and have your
   program read the file. A file's bytes are yours. A command line's bytes
   belong to the shell until it decides to hand them over.
3. **Prefer a structured edit tool where one exists.** The good ones fail loudly
   on an absent or stale match, which is precisely the failure you are trying to
   surface.
4. **Read back the changed region, unless the tool already failed loudly for
   you.** A structured edit tool that errors on an absent or stale match has
   done this step on your behalf, and re-reading after one is wasted work. Read
   back when the write went through a shell, a script you wrote, or anything
   whose success line you generated yourself: the bytes on disk, at the place
   you changed, not the exit code.
5. **Then run the thing that depends on it.** A test, a build, a checker. The
   read-back tells you the edit landed; this tells you it landed correctly.

If a write cannot be made to fail when its target is missing, you do not have a
write. You have a request.

## The tells

Be most suspicious when any of these is true.

- The payload contains a backtick, `$`, a backslash, `!`, or a newline.
- The write is one long quoted string on a command line.
- The success message was printed by your own code rather than by the OS or the
  tool. Your script cannot report a failure it never detected.
- `sed -i` or `perl -pi` with no count of what matched.
- A replace-all where you did not count occurrences before and after.
- A heredoc inside a compound command, behind `&&` or a pipe or a subshell.
- On a retry, the edit reports "already applied." Sometimes true. Sometimes the
  first attempt wrote nothing and the second is matching its own absence.
- The file is large or generated and you were never going to open it.

## What this is not

This is not "avoid the shell." The shell is excellent at moving bytes between
places. It is unreliable as the **carrier of bytes you are authoring**, which is
a different job that it is routinely asked to do because the one-liner is right
there.

It is also not a claim that your edit was wrong. It is a claim that the exit
code did not tell you whether your edit was right, and that you have been
reading it as though it did.

## Related

- `red-before-green` is the same discipline aimed at instruments rather than
  actuators: make a check produce a positive on purpose before believing its
  green. Between them: verify what measures, and verify what changes.
- `claim-sweep` covers what happens after a write does land: every other
  artifact that still asserts the fact you just changed.
- [efaimo](https://github.com/efaimo-ai/efaimo) audits the quality and context
  cost of MCP servers and Agent Skills, including this one.
