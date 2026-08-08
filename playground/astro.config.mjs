import { defineConfig } from 'astro/config';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

function llmsTxt() {
  const base = 'https://mauriziocescon.github.io/ng-next';
  const repo = 'https://github.com/mauriziocescon/ng-next';

  const sections = [
    { file: 'readme.md', title: 'Proposal narrative, syntax, and examples — covers component/directive/derivation/fragment APIs, binding syntax, composition patterns, and DI enhancements.' },
    { file: 'types/ng-ast.ts', title: 'Template AST type definitions — the structural representation of parsed `@{ }` markup (nodes, bindings, expressions, control flow).' },
    { file: 'types/ng-types.ts', title: 'Core runtime type contracts — `TemplateMarkup`, component/directive/derivation/fragment factories, `ref`, `expose`, `provide`, `injectionToken`.' },
    { file: 'types/ng-types.spec.ts', title: 'Type-level test suite — usage examples showing how the type system enforces binding correctness, proxy forwarding, and DI wiring.' },
    { file: 'types/ng-dsl-type-checking-spec.md', title: 'DSL type-checking specification — formal judgments for what the template type checker must verify inside `@{ }` (element resolution, binding arity, directive host constraints, etc.).' },
  ];

  const toc = [
    { anchor: 'component-structure-and-bindings', desc: '`setup` runs once in injection context; native elements resolve through `IntrinsicElements`; binding syntax (`bind:`, `model:`, `on:`).' },
    { anchor: 'element-directives', desc: 'Directives change DOM appearance/behavior; applied with `use:directive(...)`; `host` property constrains target elements.' },
    { anchor: 'template-scoped-derivations-derive', desc: 'Template-scoped reactive computations with injection context; follows the lifecycle of the enclosing view; must return a `Signal<T>`.' },
    { anchor: 'binding-syntax-helpers', desc: 'Literal form equivalence for string inputs; `:when` conditionally applies a `use:` binding.' },
    { anchor: 'one-time-bindings-once', desc: '`once:` freezes an input at creation time — never updated afterwards.' },
    { anchor: 'input-driven-providers', desc: 'Inputs hoisted for provider initialization; `providers` receives only inputs (not models or outputs); factories run in injection context.' },
    { anchor: 'expose-and-template-refs', desc: '`expose` defines a component/directive\'s public API through refs; `ref<T>()` and `refMany<T>()` for element/component/directive access.' },
    { anchor: 'composition-with-fragments-directives-and-forwarding', desc: 'Fragments as functions (like Svelte snippets); `component.proxy<T>()` and `component.wrap(Target)` for forwarding; `@forward()` marks placement.' },
    { anchor: 'dependency-injection-enhancements', desc: '`injectionToken` with four flavours (with factory, auto-provided, without factory, multi); `provide()` shorthand.' },
    { anchor: 'final-considerations', desc: 'Concepts impacted (ng-content, ng-template, structural directives, pipes, queries, etc.); pros and cons of the approach.' },
    { anchor: 'appendix-co-located-templates-in-angular-via-ng-files', desc: 'Rationale for `*.ng` files; co-location benefits; boilerplate tax trade-off analysis.' },
    { anchor: 'appendix-binding-prefix-and-modifier-reference', desc: 'Canonical list of every prefix/modifier (`bind:`, `model:`, `on:`, `once:`, `class:`, `style:`, `animate:`, `use:`, `:when`, `:ref`, `ref`, `@forward()`).' },
    { anchor: 'appendix-integrating-decorator-based-components', desc: 'Using existing `@Component`/`@Directive`/`@Pipe` classes in `.ng` files; `ngProjectAs`, `@fragment` for `ng-template`, `:element` suffix, pipe-to-derivation wrapping.' },
    { anchor: 'appendix-relevant-github-issues', desc: 'Well-known community requests related to these proposals.' },
  ];

  const tocTitles = [
    'Component structure and bindings',
    'Element directives',
    'Template-Scoped Derivations (`@derive`)',
    'Binding syntax helpers',
    'One-time bindings (`once:`)',
    'Input-driven providers',
    'Expose and Template Refs',
    'Composition with Fragments, Directives, and Forwarding',
    'Dependency Injection Enhancements',
    'Final considerations',
    'Appendix: Co-located templates in Angular via `.ng` files',
    'Appendix: Binding prefix and modifier reference',
    'Appendix: Integrating decorator-based components',
    'Appendix: Relevant GitHub issues',
  ];

  return {
    name: 'llms-txt',
    hooks: {
      'astro:build:start': async () => {
        const content = [
          '# ng-next',
          '',
          '> Personal exploration of Angular template ideas — explicit contracts, typed',
          '> template surfaces, and structures easier to reason about for humans, tooling,',
          '> and AI agents.',
          '',
          '> ⚠️ DISCLAIMER: This is NOT an official Angular proposal, RFC, or roadmap item.',
          '> Useful as explorative material when discussing ideas about Angular\'s future template',
          '> layer.',
          '',
          '## Overview',
          '',
          'Highlights:',
          '',
          '1. Building blocks as functions:',
          '   - `*.ng` files with template DSL,',
          '   - `component`: a `setup` with scoped logic that returns a `template` or `{ template, expose }`,',
          '   - `directive`: a `setup` that can change the appearance or behavior of DOM elements,',
          '   - `derivation`: a factory for template-scoped computed values that requires DI,',
          '   - `fragment`: a way to capture some markup in the form of a function,',
          '2. TS expressions with `{}`: bindings + text interpolation',
          '3. Extra bindings for DOM elements: `bind:`, `on:`, `model:`, `class:`, `style:`, `animate:`, `use:`,',
          '4. Hostless components + TS lexical scoping for templates,',
          '5. Component inputs: lifted up + immediately available in setup and providers,',
          '6. Expose and Template Refs,',
          '7. Composition with Fragments, Directives, and Forwarding,',
          '8. Dependency Injection Enhancements,',
          '9. Final considerations + types.',
          '',
          '**Template syntax note**: template markup is written inside a `@{ }` markup literal (the `@` marks the TypeScript→DSL boundary). It supports Angular control flow, directives, custom bindings, and an Angular-owned `IntrinsicElements` map for native tag typing.',
          '',
          '## Topics',
          '',
          ...toc.map((entry, i) =>
            `- [${tocTitles[i]}](${repo}#${entry.anchor}): ${entry.desc}`
          ),
          '',
          '## Resources',
          '',
          ...sections.map(({ file, title }) =>
            `- [${file}](${repo}/blob/main/${file}): ${title}`
          ),
          `- [Interactive Playground](${base}/): Live examples of the template DSL — browse components, directives, derivations, fragments, and composition patterns with syntax-highlighted code.`,
          `- [GitHub Repository](${repo}): Full source, issues, and version history.`,
          '',
        ].join('\n');

        writeFileSync(resolve(import.meta.dirname, 'public', 'llms.txt'), content);
      },
    },
  };
}

export default defineConfig({
  site: 'https://mauriziocescon.github.io',
  base: '/ng-next',
  trailingSlash: 'always',
  integrations: [mdx(), sitemap(), llmsTxt()],
  markdown: {
    shikiConfig: {
      theme: 'github-dark',
    },
  },
});
