/**
 * Section definitions for the interactive tour.
 * Each section has an id, navigation title, and HTML content.
 */
export const sections = [
    {
        id: 'intro',
        title: 'Introduction',
        content: `
      <h2>Exploring Angular's Template Layer</h2>
      <p class="subtitle">Personal thoughts on what a future template surface might look like — not a proposal, just an exploration.</p>
      <p>This is a thought experiment: what if Angular's template layer were redesigned around explicit contracts and typed surfaces? The ideas here are backed by a <a href="https://github.com/mauriziocescon/ng-next/blob/main/types/ng-types.ts" style="color: var(--accent)">type system sketch</a>, an <a href="https://github.com/mauriziocescon/ng-next/blob/main/types/ng-ast.ts" style="color: var(--accent)">AST definition</a>, and a <a href="https://github.com/mauriziocescon/ng-next/blob/main/types/ng-dsl-type-checking-spec.md" style="color: var(--accent)">type checking spec</a> — but none of this is real Angular. It's just one person thinking out loud.</p>
      <p>The exploration revolves around:</p>
      <ul>
        <li><strong>Building blocks as functions</strong> — component, directive, derivation, fragment</li>
        <li><strong>TS expressions with <code>{}</code></strong> — bindings + text interpolation</li>
        <li><strong>Explicit binding prefixes</strong> — bind:, on:, model:, class:, style:, use:</li>
        <li><strong>Hostless components + lexical scoping</strong></li>
        <li><strong>Composition via fragments and forwarding</strong></li>
        <li><strong>Enhanced DI with injectionToken</strong></li>
      </ul>
      <div class="annotation">
        <strong>The DSL boundary:</strong> Templates live inside a <code>@{ }</code> markup literal. The <code>@</code> marks where TypeScript ends and the template DSL begins. It's not plain TS — it would need dedicated tooling and parser support.
      </div>
      <p>Use the sidebar or arrow keys to walk through each idea.</p>
    `,
    },
    {
        id: 'components',
        title: 'Components',
        content: `<h2>Component Structure &amp; Bindings</h2><p class="subtitle">What if components were just function calls with a strict shape?</p><p>See the full proposal for details.</p>`,
    },
    {
        id: 'directives',
        title: 'Directives',
        content: `<h2>Element Directives</h2><p class="subtitle">What if directives were always explicit — no selector matching, just <code>use:</code>?</p><p>See the full proposal for details.</p>`,
    },
    {
        id: 'derivations',
        title: 'Derivations',
        content: `<h2>Template-Scoped Derivations</h2><p class="subtitle">Could pipes be replaced by something with DI access and proper lifecycle?</p><p>See the full proposal for details.</p>`,
    },
    {
        id: 'fragments',
        title: 'Fragments',
        content: `<h2>Composition with Fragments</h2><p class="subtitle">What if ng-content and ng-template were unified into typed functions?</p><p>See the full proposal for details.</p>`,
    },
    {
        id: 'forwarding',
        title: 'Forwarding',
        content: `<h2>Forwarding: Proxy &amp; Wrap</h2><p class="subtitle">How would you build a wrapper component without runtime props spreading?</p><p>See the full proposal for details.</p>`,
    },
    {
        id: 'di',
        title: 'DI Enhancements',
        content: `<h2>Dependency Injection Enhancements</h2><p class="subtitle">Small ergonomic improvements to tokens and providers — nothing revolutionary.</p><p>See the full proposal for details.</p>`,
    },
    {
        id: 'quiz',
        title: 'Quiz',
        content: `
      <h2>Test Your Understanding</h2>
      <p class="subtitle">Based on the rules explored above — is this code valid or not?</p>
      <div id="quiz-container"></div>
    `,
    },
];
//# sourceMappingURL=sections.js.map