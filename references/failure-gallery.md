# A gallery of quiet ones

Real shapes, with what each one printed. The point of collecting them is that
the loud failures are not the problem. Sort them by how they announced
themselves and the dangerous category is obvious.

## Loud: the shell refused, and said so

**A heredoc folded inside a compound command.**

```
mkdir -p "$DIR" && cat > "$DIR/patch.py" <<'PYEOF'
... 120 lines of Python containing quotes and apostrophes ...
PYEOF
python3 "$DIR/patch.py"
```

Printed:

```
/usr/bin/bash: -c: line 83: unexpected EOF while looking for matching `''
```

No file was written and nothing ran. This is the good case: the failure is in
your face, at a line number, before any damage.

**Backslashes folded in an inline script.**

```
node -e "const j=require('$P'.replace(/\\\\/g,'/'));"
```

Printed a `SyntaxError` and a stack trace, because by the time node saw the
string the escaping had collapsed to `/\/g` and the regex would not parse.
Again loud, again harmless.

## Quiet: it reported success and wrote something else

This is the one to design against.

```
python3 -c "
p = pathlib.Path(...)
new = '''- **CLI README** - `efaimo/README.md` somewhere ... uses only lowercase `efaimo`.'''
...
print('queued the README identity line')
"
```

Printed:

```
queued the README identity line
```

Exit code 0. The line that reached the file was:

```
- **CLI README** -  somewhere ... uses only lowercase  .
```

Two backtick-quoted spans were consumed by the outer double-quoted shell string
as command substitution. The shell ran `efaimo/README.md` as a command, which
failed into a separate error stream nobody was reading, substituted its empty
output, and handed Python a string with two holes in it. Python then did exactly
what it was asked with the string it was given, and reported success, because
from its point of view nothing went wrong.

Nothing in the visible output is a lie. The write did happen. The bytes were
just not the bytes that were authored, and the only way to find out was to look
at the line afterwards.

## Quiet: nothing matched, and that is not an error

```
sed -i 's/oldValue/newValue/' config.yml   # exit 0, file untouched
perl -pi -e 's/old/new/' *.md              # exit 0 across every file
text.replace(old, new)                     # returns the original string
```

All three treat "the pattern was not there" as an ordinary outcome, because for
most uses it is. It stops being ordinary the moment you are patching a specific
known string, because then absence means your assumption about the file was
wrong, which is exactly the finding you needed.

The fix is not a different tool. It is asserting the count:

```python
n = text.count(old)
if n != 1:
    raise SystemExit("expected 1 occurrence, found %d" % n)
```

A patch script built this way aborts before writing anything when any single
target is missing, so a partial application becomes impossible rather than
merely unlikely.

## Quiet: the right edit in the wrong place

```
cd projectA && cat some/file ; echo "=== part two ===" ; git ls-files | head -30
```

The shell was already sitting in a sibling directory from an earlier command, so
`cd projectA` failed and said so, loudly, at the top of the output. That failure
short-circuited the `&&` and nothing else. The `;` separated commands after it
ran anyway, in whichever directory the shell happened to be in, and `git
ls-files` printed a completely plausible file listing from the wrong repository.

The loud error and the misleading output were in the same block, seconds apart.
The error was read past, because the listing underneath it looked exactly like
what had been asked for. The tell was that the file names did not match what
that project should contain, and it was noticed only on a second reading.

Two lessons rather than one. `&&` and `;` are not the same and a failure in the
middle of a `;` chain stops nothing. And an error message adjacent to plausible
output gets skipped, so a write is not the place to rely on ambient state:
prefer absolute paths.

## Quiet on one machine, loud on another

The two categories above assume one machine. A payload can also be intact on
yours and corrupt on someone else's, which means the write is correct until it
is run somewhere with a different path separator.

A CI step read a package name so it could invoke the binary that package
installs:

```yaml
- run: |
    name=$(node -e "console.log(require('$GITHUB_WORKSPACE/package.json').name)")
```

On Linux `$GITHUB_WORKSPACE` is `/home/runner/work/read-back/read-back` and this
is correct. On Windows it is `D:\a\read-back\read-back`, the shell hands those
bytes over untouched, and then **the destination language eats them**: inside a
double-quoted JavaScript string literal, `\r` is a carriage return and `\a` is
not an escape at all. Node printed:

```
Error: Cannot find module 'D:a
ead-back
ead-back/package.json'
```

Six repositories went red at once, one of them this one, on a step whose whole
purpose was to prove the package installs correctly.

Two things are worth separating here. The corruption was not the shell's: the
shell was faithful, and the string literal was the compiler. And the bug was
invisible on half the matrix, so a POSIX-only CI would have stayed green through
every release while the same line was broken for every Windows user.

The fix is the same shape as everything else in this file. Do not put a path
into a string literal at all:

```yaml
name=$(node -p "require('./package.json').name")   # relative, no separator
cp "$tarball" "$RUNNER_TEMP/pkg.tgz"               # copy, then use a short name
```

**And this one has a sequel, in the same hour.** The correction note recording
the incident was written through a heredoc, and the sentence describing the
backslashes lost its own backslashes on the way to the file. It was written,
exit 0, and read back as prose about a path with no separators in it. A file
about payload corruption, corrupted in transit, discovered only by reading it
back.

## A harness that writes and restores has to restore in `finally`

A script measured a file, edited it, measured again, and put the original back:

```js
writeFileSync(p, next);
const after = measure(p);        // threw here
writeFileSync(p, original);      // never reached
```

The measurement threw, the restore never ran, and the file was left in the
edited state. Nothing reported a failure about the file, because the failure was
about the measurement. The next command in the session read a broken file and
was confused by it for several minutes.

Any code that takes custody of a file owes it back:

```js
writeFileSync(p, next);
try { after = measure(p); } finally { writeFileSync(p, original); }
```

## The pattern across all of them

Every quiet failure shares one property: **the success signal was generated by
something that had no way to detect the failure.** The shell succeeded at
shell-ing. Python succeeded at writing the string it received. `sed` succeeded
at finding no matches. Your script succeeded at reaching its final `print`.

None of them was in a position to know, and none of them claimed to be. The
claim was added by the reader.
