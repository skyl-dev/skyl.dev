# skyl.dev

The website and CLI for [Skyl](https://github.com/skyl-dev/skyl), a composable registry of AI agent
skills.

## The CLI

```
npx skyl.dev scan    no install, reads the project and proposes

skyl scan            read the project and propose an install
skyl add <skill>     install skills and what they require
skyl remove <skill>  take them back out
skyl list            what is installed, and what has moved since
skyl diff            what changed here, and what changed upstream
skyl update          apply the upstream side, keeping local edits
skyl audit           read a hand-written CLAUDE.md and say what is in it
skyl context         emit what a model needs to describe this project
skyl learn           derive a project knowledge skill from this repository
skyl lint            check skills against the spec
```

Nothing is written without asking, and every command prints what it would write first.

`scan` reads build files as text rather than invoking a build, so it is instant, works on a project
that does not currently compile, and needs no toolchain. It proposes and never installs on its own.

`update` distinguishes a local edit from an upstream change, because the fix differs: one is your
work to keep, the other is ours to offer. When both moved it stops and shows you the diff rather
than picking for you.

`audit` is analysis, never rewriting. Prose passed through a model comes back longer and more
generic, and the file being audited is usually one somebody tuned by hand. It reports what your file
shares with the registry and shows the words it matched on, so you can disagree with it.

`learn` derives a project knowledge skill: what the product is, what its terms mean, where things
live. There is no API key anywhere in it. Selecting the files, keeping your hand-written text, and
merging the result are deterministic and happen here; the reading is done by whichever model you
already pay for, through `--agent`, or by pasting what `--print-prompt` gives you. A file with
something that looks like a credential in it is withheld from the bundle rather than masked.

Skills are written to whichever agent tool you use:

```
--target claude     .claude/skills/     (default)
--target cursor     .cursor/rules/
--target windsurf   .windsurf/rules/
--target continue   .continue/rules/
--target agents     .agents/skills/
```

Installs are recorded in `skyl.lock` with a content hash, so `list` can tell a local edit from an
upstream change and a reinstall produces no diff.

## Layout

```
packages/core   parsing, detection, resolution, sources. Shared by the CLI and the site.
packages/cli    the skyl command, published to npm
```

`core` is shared deliberately: if the site and the CLI each grew their own parser, the site would
eventually show something the CLI does not install, and that bug is hard to trace.

## Development

```
pnpm install
pnpm test        also runs against a sibling checkout of the skyl registry, if present
pnpm build
```

## Status

Pre-alpha. The site is not started, and nothing is published to npm yet.

The bare name `skyl` on npm has been taken since 2021, so the package is `skyl.dev`, matching the
domain. The command it installs is still `skyl`.

## License

MIT. See [LICENSE](./LICENSE).
