/**
 * Base for everything this package throws, so a caller can catch one type.
 *
 * Written without constructor parameter properties: Node runs these files by stripping
 * types, which does not support that syntax, and being able to run the source directly
 * is worth more than the shorthand.
 */
export class SkylError extends Error {
  readonly detail: string | undefined;

  constructor(message: string, detail?: string) {
    super(detail ? `${message}\n  ${detail}` : message);
    this.name = new.target.name;
    this.detail = detail;
  }
}

/** A SKILL.md that does not parse, or is missing something the format requires. */
export class SkillFormatError extends SkylError {}

/** `requires` naming a skill that is not in the index, or a cycle between skills. */
export class ResolutionError extends SkylError {}

/** No source could supply the registry. */
export class SourceError extends SkylError {}
