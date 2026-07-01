/**
 * Quiz question interface.
 */
export interface QuizQuestion {
  readonly code: string;
  readonly valid: boolean;
  readonly explanation: string;
}

/**
 * Quiz question bank.
 * Each entry has: code snippet, validity flag, and explanation.
 */
export const quizQuestions: readonly QuizQuestion[] = [
  {
    code: `export const Badge = component({
  bindings: {
    label: input.required<string>(),
  },
  setup: ({ label }) => @{
    <span>{label()}</span>
  },
});`,
    valid: true,
    explanation:
      'Correct. Minimal component: required input, destructured in setup, rendered in template with signal call syntax.',
  },
  {
    code: `export const Search = component({
  setup: () => {
    const text = signal('');
    return @{
      <input model:value={text} />
      <p>{text}</p>
    };
  },
});`,
    valid: false,
    explanation:
      'Invalid. In the template, text is a signal — it should be {text()} with the call. {text} would render the signal object, not its value.',
  },
  {
    code: `const tip = directive({
  host: ref<HTMLElement>(),
  bindings: {
    message: input.required<string>(),
    hide: output<void>(),
  },
  setup: ({ message, hide }, { host }) => {
    afterRenderEffect(() => { /* ... */ });
  },
});`,
    valid: true,
    explanation:
      "Correct. Directive with typed host, input, output, and host access in setup's second parameter.",
  },
  {
    code: `export const App = component({
  setup: () => @{
    <Button use:tooltip(message={'hi'}) on:click={doStuff}>
      Click
    </Button>
  },
});`,
    valid: false,
    explanation:
      "Invalid (likely). use: directives on components only work if the component uses component.proxy<T>. A plain component() doesn't expose a native element surface for directives.",
  },
  {
    code: `const fmt = derivation({
  bindings: {
    value: input.required<number>(),
    change: output<string>(),
  },
  setup: ({ value, change }) => {
    return computed(() => value().toFixed(2));
  },
});`,
    valid: false,
    explanation:
      'Invalid. Derivations only support inputs — no outputs, no models. They have no DOM surface to emit from.',
  },
  {
    code: `export const List = component({
  bindings: {
    items: input.required<Item[]>(),
    row: fragment.required<[Item]>(),
  },
  setup: ({ items, row }) => @{
    @for (item of items(); track item.id) {
      @render(row(item))
    }
  },
});`,
    valid: true,
    explanation:
      'Correct. Named fragment with typed parameter, rendered inside @for with the item passed as argument.',
  },
  {
    code: `export const Wrapper = component.wrap(Inner, {
  bindings: {
    extra: input<string>(''),
  },
  setup: ({ extra }) => @{
    <Inner @forward() class={extra()} />
  },
});`,
    valid: true,
    explanation:
      "Correct. component.wrap forwards remaining bindings of Inner. The wrapper adds its own 'extra' input and places @forward() on the inner component.",
  },
  {
    code: `export const Counter = component({
  bindings: { start: input<number>(0) },
  providers: ({ start }) => [
    provide(CounterStore, () => new CounterStore(start)),
  ],
  setup: () => {
    const store = inject(CounterStore);
    return @{ <span>{store.value()}</span> };
  },
});`,
    valid: true,
    explanation:
      'Correct. Inputs are hoisted and available in providers before setup runs. The factory has injection context.',
  },
  {
    code: `return @{
  <input
    type="text"
    model:value={text}
    use:tooltip(message={msg()}):when={show()}
    on:input={handler} />
};`,
    valid: true,
    explanation:
      "Correct. :when conditionally applies the directive. It sits outside the directive's parentheses and cannot clash with input names.",
  },
  {
    code: `export const Card = component({
  bindings: {
    children: fragment<void>(),
    ref: input<string>(''),
  },
  setup: ({ children, ref }) => @{
    @render(children?.())
  },
});`,
    valid: false,
    explanation:
      "Invalid. Both 'children' and 'ref' are reserved names at the component level — they cannot be declared as component bindings.",
  },
];
