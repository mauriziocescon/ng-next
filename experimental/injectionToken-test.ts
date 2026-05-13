import { Component, inject, Injectable, InjectionToken } from '@angular/core';
import {
  provide,
  injectionToken,
  inject as newInject,
} from '../types/ng-types';

@Injectable()
class Store {
  x = 0;
}

// legacy
const token = new InjectionToken<number>('multi');

// new
const t1 = injectionToken<number>();
const t2 = injectionToken<string>({
  factory: () => '',
  autoProvided: false,
  multi: true,
});

const t3 = t2;

@Component({
  selector: 'App',
  providers: [
    { provide: token, useFactory: () => 1, multi: true },
    { provide: token, useFactory: () => 'oops', multi: true }, // ❌ no error — wrong type
    { provide: token, useFactory: () => 2 }, // ❌ no error — forgot multi, throws at runtime
    provide({ token: Store, factory: () => new Date() }),
    Store,
    provide(t1),
    provide({ token: t1 , factory: ()=> 10 }),
    provide(t2),
    provide({ token: t2, factory: ()=> '10' }),
  ],
  template: ``,
})
export class App {
  values = inject(token); // inferred as number, actually number[] at runtime
  t1 = newInject(t1);
  t2 = newInject(t2);
  store = newInject(Store);

  func() {
    this.t2.length;
  }
}
