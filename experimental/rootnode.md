**⚠️ Disclaimer:** This idea may well be flawed, or outright impossible to implement. At the very least, it assumes a parsing / compiler-transform / runtime mechanism that lifts a component's internal root node and makes content projection work correctly. It also assumes that `ng-container` can be used as a host.

---

In general, I think this is more or less what I would do for a potential selectorless / hostless implementation:

1. components / directives are referenced directly by their class in templates (`<MyComp @MyDir(...) />`),
2. each component must have a single root node, which cannot be wrapped in `@if` or similar control flow (much like React's `<></>` fragment),
3. the root node represents the host; it becomes a purely internal definition and must be either a valid HTML tag or an `ng-container` (or something similar in spirit, such as [`ng-host`](https://github.com/angular/angular/issues/19119)),
4. the component boundary is closed, except for inputs / outputs / directives (DI is a separate story),
5. styles remain view-scoped, as they are today; the host element can be styled directly, but only from the inside,
6. the same principle applies to every other DOM attribute / property (as in the previous point),
7. CSS custom properties on components whose root node is a real HTML tag get special treatment (`<MyComp --my-background="color()" />`),
8. `class` and `style` on HTML tags (as opposed to components) behave as they do today: they accept the sugared forms (`[class.foo]`, `[style.width]`, ...), including multiple bindings on the same tag.

Here are a few examples to better visualize the idea:

```ts
import { ClassValue, cn } from 'cn';

// host === button

@Component({
  rootElement: true,
  template: `
    <button [class]="merged()" (click)="click.emit()">
      <ng-content />
    </button>
  `,
  host: {}, // mostly useless (you can work directly on the button), but harmless because it is internal
  hostDirectives: [], // still exposes directives and inputs / outputs to consumers: they are applied to the button
})
export class Button {
  readonly class = input<ClassValue>('');
  readonly click = output<void>();

  // in this case, Button accepts any class
  protected readonly TAILWIND_BTN_DEFAULTS = `...`;
  protected readonly merged = computed(() => cn([this.TAILWIND_BTN_DEFAULTS, this.class()]));
}
```

```ts
// host === tr

@Component({
  rootElement: true,
  template: `
    <!-- Tooltip is applied to the host and can use TableRow's inputs -->
    <tr class="..." @Tooltip(...)>
      <td><!-- whatever makes sense --></td>
    </tr>
  `,
  styles: ``, // :host is no longer needed
})
export class TableRow {}
```

```ts
// host === ng-container

@Component({
  template: `
    <!-- as if the content were wrapped in an ng-container -->
  `,
})
export class MultiHtmlTags {}
```

```ts
// host === ng-container

@Component({
  template: `
    <!-- you can only pass inputs / outputs / directives -->
    <!-- Tooltip is applied to the internal button -->
    <Button @Tooltip(...) (click)="..." [class]="...">
      Click me!
    </Button>

    <table>
      <tbody>
        <TableRow />
      </tbody>
    </table>

    <MultiHtmlTags />
  `,
})
export class Consumer {}
```

**Pros**

- likely a simpler mental model, with clear boundaries between components, clear ownership, and a clear data flow,
- no double imports, no selectors,
- better template type checking,
- pipes can be partially represented by components that wrap a single computation, such as `<ng-container>{{ computation() }}</ng-container>`,
- host directives can be applied directly to the root node (the host) and can depend on component inputs,
- components whose root node is an `ng-container` naturally "reject" directives that manipulate the DOM from outside the boundary,
- potentially, the root node could be used to type-check directive compatibility — assuming directives can declare which host types they may be attached to.

**Cons**

- a change in the mental model,
- integrating selector-based components would still require an external host (`<MatButton:a ...>...</MatButton:a>`),
- a single `Button` cannot target both a `button` and an `a` tag at the same time (although there are ways to achieve it — see [`svelte:element`](https://svelte.dev/docs/svelte/svelte-element)),
- some things might require adaptations (`FormField`, for example),
- some concepts might not be supported at all (`ng-content` replaced by an input-based `ng-template`).

Cheers!
