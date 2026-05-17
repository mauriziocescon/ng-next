import {
  Component,
  signal,
  InjectionToken,
  ElementRef,
  type Signal,
} from '@angular/core';
import { JsonPipe } from '@angular/common';

import {
  type InjectableMultiToken,
  type InjectableToken,
  provide,
  injectionToken,
  inject as injectStrict,
} from '../types/ng-types';

// Token with factory (component-scoped)
const counterToken = injectionToken({
  debugName: 'counterToken',
  factory: () => {
    const count = signal(0);
    return {
      value: count.asReadonly(),
      increment: () => count.update((v) => v + 1),
    };
  },
});

const _counterTokenType: InjectableToken<{
  value: Signal<number>;
  increment: () => void;
}> = counterToken;

// Auto-provided (root-scoped)
const loggerToken = injectionToken({
  debugName: 'loggerToken',
  autoProvided: true,
  factory: () => ({ log: (msg: string) => msg }),
});

const _loggerTokenType: InjectableToken<{ log: (msg: string) => string }> =
  loggerToken;

// Multi token
const pluginToken = injectionToken.multi({
  debugName: 'pluginToken',
  factory: () => ({ name: 'default' }),
});

const _pluginTokenType: InjectableMultiToken<{ name: string }> = pluginToken;

// Token without factory
const configToken = injectionToken<{ apiUrl: string }>({
  debugName: 'configToken',
});

const _configTokenType: InjectableToken<{ apiUrl: string }> = configToken;

// Unknown token without factory
const unknownTypeToken = injectionToken<unknown>();
const MODAL_DATA = new InjectionToken<unknown>('');

// Single token with array value type: inject() returns the full array and
// explicit provide() factories return the full array, not one item.
const tagsToken = injectionToken<string[]>({ debugName: 'tags' });

// Multi token without factory: inject() returns T[] and each provide()
// contributes one T item.
const orderedPluginToken = injectionToken.multi<{ order: number }>({
  debugName: 'orderedPluginToken',
});

class Store {
  x: string;
  constructor(x?: string) {
    this.x = x ?? 'store';
  }
}

class Store2 extends Store {}

class C<T extends number> {}
abstract class AC<T extends string> {}
abstract class AbstractService {
  abstract run(): void;
}
class ConcreteService extends AbstractService {
  run() {}
}

// const x = injectStrict(C); // ✅
// const y = injectStrict(AC); // ✅

@Component({
  selector: `Comp`,
  imports: [JsonPipe],
  providers: [
    provide(counterToken),
    provide(pluginToken),
    provide(pluginToken, () => ({ name: 'custom' })),
    provide(configToken, () => ({ apiUrl: '/api' })),
    // provide(configToken),  // ✅ compile error: configToken has no TOKEN_WITH_FACTORY
    provide(unknownTypeToken, () => ''),
    provide(tagsToken, () => ['a', 'b']),
    provide(orderedPluginToken, () => ({ order: 1 })),
    provide(Store, () => new Store('provide')),
    provide(Store2, () => injectStrict(Store)),
    provide(AbstractService, () => new ConcreteService()),
  ],
  template: `
    counter: {{ counter.value() }}
    <button (click)="counter.increment()">+</button>
    <hr />
    logger: {{ logger.log(Date.now().toString()) }}
    <hr />
    plugins: {{ plugins | json }}
    <hr />
    config: {{ config | json }}
    <hr />
    unknown: {{ unknown | json }}
    <hr />
    Store: {{ store | json }}
    <hr />
    Store2: {{ store2 | json }}
    <hr />
    tags: {{ tags | json }}
    <hr />
    ordered plugins: {{ orderedPlugins | json }}
  `,
})
export class Comp {
  Date = Date;

  elRef = injectStrict(ElementRef<HTMLButtonElement>);

  counter = injectStrict(counterToken);
  logger = injectStrict(loggerToken);
  plugins = injectStrict(pluginToken);
  config = injectStrict(configToken);
  optionalConfig = injectStrict(configToken, { optional: true });
  requiredConfig = injectStrict(configToken, { optional: false });

  // c = injectStrict<string>(counterToken);
  // ✅ compile error: generic is token type, not value type
  // d = injectStrict<string>(pluginToken);
  // ✅ compile error: generic is token type, not value type
  unknown = <string>injectStrict(unknownTypeToken); // ✅ unknown
  // a = inject<string>(MODAL_DATA); // ❌ new InjectionToken
  // b = injectStrict<string>(MODAL_DATA); // ❌ new InjectionToken
  // c = <string>injectStrict(MODAL_DATA); // ❌ new InjectionToken

  tags = injectStrict(tagsToken);
  orderedPlugins = injectStrict(orderedPluginToken);
  store = injectStrict(Store);
  store2 = injectStrict(Store2);
  abstractService = injectStrict(AbstractService);
  genericStore = injectStrict(C);
  genericAbstract = injectStrict(AC);

  app = injectStrict(App);

  method() {
    const el = this.elRef.nativeElement; // ✅ HTMLButtonElement
  }
}

// Negative examples aligned with types/ng-types.spec.ts:
// provide(pluginToken, () => [{ name: 'wrong' }]);
// ✅ compile error: multi factories return one item
// provide(tagsToken, () => 'wrong'); // ✅ compile error: array-valued single token needs string[]
// provide(Store); // ✅ compile error: class shorthand is not allowed
// injectionToken<string>({ autoProvided: true });
// ✅ compile error: autoProvided requires factory
// injectionToken.multi({ autoProvided: true, factory: () => 1 });
// ✅ compile error: multi cannot be autoProvided

@Component({
  selector: 'App',
  imports: [Comp],
  template: `
    <h1>injectionToken + provide</h1>
    <Comp />
  `,
})
export class App {
  test = signal('');
}
