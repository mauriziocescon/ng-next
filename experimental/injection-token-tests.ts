import { Component, inject, Injectable } from '@angular/core';
import {
  provide,
  injectionToken,
  inject as newInject,
} from '../types/ng-types';

// new
const t1 = injectionToken<number>();
const t2 = injectionToken<string>({
  factory: () => {
    return '';
  },
  autoProvided: true,
  multi: true,
});

const t3 = injectionToken<unknown>();

@Injectable()
class Store {
  x = 0;
}

@Component({
  selector: 'App',
  providers: [
    provide(t1),
    provide({ token: t1 , factory: ()=> 10 }),
    provide(t2),
    provide({ token: t2, factory: ()=> '10' }),
    provide({ token: Store, factory: () => new Date() }),
    Store,
  ],
  template: ``,
})
export class App {
  t1 = newInject(t1);
  t2 = newInject(t2);
  t3 = <string>newInject(t3);
  store = newInject(Store);

  func() {
    this.t2.length;
  }
}
