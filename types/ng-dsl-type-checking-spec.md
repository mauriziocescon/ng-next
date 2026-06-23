# Type Checking Judgment Specification

## Angular Signal Components — Template DSL

This document defines what the **template type checker** must verify. It covers
only constructs that live inside the template DSL — things TypeScript cannot
check because they are not plain TS expressions.

The parser, lowering pipeline, and non-template TypeScript helper APIs are out
of scope except where their output is needed by the checker. `inject()`,
`provide()`, `injectionToken()`, and opt-in `satisfies` checks are specified by
the TypeScript types/tests, not by this template-node judgment document.

The expected template pipeline is:

1. parse `@{ ... }` into `TemplateAST`;
2. assign the markup literal the type `TemplateMarkup<ConcreteTemplateAST>`;
3. check the `TemplateAST` using the judgments below;
4. lower the checked tree to runtime instructions.

Normative language follows RFC 2119 style: **must** / **must not** are required
for conformance, while **may** describes implementation freedom.

---

## Notation

| Symbol | Meaning |
|--------|---------|
| `Γ` | Type environment (scope) |
| `Γ ⊢ e : T` | Under Γ, expression e has type T |
| `Γ ⊢ node ✓` | Under Γ, template node type-checks |
| `B(C)` | Bindings record of component/directive/derivation C |
| `E(C)` | Expose type of C |
| `T(C)` | Template markup type of component C |
| `H(D)` | Host element type of directive D |
| `P(C)` | Proxy surface type of component C (`never` if none) |
| `I(tag)` | Intrinsic element host type (e.g. `I("button") = HTMLButtonElement`) |
| `⊑` | Assignability (subtype) |
| `≡` | Exact type equality |

Type-level component metadata follows the public helper types:

```
C : ComponentInstance<B, E, S, M>
B = bindings record
E = expose type (`void` when absent)
S = proxy surface type (`never` when absent)
M = TemplateMarkup<TAst>
T(C) = M
TemplateAstOf<M> = TAst
```

---

## 1. Scope Resolution

```
SCOPE-RESOLVE
─────────────────────────────────────────────────────────────────
Γ = Γ_template ∪ Γ_setup ∪ Γ_module ∪ Γ_global

Lookup priority: Γ_template > Γ_setup > Γ_module > Γ_global
First match wins.
```

- `Γ_template`: `@let`, `@derive`, `@for` item + context variables,
  `@fragment` parameters, `@if` aliases
- `Γ_setup`: variables/functions in the lexical setup scope captured by the
  `@{ ... }` markup literal
- `Γ_module`: top-level imports, constants, enums, interfaces
- `Γ_global`: DOM globals, built-in JS types

---

## 2. Expression Typing (Template Expressions)

Template expressions use `{expr}` syntax. The checker must type-check these
against the scope.

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
Γ ⊢ e : T
─────────────────────────────────────────────────
Γ ⊢ {e} ✓
```

### 2.1 Markup Literal Typing

```
MARKUP-LITERAL
─────────────────────────────────────────────────────────────────
parse(@{ source }) = TAst
TAst : TemplateAST
─────────────────────────────────────────────────────────────────
Γ ⊢ @{ source } : TemplateMarkup<TAst>
```

`TemplateMarkup<TAst>` is opaque nominal markup. It is assignable to the
generic `TemplateMarkup` API, but a generic `TemplateMarkup` must not be
treated as a specific `TemplateMarkup<TAst>`.

---

## 3. Native Element

```
INTRINSIC-ELEMENT
─────────────────────────────────────────────────────────────────
tag ∈ IntrinsicElements
H = I(tag)

∀ attr ∈ node.attributes:    CHECK-NATIVE-TEXT-ATTR(Γ, H, attr)
∀ input ∈ node.inputs:       CHECK-NATIVE-INPUT(Γ, H, input)
∀ output ∈ node.outputs:     CHECK-NATIVE-OUTPUT(Γ, H, output)
∀ model ∈ node.models:       CHECK-NATIVE-MODEL(Γ, H, model)
∀ anim ∈ node.animations:   CHECK-ANIMATE-BINDING(Γ, anim)
∀ dir ∈ node.directives:     CHECK-DIRECTIVE-USE(Γ, H, {node}, dir)
∀ ref ∈ node.references:     CHECK-NATIVE-REF(Γ, H, ref)
NO-DUPLICATE-BINDINGS(node)
NO-STATIC-DYNAMIC-CLASH(node)
─────────────────────────────────────────────────────────────────
Γ ⊢ <tag ...> ✓


CHECK-NATIVE-TEXT-ATTR
─────────────────────────────────────────────────
attr.name ∈ Attrs(H)
  ∨ (attr.name ∈ Props(H) ∧ string ⊑ Props(H)[attr.name])
─────────────────────────────────────────────────


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

### 3.2 Binding Identity Constraints

```
NO-DUPLICATE-BINDINGS
─────────────────────────────────────────────────
∀ name: |{b ∈ inputs ∪ models | b.name = name}| ≤ 1
∀ name: |{b ∈ outputs | b.name = name}| ≤ 1
∀ name: |{b ∈ fragments | b.name = name}| ≤ 1
|references| ≤ 1
class: and style: bindings are repeatable
animate: and on:animate: use ANIMATE-CONSTRAINTS
use: directives use CHECK-DIRECTIVE-USE uniqueness
─────────────────────────────────────────────────


NO-STATIC-DYNAMIC-CLASH
─────────────────────────────────────────────────
∀ name ∈ attributes:  name ∉ {b.name | b ∈ inputs}
  UNLESS native element and name ∈ {"class", "style"}
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

where AnimationCallbackEvent = {
  target: Element;
  animationComplete: VoidFunction;
}


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
C = resolve(tag, Γ)     C : ComponentInstance<B, E, S, M>

∀ attr ∈ node.attributes: CHECK-COMP-TEXT-INPUT(Γ, B, attr)
∀ input ∈ node.inputs:   CHECK-COMP-INPUT(Γ, B, input)
∀ model ∈ node.models:   CHECK-COMP-MODEL(Γ, B, model)
∀ output ∈ node.outputs: CHECK-COMP-OUTPUT(Γ, B, output)
∀ frag ∈ node.fragments: CHECK-COMP-FRAGMENT(Γ, B, frag)
∀ ref ∈ node.references: CHECK-COMP-REF(Γ, E, ref)
∀ dir ∈ node.directives: CHECK-COMP-DIRECTIVE(Γ, C, S, dir)
CHECK-REQUIRED-COMP(B, node)
NO-DUPLICATE-BINDINGS(node)
NO-STATIC-DYNAMIC-CLASH(node)
NO-UNKNOWN-BINDINGS(B, node)
CHILDREN-IMPLICIT-ONLY(node)
─────────────────────────────────────────────────────────────────
Γ ⊢ <C ...> ✓


CHECK-COMP-TEXT-INPUT
─────────────────────────────────────────────────
attr.name ∈ keys(B)
B[attr.name] : InputSignal<T>
string ⊑ T
─────────────────────────────────────────────────


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
frag.name ≠ "children"
B[frag.name] : FragmentBinding<T>
∀ param ∈ frag.parameters:  param matches FragmentArgs<T> positionally
Γ' = Γ ∪ { paramᵢ.name : Tᵢ }
Γ' ⊢ frag.children ✓
─────────────────────────────────────────────────


CHECK-COMP-REF
─────────────────────────────────────────────────
ref.target.name = x
if E = void:  x : Ref<undefined> ∈ Γ   ∨   x : Ref<[]> ∈ Γ
else:         x : Ref<E | undefined> ∈ Γ  ∨  x : Ref<E[]> ∈ Γ
─────────────────────────────────────────────────


CHECK-COMP-DIRECTIVE
─────────────────────────────────────────────────
if S = never:
  node.directives must be ∅   (error: no forwarding support)
else:
  R = FORWARD-TARGETS(C)
  ∀ dir: CHECK-DIRECTIVE-USE(Γ, S, R, dir)
─────────────────────────────────────────────────


CHECK-REQUIRED-COMP
─────────────────────────────────────────────────
∀ k ∈ keys(B):
  B[k] : InputSignal.required<T>    → k ∈ provided_inputs ∪ forwarded, otherwise D006
  B[k] : ModelSignal.required<T>    → k ∈ provided_models ∪ forwarded, otherwise D006
  B[k] : RequiredFragmentBinding<T> →
    if k = "children": has_nested_content ∨ k ∈ forwarded, otherwise D006
    else:              k ∈ provided_fragments ∪ forwarded, otherwise D006
─────────────────────────────────────────────────


CHILDREN-IMPLICIT-ONLY
─────────────────────────────────────────────────
No explicit component binding may target "children" → D035.
Nested content is the only direct authoring form for a children fragment.
─────────────────────────────────────────────────


NO-UNKNOWN-BINDINGS
─────────────────────────────────────────────────
∀ attr ∈ node.attributes:  attr.name ∈ keys(B)
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
  (Applies to input, model, or output bindings named e.g.
   onInput, onModel, onEvent)
─────────────────────────────────────────────────
```

### 4.3 Component Declaration Contracts

These checks are TypeScript API well-formedness rules rather than template-node
judgments. They align with `component(...)`, `component.proxy(...)`, `component.wrap(...)`,
and their helper types.

```
SETUP-RETURN
─────────────────────────────────────────────────────────────────
setup returns either:
  M
  { template: M }
  { template: M, expose: E }
where M : TemplateMarkup<TAst>
─────────────────────────────────────────────────────────────────
component(...) : ComponentInstance<B, E, S, M>
```

```
PROVIDERS-INPUTS-ONLY
─────────────────────────────────────────────────────────────────
providers receives Pick<B, input keys only>
Models, outputs, and fragments are excluded.
─────────────────────────────────────────────────────────────────
```

```
RESERVED-CHILDREN-BINDING
─────────────────────────────────────────────────────────────────
if "children" ∈ keys(B):
  B["children"] : FragmentBinding<T>
otherwise error
─────────────────────────────────────────────────────────────────
```

```
PROXY-SURFACE
─────────────────────────────────────────────────────────────────
component.proxy<S>(config)
S ⊑ HTMLElement
S must be explicit
result : ComponentInstance<B, E, S, M>
─────────────────────────────────────────────────────────────────
```

```
WRAPPER-SELECTION
─────────────────────────────────────────────────────────────────
component.wrap(Target, config)
Target : ComponentInstance<B_Target, E_Target, S_Target, M_Target>
Selected = B(config)

keys(Selected) ⊆ keys(B_Target)
∀ k ∈ keys(Selected):
  BindingKind(Selected[k]) ≡ BindingKind(B_Target[k])
  Selected[k] ≡ B_Target[k]

setup receives SetupBindings<Selected>
providers receives Pick<Selected, input keys only>
result : ComponentInstance<B_Target, E, S_Target, M>
─────────────────────────────────────────────────────────────────
```

The wrapper form is inference-only: explicit generics must not be accepted.

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
if E = void:  x : Ref<undefined> ∈ Γ  ∨  x : Ref<[]> ∈ Γ
else:         x : Ref<E | undefined> ∈ Γ  ∨  x : Ref<E[]> ∈ Γ
─────────────────────────────────────────────────


REF-ON-DIRECTIVE
─────────────────────────────────────────────────
use:D(...):ref={x}    where E(D) = E_D
if E_D = void:  x : Ref<undefined> ∈ Γ  ∨  x : Ref<[]> ∈ Γ
else:           x : Ref<E_D | undefined> ∈ Γ  ∨  x : Ref<E_D[]> ∈ Γ
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
UNIQUE:       D appears at most once on each element in R_host

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

∀ frag ∈ dir.fragments: CHECK-DIR-FRAGMENT(Γ, B_D, frag)
CHECK-REQUIRED-DIR(B_D, dir)
NO-UNKNOWN-BINDINGS(B_D, dir)

if dir.when:
  Γ ⊢ dir.when.condition : boolean

if dir.ref:
  x = dir.ref.target.name
  if E_D = void:  x : Ref<undefined> ∈ Γ  ∨  x : Ref<[]> ∈ Γ
  else:           x : Ref<E_D | undefined> ∈ Γ  ∨  x : Ref<E_D[]> ∈ Γ
─────────────────────────────────────────────────────────────────
Γ ⊢ use:D(...) ✓
```

`H_host` is the resolved host type from `NATIVE-HOST` or `PROXY-SURFACE-HOST`.
`R_host` is the resolved host element set.

Directive fragment syntax is local to the directive application:

```
use:D(
  @fragment name(p₁: T₁, ..., pₙ: Tₙ) { children }
)
```

### 6.1 Host Compatibility

```
NATIVE-HOST
─────────────────────────────────────────────────
Element is native: H = I(tag)
Directive host: H_D
H ⊑ H_D → compatible
─────────────────────────────────────────────────


PROXY-SURFACE-HOST
─────────────────────────────────────────────────
Component C: P(C) = S (S ≠ never)
Directive host: H_D
S ⊑ H_D → compatible
─────────────────────────────────────────────────


NO-FORWARDING
─────────────────────────────────────────────────
P(C) = never → directive on component tag is an error
─────────────────────────────────────────────────
```

### 6.2 Required Directive Bindings

```
CHECK-REQUIRED-DIR
─────────────────────────────────────────────────
∀ k ∈ keys(B_D):
  B_D[k] : InputSignal.required<T>    → k ∈ provided_inputs, otherwise D038
  B_D[k] : ModelSignal.required<T>    → k ∈ provided_models, otherwise D038
  B_D[k] : RequiredFragmentBinding<T> → k ∈ provided_fragments, otherwise D038
─────────────────────────────────────────────────
```

```
CHECK-DIR-FRAGMENT
─────────────────────────────────────────────────
frag.name ∈ keys(B_D)
B_D[frag.name] : FragmentBinding<T>
frag.parameters match FragmentArgs<T> positionally, otherwise D016
Γ' = Γ ∪ { paramᵢ.name : Tᵢ }
Γ' ⊢ frag.children ✓
─────────────────────────────────────────────────
```

### 6.3 Resolved Host Element

A directive is unique per resolved host element. Native applications resolve to
the element itself. Proxy and wrapped-proxy applications resolve to the native
`@forward()` placement(s). Directives written directly on that native element
and directives delivered through a proxy all participate in the same uniqueness
check.

```
RESOLVED-HOSTS
─────────────────────────────────────────────────
Native element N:
  H_host = I(tag(N))
  R_host = {N}

Component element C:
  H_host = P(C)
  R_host = FORWARD-TARGETS(C)
─────────────────────────────────────────────────


DIRECTIVE-SET-UNIQUENESS
─────────────────────────────────────────────────
For each resolved host element H:
  LocalDirs(H)    = directives written directly on H
  ForwardedDirs(H) = directives delivered from proxy/wrapped component call sites to H
  AppliedDirs(H) = LocalDirs(H) ++ ForwardedDirs(H)   (ordered multiset)

For each directive identity D:
  count(D, AppliedDirs(H)) ≤ 1, otherwise D010
─────────────────────────────────────────────────
```

---

## 7. @forward() Marker

```
FORWARD-PROXY
─────────────────────────────────────────────────────────────────
Enclosing component declared by component.proxy<S>(...)
For each native element with @forward(): H = I(tag)
H ⊑ S   (each placement compatible with declared proxy surface)
If no @forward() placement exists → error
Forwarding payload is broadcast to every @forward() target in the checked render path
Alternative control-flow branches are checked independently
─────────────────────────────────────────────────────────────────


FORWARD-WRAP
─────────────────────────────────────────────────────────────────
Enclosing component declared by component.wrap(Target, ...)
For each component element with @forward(): element is Target
Remainder = B(Target) \ Selected
Explicit bindings on each @forward() element override Remainder for same key
Each @forward() element receives Remainder and any inherited proxy payload
if (|Remainder| > 0 ∨ P(Target) ≠ never) ∧ no @forward() → error
if any @forward() exists: P(result) = P(Target)
Forwarding payload is broadcast to every @forward() target in the checked render path
Alternative control-flow branches are checked independently
─────────────────────────────────────────────────────────────────


FORWARD-INVALID
─────────────────────────────────────────────────────────────────
Marked node cannot consume the enclosing component's forwarding payload
→ error
─────────────────────────────────────────────────────────────────


COLLISION-PRECEDENCE
─────────────────────────────────────────────────────────────────
∀ key ∈ (Explicit ∩ Remainder):
  Explicit wins regardless of source order.
  Applies uniformly to all binding kinds.
─────────────────────────────────────────────────────────────────


FORWARD-TARGETS
─────────────────────────────────────────────────────────────────
FORWARD-TARGETS(C) = @forward() placements reachable in the checked render path of T(C)
If multiple @forward() placements are reachable in the same render path,
the forwarding payload is delivered to all of them.
If @forward() placements are in alternative control-flow branches, each branch
must independently satisfy the same compatibility and payload rules.
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

node.models = ∅, otherwise D040
node.outputs = ∅, otherwise D040
node.fragments = ∅, otherwise D040
node.directives = ∅, otherwise D040
CHECK-REQUIRED-DERIVE(B_D, node)
NO-UNKNOWN-BINDINGS(B_D, node)

Γ' = Γ ∪ { node.name : Signal<T> }
─────────────────────────────────────────────────────────────────
Γ ⊢ @derive name = D(...)    producing Γ'
```

Scope: block-scoped to enclosing control-flow block. Not accessible outside.

```
CHECK-REQUIRED-DERIVE
─────────────────────────────────────────────────────────────────
∀ k ∈ keys(B_D):
  B_D[k] : InputSignal.required<T> → k ∈ provided_inputs, otherwise D039
─────────────────────────────────────────────────────────────────
```

---

## 9. Fragment & @render

### 9.1 Inline @fragment Definition

```
FRAGMENT-DEF
─────────────────────────────────────────────────────────────────
@fragment name(p₁: T₁, ..., pₙ: Tₙ) { children }

name ≠ "children"; otherwise D035
Parent component P has binding name: FragmentBinding<T>; otherwise D036
No explicit fragment binding with the same name exists on P; otherwise D036
No other inline @fragment with the same name exists under the same P; otherwise D037
parameters match FragmentArgs<T> positionally, otherwise D016
Γ' = Γ ∪ { p₁: T₁, ..., pₙ: Tₙ }
Γ' ⊢ children ✓

The fragment is auto-passed to P[name].
─────────────────────────────────────────────────────────────────
```

### 9.2 Implicit children

```
IMPLICIT-CHILDREN
─────────────────────────────────────────────────────────────────
Nested content inside <Component>...</Component>
No explicit children binding exists on the same component element
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
| `use:` | native, proxy comp, wrapped proxy comp | Yes (diff dirs) | Same directive only once per resolved host element |
| `:when` | `use:` directive | No (per dir) | Condition must be `boolean` |
| `:ref` | `use:` directive | No (per dir) | Target must match directive expose |
| `ref` | native, component | No | Target must match element/component expose |
| `@forward()` | compatible native or wrapped component target | Yes, if each placement conforms | Forwarding payload placement marker |

---

## 13. Diagnostic Summary

| Code | Condition | Severity |
|------|-----------|----------|
| D001 | `input()`/`output()`/`model()`/`fragment()` called outside `bindings` | Error |
| D002 | Unknown attribute/property on native element | Error |
| D003 | Unknown binding on component | Error |
| D004 | Duplicate binding identity, including duplicate refs or fragments | Error |
| D005 | Static attribute + dynamic binding clash (same name) | Error |
| D006 | Missing required component input/model/fragment | Error |
| D007 | Type mismatch (expression not assignable to binding type) | Error |
| D008 | `model:` bound to non-writable signal | Error |
| D009 | Directive host incompatible with element/proxy surface | Error |
| D010 | Same directive applied twice to same resolved host element | Error |
| D011 | `once:model:*` or `once:on:*` | Error |
| D012 | `once:prop` + `prop` duplicate on same element | Error |
| D013 | Directive on non-proxy component | Error |
| D014 | No `@forward()` when wrapper has a binding remainder or inherited proxy payload | Error |
| D015 | `@forward()` element type not assignable to declared proxy surface S | Error |
| D016 | Fragment argument count/type mismatch | Error |
| D017 | `ref=` variable type incompatible with element/component/directive expose | Error |
| D018 | Unresolved identifier in template expression | Error |
| D020 | `model:` on native element that is not input/select/textarea | Error |
| D021 | `on`-prefixed input/model/output binding name | Warning |
| D023 | `animate:` used on component element (not native) | Error |
| D024 | `animate:` with invalid phase (not `enter` or `leave`) | Error |
| D025 | Duplicate `animate:enter` or `animate:leave` class binding on same element | Error |
| D026 | Duplicate `on:animate:enter` or `on:animate:leave` event binding on same element | Error |
| D027 | `animate:` expression type mismatch (not `string \| string[]`) | Error |
| D028 | `on:animate:` handler type mismatch (not `(event: AnimationCallbackEvent) => void`) | Error |
| D029 | Reserved `children` binding is not a fragment binding | Error |
| D030 | Wrapper selects a binding key not present on target | Error |
| D031 | Wrapper selected binding kind differs from target | Error |
| D032 | Wrapper selected binding type is not exactly the target type | Error |
| D033 | `providers` reads model/output/fragment bindings | Error |
| D034 | Component setup does not return `TemplateMarkup` or `{ template }` | Error |
| D035 | Explicit `children` binding on a component element | Error |
| D036 | Inline `@fragment` has no matching parent fragment binding or conflicts with explicit same-name binding | Error |
| D037 | Duplicate inline `@fragment` name under the same parent component | Error |
| D038 | Missing required directive input/model/fragment | Error |
| D039 | Missing required derivation input | Error |
| D040 | Derivation uses a non-input binding form | Error |

`D019` and `D022` are retired and intentionally unused.

### 13.1 Diagnostic Examples

Each example shows a violation and the diagnostic it triggers.

#### D001 — Binding primitive used outside `bindings`

`input()`, `output()`, `model()`, and `fragment()` (and their `.required()`
variants) are declaration-only primitives. They may only appear as direct
property initializers inside a `bindings` object literal passed to
`component()`, `directive()`, or `derivation()`.

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

#### D004 — Duplicate binding identity

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

#### D006 — Missing required component input/model/fragment

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
// ❌ tooltip appears twice on the same resolved host element
<button
  use:tooltip(message={'First'})
  use:tooltip(message={'Second'})>
//~~~~~~~~~~~~ D010: Directive 'tooltip' is already applied to this resolved host element.
  Click
</button>
```

Proxying is just another path to the same resolved host element:

```ts
const Button = component.proxy<HTMLButtonElement>({
  setup: () => @{ <button @forward()>Click</button> },
});

// ❌ both tooltip instances land on Button's internal <button>
<Button use:tooltip(message={'First'}) use:tooltip(message={'Second'}) />
//      ~~~~~~~~~~~~~ D010: Directive 'tooltip' is already applied to this resolved host element.
```

The same check includes directives already written on the forwarded element:

```ts
const Button = component.proxy<HTMLButtonElement>({
  setup: () => @{ <button @forward() use:tooltip(message={'Internal'})>Click</button> },
});

// ❌ forwarded tooltip collides with the internal tooltip
<Button use:tooltip(message={'External'}) />
//      ~~~~~~~~~~~~~ D010: Directive 'tooltip' is already applied to this resolved host element.
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

#### D013 — Directive on non-proxy component

```ts
const Plain = component({
  bindings: { label: input.required<string>() },
  setup: ({ label }) => @{ <span>{label()}</span> },
});

// ❌ Plain does not declare component.proxy
<Plain label={'hi'} use:tooltip(message={'tip'}) />
//                  ~~~~~~~~~~~~ D013: Cannot apply directive to 'Plain': component does not expose a proxy surface.
```

#### D014 — No @forward() when wrapper has a payload

```ts
// ❌ Wrapper selects "user" but Target has "email" and "makeAdmin" that need forwarding
const Broken = component.wrap(UserDetail, {
  bindings: { user: input.required<User>() },
  setup: ({ user }) => @{
    // Missing @forward() — wrapper payload has nowhere to go
    <UserDetail user={user()} />
//  D014: Component wraps 'UserDetail' but template has no '@forward()' target for payload: 'email', 'makeAdmin'.
  },
});
```

#### D015 — @forward() element type not assignable to declared proxy surface

```ts
const Button = component.proxy<HTMLButtonElement>({
  bindings: { label: input.required<string>() },
  setup: ({ label }) => @{
    // ❌ <span> is HTMLSpanElement, not assignable to HTMLButtonElement
    <span @forward()>{label()}</span>
//        ~~~~~~~~~~ D015: Element 'span' (HTMLSpanElement) is not assignable to proxy surface 'HTMLButtonElement'.
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

const withPreview = directive({
  host: ref<HTMLElement>(),
  bindings: { preview: fragment.required<[Item]>() },
  setup: () => {},
});

<button use:withPreview(
  @fragment preview() {
//          ~~~~~~~ D016: Fragment 'preview' expects 1 argument [Item], but got 0.
    <span>Preview</span>
  }
) />
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

#### D029 — Reserved `children` binding is not a fragment

```ts
const Broken = component({
  bindings: {
    children: input<string>(),
//  ~~~~~~~~ D029: Reserved binding 'children' must use fragment().
  },
  setup: () => tmpl,
});
```

#### D030-D032 — Invalid wrapper binding selection

```ts
const Target = component({
  bindings: {
    user: input.required<User>(),
    save: output<void>(),
  },
  setup: () => tmpl,
});

component.wrap(Target, {
  bindings: {
    role: input<string>(),
//  ~~~~ D030: 'role' is not a binding of Target.
  },
  setup: () => tmpl,
});

component.wrap(Target, {
  bindings: {
    save: input<void>(),
//  ~~~~ D031: Binding kind must match Target's output binding.
  },
  setup: () => tmpl,
});

component.wrap(Target, {
  bindings: {
    user: input.required<string>(),
//  ~~~~ D032: Binding type must exactly match Target's user binding.
  },
  setup: () => tmpl,
});
```

#### D033 — Providers can read inputs only

```ts
const Broken = component({
  bindings: {
    value: input.required<string>(),
    selected: model<boolean>(),
    saved: output<void>(),
  },
  setup: () => tmpl,
  providers: (inputs) => {
    inputs.selected;
//  ~~~~~~~~~~~~~~~ D033: Providers receive inputs only.
    return [];
  },
});
```

#### D034 — Invalid setup return

```ts
component({
  setup: () => ({ expose: {} }),
//          ~~~~~~~~~~~~~~~~~~ D034: setup must return TemplateMarkup or { template }.
});
```

#### D035 — Explicit children fragment

```ts
// ❌ children is implicit-only
<Card children={body} />
//    ~~~~~~~~ D035: 'children' is provided by nested content, not by an explicit binding.

<Card>
  @fragment children() {
//          ~~~~~~~~ D035: Inline @fragment cannot target reserved 'children'.
    <p>Body</p>
  }
</Card>
```

#### D036 — Inline fragment has no matching parent binding

```ts
const Card = component({
  bindings: { title: input.required<string>() },
  setup: () => tmpl,
});

<Card title={'Hello'}>
  @fragment footer() {
//          ~~~~~~ D036: 'Card' has no fragment binding named 'footer'.
    <small>Footer</small>
  }
</Card>
```

#### D037 — Duplicate inline fragment

```ts
const List = component({
  bindings: { row: fragment.required<[Item]>() },
  setup: () => tmpl,
});

<List>
  @fragment row(item: Item) { <span>{item.name}</span> }
  @fragment row(item: Item) { <strong>{item.name}</strong> }
//          ~~~ D037: Inline fragment 'row' is already provided for 'List'.
</List>
```

#### D038 — Missing required directive binding

```ts
const tooltip = directive({
  host: ref<HTMLElement>(),
  bindings: { message: input.required<string>() },
  setup: () => {},
});

// ❌ required directive input missing
<button use:tooltip()>Save</button>
//      ~~~~~~~~~~~~~ D038: Required input 'message' is not provided for directive 'tooltip'.
```

#### D039 — Missing required derivation input

```ts
const price = derivation({
  bindings: { item: input.required<Item>() },
  setup: ({ item }) => computed(() => item().price),
});

@derive total = price();
//              ~~~~~ D039: Required input 'item' is not provided for derivation 'price'.
```

#### D040 — Derivation uses non-input binding

```ts
const price = derivation({
  bindings: { item: input.required<Item>() },
  setup: ({ item }) => computed(() => item().price),
});

@derive total = price(model:item={item});
//                    ~~~~~~~~~~ D040: Derivations accept input bindings only.
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

BindingKind<V> =
  V extends ModelSignal<any>         → model
  V extends InputSignal<any>         → input
  V extends OutputEmitterRef<any>    → output
  V extends FragmentBinding<any>     → fragment
  otherwise                          → unknown
```

---

## 15. Well-Formedness Invariants

1. **Binding primitives are declaration-only**: Calls to `input()`, `output()`,
   `model()`, `fragment()` (and `.required()` variants) are valid only as direct
   property values inside a `bindings` object. The compiler rejects them in any
   other syntactic position (setup body, providers factory, file scope, helper
   functions).
2. **Forward placement conformance**: Every `@forward()` placement must be able
   to consume the forwarding payload declared by the enclosing component API.
3. **Scope containment**: `@derive` and `@let` names are block-scoped to their
   enclosing control-flow block.
4. **Ref availability**: Refs resolve after `afterNextRender` — reading before yields `undefined`.
5. **Implicit children**: Nested content auto-satisfies `children` fragment
   binding. Cannot also bind `children=` explicitly.
6. **Derivation is view-scoped**: Each `@derive` instance follows the lifecycle
   of its enclosing embedded view. In `@for`, each iteration owns an independent
   instance.
7. **@forward() target check**: In proxy mode, the marked native element must
   be assignable to the declared proxy surface type `S`. In wrapper mode, the
   marked component target must be the wrapper target.
