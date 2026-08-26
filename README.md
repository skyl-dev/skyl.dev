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
--target claude     .claude/skills/<skill>/SKILL.md   (default)
--target agents     .agents/skills/<skill>/SKILL.md
--target cursor     .cursor/rules/<skill>.mdc
--target windsurf   .windsurf/rules/<skill>.md
--target continue   .continue/rules/<skill>.md
```

Each file carries the frontmatter its tool reads to decide whether the rule applies. Without it the
file is written, listed and never loaded, which is the worst available failure because it looks
installed.

The first two give a skill its own directory, so the `references/` files its rules point at are
installed beside it. The other three take one file per skill and cannot, so `add` prints which
reference files stayed behind and where to read them. Windsurf additionally reads only the first
6,000 characters of a rule and 12,000 across all of them; `add` prints the sizes rather than letting
it truncate quietly.

Installs are recorded in `skyl.lock` with a content hash, so `list` can tell a local edit from an
upstream change and a reinstall produces no diff.

Upgrading from 0.1.x: the frontmatter and the reference files are an upstream change like any other,
so `skyl list` reports one, `skyl diff` shows exactly what is being added, and `skyl update` applies
it. Nothing has to be reinstalled by hand.

## Layout

```
packages/core   parsing, detection, resolution, sources. Shared by the CLI and the site.
packages/cli    the skyl command, published to npm
apps/site       skyl.dev, a static rendering of the registry
scripts         build-bundle.mjs freezes the registry into the package, bundle-js.mjs compiles the binary
```

`core` is shared deliberately: if the site and the CLI each grew their own parser, the site would
eventually show something the CLI does not install, and that bug is hard to trace.

## Development

```
pnpm install
pnpm test        also runs against a sibling checkout of the skyl registry, if present
pnpm build       tsc, into packages/*/dist
pnpm bundle      freeze the registry into packages/cli/bundle.json
```

The site reads a sibling checkout of the registry, or `SKYL_REGISTRY` if it is set:

```
cd apps/site && pnpm dev
```

`tsc` owns `packages/cli/dist/bin.js` and esbuild owns `packages/cli/dist/skyl.js`, which is the
published binary. They wrote to the same path once, and the file on disk was whichever tool ran
last: a `pnpm build` after a pack left a release-old bundle that `tsc` would never refresh, because
its build info said the output was current.

## Status

Pre-alpha, and published. The CLI is on npm as [`skyl.dev`](https://www.npmjs.com/package/skyl.dev),
released over OIDC with a provenance attestation. The site is built and lives in `apps/site`.

The bare name `skyl` on npm has been taken since 2021, so the package is `skyl.dev`, matching the
domain. The command it installs is still `skyl`.

One family is published, Android, with 13 skills. Every number the site shows is read out of the
registry at build time rather than written down, and the build fails rather than shipping a page
that claims something the registry does not say.

## License

MIT. See [LICENSE](./LICENSE).
