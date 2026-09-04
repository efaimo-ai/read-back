# Changelog

All notable changes to read-back are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

> **Not published yet.** This entry describes what is on `main` and is
> dated when it ships. The first publish of `read-back` cannot carry provenance:
> npm's trusted publishing is configured from an existing package's settings
> page, so it cannot create a package that has never been published, and the
> authenticated session that can create one cannot mint an OIDC attestation.
> From the version after that the release workflow owns it and every release
> carries SLSA provenance naming the commit that built it. Install it from the
> repository in the meantime; the README carries the command.

### Added

- **The skill is installable.** `npx -y github:efaimo-ai/read-back` copies `SKILL.md` and its
  `references/` into `./.claude/skills/read-back/`, with `--global`, `--dir`,
  `--check`, `--print`, `--uninstall` and `--force`. The installer reads every
  byte back after writing it and fails if what landed is not what it wrote, and
  it prints how many files it installed rather than only that it succeeded.
- Three exit codes rather than two: 0 installed or already identical, 1 present
  and different, 2 could not run at all. "It differs" and "I could not do this"
  are different answers and collapsing them is how a broken install reads as a
  clean one.
- CI on four cells (Ubuntu and Windows, Node 20 and 24), including an end to end
  run that packs the package the way npm would, installs it from that tarball,
  and installs the skill from there.

### Notes

- The skill's own content did not change for this release. It grades A(100) on
  `efaimo check --skill` before and after, and the package version and the
  version in `SKILL.md` frontmatter are one number, pinned by a test.

[Unreleased]: https://github.com/efaimo-ai/read-back/commits/main
