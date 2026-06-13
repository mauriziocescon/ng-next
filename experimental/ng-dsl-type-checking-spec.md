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

## 5. Directive Application

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

### 5.1 Host Compatibility

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

## 6. @forward() Marker

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

## 7. @derive

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

## 8. Fragment & @render

### 8.1 Inline @fragment Definition

```
FRAGMENT-DEF
─────────────────────────────────────────────────────────────────
@fragment name(p₁: T₁, ..., pₙ: Tₙ) { children }

Γ' = Γ ∪ { p₁: T₁, ..., pₙ: Tₙ }
Γ' ⊢ children ✓

Fragment is auto-passed to matching fragment binding on parent component.
─────────────────────────────────────────────────────────────────
```

### 8.2 Implicit children

```
IMPLICIT-CHILDREN
─────────────────────────────────────────────────────────────────
Nested content inside <Component>...</Component>
Lowered to FragmentNode { name: "children", parameters: [] }
Satisfies `children: fragment<void>()` or `children: fragment.required<void>()`
─────────────────────────────────────────────────────────────────
```

### 8.3 @render Invocation

```
RENDER
─────────────────────────────────────────────────────────────────
Γ ⊢ expr : FragmentBinding<T>

Argument checking uses FragmentArgs<T>:
  T = void                       → args = []
  T = tuple [T₁, ..., Tₙ]      → args = [e₁, ..., eₙ] where eᵢ ⊑ Tᵢ
  T = array A[] (non-tuple)     → args = [e] where e ⊑ A[]
  T = other                     → args = [e] where e ⊑ T
─────────────────────────────────────────────────────────────────
Γ ⊢ @render(expr(args)) ✓


RENDER-OPTIONAL-GUARD
─────────────────────────────────────────────────────────────────
Γ ⊢ expr : OptionalFragmentBinding<T> | undefined
Must guard: @render(expr?.(...))  or  @if (expr) { @render(expr(...)) }
─────────────────────────────────────────────────────────────────
```

---

## 9. Control Flow

### 9.1 @if

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

### 9.2 @for

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

### 9.3 @switch

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

## 10. @let

```
LET
─────────────────────────────────────────────────
Γ ⊢ value : T
Γ' = Γ ∪ { name : T }
─────────────────────────────────────────────────
Γ ⊢ @let name = expr;   producing Γ'
```

---

## 11. Ref (Template-Side Validation)

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

## 12. Binding Prefix & Modifier Validation

| Prefix / Modifier | Target | Repeatable | Checker Rule |
|---|---|---|---|
| `bind:` (or omitted) | native, component | No (per prop) | Resolved as input binding |
| `model:` | native, component | No (per prop) | Two-way. Native: `input`/`select`/`textarea` only |
| `on:` | native, component | No (per event) | Event handler |
| `once:` | inputs only | No (per prop) | Input only. `once:model:*` / `once:on:*` → error |
| `class:` | native | Yes | Conditional class |
| `style:` | native | Yes | Conditional style |
| `use:` | native, forwarding comp | Yes (diff dirs) | Same directive only once per element |
| `:when` | `use:` directive | No (per dir) | Condition must be `boolean` |
| `:ref` | `use:` directive | No (per dir) | Target must match directive expose |
| `ref` | native, component | No | Target must match element/component expose |
| `@forward()` | native (in comp template) | No (one per template) | Forwarding target marker |

---

## 13. Diagnostic Summary

| Code | Condition | Severity |
|------|-----------|----------|
| D001 | Unknown attribute/property on native element | Error |
| D002 | Unknown binding on component | Error |
| D003 | Duplicate binding (same name, same kind) | Error |
| D004 | Static attribute + dynamic binding clash (same name) | Error |
| D005 | Missing required input/model/fragment | Error |
| D006 | Type mismatch (expression not assignable to binding type) | Error |
| D007 | `model:` bound to non-writable signal | Error |
| D008 | Directive host incompatible with element/forwarded type | Error |
| D009 | Same directive applied twice to same element | Error |
| D010 | `once:model:*` or `once:on:*` | Error |
| D011 | `once:prop` + `prop` duplicate on same element | Error |
| D012 | Directive on non-forwarding component | Error |
| D013 | No `@forward()` when wrapper remainder is non-empty | Error |
| D014 | `@forward()` element type not assignable to declared host S | Error |
| D015 | Fragment argument count/type mismatch | Error |
| D016 | `ref=` variable type incompatible with element/component/directive expose | Error |
| D017 | Unresolved identifier in template expression | Error |
| D018 | Text interpolation `{e}` where e is not Stringifiable | Error |
| D019 | `model:` on native element that is not input/select/textarea | Error |
| D020 | `on`-prefixed input/model/output binding name | Warning |
| D021 | Multiple `@forward()` in same template | Error |

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

1. **Single @forward()**: At most one per component template.
2. **Scope containment**: `@derive` and `@let` names are block-scoped to their enclosing control-flow block.
3. **Ref availability**: Refs resolve after `afterNextRender` — reading before yields `undefined`.
4. **Implicit children**: Nested content auto-satisfies `children` fragment binding. Cannot also bind `children=` explicitly.
5. **Derivation is view-scoped**: Each `@derive` instance follows the lifecycle of its enclosing embedded view. In `@for`, each iteration owns an independent instance.
6. **@forward() host check**: The actual native element at the `@forward()` site must be assignable to the declared forwarding host type S.
