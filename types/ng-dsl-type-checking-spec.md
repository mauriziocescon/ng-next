# Type Checking Judgment Specification

## Angular Signal Components — Template DSL

This document defines what the **template type checker** must verify — constructs
inside `@{ ... }` that TypeScript cannot check because they are not plain TS expressions.

Out of scope: parser, lowering pipeline, non-template TS helper APIs (`inject()`,
`provide()`, `injectionToken()`, opt-in `satisfies`).

Expected pipeline:

1. parse `@{ ... }` into `TemplateAST`;
2. assign the markup literal the type `TemplateMarkup<ConcreteTemplateAST>`;
3. check the `TemplateAST` using the judgments below;
4. lower the checked tree to runtime instructions.

Normative language follows RFC 2119: **must** / **must not** are required for
conformance; **may** describes implementation freedom.

---

## Notation

| Symbol | Meaning |
|--------|---------|
| `Γ` | Type environment (scope) |
| `Γ ⊢ e : T` | Under Γ, expression e has type T |
| `Γ ⊢ node ✓` | Under Γ, template node type-checks |
| `B(X)` | Bindings record of component/directive/derivation X |
| `E(X)` | Expose type of X |
| `T(C)` | Template markup type of component C |
| `H(D)` | Host element type of directive D |
| `P(C)` | Proxy surface type of component C (`never` if none) |
| `I(tag)` | Intrinsic element host type (e.g. `I("button") = HTMLButtonElement`) |
| `⊑` | Assignability (subtype) |
| `≡` | Exact type equality |

Component metadata shape:

```
C : ComponentInstance<B, E, S, M>
B = bindings record
E = expose type (void when absent)
S = proxy surface type (never when absent)
M = TemplateMarkup<TAst>
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

- `Γ_template`: `@let`, `@derive`, `@fragment` declarations/parameters,
  `@for` item + context variables, `@if` aliases
- `Γ_setup`: variables/functions in the lexical setup scope captured by `@{ ... }`
- `Γ_module`: top-level imports, constants, enums, interfaces
- `Γ_global`: DOM globals, built-in JS types

---

## 2. Expression Typing

Template expressions use `{expr}` syntax.

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
Γ ⊢ e : T    (any type — coerced to string at render)
─────────────────────────────────────────────────
Γ ⊢ {e} ✓
```

### 2.1 Markup Literal Typing

```
MARKUP-LITERAL
─────────────────────────────────────────────────────────────────
parse(@{ source }) = TAst : TemplateAST
─────────────────────────────────────────────────────────────────
Γ ⊢ @{ source } : TemplateMarkup<TAst>
```

`TemplateMarkup<TAst>` is opaque nominal markup — assignable to generic
`TemplateMarkup` but not vice versa.

### 2.2 Template Tree Traversal

```
CHECK-NODES
─────────────────────────────────────────────────────────────────
∀ node ∈ nodes:  Γ ⊢ node ✓
Child TemplateNode[] lists are checked under the node's scoped Γ.
─────────────────────────────────────────────────────────────────
```

---

## 3. Shared Binding Checks

These parameterized rules are reused by native elements (§4), components (§5),
directives (§7), and derivations (§9).

### 3.1 Input Check

```
CHECK-INPUT(Γ, B, input)
─────────────────────────────────────────────────
input.name ∈ keys(B)
B[input.name] : InputSignal<T>
Γ ⊢ input.value : U    U ⊑ T
─────────────────────────────────────────────────
```

### 3.2 Model Check

```
CHECK-MODEL(Γ, B, model)
─────────────────────────────────────────────────
model.name ∈ keys(B)
B[model.name] : ModelSignal<T>
Γ ⊢ model.value : WritableSignal<T>
─────────────────────────────────────────────────
```

### 3.3 Output Check

```
CHECK-OUTPUT(Γ, B, output)
─────────────────────────────────────────────────
output.name ∈ keys(B)
B[output.name] : OutputEmitterRef<T>
Γ ⊢ output.handler : U
U ⊑ ((e: T) → void)    (arity-safe: () → void is assignable)
─────────────────────────────────────────────────
```

### 3.4 Fragment Check

```
CHECK-FRAGMENT(Γ, B, frag)
─────────────────────────────────────────────────
frag.name ∈ keys(B)
frag.name ≠ "children"                              → D033
B[frag.name] : FragmentBinding<T>
frag.parameters match FragmentArgs<T> positionally  → D016
Γ' = Γ ∪ { paramᵢ.name : Tᵢ }
Γ' ⊢ frag.children ✓
─────────────────────────────────────────────────
```

### 3.5 Required Bindings Check

```
CHECK-REQUIRED(B, provided, context_label)
─────────────────────────────────────────────────
∀ k ∈ keys(B):
  B[k] : InputSignal.required<T>    → k ∈ provided_inputs
  B[k] : ModelSignal.required<T>    → k ∈ provided_models
  B[k] : RequiredFragmentBinding<T> →
    if k = "children": has_nested_content (components only)
    else:              k ∈ provided_fragments

Violation → D006 (component), D036 (directive), D037 (derivation)
─────────────────────────────────────────────────
```

For components, `provided_*` includes both explicit bindings and
`forwarded_*` bindings delivered by `WrapBindingPayload`.

### 3.6 Unknown Bindings Check

```
NO-UNKNOWN-BINDINGS(B, node)
─────────────────────────────────────────────────
∀ attr ∈ node.attributes:  attr.name ∈ keys(B)
∀ input ∈ node.inputs:     input.name ∈ keys(B)
∀ model ∈ node.models:     model.name ∈ keys(B)
∀ output ∈ node.outputs:   output.name ∈ keys(B)
∀ frag ∈ node.fragments:   frag.name ∈ keys(B)
─────────────────────────────────────────────────
```

### 3.7 Binding Identity Constraints

```
NO-DUPLICATE-BINDINGS(node)
─────────────────────────────────────────────────
∀ name: |{b ∈ inputs ∪ models | b.name = name}| ≤ 1
∀ name: |{b ∈ outputs | b.name = name}| ≤ 1
∀ name: |{b ∈ fragments | b.name = name}| ≤ 1
|references| ≤ 1
class: and style: are repeatable
animate: uses ANIMATE-CONSTRAINTS
use: uniqueness per DIRECTIVE-SET-UNIQUENESS
─────────────────────────────────────────────────


NO-STATIC-DYNAMIC-CLASH(node)
─────────────────────────────────────────────────
∀ name ∈ attributes:  name ∉ {b.name | b ∈ inputs}

class:* and style:* may coexist with a static attribute or
dynamic binding for the same base name on native elements.
─────────────────────────────────────────────────
```

### 3.8 Ref Check

```
CHECK-REF(Γ, E, ref)
─────────────────────────────────────────────────
ref.target.name = x
if E = void:  x : Ref<undefined> ∈ Γ  ∨  x : Ref<[]> ∈ Γ
else:         x : Ref<E | undefined> ∈ Γ  ∨  x : Ref<E[]> ∈ Γ
─────────────────────────────────────────────────
```

For native elements, `E = H` (the host element type).
For components, `E = E(C)` (the expose type).
For directives, `E = E(D)` (the directive expose type).

### 3.9 once: Binding

```
ONCE-BINDING
─────────────────────────────────────────────────
once: applies ONLY to inputs (InputSignal)
once:model:*  → D011
once:on:*     → D011
once:prop + prop on same target → D012
─────────────────────────────────────────────────
```

### 3.10 on-Prefix Warning

```
ON-PREFIX-WARNING
─────────────────────────────────────────────────
∀ binding name starting with "on" in B → D020 (warning)
─────────────────────────────────────────────────
```

---

## 4. Native Element

```
ELEMENT-RESOLUTION
─────────────────────────────────────────────────────────────────
tag ∈ IntrinsicElements           → INTRINSIC-ELEMENT
tag ∉ IntrinsicElements ∧ resolve(tag, Γ) ≠ ∅ → COMPONENT-ELEMENT (§5)
tag ∉ IntrinsicElements ∧ resolve(tag, Γ) = ∅ → D039
─────────────────────────────────────────────────────────────────


INTRINSIC-ELEMENT
─────────────────────────────────────────────────────────────────
tag ∈ IntrinsicElements    H = I(tag)

∀ attr ∈ node.attributes:  CHECK-NATIVE-TEXT-ATTR(Γ, H, attr)
∀ input ∈ node.inputs:     CHECK-NATIVE-INPUT(Γ, H, input)
∀ output ∈ node.outputs:   CHECK-NATIVE-OUTPUT(Γ, H, output)
∀ model ∈ node.models:     CHECK-NATIVE-MODEL(Γ, H, model)
∀ anim ∈ node.animations:  CHECK-ANIMATE-BINDING(Γ, anim)
∀ dir ∈ node.directives:   CHECK-DIRECTIVE-USE(Γ, H, {node}, dir)
∀ ref ∈ node.references:   CHECK-REF(Γ, H, ref)
NO-DUPLICATE-BINDINGS(node)
NO-STATIC-DYNAMIC-CLASH(node)
─────────────────────────────────────────────────────────────────
Γ ⊢ <tag ...> ✓
```

Native-specific binding rules (not shared because native elements resolve
properties/events from the DOM type system rather than a `bindings` record):

```
CHECK-NATIVE-TEXT-ATTR
─────────────────────────────────────────────────
attr.name ∈ Attrs(H)
  ∨ (attr.name ∈ Props(H) ∧ string ⊑ Props(H)[attr.name])


CHECK-NATIVE-INPUT
─────────────────────────────────────────────────
input.name ∈ Props(H)    Props(H)[input.name] = T
Γ ⊢ input.value : U     U ⊑ T


CHECK-NATIVE-OUTPUT
─────────────────────────────────────────────────
output.name ∈ Events(H)    Events(H)[output.name] = Event<T>
Γ ⊢ output.handler : U
U ⊑ ((e: T) → void)    (arity-safe: () → void is assignable)


CHECK-NATIVE-MODEL
─────────────────────────────────────────────────
tag ∈ {"input", "select", "textarea"}
model.name ∈ ModelableProps(H)
ModelableProps(H)[model.name] = T
Γ ⊢ model.value : WritableSignal<T>
```

### 4.1 class: and style: Typing

```
CLASS-BINDING
─────────────────────────────────────────────────
class:name={expr}    Γ ⊢ expr : boolean


STYLE-BINDING
─────────────────────────────────────────────────
style:prop={expr}    Γ ⊢ expr : string | number | null
```

### 4.2 animate: Typing

```
ANIMATE-CLASS-BINDING
─────────────────────────────────────────────────
animate:phase={expr}   where phase ∈ {"enter", "leave"}
Γ ⊢ expr : string | string[]


ANIMATE-EVENT-BINDING
─────────────────────────────────────────────────
on:animate:phase={handler}   where phase ∈ {"enter", "leave"}
Γ ⊢ handler : (event: AnimationCallbackEvent) => void

AnimationCallbackEvent = { target: Element; animationComplete: VoidFunction; }


ANIMATE-CONSTRAINTS
─────────────────────────────────────────────────
- applies ONLY to native elements (not components → D021)
- phase must be "enter" or "leave" → D022
- at most one animate:enter and one animate:leave (class form) per element
- at most one on:animate:enter and one on:animate:leave per element
- both phases and both forms (class + event) can coexist on the same element
─────────────────────────────────────────────────
```

---

## 5. Component Element

```
COMPONENT-ELEMENT
─────────────────────────────────────────────────────────────────
C = resolve(tag, Γ)     C : ComponentInstance<B, E, S, M>

∀ attr ∈ node.attributes:  CHECK-COMP-TEXT-INPUT(Γ, B, attr)
∀ input ∈ node.inputs:     CHECK-INPUT(Γ, B, input)
∀ model ∈ node.models:     CHECK-MODEL(Γ, B, model)
∀ output ∈ node.outputs:   CHECK-OUTPUT(Γ, B, output)
∀ frag ∈ node.fragments where frag.origin = "explicit":
  CHECK-FRAGMENT(Γ, B, frag)
∀ frag ∈ node.fragments where frag.origin = "implicitChildren":
  Γ ⊢ frag.children ✓
∀ ref ∈ node.references:   CHECK-REF(Γ, E, ref)
∀ dir ∈ node.directives:   CHECK-COMP-DIRECTIVE(Γ, C, S, dir)
CHECK-REQUIRED(B, provided ∪ forwarded, "component")
NO-DUPLICATE-BINDINGS(node)
NO-STATIC-DYNAMIC-CLASH(node)
NO-UNKNOWN-BINDINGS(B, node)
CHILDREN-IMPLICIT-ONLY(node)
─────────────────────────────────────────────────────────────────
Γ ⊢ <C ...> ✓
```

Component-specific rules:

```
CHECK-COMP-TEXT-INPUT
─────────────────────────────────────────────────
attr.name ∈ keys(B)
B[attr.name] : InputSignal<T>
string ⊑ T


CHECK-COMP-DIRECTIVE
─────────────────────────────────────────────────
if S = never:
  node.directives must be ∅   → D013
else:
  R = RESOLVED-FORWARD-HOSTS(C)
  ∀ dir: CHECK-DIRECTIVE-USE(Γ, S, R, dir)


CHILDREN-IMPLICIT-ONLY
─────────────────────────────────────────────────
No explicit binding or explicit @fragment may target "children" → D033.
Only non-fragment direct child content provides children.
─────────────────────────────────────────────────
```

### 5.1 Component Declaration Contracts

TypeScript API well-formedness rules (not template-node judgments):

```
SETUP-RETURN
─────────────────────────────────────────────────────────────────
setup returns: M | { template: M } | { template: M, expose: E }
where M : TemplateMarkup<TAst>
→ component(...) : ComponentInstance<B, E, S, M>


PROVIDERS-INPUTS-ONLY
─────────────────────────────────────────────────────────────────
providers receives Pick<B, input keys only>.
Models, outputs, and fragments are excluded → D031.


RESERVED-CHILDREN-BINDING
─────────────────────────────────────────────────────────────────
if "children" ∈ keys(B):  B["children"] : FragmentBinding<T>
otherwise → D027


PROXY-SURFACE
─────────────────────────────────────────────────────────────────
component.proxy<S>(config)
S ⊑ HTMLElement    S must be explicit
result : ComponentInstance<B, E, S, M>


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
Wrapper inherits Target's proxy surface: P(result) = P(Target).
Inference-only form — explicit generics must not be accepted.
─────────────────────────────────────────────────────────────────
```

---

## 6. @forward() Marker

### 6.1 Payloads

```
PAYLOAD-DEFS
─────────────────────────────────────────────────────────────────
ProxyDirectivePayload(C) =
  directives on a <C ...> call site where P(C) ≠ never

WrapBindingPayload(W, Target, Selected) =
  bindings in B(Target) not selected by component.wrap(Target, ...)

WrapDirectivePayload(W) =
  ProxyDirectivePayload(W) if P(W) = P(Target) ≠ never, otherwise ∅

WrapPayload(W, Target, Selected) = {
  bindings: WrapBindingPayload(W, Target, Selected),
  directives: WrapDirectivePayload(W),
}

Directive payloads pass through every wrapper hop and resolve to
native hosts via RESOLVED-FORWARD-HOSTS(Target).
─────────────────────────────────────────────────────────────────
```

### 6.2 Placement Rules

```
FORWARD-PROXY
─────────────────────────────────────────────────────────────────
Enclosing component declared by component.proxy<S>(...)
For each native element with @forward(): H = I(tag)
H ⊑ S → D015 on failure
If no @forward() placement exists → error
ProxyDirectivePayload broadcast to every @forward() target
Alternative control-flow branches checked independently
─────────────────────────────────────────────────────────────────


FORWARD-WRAP
─────────────────────────────────────────────────────────────────
Enclosing wrapper W declared by component.wrap(Target, ...)
P(W) = P(Target)
For each component element with @forward(): element is Target
Explicit bindings override WrapBindingPayload for same key
Each @forward() element receives WrapPayload
if (WrapPayload.bindings ≠ ∅ ∨ P(W) ≠ never) ∧ no @forward() → D014
WrapPayload broadcast to every @forward() target
Alternative control-flow branches checked independently
─────────────────────────────────────────────────────────────────


FORWARD-INVALID
─────────────────────────────────────────────────────────────────
Marked node cannot consume enclosing component's payload → error


COLLISION-PRECEDENCE
─────────────────────────────────────────────────────────────────
∀ key ∈ (ExplicitBindings ∩ WrapBindingPayload):
  Explicit wins regardless of source order.
─────────────────────────────────────────────────────────────────


FORWARD-TARGETS
─────────────────────────────────────────────────────────────────
FORWARD-TARGETS(C) = @forward() placements reachable in checked render path of T(C)
Multiple placements → payload delivered to all.
Alternative branches → each must independently satisfy rules.
Directive host checks use RESOLVED-FORWARD-HOSTS(C).
─────────────────────────────────────────────────────────────────
```

---

## 7. Directive Application

```
CHECK-DIRECTIVE-USE(Γ, H_host, R_host, dir)
─────────────────────────────────────────────────────────────────
D = resolve(dir.directiveName, Γ)
D : DirectiveInstance<H_D, B_D, E_D>

HOST-COMPAT:  H_host ⊑ H_D                         → D009
UNIQUE:       D at most once per element in R_host  → D010

∀ input ∈ dir.inputs:   CHECK-INPUT(Γ, B_D, input)
∀ output ∈ dir.outputs: CHECK-OUTPUT(Γ, B_D, output)
∀ model ∈ dir.models:   CHECK-MODEL(Γ, B_D, model)
∀ frag ∈ dir.fragments: CHECK-FRAGMENT(Γ, B_D, frag)
CHECK-REQUIRED(B_D, provided, "directive")
NO-UNKNOWN-BINDINGS(B_D, dir)

if dir.when:  Γ ⊢ dir.when.condition : boolean
if dir.ref:   CHECK-REF(Γ, E_D, dir.ref)
─────────────────────────────────────────────────────────────────
Γ ⊢ use:D(...) ✓
```

Directive fragments use local syntax: `use:D(@fragment name(p₁: T₁) { children })`.

### 7.1 Host Compatibility

```
NATIVE-HOST:         H = I(tag)         H ⊑ H_D → compatible
PROXY-SURFACE-HOST:  P(C) = S ≠ never   S ⊑ H_D → compatible
NO-FORWARDING:       P(C) = never       → D013
```

### 7.2 Resolved Host Elements and Uniqueness

A directive is unique per resolved host element — not per syntactic position.

```
RESOLVED-FORWARD-HOSTS
─────────────────────────────────────────────────
Native element N:
  RESOLVED-FORWARD-HOSTS(N) = {N}

component.proxy<S>(...) C:
  FORWARD-TARGETS(C) are native elements
  ∀ N ∈ FORWARD-TARGETS(C): I(tag(N)) ⊑ S
  RESOLVED-FORWARD-HOSTS(C) = FORWARD-TARGETS(C)

component.wrap(Target, ...) W:
  P(W) = P(Target)
  RESOLVED-FORWARD-HOSTS(W) =
    ⋃ RESOLVED-FORWARD-HOSTS(Target) for each target placement


DIRECTIVE-SET-UNIQUENESS
─────────────────────────────────────────────────
For each resolved host element H:
  AppliedDirs(H) = LocalDirs(H) ++ ForwardedDirs(H)
  ∀ directive identity D:  count(D, AppliedDirs(H)) ≤ 1 → D010
─────────────────────────────────────────────────
```

---

## 8. Control Flow

### 8.1 @if

```
IF
─────────────────────────────────────────────────
Γ ⊢ expression : T    (any type — truthiness)
if alias: Γ' = Γ ∪ { alias : Narrow(T) }
else:     Γ' = Γ
Γ' ⊢ children ✓
```

### 8.2 @for

```
FOR
─────────────────────────────────────────────────
Γ ⊢ expression : Iterable<T> | T[]
Γ ⊢ trackBy : expression referencing item/context vars

Γ' = Γ ∪ {
  itemName : T,
  $index : number, $count : number,
  $first : boolean, $last : boolean,
  $even : boolean, $odd : boolean,
} ∪ aliases

Γ' ⊢ children ✓
if empty block: Γ ⊢ empty.children ✓
```

### 8.3 @switch

```
SWITCH
─────────────────────────────────────────────────
Γ ⊢ expression : T
∀ case:
  Γ ⊢ case.expression : U    U comparable to T
  Γ ⊢ case.children ✓
```

---

## 9. @derive

```
DERIVE
─────────────────────────────────────────────────────────────────
D = resolve(derivation_name, Γ)
D : DerivationInstance<B_D, T>

∀ input ∈ node.inputs:  CHECK-INPUT(Γ, B_D, input)
CHECK-REQUIRED(B_D, provided, "derivation")
NO-UNKNOWN-BINDINGS(B_D, node)
Any non-input binding form → D038

Γ' = Γ ∪ { node.name : Signal<T> }
─────────────────────────────────────────────────────────────────
Γ ⊢ @derive name = D(...)    producing Γ'
```

Block-scoped to enclosing control-flow block. Each `@for` iteration owns an
independent instance.

---

## 10. Fragment & @render

### 10.1 @fragment Declaration

```
FRAGMENT-DEF
─────────────────────────────────────────────────────────────────
@fragment name(p₁: T₁, ..., pₙ: Tₙ) { children }

name ≠ "children"                                    → D033
parameters match FragmentArgs<T> positionally        → D016
Γ' = Γ ∪ { p₁: T₁, ..., pₙ: Tₙ }
Γ' ⊢ children ✓

Introduces name : FragmentBinding<T> in its lexical template scope.
Visible to sibling nodes and descendants; not visible outside the
child-list where declared.
─────────────────────────────────────────────────────────────────
```

### 10.2 Fragment Props

**Explicit:** `<Component fragmentName={fragmentValue} />` — checks
`fragmentValue ⊑ FragmentBinding<T>`, name ≠ "children".

**Implicit (inline):** `@fragment name(...) { ... }` as direct child of a
component element — auto-passed to the matching binding. Rules:
- Parent must have binding `name: FragmentBinding<T>` → D034
- name ≠ "children" → D033
- No explicit binding with the same name exists → D034
- No duplicate implicit fragment with the same name → D035
- Not part of implicit children

**Implicit children:** Non-fragment direct child content inside
`<Component>...</Component>` — lowered to `FragmentNode { name: "children",
origin: "implicitChildren" }`. Parent must have `children: FragmentBinding<void>`.

### 10.3 @render Invocation

```
RENDER
─────────────────────────────────────────────────────────────────
Γ ⊢ expr : FragmentBinding<T>

Arguments follow FragmentArgs<T>:
  T = void              → args = []
  T = tuple [T₁,…,Tₙ]  → args = [e₁,…,eₙ] where eᵢ ⊑ Tᵢ
  T = array A[]         → args = [e] where e ⊑ A[]
  otherwise             → args = [e] where e ⊑ T

Optional: if options.injector present:
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

## 11. @let

```
LET
─────────────────────────────────────────────────
Γ ⊢ value : T
Γ' = Γ ∪ { name : T }
─────────────────────────────────────────────────
Γ ⊢ @let name = expr;   producing Γ'
```

---

## 12. Binding Prefix & Modifier Reference

| Prefix / Modifier | Target | Repeatable | Description |
|---|---|---|---|
| `bind:` (or omitted) | native, component | No (per prop) | One-way input |
| `model:` | native, component | No (per prop) | Two-way. Native: `input`/`select`/`textarea` only |
| `on:` | native, component | No (per event) | Event handler |
| `once:` | inputs only | No (per prop) | Freeze at creation. `once:model:*`/`once:on:*` → error |
| `class:` | native | Yes | Conditional class (`boolean`) |
| `style:` | native | Yes | Conditional style (`string \| number \| null`) |
| `animate:` | native | Yes (enter + leave) | Enter/leave animation. `on:animate:` for callback |
| `use:` | native, proxy comp, wrapped proxy | Yes (diff dirs) | Same directive once per resolved host |
| `:when` | `use:` directive | No (per dir) | Condition (`boolean`) |
| `:ref` | `use:` directive | No (per dir) | Capture directive expose |
| `ref` | native, component | No | Capture element/component expose |
| `@forward()` | compatible native or wrapped target | Yes | Forwarding payload placement |

---

## 13. Auxiliary Definitions

```
FragmentArgs<T> =
  T = void                         → []
  T is tuple [T₁, ..., Tₙ]       → [T₁, ..., Tₙ]
  T is array A[] (non-tuple)      → [A[]]
  T is readonly array (non-tuple) → [readonly A[]]
  otherwise                        → [T]


Narrow(T) = Exclude<T, null | undefined | false | 0 | "">


BindingKind<V> =
  V extends ModelSignal<any>       → model
  V extends InputSignal<any>       → input
  V extends OutputEmitterRef<any>  → output
  V extends FragmentBinding<any>   → fragment
  otherwise                        → unknown
```

---

## 14. Diagnostic Summary

| Code | Condition | Severity |
|------|-----------|----------|
| D001 | `input()`/`output()`/`model()`/`fragment()` called outside `bindings` | Error |
| D002 | Unknown attribute/property on native element | Error |
| D003 | Unknown binding on component | Error |
| D004 | Duplicate binding identity (including duplicate refs or fragments) | Error |
| D005 | Static attribute + dynamic binding clash (same name) | Error |
| D006 | Missing required component input/model/fragment | Error |
| D007 | Type mismatch (expression not assignable to binding type) | Error |
| D008 | `model:` bound to non-writable signal | Error |
| D009 | Directive host incompatible with element/proxy surface | Error |
| D010 | Same directive applied twice to same resolved host element | Error |
| D011 | `once:model:*` or `once:on:*` | Error |
| D012 | `once:prop` + `prop` duplicate on same element | Error |
| D013 | Directive on non-proxy component | Error |
| D014 | No `@forward()` when wrapper has payload | Error |
| D015 | `@forward()` element type not assignable to proxy surface S | Error |
| D016 | Fragment argument count/type mismatch | Error |
| D017 | `ref=` variable type incompatible with expose | Error |
| D018 | Unresolved identifier in template expression | Error |
| D019 | `model:` on non-modelable native element | Error |
| D020 | `on`-prefixed binding name | Warning |
| D021 | `animate:` on component element | Error |
| D022 | Invalid animate phase (not `enter`/`leave`) | Error |
| D023 | Duplicate `animate:enter` or `animate:leave` class binding | Error |
| D024 | Duplicate `on:animate:enter` or `on:animate:leave` event binding | Error |
| D025 | `animate:` expression type mismatch (not `string \| string[]`) | Error |
| D026 | `on:animate:` handler type mismatch | Error |
| D027 | Reserved `children` binding is not a fragment | Error |
| D028 | Wrapper selects binding key not in target | Error |
| D029 | Wrapper selected binding kind differs from target | Error |
| D030 | Wrapper selected binding type not exactly target type | Error |
| D031 | `providers` reads model/output/fragment bindings | Error |
| D032 | Setup does not return `TemplateMarkup` or `{ template }` | Error |
| D033 | Explicit `children` binding or explicit `@fragment children()` | Error |
| D034 | Implicit fragment has no matching parent binding or conflicts | Error |
| D035 | Duplicate implicit fragment name under same parent | Error |
| D036 | Missing required directive input/model/fragment | Error |
| D037 | Missing required derivation input | Error |
| D038 | Derivation uses non-input binding form | Error |
| D039 | Unresolved element (neither intrinsic nor in scope) | Error |

### 14.1 Diagnostic Examples

One example per diagnostic — just enough to show the violation.

```ts
// D001 — binding primitive outside bindings
const Broken = component({
  setup: () => {
    const name = input<string>(); // ❌ D001
    return @{ <span>{name()}</span> };
  },
});

// D002 — unknown native property
<div colour="red">Hello</div> // ❌ D002

// D003 — unknown component binding
<UserDetail user={u()} role="admin" /> // ❌ D003: 'role' not in bindings

// D004 — duplicate binding
<button disabled={true} disabled={false}>Click</button> // ❌ D004

// D005 — static + dynamic clash
<div id="static" id={dynamicId()}>Content</div> // ❌ D005

// D006 — missing required
<Card><p>Body</p></Card> // ❌ D006: required 'title' missing

// D007 — type mismatch
<Counter count={'five'} /> // ❌ D007: string not assignable to number

// D008 — model bound to non-writable
<input model:value={computed(() => 'x')} /> // ❌ D008

// D009 — directive host incompatible
<div use:inputMask(mask={'###'})>X</div> // ❌ D009: HTMLDivElement ⊄ HTMLInputElement

// D010 — same directive twice
<button use:tooltip(message={'A'}) use:tooltip(message={'B'})>X</button> // ❌ D010
```

```ts
// D010 — via proxy forwarding
const Button = component.proxy<HTMLButtonElement>({
  setup: () => @{ <button @forward() use:tooltip(message={'Internal'})>X</button> },
});
<Button use:tooltip(message={'External'}) /> // ❌ D010: collides on resolved host

// D011 — once: on model/output
<UserDetail once:model:email={email} user={u()} /> // ❌ D011

// D012 — once:prop + prop duplicate
<Counter once:count={5} count={n()} /> // ❌ D012

// D013 — directive on non-proxy component
<Plain label={'hi'} use:tooltip(message={'tip'}) /> // ❌ D013

// D014 — no @forward() when payload exists
const Broken = component.wrap(UserDetail, {
  bindings: { user: input.required<User>() },
  setup: ({ user }) => @{ <UserDetail user={user()} /> }, // ❌ D014: missing @forward()
});

// D015 — @forward() type mismatch
const Button = component.proxy<HTMLButtonElement>({
  setup: () => @{ <span @forward()>X</span> }, // ❌ D015: HTMLSpanElement ⊄ HTMLButtonElement
});

// D016 — fragment arg mismatch
// fragment.required<[string, number]>() but @render(row(item)) passes 1 arg → D016

// D017 — ref type incompatible
const child = ref<HTMLDivElement>();
<Child ref={child} /> // ❌ D017: expects Ref<{ value: Signal<number> } | undefined>
```

```ts
// D018 — unresolved identifier
<h1>{userName}</h1> // ❌ D018

// D019 — model: on non-modelable element
<div model:value={text}>X</div> // ❌ D019

// D020 — on-prefix warning
bindings: { onSubmit: output<void>() } // ⚠️ D020

// D021–D026 — animate violations
<Card animate:enter={'fade'} />             // ❌ D021: not native
<div animate:show={'fade'}>X</div>          // ❌ D022: invalid phase
<div animate:enter={'a'} animate:enter={'b'}>X</div> // ❌ D023
<div on:animate:leave={f1} on:animate:leave={f2}>X</div> // ❌ D024
<div animate:enter={42}>X</div>             // ❌ D025: number not assignable
<div on:animate:enter={(x: string) => {}}>X</div> // ❌ D026

// D027 — children is not a fragment
bindings: { children: input<string>() } // ❌ D027

// D028–D030 — wrapper selection errors
component.wrap(Target, { bindings: { role: input<string>() } })   // ❌ D028
component.wrap(Target, { bindings: { save: input<void>() } })     // ❌ D029
component.wrap(Target, { bindings: { user: input.required<string>() } }) // ❌ D030

// D031 — providers reads non-input
providers: (inputs) => { inputs.selected; return []; } // ❌ D031

// D032 — invalid setup return
component({ setup: () => ({ expose: {} }) }) // ❌ D032

// D033 — explicit children
<Card children={body} />  // ❌ D033
<Card>@fragment children() { <p>X</p> }</Card> // ❌ D033

// D034 — no matching parent fragment binding
<Card title={'X'}>@fragment footer() { <p>X</p> }</Card> // ❌ D034

// D035 — duplicate inline fragment
<List>
  @fragment row(i: Item) { <span>{i.name}</span> }
  @fragment row(i: Item) { <b>{i.name}</b> }  // ❌ D035
</List>

// D036 — missing required directive input
<button use:tooltip()>Save</button> // ❌ D036: 'message' required

// D037 — missing required derivation input
@derive total = price(); // ❌ D037: 'item' required

// D038 — derivation non-input binding
@derive total = price(model:item={x}); // ❌ D038

// D039 — unresolved element
<FancyCard title={'hello'} /> // ❌ D039
```