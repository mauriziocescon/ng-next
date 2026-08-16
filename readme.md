# Exploring Angular Templates for an Agentic Future

**⚠️ Note ⚠️: personal thoughts on Angular's future template layer: explicit contracts, typed template surfaces, and structures that are easier for humans, tooling, and AI agents to reason about.**

Highlights:

1. Building blocks as functions:
  - `*.ng` files with template DSL (see [appendix](#appendix-co-located-templates-in-angular-via-ng-files)),
  - `component`: a `setup` with scoped logic that returns a `template` or `{ template, expose }`,
  - `directive`: a `setup` that can change the appearance or behavior of DOM elements,
  - `derivation`: a factory for template-scoped computed values that requires DI,
  - `fragment`: a way to capture some markup in the form of a function,
2. TS expressions with `{}`: bindings + text interpolation
3. Extra bindings for DOM elements: `bind:`, `on:`, `model:`, `class:`, `style:`, `animate:`, `use:`,
4. Hostless components + TS lexical scoping for templates,
5. Component inputs: lifted up + immediately available in setup and providers,
6. Expose and Template Refs,
7. Composition with Fragments, Directives, and Forwarding,
8. Dependency Injection Enhancements,
9. Final considerations (`!important`) + [`types`](https://github.com/mauriziocescon/ng-next/blob/main/types/ng-types.ts).

**Template syntax note**: template markup is written inside a `@{ }` markup literal (the `@` marks the TypeScript→DSL boundary). It supports Angular control flow, directives, custom bindings, and an Angular-owned `IntrinsicElements` map for native tag typing.

<details>
  <summary><strong>Table of contents</strong></summary>

- [Component structure and bindings](#component-structure-and-bindings)
- [Element directives](#element-directives)
- [Template-Scoped Derivations (`@derive`)](#template-scoped-derivations-derive)
- [Binding syntax helpers](#binding-syntax-helpers)
- [One-time bindings (`once:`)](#one-time-bindings-once)
- [Input-driven providers](#input-driven-providers)
- [Expose and Template Refs](#expose-and-template-refs)
- [Composition with Fragments, Directives, and Forwarding](#composition-with-fragments-directives-and-forwarding)
- [Dependency Injection Enhancements](#dependency-injection-enhancements)
- [Final considerations](#final-considerations)
- [Appendix: Co-located templates in Angular via `.ng` files](#appendix-co-located-templates-in-angular-via-ng-files)
- [Appendix: Binding prefix and modifier reference](#appendix-binding-prefix-and-modifier-reference)
- [Appendix: Integrating decorator-based components](#appendix-integrating-decorator-based-components)
- [Appendix: Relevant GitHub issues](#appendix-relevant-github-issues)

</details>

## Component structure and bindings

`setup` runs once in an injection context. Bindings are immediately available; destructuring is optional.

Native elements resolve through `IntrinsicElements` — the compiler knows valid attributes, properties, and events. Binding syntax:

- 1-way: `bind:property={var}` (`bind:` can be omitted)
- 2-way: `model:property={var}` (input / select / textarea)
- events: `on:event_name={handler}`

```ts
import { component, signal, linkedSignal, input, output } from '@angular/core';

export const TextSearch = component({
  bindings: {
    value: input.required<string>(),
    valueChange: output<string>(),
  },
  setup: ({ value, valueChange }) => {
    const text = linkedSignal(() => value());
    const isDanger = signal(false);

    function textChange() {
      valueChange.emit(text());
    }

    return @{
      <label class:danger={isDanger()}>Text:</label>
      <input type="text" model:value={text} on:input={textChange} />

      <button disabled={text().length === 0} on:click={() => text.set('')}>
        {'Reset ' + text()}
      </button>
    };
  },
  style: `
    .danger {
      color: red;
    }
  `,
});
```

Any component can be used in the template; `bind:`, `model:`, and `on:` behave the same as for native elements. All required inputs / models must be provided.

```ts
import { component, signal } from '@angular/core';
import { UserDetail, User } from './user-detail.ng';

export const Consumer = component({
  setup: () => {
    const user = signal<User>(/** ... **/);
    const email = signal<string>(/** ... **/);

    function makeAdmin() {/** ... **/}

    return @{
      <UserDetail
        user={user()}
        model:email={email}
        on:makeAdmin={makeAdmin} />
    };
  },
});

// -- UserDetail -----------------------------------
import { component, input, model, output } from '@angular/core';

export interface User {/** ... **/}

export const UserDetail = component({
  bindings: {
    user: input.required<User>(),
    email: model<string>(),
    makeAdmin: output<void>(),
  },
  setup: (bindings) => @{
    // bindings.user, bindings.email, bindings.makeAdmin
  },
});
```

Lexical scoping resolves: template → setup → file-level imports (functions, constants, enums, interfaces) → global.

```ts
import { component } from '@angular/core';

enum Type {
  Counter = 'counter',
  Other = 'other',
}

const type = Type.Counter;

const counter = (value: number) => `Let's count till ${value}`;

export const Counter = component({
  setup: () => @{
    @if (type === Type.Counter) {
      <p>{counter(5)}</p>
    } @else {
      <span>Empty</span>
    }
  },
});
```

## Element directives

Directives change the appearance or behavior of DOM elements. Apply them with `use:directive(...)` — any directive can be used directly in the template.

The `host` property constrains which elements a directive can attach to. When applied to a native tag, the compiler checks the tag's `IntrinsicElements` type against the directive's `host` ref type.

```ts
import { component, signal } from '@angular/core';
import { tooltip } from '@mylib/tooltip';

export const TextSearch = component({
  setup: () => {
    const text = signal('');
    const message = signal('Message');

    function valueChange() {/** ... **/}
    function doSomething() {/** ... **/}

    return @{
      <input
        type="text"
        model:value={text}
        on:input={valueChange}
        use:tooltip(message={message()} on:dismiss={doSomething}) />

      <p>Value: {text()}</p>
    };
  },
});

// -- tooltip in @mylib/tooltip --------------------
import { directive, ref, input, output, inject, DestroyRef, Renderer2, afterRenderEffect } from '@angular/core';

export const tooltip = directive({
  host: ref<HTMLElement>(),
  bindings: {
    message: input.required<string>(),
    dismiss: output<void>(),
  },
  setup: ({ message, dismiss }, { host }) => {
    const destroyRef = inject(DestroyRef);
    const renderer = inject(Renderer2);

    afterRenderEffect(() => {
      const hostEl: HTMLElement | undefined = host();
      // something with hostEl
    });

    destroyRef.onDestroy(() => {
      // cleanup logic
    });
  },
});
```

## Template-Scoped Derivations (`@derive`)

`@derive` creates a template-scoped reactive computation, establishing an injection context before calling the derivation's `setup`. It follows the lifecycle of the enclosing view. Bindings are passed as named pairs `key={expr}`, not as a JS object literal.

Only inputs are allowed (no outputs, no models — a derivation has no DOM surface). `setup` must return a `Signal<T>`.

```ts
import { component, derivation, computed, inject, input } from '@angular/core';
import { Item, PriceManager } from '@mylib/item';

const simulation = derivation({
  bindings: {
    item: input.required<Item>(),
    qty: input.required<number>(),
  },
  setup: ({ item, qty }) => {
    const priceManager = inject(PriceManager);

    return computed(() => priceManager.computePrice(item(), qty()));
  },
});

export const PriceSimulator = component({
  bindings: {
    items: input.required<Item[]>(),
  },
  setup: ({ items }) => {
    /**
     * price shares the @for embedded view scope and is created once,
     * following its lifecycle. Same scope as @let, same lifetime as
     * a pure pipe. Each row owns an independent instance. Not accessible
     * outside its block.
     */
    return @{
      @for (item of items(); track item.id) {
        @derive price = simulation(item={item} qty={1});

        <h5>{item.desc}</h5>
        <div>Price: {price()}</div>
      }
    };
  },
});
```

## Binding syntax helpers

- Literal form equivalence for inputs: `prop="value"` is always a string literal — equivalent to `prop={'value'}`. Non-string inputs require expression syntax: `count={5}`, not `count="5"`.
- `:when`: conditionally applies a `use:` binding; sits outside the directive's inputs and cannot clash with them.

```ts
import { component, signal } from '@angular/core';
import { tooltip } from '@mylib/tooltip';

export const SearchBox = component({
  setup: () => {
    const text = signal('');
    const showTip = signal(true);
    const tip = signal('Type to search');

    return @{
      // Literal equivalence: placeholder="Search" and placeholder={'Search'} are identical
      <input
        type="text"
        placeholder="Search"
        model:value={text}
        use:tooltip(message={tip()}):when={showTip()} />
    };
  },
});
```

## One-time bindings (`once:`)

`once:` freezes an input at creation time — never updated afterwards, even if the source signal changes.

```ts
import { component, signal } from '@angular/core';
import { UserDetail, User } from './user-detail.ng';

export const Consumer = component({
  setup: () => {
    const user = signal<User>(/** ... **/);
    const email = signal<string>(/** ... **/);

    function makeAdmin() {/** ... **/}

    return @{
      <UserDetail
        once:user={user()}
        model:email={email}
        on:makeAdmin={makeAdmin} />
    };
  },
});
```

## Input-driven providers

Inputs hoisted to the component level for use in provider initialization (`providers` receives only inputs — not models or outputs). Provider factories run in an injection context — `inject()` works inside them:

```ts
import { component, linkedSignal, input, WritableSignal, provide, inject } from '@angular/core';

class CounterStore {
  private readonly counter: WritableSignal<number>;
  readonly value = this.counter.asReadonly();

  constructor(c = () => 0) {
    this.counter = linkedSignal(() => c());
  }

  decrease() {/** ... **/}
  increase() {/** ... **/}
}

export const Counter = component({
  bindings: {
    c: input.required<number>(),
  },
  setup: () => {
    const store = inject(CounterStore);

    return @{
      <h1>Counter</h1>
      <div>Value: {store.value()}</div>
      <button on:click={() => store.decrease()}>-</button>
      <button on:click={() => store.increase()}>+</button>
    };
  },
  providers: ({ c }) => [
    provide(CounterStore, () => new CounterStore(c)),
  ],
});
```

## Expose and Template Refs

`expose` is the public API a component or directive makes available through refs; everything else stays private. Refs are readable signals branded as `Ref<T>`:

- `ref<typeof Type>()` reads as `Signal<expose | undefined>`
- `refMany<typeof Type>()` reads as `Signal<expose[]>`
- `ref<HTMLElement>()` reads as `Signal<HTMLElement | undefined>`

Without `expose`: `ref()` reads as `Signal<undefined>`, and `refMany()` reads as `Signal<[]>`. Refs are readable after `afterNextRender`.

Defining component and directive exposes:

```ts
import { component, directive, ref, signal } from '@angular/core';

const TextBadge = component({
  setup: () => {
    const text = signal('');

    return {
      template: @{ <button>{text()}</button> },
      expose: {
        text: text.asReadonly(),
      },
    };
  },
});

const tooltip = directive({
  host: ref<HTMLElement>(),
  setup: () => ({
    toggle: () => {},
  }),
});
```

Using refs — elements, components, and directives:

```ts
import { afterNextRender, component, ref, refMany } from '@angular/core';

export const RefShowcase = component({
  setup: () => {
    const el = ref<HTMLDivElement>(); // Ref<HTMLDivElement | undefined>
    const badge = ref<typeof TextBadge>();
    const tip = ref<typeof tooltip>();
    const badges = refMany<typeof TextBadge>(); // Ref<{ text: Signal<string> }[]>

    afterNextRender(() => {
      el()?.scrollIntoView();
      badge()?.text();
      tip()?.toggle();
      badges().forEach((api) => api.text());
    });

    return @{
      <div ref={el} use:tooltip():ref={tip}>Target</div>

      <TextBadge ref={badge} />

      <TextBadge ref={badges} />
      <TextBadge ref={badges} />

      <button on:click={() => tip()?.toggle()}>Toggle tlp</button>
    };
  },
});
```

## Composition with Fragments, Directives, and Forwarding

Fragments are similar to [Svelte snippets](https://svelte.dev/docs/svelte/snippet): functions that return HTML markup. The returned markup is opaque — it cannot be manipulated like [React Children (legacy)](https://react.dev/reference/react/Children) or [Solid children](https://www.solidjs.com/tutorial/props_children). 

Forwarding has two component APIs and one marker: `component.proxy<T>()` exposes a directive-compatible native surface, `component.wrap(Target)` forwards a wrapped component's remaining API, and `@forward()` marks the placement site. There is no runtime props object or spread; the compiler expands forwarding into ordinary bindings/directive instructions.

### Implicit children fragment

```ts
import { component, signal } from '@angular/core';
import { Menu, MenuItem } from '@mylib/menu';

export const Consumer = component({
  setup: () => {
    const first = signal('First');
    const second = signal('Second');

    // Markup inside a component tag implicitly becomes a children fragment
    return @{
      <Menu>
        <MenuItem>{first()}</MenuItem>
        <MenuItem>{second()}</MenuItem>
      </Menu>
    };
  },
});

// -- Menu in @mylib/menu --------------------------
import { component, fragment } from '@angular/core';

export const Menu = component({
  bindings: {
    // Provided by Angular from nested content (not bindable directly). Reserved name.
    children: fragment<void>(),
  },
  setup: ({ children }) => {
    /** ... **/

    // No ng-container needed; full form: @render(fragment(), { injector })
    return @{
      @if (children) {
        @render(children())
      } @else {
        <span>Empty</span>
      }
    };
  },
});

export const MenuItem = component({
  bindings: {
    children: fragment.required<void>(),
  },
  setup: ({ children }) => @{
    @render(children())
  },
});
```

### Customizing components

```ts
import { component, signal } from '@angular/core';
import { Menu } from '@mylib/menu';
import { MyMenuItem } from './my-menu-item.ng';

export interface Item {
  id: string;
  desc: string;
}

export const Consumer = component({
  setup: () => {
    const items = signal<Item[]>(/** ... **/);

    // Inline @fragment is auto-passed as the matching fragment input
    return @{
      <Menu items={items()}>
        @fragment menuItem(item: Item) {
          <div class="my-menu-item">
            <MyMenuItem>{item.desc}</MyMenuItem>
          </div>
        }
      </Menu>
    };
  },
  styleUrl: './consumer.css',
});

// -- Menu in @mylib/menu --------------------------
import { component, input, fragment } from '@angular/core';

export const Menu = component({
  bindings: {
    items: input.required<{ id: string, desc: string }[]>(),
    menuItem: fragment.required<[{ id: string, desc: string }]>(),
  },
  setup: ({ items, menuItem }) => @{
    <h1> Total items: {items().length} </h1>

    @for (item of items(); track item.id) {
      @render(menuItem(item))
    }
  },
});
```

### Proxying directives to an internal element

`Button` exposes an `HTMLButtonElement` proxy surface. Directives applied to `<Button />` are accepted only if their `host` type is compatible, then placed on the `@forward()` target. The same directive cannot be applied more than once to the same final element.

```ts
import { component, signal } from '@angular/core';
import { Button } from '@mylib/button';
import { ripple } from '@mylib/ripple';
import { tooltip } from '@mylib/tooltip';

export const Consumer = component({
  setup: () => {
    const tooltipMsg = signal('');
    const valid = signal(false);

    function doSomething() {/** ... **/}

    return @{
      <Button
        type="button"
        style="background-color: cyan"
        class={valid() ? 'global-css-valid' : ''}
        use:ripple()
        use:tooltip(message={tooltipMsg()})
        disabled={!valid()}
        on:click={doSomething}>
          Click / Hover me
      </Button>
    };
  },
});

// -- button in @mylib/button --------------------
import { component, input, output, computed, fragment } from '@angular/core';

export const Button = component.proxy<HTMLButtonElement>({
  bindings: {
    type: input<'button' | 'submit' | 'reset'>('button'),
    class: input<string>(''),
    style: input<string>(''),
    disabled: input<boolean>(false),
    click: output<void>(),
    children: fragment.required<void>(),
  },
  setup: ({ type, class: className, style, disabled, click, children }) => {
    const innerStyle = computed(() => `${style()}; color: red;`);

    // Directives applied to <Button /> are forwarded here
    return @{
      <button
        @forward()
        type={type()}
        class={className()}
        style={innerStyle()}
        disabled={disabled()}
        on:click={() => click.emit()}>
        @render(children())
      </button>
    };
  },
});
```

### Wrapping components

Wrappers forward the target's remaining bindings; directives pass through only if the target already exposes a proxy surface.

```ts
import { component, signal, input, computed } from '@angular/core';
import { tooltip } from '@mylib/tooltip';
import { Target, User } from './target.ng';

export const Consumer = component({
  setup: () => {
    const user = signal<User>(/** ... **/);
    const email = signal<string>(/** ... **/);

    function makeAdmin() {/** ... **/}

    return @{
      <Wrapper
        user={user()}
        model:email={email}
        on:makeAdmin={makeAdmin} />
    };
  },
});

// Select user locally; forward the remaining Target bindings.
export const Wrapper = component.wrap(Target, {
  bindings: {
    user: input.required<User>(),
  },
  setup: ({ user }) => {
    const other = computed(() => /** something depending on user() or a default value **/);

    return @{
      <Target
        @forward()
        use:tooltip(message={'Tooltip message'})
        user={other()} />
    };
  },
});

// -- Target -----------------------------------
import { component, input, model, output, fragment } from '@angular/core';

export interface User {
  name: string;
  role: string;
}

export const Target = component.proxy<HTMLDivElement>({
  bindings: {
    user: input.required<User>(),
    email: model.required<string>(),
    makeAdmin: output<void>(),
    children: fragment<void>(),
  },
  setup: ({ user, email, makeAdmin, children }) => @{
    <div @forward()>
      <h3>{user().name}</h3>
      <p>Role: {user().role}</p>

      <label>Email:</label>
      <input type="email" model:value={email} />

      <button on:click={() => makeAdmin.emit()}>Make Admin</button>

      @render(children?.())
    </div>
  },
});
```

## Dependency Injection Enhancements

Improved ergonomics for types and tokens.

`injectionToken` creates a typed DI token. Four flavours:

- **With factory** — `provide(token)` shorthand uses this factory. Not provided in root by default; the factory is only invoked when a component explicitly lists `provide(token)` in its `providers`. Throws if missing from the injector tree.
- **With factory + `autoProvided: true`** — factory registered unconditionally at root scope; no explicit `provide` needed.
- **Without factory** — must use `provide(token, factory)` with an explicit factory. The `provide(token)` shorthand is a compile-time error.
- **Multi** (`injectionToken.multi`) — each `provide` call contributes one item; `inject` returns the collected array.

```ts
import { component, inject, provide, injectionToken, input, signal } from '@angular/core';

// With factory (shorthand-eligible)
const compToken = injectionToken({
  debugName: 'compToken',
  factory: () => {
    const counter = signal(0);

    return {
      value: counter.asReadonly(),
      decrease: () => {
        counter.update(v => v - 1);
      },
      increase: () => {
        counter.update(v => v + 1);
      },
    };
  },
});

// Auto-provided at root scope
const rootToken = injectionToken({
  debugName: 'rootToken',
  autoProvided: true,
  factory: () => {
    const counter = signal(0);

    return {
      value: counter.asReadonly(),
      decrease: () => {
        counter.update(v => v - 1);
      },
      increase: () => {
        counter.update(v => v + 1);
      },
    };
  },
});

// Without factory — explicit provide(token, factory) required
const otherCompToken = injectionToken<string>({ debugName: 'otherCompToken' });

// Multi token with factory
const multiToken = injectionToken.multi({
  debugName: 'multiToken',
  factory: () => Math.random(),
});

class Store {}

export const Counter = component({
  bindings: {
    initialValue: input<number>(),
  },
  setup: () => {
    const rootCounter = inject(rootToken);
    const compCounter = inject(compToken);
    const multi = inject(multiToken); // number[]
    const store = inject(Store);
    /** ... **/
    return @{ ... };
  },
  providers: ({ initialValue }) => [
    provide(compToken),                     // shorthand — uses token's factory
    provide(multiToken),                    // shorthand
    provide(multiToken),                    // multiple contributions
    provide(multiToken, () => 10),          // explicit factory override
    provide(multiToken, () => initialValue()),
    provide(otherCompToken, () => ''),      // no factory on token — explicit required
    provide(Store, () => new Store()),      // class
  ],
});
```

## Final considerations

### Concepts Impacted by These Changes

- `ng-content`: can be modeled with `fragments`,
- `ng-template` (`let-*` shorthands + `ngTemplateGuard_*`): likely modeled with `fragments`,
- structural directives: likely modeled with `fragments`,
- `pipes`: can be modeled with derivations — derivations cover the same transform use case and also support DI,
- `event delegation`: not explicitly considered, but it could fit as "special attributes" (`onClick`, ...) similarly to [Solid events](https://docs.solidjs.com/concepts/components/event-handlers),
- `@let`: unchanged,
- `bindings aliasing`: the key is the public name (`alias` is ignored); local renaming via destructuring,
- `directives` attached to the host (components): no longer possible, but directives can be passed in and attached to elements,
- `directive` types: since `host` is declared as a typed `ref` at the directive config level, static type checking is built in. For native tags, the target element type comes from `IntrinsicElements`, so directives can only be applied to compatible elements,
- `template reference variables`: likely modeled with `ref`,
- `queries`: likely modeled with `ref`; `ref` should be extended to cover programmatic component creation, but must not allow arbitrary `read` of providers from the injector tree (see [`viewChild abuses`](https://stackblitz.com/edit/stackblitz-starters-wkkqtd9j)),
- `component and directive injection`: the preferred interaction model is an explicit `ref` passed as an `input`. Nevertheless, with `ref`/`expose` in place, component and directive injection can be made safer by design — directive-to-directive and child-to-parent injection are established patterns worth keeping (see [`ngModel hijacking`](https://stackblitz.com/edit/stackblitz-starters-ezryrmmy) for the kind of unintended coupling that `expose` helps prevent). The trade-off is that some Angular-reserved names are necessary (`children`, `ref`);
- `interface conformance`: opt-in via `satisfies` on `bindings` and `expose` — the same structural check that `implements` provides for classes.

### Notes

- other decorator properties: in this proposal, components and directives expose only `providers` and `setup` entries. However, `@Component` and `@Directive` have many more properties, some of which (like `preserveWhitespaces`) should probably remain. They are not covered here to avoid scope creep;
- `providers` defined at `directive` level: they should probably stay for backward compatibility (@angular/aria), even if the resulting mental model can be difficult to follow;
- inputs and outputs can be reassigned inside the setup:
  - `https://github.com/microsoft/TypeScript/issues/18497`,
  - [`no-param-reassign`](https://eslint.org/docs/latest/rules/no-param-reassign);
- programmatic view creation (dialogs, overlays): not covered here; likely requires a dedicated API — `createComponent` / `renderFragment` with an attachment target — rather than `ViewContainerRef`;
- `formField` integration with Signal Forms: not considered here. On a `component.proxy` component, all `use:` directives forward to `@forward()` — but a form field directive needs the *component's* binding surface (its `value` model, `disabled`, `errors`, etc.), not the inner native element. This likely requires `formField` to be a reserved binding name (alongside `ref` and `children`) with dedicated compiler support, so the form system can target the component boundary directly:
  ```ts
  <TextInput
    formField={signupForm.username}
    use:autoFocus()
    ariaLabel="Username" />
  ```
- testing story: not covered here — large topic on its own. `TestBed` and `ComponentFixture` are a poor fit for this architecture. It likely requires new APIs — a `runInInjectionContext` helper for unit-testing `setup` directly, and a thin `render(Component, { bindings, providers })` harness for DOM tests closer to [`@testing-library/angular`](https://github.com/testing-library/angular-testing-library/tree/main) than to `TestBed`. Default mantra: "test behavior, not implementation" — query by role/label/text, interact as a user would, assert on visible output.

### Pros and cons

Pros:

- familiar enough,
- not subject to typical single-file component (SFC) limitations,
- enforces a strict structure,
- explicit structure for tooling and AI agents,
- no `splitProps` drama 😅.

Cons:

- noticeable repetition in how bindings are declared and consumed,
- not plain TypeScript.

---

## Appendix: Co-located templates in Angular via `.ng` files

`tsx` does not support Angular control flow/directives today, so co-located templates likely require an Angular DSL in `*.ng` files plus dedicated tooling/parser support (TypeScript 7's content mappers - `https://github.com/microsoft/typescript-go/pull/4712` - could help, though Angular-specific template parsing would still be needed upstream).

Co-locating template and logic is not just a style preference. At the component boundary, the two usually change together: a meaningful change to one often requires a change to the other.

Angular templates are also not plain HTML. They require Angular-specific knowledge to read or modify, so the "designers own the HTML" argument rarely matches how Angular applications are maintained. CSS is a different case and remains separable.

If `.ng` files make co-location the default, they should still preserve Angular's strengths:

- tooling and agents get stable structural markers (`component`, `directive`, `derivation`, `fragment`),
- bindings stay explicit, statically typed, and remain the public API surface,
- `setup` owns component-local logic and runs once at component creation,
- provider declarations stay separate from setup/template logic,
- providers can depend on inputs, but not on setup-local variables,
- component internals stay private: only what `expose` returns is reachable through `ref`.

This keeps the explicit contract model: Angular performs synchronization/wiring, strict checks happen at build time, interface conformance for `bindings` and `expose` stays opt-in via `satisfies`, and component surfaces are inferred from the same declarations that define them.

### Boilerplate tax — a known trade-off

Declaring a binding and then destructuring it in `setup` feels redundant for small components. This is a known tax of the format.

```ts
// Tiny — the tax is visible: ~5 lines of bindings for ~3 lines of logic
export const Badge = component({
  bindings: {
    label: input.required<string>(),
    variant: input<'info' | 'warn'>('info'),
  },
  setup: ({ label, variant }) => @{
    <span class={variant()}>{label()}</span>
  },
});

// Medium — the same tax is a small fraction of the overall code
export const DataTable = component({
  bindings: {
    rows: input.required<Row[]>(),
    selected: model<Row | null>(),
    sort: output<SortEvent>(),
    rowTemplate: fragment<[Row]>(),
  },
  setup: ({ rows, selected, sort, rowTemplate }) => {
    const sorted = linkedSignal(() => defaultSort(rows()));
    const filter = signal('');
    const filtered = computed(() => applyFilter(sorted(), filter()));
    // ... 30+ lines of logic, handlers, derived state
    return @{ ... };
  },
});
```

For medium and large components the binding declaration is a small fraction of the code, and the explicit contract can pay for itself in readability, refactorability, and tooling support.

Three additional points:
- **Fairer comparison with other frameworks.** In React or Solid with TypeScript you typically write a separate `Props` interface that mirrors the component's accepted inputs — pure type-level boilerplate. Here, `bindings` serves double duty as both the type declaration *and* the runtime wiring. Counting the `Props` interface other frameworks require makes the math considerably more even.
- **Multi-component co-location.** Traditional SFCs (Vue, Svelte, etc.) map one component to one file. Splitting a growing component means creating a new file, moving markup, wiring imports, and updating the module graph — even for small, tightly coupled pieces. `.ng` files let you define helper components, fragments, and directives in the same file and extract them only when they earn their own module boundary.
- **Why not `defineBindings(...)` inside `setup`?** It would reduce repetition, but `providers` needs input access *before* `setup` runs — so it would require compiler hoisting magic or giving up input access in providers. It also introduces a second authoring style (à la Vue Options vs. Composition API) that tooling, docs, and developers all have to support.

One authoring format, explicit bindings, keeps the mental model explicit — for humans and AI agents alike.


---

## Appendix: Binding prefix and modifier reference

A canonical list of every prefix/modifier recognized in the template DSL.

| Prefix / Modifier | Applies to | Repeatable | Description |
|---|---|---|---|
| `bind:` | native elements, components | No (per property) | One-way property binding. Can be omitted (`prop={expr}` is shorthand for `bind:prop={expr}`). |
| `model:` | native elements, components | No (per property) | Two-way binding. On native elements: `<input>`, `<select>`, `<textarea>`. On components: binds to a `model()` binding. |
| `on:` | native elements, components | No (per event) | Event listener. On native elements: DOM events. On components: binds to an `output()` binding. |
| `once:` | inputs only | No (per property) | Freezes the input value at creation time; never updated afterwards. `once:model:*` and `once:on:*` are compile-time errors. |
| `class:` | native elements | Yes | Conditional CSS class binding. Multiple `class:` on the same element are valid. |
| `style:` | native elements | Yes | Conditional inline style binding. Multiple `style:` on the same element are valid. |
| `animate:` | native elements | Yes (enter + leave) | Enter/leave animation class binding. `on:animate:` for event callback. |
| `use:` | native elements, `component.proxy` components, wrapped proxy components | Yes (different directives) | Attaches a directive. On proxy / wrapped components, directives are placed at the `@forward()` target. Same directive cannot appear twice on the same final element. |
| `:when` | `use:` directives | No (per directive) | Conditionally applies the directive. Sits outside the directive's input parentheses. |
| `:ref` | `use:` directives | No (per directive) | Captures the directive's `expose` into a `ref`. Syntax: `use:dir(...):ref={variable}`. |
| `ref` | native elements, components | No | Captures element or component `expose` into a `ref` / `refMany`. Reserved — cannot be declared as a component binding. |
| `@forward()` | compatible native or wrapped component node | No (exactly one per component) | Places the forwarding payload declared by `component.proxy` or `component.wrap`. |

`ref` and `@forward()` are special attributes, not binding prefixes — included here for completeness. Both `ref` and `children` are reserved at component level only; directives and derivations may use them as binding names (though not recommended).

### Compile-time validation rules

Invalid bindings on native elements:

- `<input typ="text" />` — unknown attribute
- `<span class="..." class={...}>` — duplicate static/bound
- `<span on:click={...} on:click={...}>` — duplicate event

Multiple `class:` and `style:` on the same element are allowed:

- `<span class="..." class:some-class={...} class:some-other-class={...}>`

Invalid bindings on components:

- `<UserDetail role="admin" />` — unknown binding
- `<UserDetail user={...} user={...} model:user={...} />` — duplicate binding
- `<UserDetail on:makeAdmin={...} on:makeAdmin={...} />` — duplicate binding

Avoid `on` prefix in input / model / output names:

- `<UserDetail onInput={...} model:onModel={...} on:onEvent={...} />`


---

## Appendix: Integrating decorator-based components

Existing decorator-based (`@Component`, `@Directive`, `@Pipe`) classes work in `.ng` files without wrappers or adapters.

### Components

The class symbol is used directly as a tag — bindings follow the same `bind:` / `model:` / `on:` rules. For components with multiple element selectors (e.g. `button[mat-button], a[mat-button]`), the `:element` suffix disambiguates the host element.

```ts
import { component, signal } from '@angular/core';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { MatButton } from '@angular/material/button';

// Basic usage — class symbol as a tag
export const Settings = component({
  setup: () => {
    const darkMode = signal(false);

    return @{
      <MatSlideToggle model:checked={darkMode}>
        Dark mode
      </MatSlideToggle>
    };
  },
});

// :element suffix for multi-selector components
export const Nav = component({
  setup: () => {
    const hasPermissions = signal(false);

    return @{
      <MatButton:a href={'/admin'} disabled={hasPermissions()}>
        Admin
      </MatButton:a>
    };
  },
});
```

### Directives

Directives are attached with use:Class(...) — inputs and outputs are listed explicitly inside the parentheses. The use: syntax on decorator-based components adds the directive to the host element.

```ts
import { component, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatTooltip } from '@angular/material/tooltip';
import { CdkDrag, CdkDragEnd } from '@angular/cdk/drag-drop';
import { tooltip } from '@mylib/tooltip'; // .ng directive

export const DraggableCard = component({
  setup: () => {
    const tip = signal('Drag me');
    const position = signal({ x: 0, y: 0 });

    function onDragEnd(event: CdkDragEnd) {
      position.set(event.source.getFreeDragPosition());
    }

    return @{
      // On native elements
      <div
        use:MatTooltip(matTooltip={tip()})
        use:CdkDrag(on:cdkDragEnded={onDragEnd})>
          Position: {position().x}, {position().y}
      </div>

      // On decorator-based components
      <MatButton:button
        use:MatTooltip(matTooltip={'Click me'})
        on:click={() => {}}>
          Click
      </MatButton:button>

      <MatButton:a
        href={'/admin'}
        use:tooltip(message={'Click me'})>
          Admin
      </MatButton:a>
    };
  },
});
```

```ts
import { component, ref } from '@angular/core';
import { NgAccordionGroup, NgAccordionTrigger, NgAccordionPanel, NgAccordionContent } from '@angular/aria';

export const AccordionExample = component({
  setup: () => {
    const panel1 = ref<typeof NgAccordionPanel>();
    const panel2 = ref<typeof NgAccordionPanel>();

    return @{
      <div use:NgAccordionGroup(multiExpandable={true})>
        <div class="accordion-item">
          <h3>
            <button use:NgAccordionTrigger(panel={panel1()})>Item 1</button>
          </h3>
          <div use:NgAccordionPanel():ref={panel1}>
            <ng-template use:NgAccordionContent()>
              <p>Content for Item 1.</p>
            </ng-template>
          </div>
        </div>
        <div class="accordion-item">
          <h3>
            <button use:NgAccordionTrigger(panel={panel2()})>Item 2</button>
          </h3>
          <div use:NgAccordionPanel():ref={panel2}>
            <ng-template use:NgAccordionContent()>
              <p>Content for Item 2.</p>
            </ng-template>
          </div>
        </div>
      </div>
    };
  },
});
```

### Pipes

The template DSL has no pipe operator (`|`). Decorator-based pipes are consumed by wrapping them in a `derivation`, instantiated with `new` inside `setup` (injection context resolves constructor deps). 

```ts
import { component, derivation, computed, inject, input, LOCALE_ID } from '@angular/core';
import { DatePipe } from '@angular/common';

const dateFmt = derivation({
  bindings: {
    value: input.required<Date>(),
    format: input<string>('short'),
  },
  setup: ({ value, format }) => {
    const pipe = new DatePipe(inject(LOCALE_ID));
    return computed(() => pipe.transform(value(), format()));
  },
});

export const EventList = component({
  bindings: {
    events: input.required<{ id: string; date: Date }[]>(),
  },
  setup: ({ events }) => @{
    @for (event of events(); track event.id) {
      @derive formatted = dateFmt(value={event.date} format={'medium'});
      <span>{formatted()}</span>
    }
  },
});
```

Rules:

- Components → the class is used as a tag (`<ClassName ... />`).
- `:element` suffix disambiguates multi-selector components (`<MatButton:a>`).
- Directives → attached via `use:ClassName(input={expr} on:output={handler})`.
- Structural directives → not supported; `@if`, `@for`, `@switch`, and fragments replace them.
- Pipes → wrapped in a `derivation`, instantiated with `new` inside `setup` (injection context resolves constructor deps).
- The same binding prefixes (`bind:`, `model:`, `on:`, `:use`, `:ref`) apply.

---

## Appendix: Relevant GitHub issues

This is not an exhaustive list. These are well-known community requests that are related — directly or indirectly — to the proposals in this document.

- Hostless components — `https://github.com/angular/angular/issues/18877`
- Allow constants, enums, functions in templates — `https://github.com/angular/angular/issues/25963`
- Support Input/Output spread — `https://github.com/angular/angular/issues/14545`
- Define generic of ng-template — `https://github.com/angular/angular/issues/28731`
- One-time bindings — `https://github.com/angular/angular/issues/14033`
- Localized compilation — `https://github.com/angular/angular/issues/43165`
- Template expressions should be plain TypeScript — `https://github.com/angular/angular/issues/43485`
- Content projection (canonical) — `https://github.com/angular/angular/issues/64504`
- Transparent wrapper components — `https://github.com/angular/angular/issues/41993`
- Pipes in a signal world / template-defined computed — `https://github.com/angular/angular/issues/61501`
- Compiler gaps with attribute selectors — `https://github.com/angular/angular/issues/46351`
- Detect dangling/unknown attributes on elements — `https://github.com/angular/angular/issues/3425`
- Undefined outputs not reported in templates — `https://github.com/angular/angular/issues/43603`
