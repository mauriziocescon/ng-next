import { Component, inject, signal, InjectionToken, ElementRef } from '@angular/core';
import { JsonPipe } from '@angular/common';

import {
  provide,
  injectionToken,
  inject as newInject,
} from '../types/ng-types';

/// Token with factory (component-scoped)
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

// Auto-provided (root-scoped)
const loggerToken = injectionToken({
  debugName: 'loggerToken',
  autoProvided: true,
  factory: () => ({ log: (msg: string) => console.log(msg) }),
});

// Multi token
const pluginToken = injectionToken({
  debugName: 'pluginToken',
  multi: true,
  factory: () => ({ name: 'default' }),
});

// Token without factory
const configToken = injectionToken<{ apiUrl: string }>({
  debugName: 'configToken',
});

// Unknown token without factory
const unknownTypeToken = injectionToken<unknown>();

class Store {
  x: string;
  constructor(x?: string) {
    this.x = x ?? 'store';
  }
}

const MODAL_DATA = new InjectionToken<unknown>('');

class C<T extends number> {}
abstract class AC<T extends string> {}

const x = newInject(C);
const y = newInject(AC);

@Component({
  selector: `Comp`,
  imports: [JsonPipe],
  providers: [
    provide(counterToken),
    provide(pluginToken),
    provide({ token: pluginToken, factory: () => ({ name: 'custom' }) }),
    provide({ token: configToken, factory: () => ({ apiUrl: '/api' }) }),
    // provide(configToken),  // ✅ compile error: configToken has no TOKEN_HAS_FACTORY
    provide({ token: unknownTypeToken, factory: () => '' }),
    provide({ token: Store, factory: () => new Store('provide') }),
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
  `,
})
export class Comp {
  Date = Date;

  elRef = newInject(ElementRef<HTMLButtonElement>);

  counter = newInject(counterToken);
  logger = newInject(loggerToken);
  plugins = newInject(pluginToken);
  config = newInject(configToken);

  // c = newInject<string>(counterToken); // ✅ compile error
  unknown = <string>newInject(unknownTypeToken); // ✅ unknonw

  store = newInject(Store);

  // a = inject<string>(MODAL_DATA);
  // b = newInject<string>(MODAL_DATA);
  // c = <string>newInject(MODAL_DATA);

  method() {
    const el = this.elRef.nativeElement; // ✅ HTMLButtonElement
  }
}

@Component({
  selector: 'app-root',
  imports: [Comp],
  template: `
    <h1>injectionToken + provide</h1>
    <Comp />
  `,
})
export class App {}
