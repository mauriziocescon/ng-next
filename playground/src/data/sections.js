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
    content: `
      <h2>Component Structure & Bindings</h2>
      <p class="subtitle">What if components were just function calls with a strict shape?</p>

      <h3>The idea</h3>
      <p>A component is a call to <code>component()</code> with a config object: <code>bindings</code> declares the public API, <code>setup</code> runs once in an injection context, and the template is returned from setup. The type system (<a href="https://github.com/mauriziocescon/ng-next/blob/main/types/ng-types.ts" style="color: var(--accent)">ng-types.ts</a>) enforces that providers only see inputs, not models or outputs.</p>

      <div class="code-block">
        <div class="label">component with bindings</div>
        <pre><code class="language-typescript">import { component, signal, linkedSignal, input, output } from '@angular/core';

export const TextSearch = component({
  bindings: {
    value: input.required&lt;string&gt;(),
    valueChange: output&lt;string&gt;(),
  },
  setup: ({ value, valueChange }) =&gt; {
    const text = linkedSignal(() =&gt; value());
    const isDanger = signal(false);

    function textChange() {
      valueChange.emit(text());
    }

    return @{
      &lt;label class:danger={isDanger()}&gt;Text:&lt;/label&gt;
      &lt;input type="text" model:value={text} on:input={textChange} /&gt;

      &lt;button disabled={text().length === 0} on:click={() =&gt; text.set('')}&gt;
        {'Reset ' + text()}
      &lt;/button&gt;
    };
  },
});</code></pre>
      </div>

      <div class="annotation">
        <strong>Binding syntax:</strong> <code>bind:</code> for 1-way (can be omitted), <code>model:</code> for 2-way, <code>on:</code> for events. Native elements would resolve through an <code>IntrinsicElements</code> map — similar to how JSX does it, but Angular-owned.
      </div>

      <h3>Lexical scoping</h3>
      <p>Resolution order: template → setup → file-level imports → global. No more wondering where a variable comes from.</p>

      <div class="code-block">
        <div class="label">file-level constants accessible in template</div>
        <pre><code class="language-typescript">import { component } from '@angular/core';

enum Type { Counter = 'counter', Other = 'other' }
const type = Type.Counter;
const counter = (value: number) =&gt; \`Let's count till \${value}\`;

export const Counter = component({
  setup: () =&gt; @{
    @if (type === Type.Counter) {
      &lt;p&gt;{counter(5)}&lt;/p&gt;
    } @else {
      &lt;span&gt;Empty&lt;/span&gt;
    }
  },
});</code></pre>
      </div>
    `,
  },
  {
    id: 'directives',
    title: 'Directives',
    content: `
      <h2>Element Directives</h2>
      <p class="subtitle">What if directives were always explicit — no selector matching, just <code>use:</code>?</p>

      <p>Today Angular matches directives via CSS selectors. This exploration asks: what if you always applied them explicitly with <code>use:directive(...)</code> instead? The <code>host</code> property would constrain which elements a directive can attach to — checked at compile time via the type system.</p>

      <div class="code-block">
        <div class="label">applying a directive</div>
        <pre><code class="language-typescript">import { component, signal } from '@angular/core';
import { tooltip } from '@mylib/tooltip';

export const TextSearch = component({
  setup: () =&gt; {
    const text = signal('');
    const message = signal('Message');

    return @{
      &lt;input
        type="text"
        model:value={text}
        use:tooltip(message={message()} on:dismiss={doSomething}) /&gt;

      &lt;p&gt;Value: {text()}&lt;/p&gt;
    };
  },
});</code></pre>
      </div>

      <div class="code-block">
        <div class="label">defining a directive</div>
        <pre><code class="language-typescript">import { directive, ref, input, output, inject, DestroyRef,
         Renderer2, afterRenderEffect } from '@angular/core';

export const tooltip = directive({
  host: ref&lt;HTMLElement&gt;(),
  bindings: {
    message: input.required&lt;string&gt;(),
    dismiss: output&lt;void&gt;(),
  },
  setup: ({ message, dismiss }, { host }) =&gt; {
    const destroyRef = inject(DestroyRef);
    const renderer = inject(Renderer2);

    afterRenderEffect(() =&gt; {
      const hostEl = host();
      // attach tooltip to hostEl
    });

    destroyRef.onDestroy(() =&gt; { /* cleanup */ });
  },
});</code></pre>
      </div>

      <div class="annotation">
        <strong>Trade-off:</strong> You lose the magic of "just add an attribute and a directive kicks in." You gain explicitness, static type safety on the host element, and no accidental matches. Whether that's worth it is debatable.
      </div>
    `,
  },
  {
    id: 'derivations',
    title: 'Derivations',
    content: `
      <h2>Template-Scoped Derivations</h2>
      <p class="subtitle">Could pipes be replaced by something with DI access and proper lifecycle?</p>

      <p>Pipes are useful but limited — no injection context, tricky lifecycle. This sketch imagines a <code>derivation</code>: a factory for template-scoped computed values. Each instance lives as long as its enclosing view (same lifetime as a pure pipe), but gets a proper injection context at creation time.</p>

      <div class="code-block">
        <div class="label">defining a derivation</div>
        <pre><code class="language-typescript">import { derivation, computed, inject, input } from '@angular/core';
import { PriceManager } from '@mylib/item';

const simulation = derivation({
  bindings: {
    item: input.required&lt;Item&gt;(),
    qty: input.required&lt;number&gt;(),
  },
  setup: ({ item, qty }) =&gt; {
    const priceManager = inject(PriceManager);
    return computed(() =&gt; priceManager.computePrice(item(), qty()));
  },
});</code></pre>
      </div>

      <div class="code-block">
        <div class="label">using @derive in a template</div>
        <pre><code class="language-typescript">export const PriceSimulator = component({
  bindings: { items: input.required&lt;Item[]&gt;() },
  setup: ({ items }) =&gt; {
    return @{
      @for (item of items(); track item.id) {
        @derive price = simulation(item={item} qty={1});

        &lt;h5&gt;{item.desc}&lt;/h5&gt;
        &lt;div&gt;Price: {price()}&lt;/div&gt;
      }
    };
  },
});</code></pre>
      </div>

      <div class="annotation">
        <strong>Constraints in the type system:</strong> Only inputs are allowed (no outputs, no models — a derivation has no DOM surface). <code>setup</code> must return a <code>Signal&lt;T&gt;</code>. Each @for row owns an independent instance. These constraints are enforced by <code>DerivationBindingsConstraint</code> in ng-types.ts.
      </div>
    `,
  },
  {
    id: 'fragments',
    title: 'Fragments',
    content: `
      <h2>Composition with Fragments</h2>
      <p class="subtitle">What if ng-content and ng-template were unified into typed functions?</p>

      <h3>Implicit children</h3>
      <p>Markup inside a component tag would implicitly become a <code>children</code> fragment — similar to <a href="https://svelte.dev/docs/svelte/snippet" style="color: var(--accent)">Svelte snippets</a>. The key difference from React children: fragments are opaque — you can't iterate or manipulate them.</p>

      <div class="code-block">
        <div class="label">children as a fragment</div>
        <pre><code class="language-typescript">export const MenuConsumer = component({
  setup: () =&gt; {
    return @{
      &lt;Menu&gt;
        &lt;MenuItem&gt;{first()}&lt;/MenuItem&gt;
        &lt;MenuItem&gt;{second()}&lt;/MenuItem&gt;
      &lt;/Menu&gt;
    };
  },
});

// Menu receives children automatically
export const Menu = component({
  bindings: {
    children: fragment&lt;void&gt;(),  // reserved name
  },
  setup: ({ children }) =&gt; @{
    @if (children) {
      @render(children())
    } @else {
      &lt;span&gt;Empty&lt;/span&gt;
    }
  },
});</code></pre>
      </div>

      <h3>Named fragments (typed render props)</h3>
      <p>For more complex composition — like custom item templates — named fragments carry typed parameters.</p>

      <div class="code-block">
        <div class="label">parameterized fragment for list rendering</div>
        <pre><code class="language-typescript">export const MenuConsumer = component({
  setup: () =&gt; {
    const items = signal&lt;Item[]&gt;([]);

    return @{
      &lt;Menu items={items()}&gt;
        @fragment menuItem(item: Item) {
          &lt;div class="my-menu-item"&gt;
            &lt;MyMenuItem&gt;{item.desc}&lt;/MyMenuItem&gt;
          &lt;/div&gt;
        }
      &lt;/Menu&gt;
    };
  },
});</code></pre>
      </div>

      <div class="annotation">
        <strong>Open question:</strong> Is the fragment model flexible enough for all ng-content/ng-template use cases? Probably not all edge cases, but it covers the common patterns while being statically typed end-to-end.
      </div>
    `,
  },
  {
    id: 'forwarding',
    title: 'Forwarding',
    content: `
      <h2>Forwarding: Proxy & Wrap</h2>
      <p class="subtitle">How would you build a wrapper component without runtime props spreading?</p>

      <h3>Proxy — expose a native element surface</h3>
      <p>A common pattern: you build a <code>&lt;Button&gt;</code> but consumers want to attach directives to the underlying <code>&lt;button&gt;</code>. <code>component.proxy&lt;S&gt;</code> declares the surface type; <code>@forward()</code> marks where directives land. The compiler validates host compatibility statically.</p>

      <div class="code-block">
        <div class="label">component.proxy — typed forwarding target</div>
        <pre><code class="language-typescript">export const Button = component.proxy&lt;HTMLButtonElement&gt;({
  bindings: {
    disabled: input&lt;boolean&gt;(false),
    click: output&lt;void&gt;(),
    children: fragment.required&lt;void&gt;(),
  },
  setup: ({ disabled, click, children }) =&gt; {
    return @{
      &lt;button
        @forward()
        disabled={disabled()}
        on:click={() =&gt; click.emit()}&gt;
        @render(children())
      &lt;/button&gt;
    };
  },
});</code></pre>
      </div>

      <h3>Wrap — select some bindings, forward the rest</h3>
      <p>Sometimes you want to intercept a few inputs and let everything else pass through. <code>component.wrap</code> does this without a runtime spread — the compiler expands it into static bindings.</p>

      <div class="code-block">
        <div class="label">component.wrap — the compiler does the plumbing</div>
        <pre><code class="language-typescript">export const UserDetailWrapper = component.wrap(UserDetail, {
  bindings: {
    user: input.required&lt;User&gt;(),
  },
  setup: ({ user }) =&gt; {
    const other = computed(() =&gt; transform(user()));

    return @{
      &lt;UserDetail
        @forward()
        use:tooltip(message={'Tooltip'})
        user={other()} /&gt;
    };
  },
});</code></pre>
      </div>

      <div class="annotation">
        <strong>Why no spread?</strong> Runtime props objects are hard to type-check and optimize. This approach is more verbose but the compiler knows exactly what goes where. The <a href="https://github.com/mauriziocescon/ng-next/blob/main/types/ng-types.spec.ts" style="color: var(--accent)">spec tests</a> validate that selected binding kinds/types must match exactly.
      </div>
    `,
  },
  {
    id: 'di',
    title: 'DI Enhancements',
    content: `
      <h2>Dependency Injection Enhancements</h2>
      <p class="subtitle">Small ergonomic improvements to tokens and providers — nothing revolutionary.</p>

      <h3>Token flavours</h3>
      <p>Today's <code>InjectionToken</code> works, but the typing around multi-tokens and provider factories is loose. This sketch introduces <code>injectionToken()</code> with stricter contracts:</p>
      <ul>
        <li><strong>With factory</strong> — shorthand <code>provide(token)</code> just works</li>
        <li><strong>With factory + autoProvided</strong> — registered at root, no explicit provide needed</li>
        <li><strong>Without factory</strong> — must use <code>provide(token, factory)</code> (shorthand is a compile error)</li>
        <li><strong>Multi</strong> — each provide contributes one item; inject returns the array</li>
      </ul>

      <div class="code-block">
        <div class="label">injectionToken — typed and strict</div>
        <pre><code class="language-typescript">// With factory (shorthand-eligible)
const compToken = injectionToken({
  debugName: 'compToken',
  factory: () =&gt; {
    const counter = signal(0);
    return {
      value: counter.asReadonly(),
      increase: () =&gt; counter.update(v =&gt; v + 1),
    };
  },
});

// Auto-provided at root
const rootToken = injectionToken({
  debugName: 'rootToken',
  autoProvided: true,
  factory: () =&gt; ({ /* ... */ }),
});

// Multi token
const multiToken = injectionToken.multi({
  debugName: 'multiToken',
  factory: () =&gt; Math.random(),
});</code></pre>
      </div>

      <h3>Input-driven providers</h3>
      <p>What if component inputs were available in <code>providers</code>? Today you need workarounds. Here, inputs are hoisted — but only inputs (not models or outputs).</p>

      <div class="code-block">
        <div class="label">providers that depend on inputs</div>
        <pre><code class="language-typescript">export const Counter = component({
  bindings: { c: input.required&lt;number&gt;() },
  setup: () =&gt; {
    const store = inject(CounterStore);
    return @{ &lt;div&gt;{store.value()}&lt;/div&gt; };
  },
  providers: ({ c }) =&gt; [
    provide(CounterStore, () =&gt; new CounterStore(c)),
    provide(multiToken),
    provide(multiToken, () =&gt; 10),
  ],
});</code></pre>
      </div>

      <div class="annotation">
        <strong>Type safety:</strong> The <code>provide()</code> return type is derived from the token contract. <code>provide(multiToken, () =&gt; [1,2,3])</code> is a compile error — multi providers return one item, not an array. See the <a href="https://github.com/mauriziocescon/ng-next/blob/main/types/ng-types.spec.ts" style="color: var(--accent)">spec tests</a> for the full set of positive/negative cases.
      </div>
    `,
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
