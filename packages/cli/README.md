# skyl

Curated AI agent skills, installed for what your project actually uses.

```
npx skyl.dev scan
```

`scan` reads your build files and proposes the skills that match. Nothing is written without
asking, and every command prints what it would write first.

```
  Detected
    android/core        new    **/src/main/AndroidManifest.xml
    android/compose     new    androidx.compose.material3:material3
    android/db          new    androidx.room:room-runtime
    android/di          new    com.google.dagger:hilt-android

  Considered and not detected
    android/java   android/mvvm   android/xml

  8 to install, ~12,300 tokens into .claude/skills
```

## Commands

```
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

## Where it writes

```
--target claude     .claude/skills/     (default)
--target cursor     .cursor/rules/
--target windsurf   .windsurf/rules/
--target continue   .continue/rules/
--target agents     .agents/skills/
```

## How it works

**Detection reads build files as text.** No Gradle invocation, no toolchain, no build. It is
instant and works on a project that does not currently compile. The cost is that a dependency
assembled at runtime from variables is missed, which is why `scan` proposes and never installs on
its own.

**Only the rules are installed.** A skill in the registry carries its reasoning, its pitfalls and
the evidence behind it. None of that reaches the model. Your agent gets the rules; the rest stays in
the repository for a human to read.

**Installs are recorded in `skyl.lock`** with a content hash of what was written, so `update` can
tell a local edit from an upstream change. The fix differs: one is your work to keep, the other is
ours to offer. When both moved, it stops and shows you the diff.

**The registry ships inside this package**, so the first run works with no network. `--refresh`
prefers the network when currency matters more than speed.

## The skills

[github.com/skyl-dev/skyl](https://github.com/skyl-dev/skyl). Every skill states what it is for,
where it does not apply, and what was measured.

## Status

Early. The API and the output are still moving.

MIT
