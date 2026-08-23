# skyl.dev

The website and CLI for [Skyl](https://github.com/skyl-dev/skyl), a composable registry of AI agent
skills.

## The CLI

```
npx skyl scan          read the project and propose an install
npx skyl add <skill>   install skills and what they require
npx skyl list          what is installed, and what has moved since
```

`scan` reads build files as text rather than invoking a build, so it is instant, works on a project
that does not currently compile, and needs no toolchain. It proposes and never installs on its own.

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

Pre-alpha. The site is not started.

## License

MIT. See [LICENSE](./LICENSE).
