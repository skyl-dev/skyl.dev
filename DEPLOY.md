# Deploying skyl.dev

Cloudflare Pages, connected to this repository, building on every push to `main`.

## The one thing that is not obvious

**Two repositories are involved and Pages only clones one.**

Pages clones `skyl-dev/skyl.dev`, which is this repository: the site source, the CLI, and the
shared parser. It does not clone `skyl-dev/skyl`, which is the registry: the SKILL.md files the
site is a rendering of.

The site looks for the registry as a sibling checkout, or wherever `SKYL_REGISTRY` points. A build
that has only this repository finds neither, and fails with:

```
no registry found. Check out github.com/skyl-dev/skyl beside this repository,
or set SKYL_REGISTRY to where it lives.
```

So the build command fetches it. That is what the `git clone` below is for. It is not re-cloning
the repository you connected.

It is cloned rather than added as a submodule so that publishing a skill stays one commit in one
repository, with nothing to bump here afterwards.

## Settings

In **Workers & Pages → skyl-dev → Settings → Builds and deployments**.

**Framework preset**

```
None
```

Not Astro. The preset prefills a build command and an output directory for a repository with one
app at its root. This is a workspace with the site under `apps/site`, so the preset's defaults are
wrong in both fields and only have to be overwritten.

**Build command**

```
git clone --depth 1 https://github.com/skyl-dev/skyl.git .registry && export SKYL_REGISTRY="$PWD/.registry" && pnpm install --frozen-lockfile && pnpm build && pnpm --filter @skyl/site build
```

**Build output directory**

```
apps/site/dist
```

**Root directory**

```
/
```

Leave it. The build command is written to run from the repository root.

**Environment variables**

None. Both of the ones you might expect are handled already:

- `SKYL_REGISTRY` is exported inside the build command, so it cannot disagree with where the clone
  actually landed. Setting it in the dashboard would mean hardcoding `/opt/buildhome/repo`, which
  is Cloudflare's build path today rather than a promise.
- `NODE_VERSION` comes from `.node-version` in this repository, which Pages reads.

## What each part of the build command does

| part | why |
|---|---|
| `git clone --depth 1 ... .registry` | fetches the registry, the second repository Pages does not clone. `--depth 1` because the site renders the current state, not the history |
| `export SKYL_REGISTRY="$PWD/.registry"` | tells the site where it landed. `$PWD` rather than an absolute path, so it is true wherever Cloudflare runs it |
| `pnpm install --frozen-lockfile` | the workspace. Frozen so a build cannot quietly resolve a different version than the lockfile says |
| `pnpm build` | compiles `@skyl/core`. **Not optional:** the site imports it through its package exports, which point at `dist`. Skipping this produces a module-not-found that reads like a missing dependency |
| `pnpm --filter @skyl/site build` | the pages |

## Checking it worked

The first build takes a couple of minutes, most of it `pnpm install`. When it is green:

```
https://skyl-dev.pages.dev              the home page
https://skyl-dev.pages.dev/skills       13 skills, 146 rules
https://skyl-dev.pages.dev/registry.json  13 skills and 14 reference files
https://skyl-dev.pages.dev/nothing-here   the 404 page, listing what does exist
```

`registry.json` is the one worth opening. It is what `skyl --refresh` fetches, and it should have
three top-level keys: `version`, `skills`, `references`.

## The custom domain

`skyl.dev` is already a zone on this Cloudflare account, on `bayan` and `itzel.ns.cloudflare.com`,
with no A record. So it is:

**Workers & Pages → skyl-dev → Custom domains → Set up a domain → `skyl.dev`**

No DNS records to add by hand. Cloudflare writes them, because it holds the zone.

This matters beyond looking better: the CLI falls back to `https://skyl.dev/registry.json`, so
until the domain resolves, `skyl --refresh` has nothing to fetch and the copy bundled inside the
npm package is the only route to skill content.

## Building it the same way locally

```
pnpm install
pnpm build
pnpm --filter @skyl/site build
```

No clone and no `SKYL_REGISTRY`, because a development checkout already has `skyl` beside
`skyl.dev` and the site walks up to find it.

## What still is not wired

**A push to the registry does not rebuild the site.** Pages watches this repository only, so
publishing a skill changes what the site should say and nothing tells the site to rebuild.

The fix is a deploy hook: create one under **Settings → Builds and deployments → Deploy hooks**,
then a workflow in the `skyl` repository calls that URL on push to `main`. The hook URL is a
secret in the sense that anyone holding it can trigger a build, so it belongs in the registry
repository's secrets rather than in a file.

Not written yet, because it needs the hook URL, which does not exist until the project does.
