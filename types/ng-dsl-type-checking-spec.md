# Type Checking Judgment Specification

## Angular Signal Components — Template DSL

This document defines what the **template type checker** must verify — the
structure inside `@{ ... }` that TypeScript cannot check on its own: element and
component bindings, directives, root nodes, fragments, control flow, and refs.

Expressions are **not** in that set. Everything inside `{ ... }` is a plain
TypeScript expression, typed by TypeScript; §2 states only the scope, the forms
the DSL rejects, and how TypeScript's diagnostics are mapped back into the
`.ng` file. This specification does not restate TypeScript's typing rules.

Out of scope: parser, lowering pipeline, non-template TS helper APIs (`inject()`,
`provide()`, `injectionToken()`, opt-in `satisfies`).

Expected pipeline:

1. parse `@{ ... }` into a template tree, handing each `{ ... }` region to the
   TypeScript parser and carrying the resulting expression node opaquely;
2. assign the markup literal the type `TemplateMarkup<TAst>`;
3. check the tree using the judgments below, delegating expression typing to
   TypeScript;
4. lower the checked tree to runtime instructions.

The tree's concrete shape is the compiler's concern and is deliberately not
specified here — `TemplateAST` (`ng-types.ts`) is an opaque nominal token.
The judgments are stated over the node vocabulary in Notation.

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
| `I(tag)` | Intrinsic element host type (e.g. `I("button") = HTMLButtonElement`) |
| `RR(C)` | Renderable root nodes of C's template (excludes `@let`/`@derive`/`@fragment` and whitespace-only text) (§5.1) |
| `RN(C)` | The sole renderable root of C when C declares a native-element `rootNode`; undefined otherwise (§5.1) |
| `DeclaredRoot(C)` | Public root contract carried as R in `ComponentInstance`; the declared `element<T>()` type, or `RootNode` when omitted |
| `ActualRoot(C)` | Native element type `I(tag(RN(C)))`, resolved at declaration time; undefined for a default `RootNode` root (§5.1) |
| `Root(C)` | Root type used for directive compatibility at `<C .../>`: `DeclaredRoot(C)` (§6) |
| `⊑` | Assignability (subtype) |
| `≡` | Exact type equality |

Component metadata shape:

```
C : ComponentInstance<B, E, M, R>
B = bindings record
E = expose type (void when absent)
M = TemplateMarkup<TAst>
R = root type (RootNode when rootNode omitted; the declared element<T>() type, T ⊑ HTMLElement | SVGElement, otherwise)
```

### Template node vocabulary

The judgments are stated over the fields below. They name the **roles** a
parsed node carries, not a data structure — a compiler is free to represent
them however it likes.

| Node | Fields |
|------|--------|
| element (native or component) | `name`, `attributes`, `inputs`, `models`, `outputs`, `classes`, `styles`, `animations`, `references`, `directives`, `fragments`, `children` |
| directive application | `directiveName`, `inputs`, `models`, `outputs`, `fragments`, `when`, `ref` |
| fragment | `name`, `origin` (`inline` \| `implicitChildren`), `parameters`, `children` |
| derive | `name`, `derivation`, `inputs` |
| binding entry | `name`, plus `value` or `handler`; input entries also carry `once` |
| animate binding | `phase` (`enter` \| `leave`), `kind` (`class` \| `event`), `value` or `handler` |
| ref | `target` (a single identifier) |

`attributes` are static `name="literal"` pairs. `inputs` are `name={expr}`
bindings, equivalently written `bind:name={expr}` — the prefix is optional
syntax and carries no separate judgment. Per §10.2 an input entry may target
either an input or a fragment binding. A component element's `fragments` are
the fragments *delivered* to it; a `@fragment` declaration anywhere else is an
ordinary child node (§10.1).

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

Derivation, component, and directive references must be simple identifiers (single
lexical name resolved through the scope chain). Dot-notation, conditional
expressions, or any non-identifier forms are parse errors.

Such an identifier is not inside a `{ ... }` region, so §2's diagnostic mapping
does not apply to it and D001 is not the code. A name that resolves to nothing
is D002; a name that resolves to the wrong kind — a `use:` target that is not a
directive, a `@derive` target that is not a derivation, a tag that is neither
intrinsic nor a component — is D003.

---

## 2. Expressions

Template expressions use `{expr}` syntax and are **plain TypeScript expressions**.

This specification does not restate TypeScript's typing rules. The `.ng` parser
owns the template grammar; each `{ ... }` region is handed to the TypeScript
parser and TypeScript assigns the expression its type. What follows is only
what the DSL adds: the scope the expression is checked in, the forms the DSL
rejects, and how TypeScript's diagnostics are reported.

```
EXPRESSION
─────────────────────────────────────────────────────────────────
{ e }    where e is a TypeScript expression
Γ        the template scope from §1 (SCOPE-RESOLVE)

TypeScript assigns   Γ ⊢ e : T
─────────────────────────────────────────────────────────────────
Γ ⊢ { e } ✓


RESTRICTED-FORMS
─────────────────────────────────────────────────────────────────
The following TypeScript forms must be rejected inside `{ ... }`:

  assignment (=, +=, ++, --, ...)      declaration statements
  await, yield                          class expressions
  import()                              comma operator
  new                                   satisfies
  type assertions (as, <T>)

Rejection must name the offending form           → D040

Scope of the ban: it applies to the binding expression and to every
expression nested within it, but NOT to the body of an arrow function
appearing in the expression. An arrow body is ordinary TypeScript — a
handler such as `on:click={() => { count.set(0); log(); }}` may contain
statements, and the DSL does not reach inside it.
─────────────────────────────────────────────────────────────────


DIAGNOSTIC-MAPPING
─────────────────────────────────────────────────────────────────
TypeScript diagnostics for e are reported at sourceSpan(e) in the `.ng` file.

D001 (unresolved identifier) and D017 (expression not assignable to a
binding type) are TypeScript diagnostics surfaced through this mapping, not
independent judgments of this specification.
─────────────────────────────────────────────────────────────────


TEXT-INTERPOLATION
─────────────────────────────────────────────────────────────────
Γ ⊢ e : T    (any type — stringified at render;
              null/undefined render as empty string)
─────────────────────────────────────────────────────────────────
Γ ⊢ {e} ✓
```

The template tree carries each expression opaquely — its spans plus the
TypeScript node — and does not model its internals. The same holds for the type
annotations on `@fragment` parameters (§10.1): they are TypeScript types,
carried as written and resolved by TypeScript.

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
CHECK-NODES(Γ, nodes)
─────────────────────────────────────────────────────────────────
Declaration forms extend Γ for the nodes that follow, so a child list is
checked left to right with Γ threaded through:

  Γ₀ = Γ ∪ { every @fragment declared directly in `nodes` }   (§10.1)

  for i in 0 .. n-1:
    Γᵢ ⊢ nodesᵢ ✓
    Γᵢ₊₁ = Γᵢ ∪ bind(nodesᵢ)

  bind(@let name = e)          = { name : T }           (§11)
  bind(@derive name = D(...))  = { name : Signal<T> }   (§9)
  bind(_)                      = ∅

Each node's own children are checked under its scoped Γ — the @for item and
context variables, @if aliases, @fragment parameters.
─────────────────────────────────────────────────────────────────
```

`@fragment` names are pre-collected into Γ₀ rather than threaded, because
§10.1 makes a declaration visible to *every* sibling in its child list, not
only to later ones. `@let` and `@derive` are forward-scoped, so they thread.
Neither escapes the child list it is declared in.

The template root is the entry point: `CHECK-NODES(Γ, root.nodes)`, with Γ
assembled per §1 (SCOPE-RESOLVE).

### 2.3 Comments

`//` line comments and `/* */` block comments are permitted in markup and are
**discarded at parse time**. There is no comment node in the template tree, and
no judgment applies to them.

A comment is recognized only where a template node may begin. Inside text
content and attribute values, `//` and `/*` are ordinary characters — so
`<p>https://example.com</p>` is text, not a comment. Comments inside `{ ... }`
are TypeScript's, handled by the TypeScript parser.

---

## 3. Shared Binding Checks

These parameterized rules are reused by native elements (§4), components (§5),
directives (§7), and derivations (§9).

### 3.1 Input Check

```
CHECK-INPUT(Γ, B, input)
─────────────────────────────────────────────────
input.name ∈ keys(B)
B[input.name] : InputSignal<T>                        → D011 if absent
Γ ⊢ input.value : U    U ⊑ T                          → D017 on mismatch
─────────────────────────────────────────────────
```

### 3.2 Model Check

```
CHECK-MODEL(Γ, B, model)
─────────────────────────────────────────────────
model.name ∈ keys(B)
B[model.name] : ModelSignal<T>                        → D011 if absent
Γ ⊢ model.value : WritableSignal<T>                   → D018 if not writable
─────────────────────────────────────────────────
```

### 3.3 Output Check

```
CHECK-OUTPUT(Γ, B, output)
─────────────────────────────────────────────────
output.name ∈ keys(B)
B[output.name] : OutputEmitterRef<T>                  → D011 if absent
Γ ⊢ output.handler : U
U ⊑ ((e: T) → void)                                   → D017 on mismatch
       (arity-safe: () → void is assignable)
─────────────────────────────────────────────────
```

### 3.4 Fragment Check

```
CHECK-FRAGMENT(Γ, B, frag)
─────────────────────────────────────────────────
frag.name ∈ keys(B)
B[frag.name] : FragmentBinding<T>                          → D027 if absent
frag.parameters match FragmentArgs<T> positionally         → D026
Γ' = Γ ∪ { paramᵢ.name : Tᵢ }
CHECK-NODES(Γ', frag.children)
─────────────────────────────────────────────────
```

This is the **inline** delivery form — a `@fragment` declared as a direct
child of a component element (§10.2). A `@fragment` anywhere else declares a
name without delivering it and is checked by FRAGMENT-DEF (§10.1) instead.
The by-value form `name={expr}` is CHECK-FRAGMENT-PROP (§10.2).

The `children` binding name is reserved at **declaration** time (D005): if
present in a component's `bindings`, it must be a `FragmentBinding<void>`.
Call-site delivery rules for all fragments (including `children`) are in §10.2.

### 3.5 Required Bindings Check

```
CHECK-REQUIRED(B, provided, context_label)
─────────────────────────────────────────────────
required(k) is a property of how k was declared, not of its type:

  input.required<T>()    required     input<T>() / input<T>(d)  optional
  model.required<T>()    required     model<T>()                optional
  fragment.required<T>() required     fragment<T>()             optional

∀ k ∈ keys(B) where required(k):
  BindingKind<B[k]> = input     → k ∈ provided_inputs
  BindingKind<B[k]> = model     → k ∈ provided_models
  BindingKind<B[k]> = fragment  → k ∈ provided_fragments

Violation → D015 (component), D016 (directive), D031 (derivation)
─────────────────────────────────────────────────
```

`provided_fragments` includes all delivery mechanisms defined in §10.2.

Note that only fragment binding declarations carry required-ness in the type:
`RequiredFragmentBinding<T>` and `OptionalFragmentBinding<T>` are nominally
distinct (`ng-types.ts`). Angular erases it for inputs and models —
`input.required<User>()` and `input<User>(d)` are both `InputSignal<User>` —
so a checker must read `required(k)` from the declaration site. There is no
`InputSignal.required<T>` type to test against.

### 3.6 Unknown Bindings Check

```
NO-UNKNOWN-BINDINGS(B, node)
─────────────────────────────────────────────────
∀ b ∈ binding lists carried by node:  b.name ∈ keys(B)   → D011

  component element: attributes, inputs, models, outputs
  directive:         inputs, models, outputs, fragments
  derive:            inputs

Native elements do not use this rule — they resolve against the DOM type
system through the CHECK-NATIVE-* rules in §4 (→ D010).

A component element's delivered `fragments` are excluded: an unmatched
fragment there is D027 (§3.4, §10.2), the more specific code. Fragments
delivered to a directive arrive by reference and have no such rule, so they
stay under D011.
─────────────────────────────────────────────────
```

### 3.7 Binding Identity Constraints

```
NO-DUPLICATE-BINDINGS(node)
─────────────────────────────────────────────────
∀ name: |{a ∈ attributes | a.name = name}| ≤ 1
∀ name: |{b ∈ inputs ∪ models | b.name = name}| ≤ 1
∀ name: |{b ∈ outputs | b.name = name}| ≤ 1
|references| ≤ 1
Violation → D012

A fragment must be delivered once, by one mechanism (§10.2). Let
delivered(name) = the fragment props in inputs, the inline fragments, and
the implicit children fragment, taken together:

∀ name: |delivered(name)| ≤ 1

  both occurrences are inline fragments  → D028
  otherwise (mechanisms differ)          → D012

Two occurrences of the same name in the same list get the more specific
code; a name arriving by two different mechanisms is an ordinary duplicate.

Exception: a pair differing only in the once: modifier — once:prop and prop
on the same element — is D021, not D012, for the same reason.

classes: repeatable (multiple class:name allowed per element)
styles: repeatable (multiple style:prop allowed per element)
animate: uses ANIMATE-CONSTRAINTS (§4.2)
use: at most one application of a given directive per resolved host
     element — the UNIQUE premise of §7, → D025 (see §7.1)
─────────────────────────────────────────────────


NO-DUPLICATE-DIRECTIVE-BINDINGS(dir)
─────────────────────────────────────────────────
The bindings carried by a single `use:D(...)` application have their own
identity slots, independent of the element's:

∀ name: |{b ∈ dir.inputs ∪ dir.models | b.name = name}| ≤ 1
∀ name: |{b ∈ dir.outputs | b.name = name}| ≤ 1
∀ name: |{b ∈ dir.fragments | b.name = name}| ≤ 1
|dir.when| ≤ 1
|dir.ref| ≤ 1
Violation → D012

The once: exception of NO-DUPLICATE-BINDINGS applies here too: once:prop
and prop on the same application is D021.

Two applications of the *same* directive to one element are D025, not D012 —
that is the UNIQUE premise of §7, not a binding-identity question.
─────────────────────────────────────────────────


NO-STATIC-DYNAMIC-CLASH(node)
─────────────────────────────────────────────────
∀ name ∈ attributes:  name ∉ {b.name | b ∈ inputs}     → D013

classes and styles may coexist with a static attribute or
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
Violation → D030
─────────────────────────────────────────────────
```

For native elements, `E = H` (the host element type).
For components, `E = E(C)` (the expose type).
For directives, `E = E(D)` (the directive expose type).

Note: a `ref()` variable (`Ref<T | undefined>`) may appear at multiple sites
across the template — last rendered wins (template order). This is intentional:
it supports patterns like `@if`/`@else` branches sharing the same ref. Use
`refMany()` when collecting multiple simultaneously-active instances.

### 3.9 once: Binding

```
ONCE-BINDING
─────────────────────────────────────────────────
once: applies ONLY to inputs (InputSignal) — component, directive and
derivation inputs. It is not a DOM feature.

once:model:*                       → D020
once:on:*                          → D020
once: on a native element property → D020
once: on a fragment prop (§10.2)   → D020
once:prop + prop on same target    → D021
─────────────────────────────────────────────────
```

The `model:`/`on:` cases are parse-time (the grammar admits `once:` only before
an input name); the other two are check-time, resolved via §4 and the binding
record (§10.2).

---

## 4. Native Element

```
ELEMENT-RESOLUTION
─────────────────────────────────────────────────────────────────
tag ∈ IntrinsicElements           → INTRINSIC-ELEMENT
tag ∉ IntrinsicElements ∧ resolve(tag, Γ) ≠ ∅ → COMPONENT-ELEMENT (§5)
tag ∉ IntrinsicElements ∧ resolve(tag, Γ) = ∅ → D002
─────────────────────────────────────────────────────────────────


INTRINSIC-ELEMENT
─────────────────────────────────────────────────────────────────
tag ∈ IntrinsicElements    H = I(tag)

∀ attr ∈ node.attributes:       CHECK-NATIVE-TEXT-ATTR(Γ, H, attr)
∀ input ∈ node.inputs:          CHECK-NATIVE-INPUT(Γ, H, input)
∀ output ∈ node.outputs:        CHECK-NATIVE-OUTPUT(Γ, H, output)
∀ model ∈ node.models:          CHECK-NATIVE-MODEL(Γ, H, model)
∀ cls ∈ node.classes:           CLASS-BINDING(Γ, cls)
∀ sty ∈ node.styles:            STYLE-BINDING(Γ, sty)
∀ anim ∈ node.animations:       CHECK-ANIMATE-BINDING(Γ, anim)
∀ dir ∈ node.directives:        CHECK-DIRECTIVE-USE(Γ, H, {node}, dir)
∀ ref ∈ node.references:        CHECK-REF(Γ, H, ref)
CHECK-NODES(Γ, node.children)
NO-DUPLICATE-BINDINGS(node)
NO-STATIC-DYNAMIC-CLASH(node)
─────────────────────────────────────────────────────────────────
Γ ⊢ <tag ...> ✓
```

A native element has no fragment *delivery* surface, but a `@fragment`
declared among its children is an ordinary declaration — it introduces a name
in scope and is checked by FRAGMENT-DEF (§10.1), exactly as `<ng-template>`
inside a `<div>` works today. It is not an error.

Native-specific binding rules (resolve properties/events from the DOM type
system rather than a `bindings` record):

```
CHECK-NATIVE-TEXT-ATTR
─────────────────────────────────────────────────
attr.name ∈ Attrs(H)
  ∨ (attr.name ∈ Props(H) ∧ string ⊑ Props(H)[attr.name])
                                                       → D010 on failure


CHECK-NATIVE-INPUT
─────────────────────────────────────────────────
input.name ∈ Props(H)    Props(H)[input.name] = T      → D010 if absent
input.once = false                                     → D020 otherwise
Γ ⊢ input.value : U     U ⊑ T                          → D017 on mismatch


CHECK-NATIVE-OUTPUT
─────────────────────────────────────────────────
output.name ∈ Events(H)    Events(H)[output.name] = Event<T>
Γ ⊢ output.handler : U
U ⊑ ((e: T) → void)    (same arity-safe rule as §3.3)


CHECK-NATIVE-MODEL
─────────────────────────────────────────────────
tag ∈ {"input", "select", "textarea"}                  → D019 otherwise
model.name ∈ ModelableProps(H)                         → D010 if absent
ModelableProps(H)[model.name] = T
Γ ⊢ model.value : WritableSignal<T>
```

### 4.1 class: and style: Typing

`class:` and `style:` apply **only** to native elements. Using them on component
elements is a compile-time error (D023).

```
CLASS-BINDING
─────────────────────────────────────────────────
class:name={expr}    Γ ⊢ expr : T    (any type — truthiness)


STYLE-BINDING
─────────────────────────────────────────────────
style:prop={expr}    Γ ⊢ expr : string | number | null
```

### 4.2 animate: Typing

```
CHECK-ANIMATE-BINDING(Γ, anim)
─────────────────────────────────────────────────
anim.kind = "class"  → ANIMATE-CLASS-BINDING(Γ, anim.value)
anim.kind = "event"  → ANIMATE-EVENT-BINDING(Γ, anim.handler)
Both forms are subject to ANIMATE-CONSTRAINTS.
─────────────────────────────────────────────────


ANIMATE-CLASS-BINDING
─────────────────────────────────────────────────
animate:phase={expr}   where phase ∈ {"enter", "leave"}
Γ ⊢ expr : string | string[]                           → D038 on mismatch


ANIMATE-EVENT-BINDING
─────────────────────────────────────────────────
on:animate:phase={handler}   where phase ∈ {"enter", "leave"}
Γ ⊢ handler : (event: AnimationCallbackEvent) => void   → D039 on mismatch

AnimationCallbackEvent = { target: Element; animationComplete: VoidFunction; }


ANIMATE-CONSTRAINTS
─────────────────────────────────────────────────
- applies ONLY to native elements (not components → D034)
- phase must be "enter" or "leave" → D035 (parse-time: the grammar admits only
  those two phase names)
- at most one animate:enter and one animate:leave (class form) per element → D036
- at most one on:animate:enter and one on:animate:leave per element        → D037
- both phases and both forms (class + event) can coexist on the same element
─────────────────────────────────────────────────
```

---

## 5. Component Element

```
COMPONENT-ELEMENT
─────────────────────────────────────────────────────────────────
C = resolve(tag, Γ)
C : ComponentInstance<B, E, M, R>                          → D003 otherwise

node.classes ≠ []        → D023
node.styles ≠ []         → D023
node.animations ≠ []     → D034

∀ attr ∈ node.attributes:  CHECK-COMP-TEXT-INPUT(Γ, B, attr)
∀ b ∈ node.inputs:         dispatch on BindingKind<B[b.name]> (§12):
                             b.name ∉ keys(B) → D011
                             input    → CHECK-INPUT(Γ, B, b)
                             model    → CHECK-INPUT(Γ, B, b)   (see note)
                             fragment → CHECK-FRAGMENT-PROP(Γ, B, b)
                             output   → D014
                             unknown  → D014
∀ model ∈ node.models:     CHECK-MODEL(Γ, B, model)
∀ output ∈ node.outputs:   CHECK-OUTPUT(Γ, B, output)
∀ frag ∈ node.fragments where frag.origin = "inline":
  CHECK-FRAGMENT(Γ, B, frag)
∀ frag ∈ node.fragments where frag.origin = "implicitChildren":
  B["children"] : FragmentBinding<void>                    → D027
  CHECK-NODES(Γ, frag.children)
∀ ref ∈ node.references:   CHECK-REF(Γ, E, ref)
node.children = []         (nested content is lowered to the
                            "implicitChildren" fragment — §10.2)
∀ dir ∈ node.directives:
  CHECK-DIRECTIVE-USE(Γ, Root(C), HostSet(C, node), dir)
  where HostSet(C, node) = {RN(C)}  if C declares a native-element rootNode
                                          (rootNode: element<T>() where T ⊑ HTMLElement | SVGElement)
                         = {node}         otherwise
CHECK-REQUIRED(B, provided, "component")
NO-DUPLICATE-BINDINGS(node)
NO-STATIC-DYNAMIC-CLASH(node)
NO-UNKNOWN-BINDINGS(B, node)
─────────────────────────────────────────────────────────────────
Γ ⊢ <C ...> ✓
```

Every component accepts directives syntactically; incompatibility is reported by
HOST-COMPAT (§7) as D024.

**On binding a `model()` one-way.** `model` dispatches to CHECK-INPUT because
`ModelSignal<T> ⊑ InputSignal<T>` (§3.5), so one-way binding is legal and
writeback needs `model:` (D018).

Component-specific rule:

```
CHECK-COMP-TEXT-INPUT
─────────────────────────────────────────────────
attr.name ∈ keys(B)                                    → D011 if absent
B[attr.name] : InputSignal<T>                          → D014 on wrong kind
attr.value is string literal V    V : literal type
V ⊑ T                                                  → D017 on mismatch
─────────────────────────────────────────────────
```

### 5.1 Component Declaration Contracts

TypeScript API well-formedness rules (not template-node judgments):

```
SETUP-RETURN
─────────────────────────────────────────────────────────────────
setup returns: M | { template: M } | { template: M, expose: E }
where M : TemplateMarkup<TAst>
Any other return shape → D008
→ component(...) : ComponentInstance<B, E, M, R>


SINGLE-TEMPLATE-RULE
─────────────────────────────────────────────────────────────────
setup body contains exactly one @{ } literal (markup literal).
That literal must appear only at the tail position:
  - Direct return: setup: () => @{ ... }
  - Block return:  setup: () => { ...; return @{ ... }; }
  - Object return: setup: () => { ...; return { template: @{ ... }, expose }; }

Multiple @{ } literals in setup → D009
@{ } inside branches, loops, or non-tail position → D009
─────────────────────────────────────────────────────────────────


PROVIDERS-INPUTS-ONLY
─────────────────────────────────────────────────────────────────
For component(...) and directive(...), providers receives
Pick<B, input keys only>. Models (including ModelSignal's InputSignal
supertype), outputs, and fragments are excluded → D007.
The selected input signals retain their declared value types, including
undefined for optional inputs.


BINDING-PRIMITIVE-PLACEMENT
─────────────────────────────────────────────────────────────────
input(), input.required(), model(), output(), fragment() and
fragment.required() may appear only as values of the `bindings` record of
component(...), directive(...) or derivation(...).
Calling one anywhere else — in setup, providers, or module scope — is → D004.


RESERVED-COMPONENT-BINDINGS
─────────────────────────────────────────────────────────────────
if "children" ∈ keys(B):  B["children"] : FragmentBinding<void>   → D005 otherwise

if "ref" ∈ keys(B) (component only):  → D006
─────────────────────────────────────────────────────────────────


ON-PREFIX-WARNING
─────────────────────────────────────────────────────────────────
∀ k ∈ keys(B) of component(...), directive(...) or derivation(...):
  k starts with "on" → D022 (warning)

Reported once at the declaration site, not at each call site.
─────────────────────────────────────────────────────────────────


ELEMENT-ROOT
─────────────────────────────────────────────────────────────────
`rootNode` defaults to `RootNode` when omitted; it is not declared as
`element<RootNode>()`. Declaring `element<T>()` with `T ⊑ HTMLElement | SVGElement`
(e.g. `element<HTMLElement>()`, `element<HTMLButtonElement>()`,
`element<SVGSVGElement>()`) opts into a native-element root. The declared
root type is reflected in `ComponentInstance` as its `R` parameter, read via
`ComponentRootOf<C>`.

RR(C) = the root nodes of T(C), excluding
  - declaration-only nodes: @let, @derive, @fragment
  - whitespace-only text
A top-level @let or @fragment declaration beside the root element is therefore
not a second root.

When C declares a native-element rootNode (rootNode: element<T>() where T ⊑ HTMLElement | SVGElement):
  |RR(C)| = 1                                    → D041 otherwise
  RN(C) = the single member of RR(C)
  RN(C) is not a block construct (@if/@for/@switch/@defer/@boundary)  → D042
  RN(C) is a native element                                          → D043
  ActualRoot(C) = I(tag(RN(C)))
  DeclaredRoot(C) = T
  ActualRoot(C) ⊑ DeclaredRoot(C)                                     → D044 otherwise
  Root(C) = DeclaredRoot(C)

  A block construct is any control-flow block (@if/@for/@switch), a @defer
  block (or its companion @placeholder/@loading/@error blocks), or a @boundary
  block. RN(C) must be a statically/unconditionally present node, not nested in
  any of these.

  Diagnostic precedence: D041 is checked first, then D042, then D043, then D044.
  D044 is checked only after a valid native root has been established. D042 is
  the specific case of D043 that has a better message, so a block-wrapped root
  reports D042 and never D043.

Otherwise C has the default rootNode:
  RN(C) and ActualRoot(C) are undefined
  DeclaredRoot(C) = Root(C) = RootNode     no root diagnostic applies

Root(C) is what a directive applied at a `<C .../>` call site attaches to; see
§6 for resolution and §7 for the RootNode-root (inert) mechanism.
─────────────────────────────────────────────────────────────────
```

---

## 6. Root Resolution

A directive applied at `<C .../>` attaches to C's root in one step and no
further: attachment is non-transitive. A component whose entire template is
`<Other />` is legal, its root type is still `RootNode`, and directives applied
to it never reach `Other`.

```
ROOT-RESOLUTION
─────────────────────────────────────────────────────────────────
Native element N:
  Root(N) = I(tag(N))              host set = {N}

Component C declaring a native-element rootNode:
  RN(C) = the single renderable root node of T(C)
                (§5.1 ELEMENT-ROOT; D041/D042/D043/D044)
  RN(C) is a native element by rule, so resolution terminates here.
  ActualRoot(C) ⊑ DeclaredRoot(C) was checked at declaration time.
  Root(C) = DeclaredRoot(C)    host set = {RN(C)}

Component C with the default rootNode:
  Root(C) = RootNode               host set = {the <C .../> call-site node}
  T(C) is not inspected at all, so resolution terminates immediately.

Directive checks pass Root(C) as H_host and the host set as R_host to
CHECK-DIRECTIVE-USE (§7).
─────────────────────────────────────────────────────────────────
```

RN(C) and Root(C) follow §5.1 ELEMENT-ROOT (D041/D042/D043/D044).
The host set identifies the attachment target; it does not narrow the public
root type used for call-site directive compatibility.

---

## 7. Directive Application

```
CHECK-DIRECTIVE-USE(Γ, H_host, R_host, dir)
─────────────────────────────────────────────────────────────────
D = resolve(dir.directiveName, Γ)                  → D002 if unresolved
D : DirectiveInstance<H_D, B_D, E_D>               → D003 otherwise

HOST-COMPAT:  H_host ⊑ H_D                         → D024
UNIQUE:       D at most once per element in R_host  → D025

∀ input ∈ dir.inputs:       CHECK-INPUT(Γ, B_D, input)
∀ output ∈ dir.outputs:     CHECK-OUTPUT(Γ, B_D, output)
∀ model ∈ dir.models:       CHECK-MODEL(Γ, B_D, model)
∀ frag ∈ dir.fragments:     CHECK-DIRECTIVE-FRAGMENT(Γ, B_D, frag)
CHECK-REQUIRED(B_D, provided, "directive")
NO-UNKNOWN-BINDINGS(B_D, dir)
NO-DUPLICATE-DIRECTIVE-BINDINGS(dir)

if dir.when:  Γ ⊢ dir.when.condition : T    (any type — truthiness)
if dir.ref:   CHECK-REF(Γ, E_D, dir.ref)
─────────────────────────────────────────────────────────────────
Γ ⊢ use:D(...) ✓
```

HOST-COMPAT (`H_host ⊑ H_D`) is ordinary TypeScript assignability, D024 on
failure, with `H_host = Root(C)` (§5.1 ELEMENT-ROOT). So a default RootNode root
(§6) rejects a DOM-only `host: ref<HTMLElement>()` as D024 and accepts hosts that
admit RootNode (`host: ref<RootNode>()`, `host: ref<HTMLElement | RootNode>()`),
while `host: ref<RootNode>()` fails against native elements and native-element-rootNode
components. A RootNode host is inert: it attaches, runs setup, injects, and reads
its own bindings, but cannot reach the DOM through `host`, since RootNode is a
members-less brand. Use `isRootNode` to distinguish host kinds: it narrows
`HTMLElement | RootNode`, does not export its brand symbol, and avoids
`instanceof` (which fails under SSR).

Fragment-specific check for directives:

```
CHECK-DIRECTIVE-FRAGMENT(Γ, B_D, frag)
─────────────────────────────────────────────────
CHECK-FRAGMENT-PROP(Γ, B_D, frag)                      (§10.2)
  required declaration → source must be Fragment<T>
  optional declaration → source may be Fragment<T> | undefined
  once: is rejected                                  → D020
─────────────────────────────────────────────────
```

Inline `@fragment` is component-only; directives receive fragments only by
reference via `name={expr}`, and an inline `@fragment` in a directive use is
rejected as D029 (parse-time). Since `name={expr}` cannot distinguish
`dir.inputs` from `dir.fragments` at parse time (the §10.2 ambiguity), the split
is made after `D` resolves by `BindingKind<B_D[name]>` (§12), as COMPONENT-ELEMENT does.

### 7.1 Uniqueness Note

Uniqueness (D025) is per resolved host element per instantiation, not per
syntactic position and not per component declaration. For a component C with a
native-element `rootNode`, instantiated at call site S:

  AppliedDirs(C, S) = LocalDirs(RN(C)) ∪ CallSiteDirs(S)

A directive on C's root element inside T(C) collides with the same directive
applied at S. The merged set is per-instantiation: C's many call sites are
independent. With the default `rootNode` there is no shared element, so
uniqueness reduces to "at most once per call site".

### 7.2 Directive Declaration Contracts

TypeScript API well-formedness rules (not template-node judgments):

```
DIRECTIVE-PROVIDERS
─────────────────────────────────────────────────────────────────
With bindings B:
  providers?: (inputs: InputsOnly<B>) => Provider[]
Without a bindings record:
  providers?: () => Provider[]

InputsOnly uses PROVIDERS-INPUTS-ONLY (§5.1); excluded binding access → D007.
The callback must return Angular Provider[]; other type mismatches → D017.
Host context and setup's expose result are not callback arguments.
─────────────────────────────────────────────────────────────────
```

`providers` is declaration configuration, not a consumer-bindable key and not
part of `B`. It does not change `DirectiveInstance<H, B, E>`, host compatibility,
required consumer bindings, or expose/ref inference. It is also permitted on
inert `RootNode` directives: lack of a DOM surface does not prevent DI.

---

## 8. Control Flow

### 8.1 @if

```
IF
─────────────────────────────────────────────────
Γ ⊢ expression : T    (any type — truthiness)

FLOW: branches must be checked as if lowered to a TypeScript if/else-if/else
      chain in declaration order — own condition true, preceding ones false.
      Regions are parsed per §2 but checked in that one flow context.

if alias: Γ' = Γ ∪ { alias : expression narrowed to truthy (per FLOW) }
else:     Γ' = Γ
CHECK-NODES(Γ', branch.children)
```

Γ carries declarations, FLOW carries narrowing — TypeScript's, so there is no
narrowing operator here. It reaches identifiers and property-access paths, not
repeated calls: `@if (user()) { {user().name} }` leaves `user()` possibly-null.
The alias form (`expressionAlias`) covers that case.

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

CHECK-NODES(Γ', children)
if empty block: CHECK-NODES(Γ, empty.children)
```

### 8.3 @switch

```
SWITCH
─────────────────────────────────────────────────
Γ ⊢ expression : T
∀ case:
  Γ ⊢ case.expression : U    U comparable to T
  CHECK-NODES(Γ, case.children)

FLOW: cases must be checked as if lowered to a TypeScript switch statement, so
      a discriminant narrows in each case body and `@default` sees the residual.
```

Same reach and limits as §8.1 — and no alias form here, so a `@switch` on a call
expression narrows nothing.

---

## 9. @derive

```
DERIVE
─────────────────────────────────────────────────────────────────
D = resolve(derivation_name, Γ)                    → D002 if unresolved
D : DerivationInstance<B_D, T>                     → D003 otherwise

∀ input ∈ node.inputs:  CHECK-INPUT(Γ, B_D, input)
CHECK-REQUIRED(B_D, provided, "derivation")
NO-UNKNOWN-BINDINGS(B_D, node)
Any non-input binding form → D032

Γ' = Γ ∪ { node.name : Signal<T> }
─────────────────────────────────────────────────────────────────
Γ ⊢ @derive name = D(...)    producing Γ'
```

Block-scoped to enclosing control-flow block. Each `@for` iteration owns an
independent instance.

### 9.1 Derivation Declaration Contract

A TypeScript API well-formedness rule (not a template-node judgment):

```
DERIVATION-BINDINGS-INPUTS-ONLY
─────────────────────────────────────────────────────────────────
∀ k ∈ keys(B) of derivation(...):  BindingKind<B[k]> = input
Model, output or fragment binding → D033

A derivation has no DOM surface — no host, no events, no content — so the
only binding kind that means anything is an input.
─────────────────────────────────────────────────────────────────
```

Enforced at the type level by `ValidateDerivationBindings` (`ng-types.ts`),
which maps a non-input binding to `never`. D032 is the template-side
counterpart: D033 rejects the *declaration*, D032 the *call site*.

---

## 10. Fragment & @render

### 10.1 @fragment Declaration

```
FRAGMENT-DEF
─────────────────────────────────────────────────────────────────
@fragment name(p₁: T₁, ..., pₙ: Tₙ) { children }

As a direct child of a component element: delivered to the parent's matching
binding, checked via CHECK-FRAGMENT(Γ, B_parent, frag) — §10.2.

Anywhere else — native element, control-flow block, template root — it is
standalone: it declares a name without delivering it.
  Γ' = Γ ∪ { p₁: T₁, ..., pₙ: Tₙ }
  CHECK-NODES(Γ', children)

In both cases introduces name : Fragment<T> in its lexical
template scope. T is derived from declared parameters: 0 params → void,
n params → [T₁, ..., Tₙ]. Visible to every sibling in the child-list where it
is declared and to their descendants; not visible outside it.
─────────────────────────────────────────────────────────────────
```

A standalone declaration is the DSL's local named template — the role
`<ng-template #name>` plus `ngTemplateOutlet` plays today. It is not an error:

```ts
<div>
  @fragment row(i: Item) { <span>{i.desc}</span> }
  @for (item of items(); track item.id) { @render(row(item)) }
</div>
```

Parameter type annotations are ordinary TypeScript types, carried as written
and resolved by TypeScript in Γ (§2).

`Fragment<T>` is a branded callable source returning opaque `TemplateMarkup`.
It is distinct from `FragmentBinding<T>`, which is non-callable declaration
metadata. Requiredness belongs to the receiving binding declaration, not to a
lexical source. Local sources are invoked directly, as `row(item)` above;
received sources are read through signals before invocation (§10.2).

### 10.2 Fragment Delivery

Three mechanisms deliver a fragment to a component binding.

**By value (fragment prop):** `<Component fragmentName={expr} />`

```
CHECK-FRAGMENT-PROP(Γ, B, prop)
─────────────────────────────────────────────────
prop.name ∈ keys(B)                                        → D011 if absent
prop.once = false                                          → D020 otherwise

B[prop.name] : RequiredFragmentBinding<T>
  Γ ⊢ prop.value : U   U ⊑ Fragment<T>                     → D017 on mismatch

B[prop.name] : OptionalFragmentBinding<T>
  Γ ⊢ prop.value : U   U ⊑ Fragment<T> | undefined         → D017 on mismatch
─────────────────────────────────────────────────
```

**Inline:** `@fragment name(...) { ... }` as a direct child of a component
element, delivered to the matching binding and checked by CHECK-FRAGMENT
(§3.4).
- Parent must have binding `name: FragmentBinding<T>` → D027
- The same name must not also arrive as a fragment prop → D012
- No duplicate inline fragment with the same name → D028

**Implicit children:** non-fragment direct child content inside
`<Component>...</Component>`, lowered to a fragment named `children` with
origin `implicitChildren`. Parent must have `children: FragmentBinding<void>`
→ D027.

All three work for `children`. Providing the same fragment name through more
than one mechanism is a duplicate (D012 / D028).

A fragment prop and an input binding share `name={expr}` syntax and are
disambiguated by the component's binding record `B` through `BindingKind` (§12).

### 10.3 @render Invocation

```
RENDER
─────────────────────────────────────────────────────────────────
Γ ⊢ expr : TemplateMarkup | undefined

if expr is a fragment invocation f(a₁, ..., aₙ)  (incl. f?.(...)):
  Γ ⊢ f : Fragment<T> | undefined
  (a₁, ..., aₙ) match FragmentArgs<T> positionally         → D026

Optional: if options.injector present:
  Γ ⊢ options.injector : Injector | null | undefined
─────────────────────────────────────────────────────────────────
Γ ⊢ @render(expr, { injector? }) ✓
```

When `expr` is `undefined`, nothing is rendered (no-op).
This supports `@render(optionalFragment()?.())` for an optional receiver signal.

D026 is a template-side code only. It is the invocation half of the fragment
contract; §3.4 is the declaration half (an inline `@fragment`'s parameter list),
both comparing a positional list to the same `FragmentArgs<T>`.

**Injector resolution.** `@render` is an inline outlet: providers inside the rendered
fragment resolve against the **render site's** injector, not the definition site's.
When `options.injector` is provided it overrides this default; when omitted the
enclosing component's injector at the `@render` call site is used.

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

`name` is visible to subsequent siblings and their descendants only (forward-scoped).

---

## 12. Auxiliary Definitions

```
FragmentArgs<T> =
  T = void                         → []
  T is tuple [T₁, ..., Tₙ]       → [T₁, ..., Tₙ]
  T is readonly tuple             → [T₁, ..., Tₙ]   (readonly is dropped)
  T is array A[] (non-tuple)      → [A[]]
  T is readonly array (non-tuple) → [readonly A[]]
  otherwise                        → [T]


BindingKind<V> =
  V extends ModelSignal<any>       → model
  V extends InputSignal<any>       → input
  V extends OutputEmitterRef<any>  → output
  V extends FragmentBinding<any>   → fragment
  otherwise                        → unknown
```

---

## 13. Diagnostic Summary

| Code | Category | Condition | Severity |
|------|----------|-----------|----------|
| D001 | Resolution | Unresolved identifier in template expression (mapped TS diagnostic, §2) | Error |
| D002 | Resolution | Unresolved reference: element tag (neither intrinsic nor in scope), `use:` directive name, or `@derive` derivation name | Error |
| D003 | Resolution | Reference resolves to the wrong kind (tag that is not a component, `use:` target that is not a directive, `@derive` target that is not a derivation) | Error |
| D004 | Declaration | `input()`/`output()`/`model()`/`fragment()` called outside `bindings` | Error |
| D005 | Declaration | Reserved `children` binding is not a `FragmentBinding<void>` | Error |
| D006 | Declaration | Reserved `ref` binding declared on a component | Error |
| D007 | Declaration | Component/directive `providers` reads model/output/fragment bindings | Error |
| D008 | Declaration | Setup does not return `TemplateMarkup` or `{ template }` | Error |
| D009 | Declaration | Multiple `@{ }` literals in setup or `@{ }` not in tail position | Error |
| D010 | Binding: Existence | Unknown attribute/property on native element | Error |
| D011 | Binding: Existence | Unknown binding on component, directive, or derivation | Error |
| D012 | Binding: Existence | Duplicate binding identity (including duplicate refs or fragments) | Error |
| D013 | Binding: Existence | Static attribute + dynamic binding clash (same name) | Error |
| D014 | Binding: Existence | Binding bound with the syntax of a different kind (e.g. an `output()` bound as an input) | Error |
| D015 | Binding: Required | Missing required component input/model/fragment | Error |
| D016 | Binding: Required | Missing required directive input/model/fragment | Error |
| D017 | Binding: Types | Type mismatch (expression not assignable to binding type; mapped TS diagnostic, §2) | Error |
| D018 | Binding: Types | `model:` bound to non-writable signal | Error |
| D019 | Binding: Types | `model:` on non-modelable native element | Error |
| D020 | Binding: Modifiers | `once:` on a non-input target (`model:`, `on:`, native element property, fragment prop) | Error |
| D021 | Binding: Modifiers | `once:prop` + `prop` duplicate on same element | Error |
| D022 | Binding: Modifiers | `on`-prefixed binding name | Warning |
| D023 | Binding: Scope | `class:` or `style:` on component element | Error |
| D024 | Directives | Directive host incompatible with the element or the component's root type, including a DOM-element directive on a component with the default (RootNode) root | Error |
| D025 | Directives | Same directive applied twice to same resolved host element | Error |
| D026 | Fragments | Fragment argument/parameter list does not match `FragmentArgs<T>` — at a `@render` invocation (§10.3) or an inline `@fragment` declaration (§3.4) | Error |
| D027 | Fragments | Fragment delivered to a component element has no matching parent binding | Error |
| D028 | Fragments | Duplicate inline fragment name under same parent | Error |
| D029 | Fragments | Inline `@fragment` declaration inside directive `use:` binding | Error |
| D030 | Refs | `ref=` variable type incompatible with expose | Error |
| D031 | Derivation | Missing required derivation input | Error |
| D032 | Derivation | Derivation uses non-input binding form (parse-time) | Error |
| D033 | Derivation | `derivation(...)` declares a model, output or fragment binding | Error |
| D034 | Animate | `animate:` on component element | Error |
| D035 | Animate | Invalid animate phase (not `enter`/`leave`) | Error |
| D036 | Animate | Duplicate `animate:enter` or `animate:leave` class binding | Error |
| D037 | Animate | Duplicate `on:animate:enter` or `on:animate:leave` event binding | Error |
| D038 | Animate | `animate:` expression type mismatch (not `string \| string[]`) | Error |
| D039 | Animate | `on:animate:` handler type mismatch | Error |
| D040 | Expressions | Restricted TypeScript form used inside `{ ... }` | Error |
| D041 | Root node | a native-element `rootNode` is declared but the template does not have exactly one renderable root node | Error |
| D042 | Root node | a native-element `rootNode` is declared but the root node is a block construct: a control-flow block (`@if`/`@for`/`@switch`), a `@defer` block, or a `@boundary` block | Error |
| D043 | Root node | a native-element `rootNode` is declared but the root node is not a native element | Error |
| D044 | Root node | The actual native root element type is not assignable to the declared `rootNode` type | Error |

### 13.1 Diagnostic Examples

One example per diagnostic — just enough to show the violation.

```ts
// D001 — unresolved identifier
<h1>{userName}</h1> // ❌ D001

// D002 — unresolved element
<FancyCard title={'hello'} /> // ❌ D002

// D003 — reference resolves, but to the wrong kind
const helper = (x: number) => x * 2;
<helper />                              // ❌ D003: not a component
<div use:helper()>X</div>               // ❌ D003: not a directive
@derive total = helper(x={1});          // ❌ D003: not a derivation
// Contrast D002, where nothing resolves at all:
<div use:noSuchDirective()>X</div>      // ❌ D002

// D004 — binding primitive outside bindings
const Broken = component({
  setup: () => {
    const name = input<string>(); // ❌ D004
    return @{ <span>{name()}</span> };
  },
});

// D005 — children is not a fragment
bindings: { children: input<string>() } // ❌ D005

// D006 — reserved `ref` binding declared on a component
bindings: { ref: input<string>() } // ❌ D006

// D007 — component or directive providers reads non-input
providers: (inputs) => { inputs.selected; return []; } // ❌ D007

// D008 — invalid setup return
component({ setup: () => ({ expose: {} }) }) // ❌ D008

// D009 — multiple @{ } literals / early return with markup
const Bad = component({
  setup: ({ flag }) => {
    if (flag()) {
      return @{ <span>A</span> }; // ❌ D009: @{ } not in tail position
    }
    return @{ <span>B</span> };
  },
});

// D009 — @{ } inside a branch (even without early return)
const AlsoBad = component({
  setup: () => {
    const tmpl = condition ? @{ <span>A</span> } : @{ <span>B</span> }; // ❌ D009
    return tmpl;
  },
});

// D010 — unknown native property
<div colour="red">Hello</div> // ❌ D010

// D011 — unknown component binding
<UserDetail user={u()} role="admin" /> // ❌ D011: 'role' not in bindings

// D012 — duplicate binding
<button disabled={true} disabled={false}>Click</button> // ❌ D012

// D012 — duplicate static attribute
<div id="a" id="b">Content</div> // ❌ D012

// D012 — duplicate children (explicit prop + implicit nested content)
<Card children={body}><p>Also children</p></Card> // ❌ D012

// D013 — static + dynamic clash
<div id="static" id={dynamicId()}>Content</div> // ❌ D013

// D014 — binding bound with the syntax of a different kind
<UserDetail user={u()} makeAdmin={handler} />  // ❌ D014: makeAdmin is an
                                               //    output(); use on:makeAdmin
// Permitted: a model() may be bound one-way — ModelSignal ⊑ InputSignal, and
// the writeback half is simply not requested (§5)
<UserDetail user={u()} email={'a@b.c'} />      // ✅

// D015 — missing required component binding
<Card><p>Body</p></Card> // ❌ D015: required 'title' missing

// D016 — missing required directive input
<button use:tooltip()>Save</button> // ❌ D016: 'message' required

// D017 — type mismatch
<Counter count={'five'} /> // ❌ D017: string not assignable to number

// D018 — model bound to non-writable
<input model:value={computed(() => 'x')} /> // ❌ D018

// D019 — model: on non-modelable element
<div model:value={text}>X</div> // ❌ D019

// D020 — once: on model/output
<UserDetail once:model:email={email} user={u()} /> // ❌ D020

// D020 — once: on a native element property (once: is an input feature)
<div once:id={staticId()}>X</div> // ❌ D020

// D021 — once:prop + prop duplicate
<Counter once:count={5} count={n()} /> // ❌ D021

// D022 — on-prefix warning
bindings: { onSubmit: output<void>() } // ⚠️ D022

// D023 — class:/style: on component element
<UserDetail class:active={true} user={u()} /> // ❌ D023
<UserDetail style:color={'red'} user={u()} /> // ❌ D023

// D024 — directive host incompatible
<div use:inputMask(mask={'###'})>X</div> // ❌ D024: HTMLDivElement ⊄ HTMLInputElement

// D024 — a DOM-element directive on a component with no element root.
// tooltip declares host: ref<HTMLElement>(); MultiTags has the default rootNode,
// so Root(MultiTags) = RootNode, which is not an HTMLElement.
const MultiTags = component({
  setup: () => @{
    <p>one</p>
    <p>two</p>
  },
});
<MultiTags use:tooltip(message={'x'}) />     // ❌ D024
<MultiTags use:logDirective() />             // ✅ host: ref<HTMLElement | RootNode>()

// D025 — same directive twice
<button use:tooltip(message={'A'}) use:tooltip(message={'B'})>X</button> // ❌ D025

// D025 — a call-site directive colliding with one on the native-element root
const Button = component({
  rootNode: element<HTMLButtonElement>(),
  setup: () => @{ <button use:tooltip(message={'Internal'})>X</button> },
});
<Button use:tooltip(message={'External'}) /> // ❌ D025: collides on Button's root

// D026 — fragment arg mismatch at the invocation (§10.3).
// A receiver declared with fragment.required<[string, number]>() receives
// row : Signal<Fragment<[string, number]>>. Read it, then invoke the source:
@render(row()(item))        // ❌ D026: 1 argument, expected 2
@render(row()(label, 0))    // ✅

// D026 — the same code on the declaration side (§3.4): an inline @fragment's
// parameter list must match the parent binding it is delivered to
<List>
  @fragment row(i: Item) { <span>{i.name}</span> }  // ❌ D026 if List declares
</List>                                             //    row: fragment.required<[Item, number]>()

// D027 — no matching parent fragment binding
<Card title={'X'}>@fragment footer() { <p>X</p> }</Card> // ❌ D027

// Permitted: inside a native element there is nothing to deliver to, so the
// same declaration is a local named template (§10.1) — not an error
<div>@fragment row(i: Item) { <span>{i.desc}</span> }</div> // ✅

// D028 — duplicate inline fragment
<List>
  @fragment row(i: Item) { <span>{i.name}</span> }
  @fragment row(i: Item) { <b>{i.name}</b> }  // ❌ D028
</List>

// D029 — inline fragment inside use:
<button use:popover(@fragment content() { <div>Body</div> })>X</button> // ❌ D029

// D030 — ref type incompatible
const child = ref<HTMLDivElement>();
<Child ref={child} /> // ❌ D030: expects Ref<{ value: Signal<number> } | undefined>

// D031 — missing required derivation input
@derive total = price(); // ❌ D031: 'item' required

// D032 — derivation non-input binding
@derive total = price(model:item={x}); // ❌ D032

// D033 — derivation declares a non-input binding
derivation({ bindings: { changed: model<number>() }, /* ... */ }) // ❌ D033

// D034 — animate: on component element
<Card animate:enter={'fade'} /> // ❌ D034

// D035 — invalid animate phase
<div animate:show={'fade'}>X</div> // ❌ D035

// D036 — duplicate animate:enter class binding
<div animate:enter={'a'} animate:enter={'b'}>X</div> // ❌ D036

// D037 — duplicate on:animate:leave event binding
<div on:animate:leave={f1} on:animate:leave={f2}>X</div> // ❌ D037

// D038 — animate: expression type mismatch
<div animate:enter={42}>X</div> // ❌ D038: number not assignable

// D039 — on:animate: handler type mismatch
<div on:animate:enter={(x: string) => {}}>X</div> // ❌ D039

// D040 — restricted form inside { }
<button on:click={count = 5}>X</button>              // ❌ D040: assignment
<span>{value as string}</span>                        // ❌ D040: type assertion
<span>{new Date().getFullYear()}</span>               // ❌ D040: new
// Permitted: an arrow body is ordinary TypeScript, statements included
<button on:click={() => { count.set(0); log(); }}>X</button> // ✅

// D041 — a native-element rootNode with more than one renderable root node
const TwoRoots = component({
  rootNode: element<HTMLButtonElement>(),
  setup: () => @{
    <button>A</button>
    <button>B</button>                       // ❌ D041
  },
});

// D041 — a native-element rootNode with no renderable root node.
// @let is declaration-only, so it does not count as the root.
const NoRoot = component({
  rootNode: element<HTMLElement>(),
  setup: () => @{
    @let n = 1;                              // ❌ D041: zero renderable roots
  },
});

// OK — a declaration beside the root element is not a second root
const WithLet = component({
  rootNode: element<HTMLButtonElement>(),
  setup: () => @{
    @let label = 'x';
    <button>{label}</button>                 // ✅ exactly one renderable root
  },
});

// D042 — a native-element rootNode with a control-flow root
const CondRoot = component({
  rootNode: element<HTMLButtonElement>(),
  setup: () => @{
    @if (cond()) {                           // ❌ D042
      <button>X</button>
    }
  },
});

// D043 — a native-element rootNode with a root that is not a native element
const Inner = component({ setup: () => @{ <button>x</button> } });
const CompRoot = component({
  rootNode: element<HTMLElement>(),
  setup: () => @{ <Inner /> },               // ❌ D043
});

// D044 — a native root whose type violates the declared root contract
const WrongRootType = component({
  rootNode: element<HTMLButtonElement>(),
  setup: () => @{ <input /> },              // ❌ D044: HTMLInputElement ⊄ HTMLButtonElement
});

// OK — the actual root may be more specific than the declared contract
const BroadRoot = component({
  rootNode: element<HTMLElement>(),
  setup: () => @{ <button>X</button> },      // ✅ HTMLButtonElement ⊑ HTMLElement
});
<BroadRoot use:tooltip(message={'x'}) />     // ✅ tooltip accepts HTMLElement
// buttonOnly declares host: ref<HTMLButtonElement>(); call-site checks use
// the public HTMLElement contract, even though the private root is a button.
<BroadRoot use:buttonOnly() />              // ❌ D024: HTMLElement ⊄ HTMLButtonElement

// OK — the same template with the default rootNode. Root = RootNode, and the
// directives applied to <NoFlag /> never reach Inner (attachment is not
// transitive).
const NoFlag = component({
  setup: () => @{ <Inner /> },               // ✅
});
```
