/**
 * The question flow.
 *
 * Nobody arrives knowing they want `android/db`. They know they are building an app that
 * saves things on the device. The flow asks about the project and resolves the skills,
 * which is also the honest way to show the composition model: every answer is a layer.
 *
 * Paths with nothing published say so rather than being hidden. A registry that pretends
 * to cover everything is worse than one that says what it covers.
 */
export interface Option {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  /** Skills this answer contributes. */
  readonly picks?: readonly string[];
  readonly next?: string;
  /** Nothing published for this path yet, with what would be involved. */
  readonly soon?: string;
  /** Chosen when someone says they are not sure, with the reason shown. */
  readonly fallback?: string;
}

export interface Question {
  readonly id: string;
  readonly prompt: string;
  readonly help?: string;
  readonly multi?: boolean;
  readonly options: readonly Option[];
}

export const START = 'building';

export const QUESTIONS: readonly Question[] = [
  {
    id: 'building',
    prompt: 'What are you building?',
    help: 'Five axes decide what loads. This is the first one.',
    options: [
      { id: 'mobile', label: 'A mobile app', hint: 'Ships to a phone', next: 'platform' },
      {
        id: 'web', label: 'A web app or site', hint: 'React, Vue, Svelte, plain HTML',
        soon: 'No web family is published yet. The axes are the same, and the rules are not: a web core would own hydration, bundling and route boundaries.',
      },
      {
        id: 'backend', label: 'A backend or API', hint: 'Node, Python, Go, Rust',
        soon: 'No backend family is published yet. A service core would own transactions, idempotency and retry semantics.',
      },
      {
        id: 'unsure', label: "I'm not sure", hint: 'Let the CLI read the project instead',
        soon: 'Run `npx skyl.dev scan` in the project. It reads the build files as text, proposes what matches, and installs nothing without asking.',
      },
    ],
  },
  {
    id: 'platform',
    prompt: 'Which platform?',
    options: [
      { id: 'android', label: 'Android', hint: '13 skills published', picks: ['android/core'], next: 'language' },
      {
        id: 'ios', label: 'iOS', hint: 'Swift, SwiftUI or UIKit',
        soon: 'No iOS family yet. It is the next one that makes sense: the axis model transfers directly, and the rules do not.',
      },
      {
        id: 'cross', label: 'Cross-platform', hint: 'Flutter, React Native, KMP',
        soon: 'Nothing published yet. Kotlin Multiplatform would compose with the Android family; Flutter and React Native would each need their own.',
      },
    ],
  },
  {
    id: 'language',
    prompt: 'Which language is most of the code?',
    options: [
      { id: 'kotlin', label: 'Kotlin', picks: ['android/kotlin'], next: 'ui' },
      { id: 'java', label: 'Java', picks: ['android/java'], next: 'ui' },
      { id: 'both', label: 'Both', hint: 'A codebase mid-migration', picks: ['android/kotlin', 'android/java'], next: 'ui' },
      {
        id: 'unsure', label: "I'm not sure", picks: ['android/kotlin'], next: 'ui',
        fallback: 'Assuming Kotlin, which almost all new Android code is. You can change it after.',
      },
    ],
  },
  {
    id: 'ui',
    prompt: 'How is the interface built?',
    options: [
      { id: 'compose', label: 'Jetpack Compose', picks: ['android/compose'], next: 'arch' },
      { id: 'xml', label: 'XML layouts', hint: 'Views, Fragments, ViewBinding', picks: ['android/xml'], next: 'arch' },
      { id: 'both', label: 'Both', hint: 'Compose screens inside an existing app', picks: ['android/compose', 'android/xml'], next: 'arch' },
      {
        id: 'unsure', label: "I'm not sure", picks: ['android/compose'], next: 'arch',
        fallback: 'Assuming Compose. If the project has files in res/layout, choose XML instead.',
      },
    ],
  },
  {
    id: 'arch',
    prompt: 'Is there a ViewModel layer?',
    help: 'State that has to survive a rotation or the process being killed.',
    options: [
      { id: 'yes', label: 'Yes', picks: ['android/mvvm'], next: 'needs' },
      { id: 'no', label: 'No', hint: 'State lives in the screen', next: 'needs' },
      {
        id: 'unsure', label: "I'm not sure", picks: ['android/mvvm'], next: 'needs',
        fallback: 'Including it. Almost every Android app has one, and its rules are about state you lose rather than style.',
      },
    ],
  },
  {
    id: 'needs',
    prompt: 'What does the app actually do?',
    help: 'Pick every one that applies. Each adds one layer.',
    multi: true,
    options: [
      { id: 'network', label: 'Talks to a server', hint: 'Retrofit, Ktor, OkHttp', picks: ['android/networking'] },
      { id: 'store', label: 'Stores data on the device', hint: 'Room, DataStore, SQLite', picks: ['android/db'] },
      { id: 'media', label: 'Shows images or video', hint: 'Feeds, avatars, uploads', picks: ['android/images'] },
      { id: 'device', label: 'Uses the camera, location, mic or files', picks: ['android/permissions'] },
      { id: 'auth', label: 'Signs people in, or holds a token', picks: ['android/security'] },
      { id: 'di', label: 'Uses dependency injection', hint: 'Hilt, Dagger, Koin', picks: ['android/di'] },
      { id: 'tests', label: 'Has tests, or should', picks: ['android/testing'] },
    ],
  },
];
