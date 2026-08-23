/** The five axes. A skill belongs to exactly one, and the axis decides when it loads. */
export type Axis = 'core' | 'language' | 'framework' | 'service' | 'topic';

export const AXES: readonly Axis[] = ['core', 'language', 'framework', 'service', 'topic'];

/**
 * How a project is recognised. Keys are defined by the family, not by this package:
 * `android` uses `gradle_dependency`, a web family would use something else. Values are
 * matched as substrings against the signals a scanner collects, so
 * `com.squareup.retrofit2:retrofit` matches a Gradle line that also pins a version.
 */
export type DetectBlock = Record<string, readonly string[]>;

/** A rule id such as `ASYNC-4`. Stable for the life of a skill and never reused. */
export type RuleId = string;

export interface Rule {
  readonly id: RuleId;
  /** `must` means the failure is silent, expensive or hard to reverse. */
  readonly priority: 'must' | 'should';
}

export interface SkillMeta {
  /** `family/name`, the installable identity. */
  readonly name: string;
  readonly family: string;
  readonly skill: string;
  readonly axis: Axis;
  readonly version: string;
  readonly requires: readonly string[];
  /** Which sections an installer gives the agent. Everything else is for humans. */
  readonly agentSections: readonly string[];
  readonly retired: readonly RuleId[];
  readonly detect: DetectBlock;
  readonly authors: readonly string[];
}

export interface Skill extends SkillMeta {
  readonly rules: readonly Rule[];
  /** Only the sections named by `agentSections`, which is what gets installed. */
  readonly installable: string;
  /** Word count of `installable`, so a caller can show the cost before writing. */
  readonly installableWords: number;
  /** The whole file, for a reader who wants the reasoning as well. */
  readonly raw: string;
}

/** What a scanner found in a project, keyed the same way as a `DetectBlock`. */
export type ProjectSignals = Record<string, readonly string[]>;

export interface Match {
  readonly skill: string;
  /** Why it matched: the detect key and the value that hit. */
  readonly on: readonly { key: string; value: string }[];
}
