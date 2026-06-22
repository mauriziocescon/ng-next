# Type Checking Judgment Specification

## Angular Signal Components — Template DSL

This document defines what the **template type checker** must verify. It covers only constructs that live inside the template DSL — things TypeScript cannot check because they are not plain TS expressions.

---

## Notation

| Symbol | Meaning |
|--------|---------|
| `Γ` | Type environment (scope) |
| `Γ ⊢ e : T` | Under Γ, expression e has type T |
| `Γ ⊢ node ✓` | Under Γ, template node type-checks |
| `B(C)` | Bindings record of component/directive/derivation C |
| `E(C)` | Expose type of C |
| `H(D)` | Host element type of directive D |
| `F(C)` | Forwarding host type of component C (`never` if none) |
| `I(tag)` | Intrinsic element host type (e.g. `I("button") = HTMLButtonElement`) |
| `⊑` | Assignability (subtype) |
| `≡` | Exact type equality |

---

## 1. Scope Resolution

```
SCOPE-RESOLVE
─────────────────────────────────────────────────────────────────
Γ = Γ_template ∪ Γ_setup ∪ Γ_module ∪ Γ_global

Lookup priority: Γ_template > Γ_setup > Γ_module > Γ_global
First match wins.
```

- `Γ_template`: `@let`, `@derive`, `@for` item + context variables, `@fragment` parameters, `@if` aliases
- `Γ_setup`: variables/functions visible from setup's return (or the full setup scope for the template)
- `Γ_module`: top-level imports, constants, enums, interfaces
- `Γ_global`: DOM globals, built-in JS types

---

## 2. Expression Typing (Template Expressions)

Template expressions use `{expr}` syntax. The checker must type-check these against the scope.

```
VAR
─────────────────────────────────────────────────
x : T ∈ Γ
─────────────────────────────────────────────────
Γ ⊢ x : T


PROPERTY-READ
─────────────────────────────────────────────────
Γ ⊢ e : T    name ∈ keys(T)    T[name] = U
─────────────────────────────────────────────────
Γ ⊢ e.name : U


SAFE-PROPERTY-READ
─────────────────────────────────────────────────
Γ ⊢ e : T | null | undefined    name ∈ keys(T)    T[name] = U
─────────────────────────────────────────────────
Γ ⊢ e?.name : U | undefined


FUNCTION-CALL
─────────────────────────────────────────────────
Γ ⊢ f : (a₁: A₁, ..., aₙ: Aₙ) → R
Γ ⊢ eᵢ : Tᵢ    Tᵢ ⊑ Aᵢ  for i ∈ 1..n
─────────────────────────────────────────────────
Γ ⊢ f(e₁, ..., eₙ) : R


METHOD-CALL
─────────────────────────────────────────────────
Γ ⊢ e : T    T has method name : (a₁: A₁, ..., aₙ: Aₙ) → R
Γ ⊢ argᵢ : Tᵢ    Tᵢ ⊑ Aᵢ  for i ∈ 1..n
─────────────────────────────────────────────────
Γ ⊢ e.name(arg₁, ..., argₙ) : R


TEXT-INTERPOLATION
─────────────────────────────────────────────────
Γ ⊢ e : T    T ⊑ Stringifiable
─────────────────────────────────────────────────
Γ ⊢ {e} ✓

where Stringifiable = string | number | boolean | null | undefined
                    | { toString(): string }
```

---

## 3. Native Element

```
INTRINSIC-ELEMENT
─────────────────────────────────────────────────────────────────
tag ∈ IntrinsicElements
H = I(tag)

∀ attr ∈ node.attributes:    attr.name ∈ Attrs(H)
∀ input ∈ node.inputs:       CHECK-NATIVE-INPUT(Γ, H, input)
∀ output ∈ node.outputs:     CHECK-NATIVE-OUTPUT(Γ, H, output)
∀ model ∈ node.models:       CHECK-NATIVE-MODEL(Γ, H, model)
∀ anim ∈ node.animations:   CHECK-ANIMATE-BINDING(Γ, anim)
∀ dir ∈ node.directives:     CHECK-DIRECTIVE-USE(Γ, H, dir)
∀ ref ∈ node.references:     CHECK-NATIVE-REF(Γ, H, ref)
NO-DUPLICATE-BINDINGS(node)
NO-STATIC-DYNAMIC-CLASH(node)
─────────────────────────────────────────────────────────────────
Γ ⊢ <tag ...> ✓


CHECK-NATIVE-INPUT
─────────────────────────────────────────────────
input.name ∈ Props(H)    Props(H)[input.name] = T
Γ ⊢ input.value : U     U ⊑ T
─────────────────────────────────────────────────


CHECK-NATIVE-OUTPUT
─────────────────────────────────────────────────
output.name ∈ Events(H)    Events(H)[output.name] = Event<T>
Γ ⊢ output.handler : (e: T) → void
─────────────────────────────────────────────────


CHECK-NATIVE-MODEL
─────────────────────────────────────────────────
tag ∈ {"input", "select", "textarea"}
model.name ∈ ModelableProps(H)
ModelableProps(H)[model.name] = T
Γ ⊢ model.value : WritableSignal<T>
─────────────────────────────────────────────────


CHECK-NATIVE-REF
─────────────────────────────────────────────────
ref.target.name = x
x : Ref<H | undefined> ∈ Γ
─────────────────────────────────────────────────
```

### 3.1 class: and style: Typing

```
CLASS-BINDING
─────────────────────────────────────────────────
class:name={expr}
Γ ⊢ expr : boolean
─────────────────────────────────────────────────


STYLE-BINDING
─────────────────────────────────────────────────
style:prop={expr}
Γ ⊢ expr : string | number | null
─────────────────────────────────────────────────
```

### 3.2 Native Binding Constraints

```
NO-DUPLICATE-BINDINGS
─────────────────────────────────────────────────
∀ name: |{b ∈ inputs ∪ models | b.name = name}| ≤ 1
∀ name: |{b ∈ outputs | b.name = name}| ≤ 1
class: and style: bindings are EXEMPT (repeatable)
─────────────────────────────────────────────────


NO-STATIC-DYNAMIC-CLASH
─────────────────────────────────────────────────
∀ name ∈ attributes:  name ∉ {b.name | b ∈ inputs}
  UNLESS name ∈ {"class", "style"}
─────────────────────────────────────────────────
```

### 3.3 animate: Typing

```
ANIMATE-CLASS-BINDING
─────────────────────────────────────────────────
animate:phase={expr}   where phase ∈ {"enter", "leave"}
Γ ⊢ expr : string | string[]
─────────────────────────────────────────────────


ANIMATE-EVENT-BINDING
─────────────────────────────────────────────────
on:animate:phase={handler}   where phase ∈ {"enter", "leave"}
Γ ⊢ handler : (event: AnimationCallbackEvent) => void
─────────────────────────────────────────────────

where AnimationCallbackEvent = { target: Element; animationComplete: VoidFunction }


ANIMATE-CONSTRAINTS
─────────────────────────────────────────────────
animate: applies ONLY to native elements (not components)
phase must be "enter" or "leave" — any other value is an error
At most one animate:enter (class form) per element
At most one animate:leave (class form) per element
At most one on:animate:enter per element
At most one on:animate:leave per element
Both animate:enter and animate:leave can coexist on the same element
Both class form and event form can coexist for the same phase on the same element
─────────────────────────────────────────────────
```

---

## 4. Component Element

```
COMPONENT-ELEMENT
─────────────────────────────────────────────────────────────────
C = resolve(tag, Γ)     C : ComponentInstance<B, E, S>

∀ input ∈ node.inputs:   CHECK-COMP-INPUT(Γ, B, input)
∀ model ∈ node.models:   CHECK-COMP-MODEL(Γ, B, model)
∀ output ∈ node.outputs: CHECK-COMP-OUTPUT(Γ, B, output)
∀ frag ∈ node.fragments: CHECK-COMP-FRAGMENT(Γ, B, frag)
∀ ref ∈ node.references: CHECK-COMP-REF(Γ, E, ref)
∀ dir ∈ node.directives: CHECK-COMP-DIRECTIVE(Γ, S, dir)
CHECK-REQUIRED(B, node)
NO-DUPLICATE-BINDINGS(node)
NO-UNKNOWN-BINDINGS(B, node)
─────────────────────────────────────────────────────────────────
Γ ⊢ <C ...> ✓


CHECK-COMP-INPUT
─────────────────────────────────────────────────
input.name ∈ keys(B)
B[input.name] : InputSignal<T>
Γ ⊢ input.value : U    U ⊑ T
─────────────────────────────────────────────────


CHECK-COMP-MODEL
─────────────────────────────────────────────────
model.name ∈ keys(B)
B[model.name] : ModelSignal<T>
Γ ⊢ model.value : WritableSignal<T>
─────────────────────────────────────────────────


CHECK-COMP-OUTPUT
─────────────────────────────────────────────────
output.name ∈ keys(B)
B[output.name] : OutputEmitterRef<T>
Γ ⊢ output.handler : (e: T) → void
─────────────────────────────────────────────────


CHECK-COMP-FRAGMENT
─────────────────────────────────────────────────
frag.name ∈ keys(B)
B[frag.name] : FragmentBinding<T>
∀ param ∈ frag.parameters:  param matches FragmentArgs<T> positionally
Γ' = Γ ∪ { paramᵢ.name : Tᵢ }
Γ' ⊢ frag.children ✓
─────────────────────────────────────────────────


CHECK-COMP-REF
─────────────────────────────────────────────────
ref.target.name = x
if E = void:  x : Ref<undefined> ∈ Γ   ∨   x : Ref<undefined[]> ∈ Γ
else:         x : Ref<E | undefined> ∈ Γ  ∨  x : Ref<E[]> ∈ Γ
─────────────────────────────────────────────────


CHECK-COMP-DIRECTIVE
─────────────────────────────────────────────────
if S = never:
  node.directives must be ∅   (error: no forwarding support)
else:
  ∀ dir: CHECK-DIRECTIVE-USE(Γ, S, dir)
─────────────────────────────────────────────────


CHECK-REQUIRED
─────────────────────────────────────────────────
∀ k ∈ keys(B):
  B[k] : InputSignal.required<T>    → k ∈ provided_inputs ∪ forwarded
  B[k] : ModelSignal.required<T>    → k ∈ provided_models ∪ forwarded
  B[k] : RequiredFragmentBinding<T> → k ∈ provided_fragments ∪ forwarded
                                      ∨ (k = "children" ∧ has_nested_content)
─────────────────────────────────────────────────


NO-UNKNOWN-BINDINGS
─────────────────────────────────────────────────
∀ input ∈ node.inputs:   input.name ∈ keys(B)
∀ model ∈ node.models:   model.name ∈ keys(B)
∀ output ∈ node.outputs: output.name ∈ keys(B)
∀ frag ∈ node.fragments: frag.name ∈ keys(B)
─────────────────────────────────────────────────
```

### 4.1 once: Binding

```
ONCE-BINDING
─────────────────────────────────────────────────
once: applies ONLY to inputs (InputSignal)
once:model:*  → error
once:on:*     → error
once:prop + prop on same element → duplicate error
─────────────────────────────────────────────────
```

### 4.2 on-Prefix Warning

```
ON-PREFIX-WARNING
─────────────────────────────────────────────────
∀ binding name starting with "on" in B → warning
  (Applies to input, model, or output bindings named e.g. onInput, onModel, onEvent)
─────────────────────────────────────────────────
```

---

## 5. Ref (Template-Side Validation)

The checker validates that `ref={x}` and `use:dir(...):ref={x}` reference variables with compatible types.

```
REF-ON-NATIVE-ELEMENT
─────────────────────────────────────────────────
<tag ref={x}>   where H = I(tag)
x : Ref<H | undefined> ∈ Γ
─────────────────────────────────────────────────


REF-ON-COMPONENT
─────────────────────────────────────────────────
<C ref={x}>    where E(C) = E
if E = void:  x : Ref<undefined> ∈ Γ  ∨  x : Ref<undefined[]> ∈ Γ
else:         x : Ref<E | undefined> ∈ Γ  ∨  x : Ref<E[]> ∈ Γ
─────────────────────────────────────────────────


REF-ON-DIRECTIVE
─────────────────────────────────────────────────
use:D(...):ref={x}    where E(D) = E_D
if E_D = void:  x : Ref<undefined> ∈ Γ
else:           x : Ref<E_D | undefined> ∈ Γ
─────────────────────────────────────────────────
```

---

## 6. Directive Application

```
CHECK-DIRECTIVE-USE
─────────────────────────────────────────────────────────────────
D = resolve(dir.directiveName, Γ)
D : DirectiveInstance<H_D, B_D, E_D>

HOST-COMPAT:  H_host ⊑ H_D
UNIQUE:       D not already applied to this element/component

∀ input ∈ dir.inputs:
  input.name ∈ keys(B_D)
  B_D[input.name] : InputSignal<T>
  Γ ⊢ input.value : U    U ⊑ T

∀ output ∈ dir.outputs:
  output.name ∈ keys(B_D)
  B_D[output.name] : OutputEmitterRef<T>
  Γ ⊢ output.handler : (e: T) → void

∀ model ∈ dir.models:
  model.name ∈ keys(B_D)
  B_D[model.name] : ModelSignal<T>
  Γ ⊢ model.value : WritableSignal<T>

CHECK-REQUIRED(B_D, dir)
NO-UNKNOWN-BINDINGS(B_D, dir)

if dir.when:
  Γ ⊢ dir.when.condition : boolean

if dir.ref:
  x = dir.ref.target.name
  if E_D = void:  x : Ref<undefined> ∈ Γ
  else:           x : Ref<E_D | undefined> ∈ Γ
─────────────────────────────────────────────────────────────────
Γ ⊢ use:D(...) ✓
```

### 6.1 Host Compatibility

```
NATIVE-HOST
─────────────────────────────────────────────────
Element is native: H = I(tag)
Directive host: H_D
H ⊑ H_D → compatible
─────────────────────────────────────────────────


FORWARDED-HOST
─────────────────────────────────────────────────
Component C: F(C) = S (S ≠ never)
Directive host: H_D
S ⊑ H_D → compatible
─────────────────────────────────────────────────


NO-FORWARDING
─────────────────────────────────────────────────
F(C) = never → directive on component tag is an error
─────────────────────────────────────────────────
```

---

## 7. @forward() Marker

```
FORWARD-PASSTHROUGH (one-argument withForwarding<S>)
─────────────────────────────────────────────────────────────────
Template has exactly one element with @forward()
That element is native: H = I(tag)
H ⊑ S   (actual element compatible with declared forwarding host)
─────────────────────────────────────────────────────────────────


FORWARD-WRAPPER (two-argument withForwarding(Target, config))
─────────────────────────────────────────────────────────────────
Template has exactly one <Target @forward() .../> 
Remainder = B(Target) \ Selected
Explicit bindings on @forward() element override Remainder for same key
if |Remainder| > 0 ∧ no @forward() → error
─────────────────────────────────────────────────────────────────


COLLISION-PRECEDENCE
─────────────────────────────────────────────────────────────────
∀ key ∈ (Explicit ∩ Remainder):
  Explicit wins regardless of source order.
  Applies uniformly to all binding kinds.
─────────────────────────────────────────────────────────────────
```

---

## 8. @derive

```
DERIVE
─────────────────────────────────────────────────────────────────
D = resolve(derivation_name, Γ)
D : DerivationInstance<B_D, T>

∀ input ∈ node.inputs:
  input.name ∈ keys(B_D)
  B_D[input.name] : InputSignal<T_k>
  Γ ⊢ input.value : U    U ⊑ T_k

CHECK-REQUIRED(B_D, node)
NO-UNKNOWN-BINDINGS(B_D, node)

Γ' = Γ ∪ { node.name : Signal<T> }
─────────────────────────────────────────────────────────────────
Γ ⊢ @derive name = D(...)    producing Γ'
```

Scope: block-scoped to enclosing control-flow block. Not accessible outside.

---

## 9. Fragment & @render

### 9.1 Inline @fragment Definition

```
FRAGMENT-DEF
─────────────────────────────────────────────────────────────────
@fragment name(p₁: T₁, ..., pₙ: Tₙ) { children }

Γ' = Γ ∪ { p₁: T₁, ..., pₙ: Tₙ }
Γ' ⊢ children ✓

Fragment is auto-passed to matching fragment binding on parent component.
─────────────────────────────────────────────────────────────────
```

### 9.2 Implicit children

```
IMPLICIT-CHILDREN
─────────────────────────────────────────────────────────────────
Nested content inside <Component>...</Component>
Lowered to FragmentNode { name: "children", parameters: [] }
Satisfies `children: fragment<void>()` or `children: fragment.required<void>()`
─────────────────────────────────────────────────────────────────
```

### 9.3 @render Invocation

```
RENDER
─────────────────────────────────────────────────────────────────
Γ ⊢ expr : FragmentBinding<T>

Argument checking uses FragmentArgs<T>:
  T = void                       → args = []
  T = tuple [T₁, ..., Tₙ]      → args = [e₁, ..., eₙ] where eᵢ ⊑ Tᵢ
  T = array A[] (non-tuple)     → args = [e] where e ⊑ A[]
  T = other                     → args = [e] where e ⊑ T

Optional injector override:
  if options.injector present:
    Γ ⊢ options.injector : Injector | 'outlet' | null | undefined
─────────────────────────────────────────────────────────────────
Γ ⊢ @render(expr(args), { injector? }) ✓


RENDER-OPTIONAL-GUARD
─────────────────────────────────────────────────────────────────
Γ ⊢ expr : OptionalFragmentBinding<T> | undefined
Must guard: @render(expr?.(...))  or  @if (expr) { @render(expr(...)) }
─────────────────────────────────────────────────────────────────
```

---

## 10. Control Flow

### 10.1 @if

```
IF
─────────────────────────────────────────────────
Γ ⊢ expression : T    (any type — used for truthiness)
if alias present:
  Γ' = Γ ∪ { alias : Narrow(T) }
else:
  Γ' = Γ
Γ' ⊢ children ✓
─────────────────────────────────────────────────
```

### 10.2 @for

```
FOR
─────────────────────────────────────────────────
Γ ⊢ expression : Iterable<T> | T[]
Γ ⊢ trackBy : expression referencing item/context vars

Γ' = Γ ∪ {
  itemName : T,
  $index : number,
  $count : number,
  $first : boolean,
  $last  : boolean,
  $even  : boolean,
  $odd   : boolean,
} ∪ aliases

Γ' ⊢ children ✓
if empty block: Γ ⊢ empty.children ✓
─────────────────────────────────────────────────
```

### 10.3 @switch

```
SWITCH
─────────────────────────────────────────────────
Γ ⊢ expression : T

∀ case:
  Γ ⊢ case.expression : U    U comparable to T
  Γ ⊢ case.children ✓
─────────────────────────────────────────────────
```

---

## 11. @let

```
LET
─────────────────────────────────────────────────
Γ ⊢ value : T
Γ' = Γ ∪ { name : T }
─────────────────────────────────────────────────
Γ ⊢ @let name = expr;   producing Γ'
```

## 12. Binding Prefix & Modifier Validation

| Prefix / Modifier | Target | Repeatable | Checker Rule |
|---|---|---|---|
| `bind:` (or omitted) | native, component | No (per prop) | Resolved as input binding |
| `model:` | native, component | No (per prop) | Two-way. Native: `input`/`select`/`textarea` only |
| `on:` | native, component | No (per event) | Event handler |
| `once:` | inputs only | No (per prop) | Input only. `once:model:*` / `once:on:*` → error |
| `class:` | native | Yes | Conditional class |
| `style:` | native | Yes | Conditional style |
| `animate:` | native | Yes (enter + leave) | Enter/leave animation class binding. `on:animate:` for event callback. |
| `use:` | native, forwarding comp | Yes (diff dirs) | Same directive only once per element |
| `:when` | `use:` directive | No (per dir) | Condition must be `boolean` |
| `:ref` | `use:` directive | No (per dir) | Target must match directive expose |
| `ref` | native, component | No | Target must match element/component expose |
| `@forward()` | native (in comp template) | No (one per template) | Forwarding target marker |

---

## 13. Diagnostic Summary

| Code | Condition | Severity |
|------|-----------|----------|
| D001 | `input()`/`output()`/`model()`/`fragment()` called outside `bindings` | Error |
| D002 | Unknown attribute/property on native element | Error |
| D003 | Unknown binding on component | Error |
| D004 | Duplicate binding (same name, same kind) | Error |
| D005 | Static attribute + dynamic binding clash (same name) | Error |
| D006 | Missing required input/model/fragment | Error |
| D007 | Type mismatch (expression not assignable to binding type) | Error |
| D008 | `model:` bound to non-writable signal | Error |
| D009 | Directive host incompatible with element/forwarded type | Error |
| D010 | Same directive applied twice to same element | Error |
| D011 | `once:model:*` or `once:on:*` | Error |
| D012 | `once:prop` + `prop` duplicate on same element | Error |
| D013 | Directive on non-forwarding component | Error |
| D014 | No `@forward()` when wrapper remainder is non-empty | Error |
| D015 | `@forward()` element type not assignable to declared host S | Error |
| D016 | Fragment argument count/type mismatch | Error |
| D017 | `ref=` variable type incompatible with element/component/directive expose | Error |
| D018 | Unresolved identifier in template expression | Error |
| D019 | Text interpolation `{e}` where e is not Stringifiable | Error |
| D020 | `model:` on native element that is not input/select/textarea | Error |
| D021 | `on`-prefixed input/model/output binding name | Warning |
| D022 | Multiple `@forward()` in same template | Error |
| D023 | `animate:` used on component element (not native) | Error |
| D024 | `animate:` with invalid phase (not `enter` or `leave`) | Error |
| D025 | Duplicate `animate:enter` or `animate:leave` class binding on same element | Error |
| D026 | Duplicate `on:animate:enter` or `on:animate:leave` event binding on same element | Error |
| D027 | `animate:` expression type mismatch (not `string \| string[]`) | Error |
| D028 | `on:animate:` handler type mismatch (not `(event: AnimationCallbackEvent) => void`) | Error |

### 13.1 Diagnostic Examples

Each example shows a violation and the diagnostic it triggers.

#### D001 — Binding primitive used outside `bindings`

`input()`, `output()`, `model()`, and `fragment()` (and their `.required()` / `.once()` variants) are declaration-only primitives. They may only appear as direct property initializers inside a `bindings` object literal passed to `component()`, `directive()`, or `derivation()`.

```ts
// ❌ input() inside setup
const Broken = component({
  setup: () => {
    const name = input<string>();
//               ~~~~~ D001: 'input()' can only be used inside a 'bindings' declaration.
    return @{ <span>{name()}</span> };
  },
});

// ❌ output() inside providers
const AlsoBroken = component({
  bindings: { c: input.required<number>() },
  setup: () => tmpl,
  providers: ({ c }) => {
    const ev = output<void>();
//             ~~~~~~ D001: 'output()' can only be used inside a 'bindings' declaration.
    return [];
  },
});

// ❌ model() at file scope
const email = model<string>();
//            ~~~~~ D001: 'model()' can only be used inside a 'bindings' declaration.

// ❌ fragment() inside directive setup
const broken = directive({
  host: ref<HTMLElement>(),
  setup: ({}, { host }) => {
    const tpl = fragment<void>();
//              ~~~~~~~~ D001: 'fragment()' can only be used inside a 'bindings' declaration.
  },
});

// ✅ All binding primitives inside bindings — valid
const Valid = component({
  bindings: {
    name: input.required<string>(),
    email: model<string>(),
    save: output<void>(),
    children: fragment<void>(),
  },
  setup: ({ name, email, save, children }) => tmpl,
});
```

#### D002 — Unknown attribute/property on native element

```ts
// ❌ "colour" is not a known property of HTMLDivElement
<div colour="red">Hello</div>
//   ~~~~~~ D002: Property 'colour' does not exist on element 'div'.
```

#### D003 — Unknown binding on component

```ts
const UserDetail = component({
  bindings: { user: input.required<User>() },
  setup: ({ user }) => @{ <span>{user().name}</span> },
});

// ❌ "role" is not declared in UserDetail's bindings
<UserDetail user={u()} role="admin" />
//                      ~~~~ D003: 'role' is not a known binding of 'UserDetail'.
```

#### D004 — Duplicate binding (same name, same kind)

```ts
// ❌ "disabled" bound twice
<button disabled={true} disabled={false}>Click</button>
//                      ~~~~~~~~ D004: Duplicate binding 'disabled'.

// ❌ Same event bound twice on a component
<UserDetail user={u()} on:makeAdmin={f1} on:makeAdmin={f2} />
//                                       ~~~~~~~~~~~~ D004: Duplicate binding 'makeAdmin'.
```

#### D005 — Static attribute + dynamic binding clash

```ts
// ❌ "id" appears both as static attribute and dynamic binding
<div id="static" id={dynamicId()}>Content</div>
//                ~~ D005: 'id' is already set as a static attribute.
```

#### D006 — Missing required input/model/fragment

```ts
const Card = component({
  bindings: {
    title: input.required<string>(),
    content: fragment.required<void>(),
  },
  setup: ({ title, content }) => @{
    <h2>{title()}</h2>
    @render(content())
  },
});

// ❌ "title" is required but not provided
<Card>
  <p>Body</p>
</Card>
// D006: Required input 'title' is not provided for 'Card'.
```

#### D007 — Type mismatch

```ts
const Counter = component({
  bindings: { count: input.required<number>() },
  setup: ({ count }) => @{ <span>{count()}</span> },
});

// ❌ string is not assignable to number
<Counter count={'five'} />
//              ~~~~~~ D007: Type 'string' is not assignable to type 'number'.
```

#### D008 — model: bound to non-writable signal

```ts
const name = computed(() => 'readonly');

// ❌ computed() is not writable
<input type="text" model:value={name} />
//                              ~~~~ D008: 'model:value' requires a WritableSignal, but received Signal<string>.
```

#### D009 — Directive host incompatible

```ts
const inputMask = directive({
  host: ref<HTMLInputElement>(),
  bindings: { mask: input.required<string>() },
  setup: () => {},
});

// ❌ HTMLDivElement is not assignable to HTMLInputElement
<div use:inputMask(mask={'###-####'})>Content</div>
//   ~~~~~~~~~~~~~ D009: Directive 'inputMask' requires host 'HTMLInputElement', but applied to 'div' (HTMLDivElement).
```

#### D010 — Same directive applied twice

```ts
// ❌ tooltip appears twice on the same element
<button
  use:tooltip(message={'First'})
  use:tooltip(message={'Second'})>
//~~~~~~~~~~~~ D010: Directive 'tooltip' is already applied to this element.
  Click
</button>
```

#### D011 — once:model: or once:on:

```ts
// ❌ once: is only valid on inputs
<UserDetail once:model:email={email} user={u()} />
//          ~~~~~~~~~~~~~~~~ D011: 'once:' cannot be used with 'model:'. Only inputs support 'once:'.

<UserDetail once:on:makeAdmin={f} user={u()} />
//          ~~~~~~~~~~~~~~~~~ D011: 'once:' cannot be used with 'on:'. Only inputs support 'once:'.
```

#### D012 — once:prop + prop duplicate

```ts
// ❌ same input bound with and without once:
<Counter once:count={5} count={dynamicCount()} />
//                      ~~~~~ D012: 'count' cannot appear both as 'once:count' and 'count'.
```

#### D013 — Directive on non-forwarding component

```ts
const Plain = component({
  bindings: { label: input.required<string>() },
  setup: ({ label }) => @{ <span>{label()}</span> },
});

// ❌ Plain does not declare withForwarding
<Plain label={'hi'} use:tooltip(message={'tip'}) />
//                  ~~~~~~~~~~~~ D013: Cannot apply directive to 'Plain': component does not support forwarding.
```

#### D014 — No @forward() when wrapper remainder is non-empty

```ts
// ❌ Wrapper selects "user" but Target has "email" and "makeAdmin" that need forwarding
const Broken = component.withForwarding(UserDetail, {
  bindings: { user: input.required<User>() },
  setup: ({ user }) => @{
    // Missing @forward() — remaining bindings have nowhere to go
    <UserDetail user={user()} />
//  D014: Component wraps 'UserDetail' but template has no '@forward()' target for remaining bindings: 'email', 'makeAdmin'.
  },
});
```

#### D015 — @forward() element type not assignable to declared host

```ts
const Button = component.withForwarding<HTMLButtonElement>({
  bindings: { label: input.required<string>() },
  setup: ({ label }) => @{
    // ❌ <span> is HTMLSpanElement, not assignable to HTMLButtonElement
    <span @forward()>{label()}</span>
//        ~~~~~~~~~~ D015: Element 'span' (HTMLSpanElement) is not assignable to forwarding host 'HTMLButtonElement'.
  },
});
```

#### D016 — Fragment argument count/type mismatch

```ts
const List = component({
  bindings: {
    items: input.required<string[]>(),
    row: fragment.required<[string, number]>(),
  },
  setup: ({ items, row }) => @{
    @for (item of items(); track item) {
      @render(row(item))
    }
//              ~~~~~~~~ D016: Fragment 'row' expects 2 arguments [string, number], but got 1.
  },
});
```

#### D017 — ref variable type incompatible

```ts
const child = ref<HTMLDivElement>();

const Child = component({
  setup: () => {
    return {
      template: @{ <span>hi</span> },
      expose: { value: signal(0).asReadonly() },
    };
  },
});

// ❌ ref expects { value: Signal<number> } | undefined, got HTMLDivElement | undefined
<Child ref={child} />
//          ~~~~~ D017: Type 'Ref<HTMLDivElement | undefined>' is not assignable. Expected 'Ref<{ value: Signal<number> } | undefined>'.
```

#### D018 — Unresolved identifier

```ts
export const App = component({
  setup: () => @{
    // ❌ "userName" is not in any scope
    <h1>{userName}</h1>
//       ~~~~~~~~ D018: Cannot find name 'userName'.
  },
});
```

#### D019 — Text interpolation with non-Stringifiable type

```ts
const data = signal({ x: 1, y: 2 });

// ❌ {x: number, y: number} has no toString() override — not Stringifiable
<p>{data()}</p>
//  ~~~~~~ D019: Type '{ x: number; y: number }' is not assignable to 'Stringifiable'.
```

#### D020 — model: on non-modelable native element

```ts
// ❌ <div> does not support model:
<div model:value={text}>Content</div>
//   ~~~~~~~~~~~ D020: 'model:' is only valid on 'input', 'select', or 'textarea' elements.
```

#### D021 — on-prefixed binding name (Warning)

```ts
const Form = component({
  bindings: {
    onSubmit: output<void>(),  // ← name starts with "on"
  },
  setup: ({ onSubmit }) => @{
    <button on:click={() => onSubmit.emit()}>Submit</button>
  },
});
// D021 (warning): Binding name 'onSubmit' starts with 'on'. Consider renaming to 'submit' to avoid confusion with event syntax.
```

#### D022 — Multiple @forward() in same template

```ts
const Broken = component.withForwarding<HTMLElement>({
  bindings: { label: input.required<string>() },
  setup: ({ label }) => @{
    // ❌ Two @forward() markers
    <div @forward()>{label()}</div>
    <span @forward()>extra</span>
//        ~~~~~~~~~~ D022: Only one '@forward()' is allowed per component template.
  },
});
```

#### D023 — `animate:` on component element

```ts
const Card = component({
  bindings: { title: input.required<string>() },
  setup: ({ title }) => @{ <h2>{title()}</h2> },
});

// ❌ animate: is only valid on native elements
<Card title={'hi'} animate:enter={'fade-in'} />
//                  ~~~~~~~~~~~~~~ D023: 'animate:' can only be used on native elements, not component 'Card'.
```

#### D024 — Invalid animate phase

```ts
// ❌ "show" is not a valid phase
<div animate:show={'fade-in'}>Content</div>
//   ~~~~~~~~~~~~~ D024: Invalid animation phase 'show'. Only 'enter' and 'leave' are supported.
```

#### D025 — Duplicate animate class binding

```ts
// ❌ animate:enter bound twice
<div animate:enter={'fade-in'} animate:enter={'slide-in'}>Content</div>
//                             ~~~~~~~~~~~~~~ D025: Duplicate 'animate:enter' binding.
```

#### D026 — Duplicate animate event binding

```ts
// ❌ on:animate:leave bound twice
<div on:animate:leave={fn1} on:animate:leave={fn2}>Content</div>
//                          ~~~~~~~~~~~~~~~~~ D026: Duplicate 'on:animate:leave' binding.
```

#### D027 — Animate class type mismatch

```ts
const count = signal(42);

// ❌ number is not a valid animate class value
<div animate:enter={count()}>Content</div>
//                  ~~~~~~~ D027: Type 'number' is not assignable to 'string | string[]'.
```

#### D028 — Animate event handler type mismatch

```ts
function wrongHandler(x: string) {}

// ❌ handler signature doesn't match AnimationCallbackEvent
<div on:animate:enter={wrongHandler}>Content</div>
//                     ~~~~~~~~~~~~ D028: Type '(x: string) => void' is not assignable to '(event: AnimationCallbackEvent) => void'.
```

---

## 14. Auxiliary Definitions

```
FragmentArgs<T> =
  T = void                        → []
  T is tuple [T₁, ..., Tₙ]      → [T₁, ..., Tₙ]
  T is array A[] (non-tuple)     → [A[]]
  T is readonly array (non-tuple) → [readonly A[]]
  otherwise                       → [T]


Narrow(T) = Exclude<T, null | undefined | false | 0 | "">


Stringifiable = string | number | boolean | null | undefined
              | { toString(): string }
```

---

## 15. Well-Formedness Invariants

1. **Binding primitives are declaration-only**: Calls to `input()`, `output()`, `model()`, `fragment()` (and variants) are valid only as direct property values inside a `bindings` object. The compiler rejects them in any other syntactic position (setup body, providers factory, file scope, helper functions).
2. **Single @forward()**: At most one per component template.
3. **Scope containment**: `@derive` and `@let` names are block-scoped to their enclosing control-flow block.
4. **Ref availability**: Refs resolve after `afterNextRender` — reading before yields `undefined`.
5. **Implicit children**: Nested content auto-satisfies `children` fragment binding. Cannot also bind `children=` explicitly.
6. **Derivation is view-scoped**: Each `@derive` instance follows the lifecycle of its enclosing embedded view. In `@for`, each iteration owns an independent instance.
7. **@forward() host check**: The actual native element at the `@forward()` site must be assignable to the declared forwarding host type S.
