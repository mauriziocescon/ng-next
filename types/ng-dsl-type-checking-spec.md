# Type Checking Judgment Specification

## Angular Signal Components — Template DSL

This document defines what the **template type checker** must verify — the
structure inside `@{ ... }` that TypeScript cannot check on its own: element and
component bindings, directives, forwarding, fragments, control flow, and refs.

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
| `F(C)` | Forward surface type of component C (`never` if none) |
| `I(tag)` | Intrinsic element host type (e.g. `I("button") = HTMLButtonElement`) |
| `⊑` | Assignability (subtype) |
| `≡` | Exact type equality |

Component metadata shape:

```
C : ComponentInstance<B, E, S, M>
B = bindings record
E = expose type (void when absent)
S = forward surface type (never when absent)
M = TemplateMarkup<TAst>
```

### Template node vocabulary

The judgments are stated over the fields below. They name the **roles** a
parsed node carries, not a data structure — a compiler is free to represent
them however it likes.

| Node | Fields |
|------|--------|
| element (native or component) | `name`, `attributes`, `inputs`, `models`, `outputs`, `classes`, `styles`, `animations`, `references`, `directives`, `fragments`, `children`, `forwardMarker` |
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
intrinsic nor a component — is D044.

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

Rejection must name the offending form           → D042

Scope of the ban: it applies to the binding expression and to every
expression nested within it, but NOT to the body of an arrow function
appearing in the expression. An arrow body is ordinary TypeScript — a
handler such as `on:click={() => { count.set(0); log(); }}` may contain
statements, and the DSL does not reach inside it.
─────────────────────────────────────────────────────────────────


DIAGNOSTIC-MAPPING
─────────────────────────────────────────────────────────────────
TypeScript diagnostics for e are reported at sourceSpan(e) in the `.ng` file.

D001 (unresolved identifier) and D015 (expression not assignable to a
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

**Why delegation rather than a curated subset.** An enumerated expression
grammar has to track TypeScript's forever, and each omission is a construct
the DSL silently cannot express — arrow-function handlers, `f?.()`, postfix
`!`, template literals. A rejection pass over a real TypeScript expression
also produces a better diagnostic than a parse failure: `count = 5` reports
*assignment is not allowed in a template expression* (D042) rather than an
unexplained syntax error.

Correspondingly, the template tree carries each expression opaquely — its
spans plus the TypeScript node — and does not model its internals. The same
holds for the type annotations on `@fragment` parameters (§10.1): they are
TypeScript types, carried as written and resolved by TypeScript.

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
B[input.name] : InputSignal<T>                        → D010 if absent
Γ ⊢ input.value : U    U ⊑ T                          → D015 on mismatch
─────────────────────────────────────────────────
```

### 3.2 Model Check

```
CHECK-MODEL(Γ, B, model)
─────────────────────────────────────────────────
model.name ∈ keys(B)
B[model.name] : ModelSignal<T>                        → D010 if absent
Γ ⊢ model.value : WritableSignal<T>                   → D016 if not writable
─────────────────────────────────────────────────
```

### 3.3 Output Check

```
CHECK-OUTPUT(Γ, B, output)
─────────────────────────────────────────────────
output.name ∈ keys(B)
B[output.name] : OutputEmitterRef<T>                  → D010 if absent
Γ ⊢ output.handler : U
U ⊑ ((e: T) → void)                                   → D015 on mismatch
       (arity-safe: () → void is assignable)
─────────────────────────────────────────────────
```

### 3.4 Fragment Check

```
CHECK-FRAGMENT(Γ, B, frag)
─────────────────────────────────────────────────
frag.name ∈ keys(B)
B[frag.name] : FragmentBinding<T>                          → D030 if absent
frag.parameters match FragmentArgs<T> positionally         → D029
Γ' = Γ ∪ { paramᵢ.name : Tᵢ }
CHECK-NODES(Γ', frag.children)
─────────────────────────────────────────────────
```

This is the **inline** delivery form — a `@fragment` declared as a direct
child of a component element (§10.2). A `@fragment` anywhere else declares a
name without delivering it and is checked by FRAGMENT-DEF (§10.1) instead.
The by-value form `name={expr}` is CHECK-FRAGMENT-PROP (§10.2).

The `children` binding name is reserved at **declaration** time (D004): if
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

Violation → D013 (component), D014 (directive), D034 (derivation)
─────────────────────────────────────────────────
```

`provided_fragments` includes all delivery mechanisms defined in §10.2.

Note that only fragments carry required-ness in the type:
`RequiredFragmentBinding<T>` and `OptionalFragmentBinding<T>` are nominally
distinct (`ng-types.ts`). Angular erases it for inputs and models —
`input.required<User>()` and `input<User>(d)` are both `InputSignal<User>` —
so a checker must read `required(k)` from the declaration site. There is no
`InputSignal.required<T>` type to test against.

### 3.6 Unknown Bindings Check

```
NO-UNKNOWN-BINDINGS(B, node)
─────────────────────────────────────────────────
∀ b ∈ binding lists carried by node:  b.name ∈ keys(B)   → D010

  component element: attributes, inputs, models, outputs
  directive:         inputs, models, outputs, fragments
  derive:            inputs

Native elements do not use this rule — they resolve against the DOM type
system through the CHECK-NATIVE-* rules in §4 (→ D009).

A component element's delivered `fragments` are excluded: an unmatched
fragment there is D030 (§3.4, §10.2), the more specific code. Fragments
delivered to a directive arrive by reference and have no such rule, so they
stay under D010.
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
Violation → D011

A fragment must be delivered once, by one mechanism (§10.2). Let
delivered(name) = the fragment props in inputs, the inline fragments, and
the implicit children fragment, taken together:

∀ name: |delivered(name)| ≤ 1

  both occurrences are inline fragments  → D031
  otherwise (mechanisms differ)          → D011

Two occurrences of the same name in the same list get the more specific
code; a name arriving by two different mechanisms is an ordinary duplicate.

Exception: a pair differing only in the once: modifier — once:prop and prop
on the same element — is D019, not D011, for the same reason.

classes: repeatable (multiple class:name allowed per element)
styles: repeatable (multiple style:prop allowed per element)
animate: uses ANIMATE-CONSTRAINTS (§4.2)
use: at most one application of a given directive per resolved host
     element — the UNIQUE premise of §7, → D023 (see §7.1)
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
Violation → D011

The once: exception of NO-DUPLICATE-BINDINGS applies here too: once:prop
and prop on the same application is D019.

Two applications of the *same* directive to one element are D023, not D011 —
that is the UNIQUE premise of §7, not a binding-identity question.
─────────────────────────────────────────────────


NO-STATIC-DYNAMIC-CLASH(node)
─────────────────────────────────────────────────
∀ name ∈ attributes:  name ∉ {b.name | b ∈ inputs}     → D012

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
Violation → D033
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

once:model:*                       → D018
once:on:*                          → D018
once: on a native element property → D018
once: on a fragment prop (§10.2)   → D018
once:prop + prop on same target    → D019
─────────────────────────────────────────────────
```

Note on when D018 fires. The `model:`/`on:` cases are parse-time: the grammar
admits `once:` only before an input name, so `once:model:x` and `once:on:x`
never reach the checker. The other two are check-time — `once:prop` is
well-formed syntax, and only element resolution (§4) and the binding record
(§10.2) tell a component input apart from a native property or a fragment
prop.

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
node.forwardMarker ≠ ∅:         FORWARD-PLACEMENT (§6.2)
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
                                                       → D009 on failure


CHECK-NATIVE-INPUT
─────────────────────────────────────────────────
input.name ∈ Props(H)    Props(H)[input.name] = T      → D009 if absent
input.once = false                                     → D018 otherwise
Γ ⊢ input.value : U     U ⊑ T                          → D015 on mismatch


CHECK-NATIVE-OUTPUT
─────────────────────────────────────────────────
output.name ∈ Events(H)    Events(H)[output.name] = Event<T>
Γ ⊢ output.handler : U
U ⊑ ((e: T) → void)    (same arity-safe rule as §3.3)


CHECK-NATIVE-MODEL
─────────────────────────────────────────────────
tag ∈ {"input", "select", "textarea"}                  → D017 otherwise
model.name ∈ ModelableProps(H)                         → D009 if absent
ModelableProps(H)[model.name] = T
Γ ⊢ model.value : WritableSignal<T>
```

### 4.1 class: and style: Typing

`class:` and `style:` apply **only** to native elements. Using them on component
elements is a compile-time error (D021).

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
Γ ⊢ expr : string | string[]                           → D040 on mismatch


ANIMATE-EVENT-BINDING
─────────────────────────────────────────────────
on:animate:phase={handler}   where phase ∈ {"enter", "leave"}
Γ ⊢ handler : (event: AnimationCallbackEvent) => void   → D041 on mismatch

AnimationCallbackEvent = { target: Element; animationComplete: VoidFunction; }


ANIMATE-CONSTRAINTS
─────────────────────────────────────────────────
- applies ONLY to native elements (not components → D036)
- phase must be "enter" or "leave" → D037 (parse-time: the grammar admits only
  those two phase names)
- at most one animate:enter and one animate:leave (class form) per element → D038
- at most one on:animate:enter and one on:animate:leave per element        → D039
- both phases and both forms (class + event) can coexist on the same element
─────────────────────────────────────────────────
```

---

## 5. Component Element

```
COMPONENT-ELEMENT
─────────────────────────────────────────────────────────────────
C = resolve(tag, Γ)
C : ComponentInstance<B, E, S, M>                          → D044 otherwise

node.classes ≠ []        → D021
node.styles ≠ []         → D021
node.animations ≠ []     → D036
node.forwardMarker ≠ ∅   → D028   (FORWARD-INVALID, §6.2)

∀ attr ∈ node.attributes:  CHECK-COMP-TEXT-INPUT(Γ, B, attr)
∀ b ∈ node.inputs:         dispatch on BindingKind<B[b.name]> (§12):
                             b.name ∉ keys(B) → D010
                             input    → CHECK-INPUT(Γ, B, b)
                             model    → CHECK-INPUT(Γ, B, b)   (see note)
                             fragment → CHECK-FRAGMENT-PROP(Γ, B, b)
                             output   → D046
                             unknown  → D046
∀ model ∈ node.models:     CHECK-MODEL(Γ, B, model)
∀ output ∈ node.outputs:   CHECK-OUTPUT(Γ, B, output)
∀ frag ∈ node.fragments where frag.origin = "inline":
  CHECK-FRAGMENT(Γ, B, frag)
∀ frag ∈ node.fragments where frag.origin = "implicitChildren":
  B["children"] : FragmentBinding<void>                    → D030
  CHECK-NODES(Γ, frag.children)
∀ ref ∈ node.references:   CHECK-REF(Γ, E, ref)
node.children = []         (nested content is lowered to the
                            "implicitChildren" fragment — §10.2)
∀ dir ∈ node.directives:
  F(C) = never → D024
  else: CHECK-DIRECTIVE-USE(Γ, F(C), RESOLVED-FORWARD-HOSTS(C), dir)
CHECK-REQUIRED(B, provided, "component")
NO-DUPLICATE-BINDINGS(node)
NO-STATIC-DYNAMIC-CLASH(node)
NO-UNKNOWN-BINDINGS(B, node)
─────────────────────────────────────────────────────────────────
Γ ⊢ <C ...> ✓
```

The dispatch is total: every input entry lands on exactly one row, so a
binding that exists under the wrong kind is distinguishable from one that does
not exist at all (D046 vs D010).

**On binding a `model()` one-way.** `model` dispatches to CHECK-INPUT rather
than to D046 because `ModelSignal<T> ⊑ InputSignal<T>` in Angular's type
hierarchy (§3.5), so the premise `B[name] : InputSignal<T>` already holds. The
effect is that `<C value={expr} />` against `value: model<T>()` is a legal
one-way binding — the writeback half is simply not requested — matching how
`[value]` on a model input behaves today. Requesting writeback needs `model:`,
which CHECK-MODEL additionally constrains to a `WritableSignal` (D016).

Component-specific rule:

```
CHECK-COMP-TEXT-INPUT
─────────────────────────────────────────────────
attr.name ∈ keys(B)                                    → D010 if absent
B[attr.name] : InputSignal<T>                          → D046 on wrong kind
attr.value is string literal V    V : literal type
V ⊑ T                                                  → D015 on mismatch
─────────────────────────────────────────────────
```

### 5.1 Component Declaration Contracts

TypeScript API well-formedness rules (not template-node judgments):

```
SETUP-RETURN
─────────────────────────────────────────────────────────────────
setup returns: M | { template: M } | { template: M, expose: E }
where M : TemplateMarkup<TAst>
Any other return shape → D007
→ component(...) : ComponentInstance<B, E, S, M>


SINGLE-TEMPLATE-RULE
─────────────────────────────────────────────────────────────────
setup body contains exactly one @{ } literal (markup literal).
That literal must appear only at the tail position:
  - Direct return: setup: () => @{ ... }
  - Block return:  setup: () => { ...; return @{ ... }; }
  - Object return: setup: () => { ...; return { template: @{ ... }, expose }; }

Multiple @{ } literals in setup → D008
@{ } inside branches, loops, or non-tail position → D008
─────────────────────────────────────────────────────────────────


PROVIDERS-INPUTS-ONLY
─────────────────────────────────────────────────────────────────
providers receives Pick<B, input keys only>.
Models, outputs, and fragments are excluded → D006.


BINDING-PRIMITIVE-PLACEMENT
─────────────────────────────────────────────────────────────────
input(), input.required(), model(), output(), fragment() and
fragment.required() may appear only as values of the `bindings` record of
component(...), directive(...) or derivation(...).
Calling one anywhere else — in setup, providers, or module scope — is → D003.

surface() may appear only as the value of the `forward` key of a
component(...) config. Anywhere else — including inside `bindings` — is → D003.


RESERVED-COMPONENT-BINDINGS
─────────────────────────────────────────────────────────────────
if "children" ∈ keys(B):  B["children"] : FragmentBinding<void>
otherwise → D004

if "ref" ∈ keys(B) (component only):  → D005
─────────────────────────────────────────────────────────────────


ON-PREFIX-WARNING
─────────────────────────────────────────────────────────────────
∀ k ∈ keys(B) of component(...), directive(...) or derivation(...):
  k starts with "on" → D020 (warning)

Reported once at the declaration site, not at each call site.
─────────────────────────────────────────────────────────────────


FORWARD-SURFACE
─────────────────────────────────────────────────────────────────
component({ forward: surface<S>(), ...config })
S ⊑ HTMLElement    (enforced by the type parameter bound on surface)
B, E, M are inferred from the same config
result : ComponentInstance<B, E, S, M>

component({ ...config })        (no `forward` key)
result : ComponentInstance<B, E, never, M>

One signature covers both. S is declared in a value position, so it is
inferred like every other config-derived parameter; omitting `forward`
leaves no inference site and S falls back to its `never` default.

surface<S>() is declaration-only: a phantom brand with no implementation.
It is erased with the `forward` key, contributes no runtime object, and is
never visible to setup — which is why it does not appear in B.

S is a promise, not a fact. FORWARD-PLACEMENT checks H ⊑ S, so a component
may declare a wider surface than the element it forwards to and keep the
internal tag out of its public API. A surface read off the @forward() element
instead would always make the tightest promise, making a change of internal
tag a breaking change for consumers with no declaration site to report it at.
```

---

## 6. @forward() Marker

### 6.1 Payloads

```
PAYLOAD-DEFS
─────────────────────────────────────────────────────────────────
ForwardDirectivePayload(C) =
  directives on a <C ...> call site where F(C) ≠ never

Directives are the only forwarded payload. They resolve to native
hosts via RESOLVED-FORWARD-HOSTS.
─────────────────────────────────────────────────────────────────
```

### 6.2 Placement Rules and Resolved Hosts

```
FORWARD-PLACEMENT
─────────────────────────────────────────────────────────────────
Enclosing component declares forward: surface<S>()
  i.e. F(C) ≠ never                                → D045 otherwise
Exactly one native element with @forward() must exist → D027 on multiple
H = I(tag of that element)
H ⊑ S → D025 on failure
If no @forward() placement exists → D026
ForwardDirectivePayload delivered to that single target
─────────────────────────────────────────────────────────────────

D045 is the converse of D026: D026 is a component that declares a surface and
never places its payload, D045 is a placement in a component that has no
payload to place. Without it the premise would fall through to `H ⊑ never`,
reporting D025 — an assignability message for a component that has no surface
to be assignable to. Both remain a lookup for the sibling `forward` key in the
same config object, not a search of an unrelated construct.


FORWARD-INVALID
─────────────────────────────────────────────────────────────────
@forward() on a node that is not a native element → D028
Only a native element can consume a forwarded directive payload.
─────────────────────────────────────────────────────────────────


RESOLVED-FORWARD-HOSTS
─────────────────────────────────────────────────────────────────
Native element N:
  RESOLVED-FORWARD-HOSTS(N) = {N}

Component C where F(C) = S ≠ never:
  target = the single @forward() placement in T(C)
  I(tag(target)) ⊑ S
  RESOLVED-FORWARD-HOSTS(C) = {target}

Exactly one placement per component (D027).
Directive host checks use RESOLVED-FORWARD-HOSTS.
─────────────────────────────────────────────────────────────────
```

---

## 7. Directive Application

```
CHECK-DIRECTIVE-USE(Γ, H_host, R_host, dir)
─────────────────────────────────────────────────────────────────
D = resolve(dir.directiveName, Γ)                  → D002 if unresolved
D : DirectiveInstance<H_D, B_D, E_D>               → D044 otherwise

HOST-COMPAT:  H_host ⊑ H_D                         → D022
UNIQUE:       D at most once per element in R_host  → D023

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

Fragment-specific check for directives:

```
CHECK-DIRECTIVE-FRAGMENT(Γ, B_D, frag)
─────────────────────────────────────────────────
frag.name ∈ keys(B_D)
B_D[frag.name] : FragmentBinding<T>
Γ ⊢ frag.value : U    U ⊑ FragmentBinding<T>
─────────────────────────────────────────────────
```

Inline `@fragment` delivery is supported only on component elements. Directives receive fragments exclusively by reference via `name={expr}` syntax inside `use:dir(...)` — inline `@fragment` declarations are rejected (D032).

Note: D032 is a parse-time diagnostic. The grammar admits only `name={expr}`
inside `use:dir(...)`, so an inline `@fragment` declaration there never reaches
the checker.

That single `name={expr}` syntax is also why `dir.inputs` and `dir.fragments`
cannot be told apart at parse time — the same ambiguity §10.2 describes for
component elements. The split is made after `D` resolves, by `BindingKind<B_D[name]>`
(§12); a checker may equally keep one list and dispatch on the kind, as
COMPONENT-ELEMENT does.

### 7.1 Uniqueness Note

Uniqueness (D023) is per resolved host element, not per syntactic position.
When directives are forwarded through `@forward()`, `AppliedDirs(H) =
LocalDirs(H) ∪ ForwardedDirs(H)` — duplicates across local and forwarded
sets are rejected.

Directives do not declare `providers`.

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
D : DerivationInstance<B_D, T>                     → D044 otherwise

∀ input ∈ node.inputs:  CHECK-INPUT(Γ, B_D, input)
CHECK-REQUIRED(B_D, provided, "derivation")
NO-UNKNOWN-BINDINGS(B_D, node)
Any non-input binding form → D035

Γ' = Γ ∪ { node.name : Signal<T> }
─────────────────────────────────────────────────────────────────
Γ ⊢ @derive name = D(...)    producing Γ'
```

Block-scoped to enclosing control-flow block. Each `@for` iteration owns an
independent instance.

Note: D035 is a parse-time diagnostic. The grammar admits only input bindings
inside `@derive name = D(...)` — `name={expr}` and its `bind:`/`once:` forms —
so `model:`, `on:` and inline fragment forms never reach the checker.

### 9.1 Derivation Declaration Contract

A TypeScript API well-formedness rule (not a template-node judgment):

```
DERIVATION-BINDINGS-INPUTS-ONLY
─────────────────────────────────────────────────────────────────
∀ k ∈ keys(B) of derivation(...):  BindingKind<B[k]> = input
Model, output or fragment binding → D043

A derivation has no DOM surface — no host, no events, no content — so the
only binding kind that means anything is an input.
─────────────────────────────────────────────────────────────────
```

Enforced at the type level by `ValidateDerivationBindings` (`ng-types.ts`),
which maps a non-input binding to `never`. D035 is the template-side
counterpart: D043 rejects the *declaration*, D035 the *call site*.

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

In both cases introduces name : RequiredFragmentBinding<T> in its lexical
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

### 10.2 Fragment Delivery

Three mechanisms deliver a fragment to a component binding.

**By value (fragment prop):** `<Component fragmentName={expr} />`

```
CHECK-FRAGMENT-PROP(Γ, B, prop)
─────────────────────────────────────────────────
prop.name ∈ keys(B)                                        → D010 if absent
prop.once = false                                          → D018 otherwise

B[prop.name] : RequiredFragmentBinding<T>
  Γ ⊢ prop.value : U   U ⊑ FragmentBinding<T>              → D015 on mismatch

B[prop.name] : OptionalFragmentBinding<T>
  Γ ⊢ prop.value : U   U ⊑ FragmentBinding<T> | undefined  → D015 on mismatch
─────────────────────────────────────────────────
```

**Inline:** `@fragment name(...) { ... }` as a direct child of a component
element, delivered to the matching binding and checked by CHECK-FRAGMENT
(§3.4).
- Parent must have binding `name: FragmentBinding<T>` → D030
- The same name must not also arrive as a fragment prop → D011
- No duplicate inline fragment with the same name → D031

**Implicit children:** non-fragment direct child content inside
`<Component>...</Component>`, lowered to a fragment named `children` with
origin `implicitChildren`. Parent must have `children: FragmentBinding<void>`
→ D030.

All three work for `children`. Providing the same fragment name through more
than one mechanism is a duplicate (D011 / D031).

**On the shared syntax.** A fragment prop and an input binding are written
identically — `name={expr}` — so the call site alone does not say which one it
is; the component's binding record `B` is the disambiguator, through
`BindingKind` (§12). Two consequences worth stating. A fragment prop is
subject to the input rules that are about *position* (it occupies the same
name-uniqueness slot, D011) but not to those about *being an input* (`once:`
on one is D018, §3.9). And changing a declaration from `input<T>()` to
`fragment<T>()` silently changes what every existing call site means — a
declaration-side change a reviewer has to catch, since nothing at the call
site marks the difference.

### 10.3 @render Invocation

```
RENDER
─────────────────────────────────────────────────────────────────
Γ ⊢ expr : TemplateMarkup | undefined

if expr is a fragment invocation f(a₁, ..., aₙ)  (incl. f?.(...)):
  Γ ⊢ f : FragmentBinding<T> | undefined
  (a₁, ..., aₙ) match FragmentArgs<T> positionally         → D029

Optional: if options.injector present:
  Γ ⊢ options.injector : Injector | null | undefined
─────────────────────────────────────────────────────────────────
Γ ⊢ @render(expr, { injector? }) ✓
```

When `expr` is `undefined`, nothing is rendered (no-op).
This supports `@render(optionalFragment?.())` directly.

**Why D029 rather than a mapped TypeScript diagnostic.** A fragment binding is
a callable (`ng-types.ts`), so TypeScript would catch a bad argument list on
its own and §2 would surface it in the D015/D001 family. The DSL claims the
code instead, because at a `@render` site the arity is the fragment contract
rather than an incidental call signature, and D029 can name the binding the
arguments failed to match. The same call written in `setup` — `children?.()` —
stays ordinary TypeScript; D029 is a template-side code only.

This is the invocation half of D029. §3.4 is the declaration half: an inline
`@fragment`'s *parameter* list against the parent binding's `FragmentArgs<T>`.
Both compare a positional list to the same `FragmentArgs<T>`, from the two
sides of the contract.

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
| D003 | Declaration | `input()`/`output()`/`model()`/`fragment()` called outside `bindings`, or `surface()` called outside a component's `forward` key | Error |
| D004 | Declaration | Reserved `children` binding is not a `FragmentBinding<void>` | Error |
| D005 | Declaration | Reserved `ref` binding declared on a component | Error |
| D006 | Declaration | `providers` reads model/output/fragment bindings | Error |
| D007 | Declaration | Setup does not return `TemplateMarkup` or `{ template }` | Error |
| D008 | Declaration | Multiple `@{ }` literals in setup or `@{ }` not in tail position | Error |
| D009 | Binding: Existence | Unknown attribute/property on native element | Error |
| D010 | Binding: Existence | Unknown binding on component, directive, or derivation | Error |
| D011 | Binding: Existence | Duplicate binding identity (including duplicate refs or fragments) | Error |
| D012 | Binding: Existence | Static attribute + dynamic binding clash (same name) | Error |
| D013 | Binding: Required | Missing required component input/model/fragment | Error |
| D014 | Binding: Required | Missing required directive input/model/fragment | Error |
| D015 | Binding: Types | Type mismatch (expression not assignable to binding type; mapped TS diagnostic, §2) | Error |
| D016 | Binding: Types | `model:` bound to non-writable signal | Error |
| D017 | Binding: Types | `model:` on non-modelable native element | Error |
| D018 | Binding: Modifiers | `once:` on a non-input target (`model:`, `on:`, native element property, fragment prop) | Error |
| D019 | Binding: Modifiers | `once:prop` + `prop` duplicate on same element | Error |
| D020 | Binding: Modifiers | `on`-prefixed binding name | Warning |
| D021 | Binding: Scope | `class:` or `style:` on component element | Error |
| D022 | Directives | Directive host incompatible with element/forward surface | Error |
| D023 | Directives | Same directive applied twice to same resolved host element | Error |
| D024 | Directives | Directive on a component that declares no forward surface | Error |
| D025 | Forwarding | `@forward()` element type not assignable to forward surface S | Error |
| D026 | Forwarding | No `@forward()` in a component that declares a forward surface | Error |
| D027 | Forwarding | Multiple `@forward()` placements in one component | Error |
| D028 | Forwarding | `@forward()` on a node that is not a native element | Error |
| D029 | Fragments | Fragment argument/parameter list does not match `FragmentArgs<T>` — at a `@render` invocation (§10.3) or an inline `@fragment` declaration (§3.4) | Error |
| D030 | Fragments | Fragment delivered to a component element has no matching parent binding | Error |
| D031 | Fragments | Duplicate inline fragment name under same parent | Error |
| D032 | Fragments | Inline `@fragment` declaration inside directive `use:` binding | Error |
| D033 | Refs | `ref=` variable type incompatible with expose | Error |
| D034 | Derivation | Missing required derivation input | Error |
| D035 | Derivation | Derivation uses non-input binding form (parse-time) | Error |
| D036 | Animate | `animate:` on component element | Error |
| D037 | Animate | Invalid animate phase (not `enter`/`leave`) | Error |
| D038 | Animate | Duplicate `animate:enter` or `animate:leave` class binding | Error |
| D039 | Animate | Duplicate `on:animate:enter` or `on:animate:leave` event binding | Error |
| D040 | Animate | `animate:` expression type mismatch (not `string \| string[]`) | Error |
| D041 | Animate | `on:animate:` handler type mismatch | Error |
| D042 | Expressions | Restricted TypeScript form used inside `{ ... }` | Error |
| D043 | Derivation | `derivation(...)` declares a model, output or fragment binding | Error |
| D044 | Resolution | Reference resolves to the wrong kind (tag that is not a component, `use:` target that is not a directive, `@derive` target that is not a derivation) | Error |
| D045 | Forwarding | `@forward()` in a component that has no forward surface | Error |
| D046 | Binding: Existence | Binding bound with the syntax of a different kind (e.g. an `output()` bound as an input) | Error |

### 13.1 Diagnostic Examples

One example per diagnostic — just enough to show the violation.

```ts
// D001 — unresolved identifier
<h1>{userName}</h1> // ❌ D001

// D002 — unresolved element
<FancyCard title={'hello'} /> // ❌ D002

// D003 — binding primitive outside bindings
const Broken = component({
  setup: () => {
    const name = input<string>(); // ❌ D003
    return @{ <span>{name()}</span> };
  },
});

// D003 — surface() outside the `forward` key. Inside `bindings` the type
// system already rejects it (Surface is not a ComponentBindingValue); a call
// in setup or module scope is well-typed TypeScript, so it needs the rule.
const AlsoBroken = component({
  setup: () => {
    const s = surface<HTMLButtonElement>(); // ❌ D003
    return @{ <button @forward()>X</button> };
  },
});

// D004 — children is not a fragment
bindings: { children: input<string>() } // ❌ D004

// D005 — reserved `ref` binding declared on a component
bindings: { ref: input<string>() } // ❌ D005

// D006 — providers reads non-input
providers: (inputs) => { inputs.selected; return []; } // ❌ D006

// D007 — invalid setup return
component({ setup: () => ({ expose: {} }) }) // ❌ D007

// D008 — multiple @{ } literals / early return with markup
const Bad = component({
  setup: ({ flag }) => {
    if (flag()) {
      return @{ <span>A</span> }; // ❌ D008: @{ } not in tail position
    }
    return @{ <span>B</span> };
  },
});

// D008 — @{ } inside a branch (even without early return)
const AlsoBad = component({
  setup: () => {
    const tmpl = condition ? @{ <span>A</span> } : @{ <span>B</span> }; // ❌ D008
    return tmpl;
  },
});

// D009 — unknown native property
<div colour="red">Hello</div> // ❌ D009

// D010 — unknown component binding
<UserDetail user={u()} role="admin" /> // ❌ D010: 'role' not in bindings

// D011 — duplicate binding
<button disabled={true} disabled={false}>Click</button> // ❌ D011

// D011 — duplicate static attribute
<div id="a" id="b">Content</div> // ❌ D011

// D011 — duplicate children (explicit prop + implicit nested content)
<Card children={body}><p>Also children</p></Card> // ❌ D011

// D012 — static + dynamic clash
<div id="static" id={dynamicId()}>Content</div> // ❌ D012

// D013 — missing required component binding
<Card><p>Body</p></Card> // ❌ D013: required 'title' missing

// D014 — missing required directive input
<button use:tooltip()>Save</button> // ❌ D014: 'message' required

// D015 — type mismatch
<Counter count={'five'} /> // ❌ D015: string not assignable to number

// D016 — model bound to non-writable
<input model:value={computed(() => 'x')} /> // ❌ D016

// D017 — model: on non-modelable element
<div model:value={text}>X</div> // ❌ D017

// D018 — once: on model/output
<UserDetail once:model:email={email} user={u()} /> // ❌ D018

// D018 — once: on a native element property (once: is an input feature)
<div once:id={staticId()}>X</div> // ❌ D018

// D019 — once:prop + prop duplicate
<Counter once:count={5} count={n()} /> // ❌ D019

// D020 — on-prefix warning
bindings: { onSubmit: output<void>() } // ⚠️ D020

// D021 — class:/style: on component element
<UserDetail class:active={true} user={u()} /> // ❌ D021
<UserDetail style:color={'red'} user={u()} /> // ❌ D021

// D022 — directive host incompatible
<div use:inputMask(mask={'###'})>X</div> // ❌ D022: HTMLDivElement ⊄ HTMLInputElement

// D023 — same directive twice
<button use:tooltip(message={'A'}) use:tooltip(message={'B'})>X</button> // ❌ D023

// D023 — via forwarding
const Button = component({
  forward: surface<HTMLButtonElement>(),
  setup: () => @{ <button @forward() use:tooltip(message={'Internal'})>X</button> },
});
<Button use:tooltip(message={'External'}) /> // ❌ D023: collides on resolved host

// D024 — directive on a component that declares no forward surface
<Plain label={'hi'} use:tooltip(message={'tip'}) /> // ❌ D024

// D025 — @forward() type mismatch
const Button = component({
  forward: surface<HTMLButtonElement>(),
  setup: () => @{ <span @forward()>X</span> }, // ❌ D025: HTMLSpanElement ⊄ HTMLButtonElement
});

// D026 — declared surface never placed
const Button = component({
  forward: surface<HTMLButtonElement>(),
  setup: () => @{ <span>no forward</span> }, // ❌ D026
});

// D027 — multiple @forward() placements
const SplitPanel = component({
  forward: surface<HTMLDivElement>(),
  setup: () => @{
    <div @forward()>Left</div>
    <div @forward()>Right</div>  // ❌ D027
  },
});

// D028 — @forward() on a node that is not a native element.
// A forwarded directive payload can only land on a native element.
const Panel = component({
  forward: surface<HTMLDivElement>(),
  setup: () => @{
    <Card @forward()>           // ❌ D028: component element cannot consume the payload
      <p>Body</p>
    </Card>
  },
});

// D029 — fragment arg mismatch at the invocation (§10.3).
// A fragment is a callable, so this is an arity error against FragmentArgs<T>:
// row : fragment.required<[string, number]>() declares (string, number)
@render(row(item))          // ❌ D029: 1 argument, expected 2
@render(row(label, 0))      // ✅

// D029 — the same code on the declaration side (§3.4): an inline @fragment's
// parameter list must match the parent binding it is delivered to
<List>
  @fragment row(i: Item) { <span>{i.name}</span> }  // ❌ D029 if List declares
</List>                                             //    row: fragment.required<[Item, number]>()

// D030 — no matching parent fragment binding
<Card title={'X'}>@fragment footer() { <p>X</p> }</Card> // ❌ D030

// Permitted: inside a native element there is nothing to deliver to, so the
// same declaration is a local named template (§10.1) — not an error
<div>@fragment row(i: Item) { <span>{i.desc}</span> }</div> // ✅

// D031 — duplicate inline fragment
<List>
  @fragment row(i: Item) { <span>{i.name}</span> }
  @fragment row(i: Item) { <b>{i.name}</b> }  // ❌ D031
</List>

// D032 — inline fragment inside use:
<button use:popover(@fragment content() { <div>Body</div> })>X</button> // ❌ D032

// D033 — ref type incompatible
const child = ref<HTMLDivElement>();
<Child ref={child} /> // ❌ D033: expects Ref<{ value: Signal<number> } | undefined>

// D034 — missing required derivation input
@derive total = price(); // ❌ D034: 'item' required

// D035 — derivation non-input binding
@derive total = price(model:item={x}); // ❌ D035

// D036 — animate: on component element
<Card animate:enter={'fade'} /> // ❌ D036

// D037 — invalid animate phase
<div animate:show={'fade'}>X</div> // ❌ D037

// D038 — duplicate animate:enter class binding
<div animate:enter={'a'} animate:enter={'b'}>X</div> // ❌ D038

// D039 — duplicate on:animate:leave event binding
<div on:animate:leave={f1} on:animate:leave={f2}>X</div> // ❌ D039

// D040 — animate: expression type mismatch
<div animate:enter={42}>X</div> // ❌ D040: number not assignable

// D041 — on:animate: handler type mismatch
<div on:animate:enter={(x: string) => {}}>X</div> // ❌ D041

// D042 — restricted form inside { }
<button on:click={count = 5}>X</button>              // ❌ D042: assignment
<span>{value as string}</span>                        // ❌ D042: type assertion
<span>{new Date().getFullYear()}</span>               // ❌ D042: new
// Permitted: an arrow body is ordinary TypeScript, statements included
<button on:click={() => { count.set(0); log(); }}>X</button> // ✅

// D043 — derivation declares a non-input binding
derivation({ bindings: { changed: model<number>() }, /* ... */ }) // ❌ D043

// D044 — reference resolves, but to the wrong kind
const helper = (x: number) => x * 2;
<helper />                              // ❌ D044: not a component
<div use:helper()>X</div>               // ❌ D044: not a directive
@derive total = helper(x={1});          // ❌ D044: not a derivation
// Contrast D002, where nothing resolves at all:
<div use:noSuchDirective()>X</div>      // ❌ D002

// D045 — @forward() in a component with no forward surface.
// Without a `forward` key there is no payload, so there is nothing to place.
const Plain = component({
  setup: () => @{ <button @forward()>X</button> }, // ❌ D045
});

// D046 — binding bound with the syntax of a different kind
<UserDetail user={u()} makeAdmin={handler} />  // ❌ D046: makeAdmin is an
                                               //    output(); use on:makeAdmin
// Permitted: a model() may be bound one-way — ModelSignal ⊑ InputSignal, and
// the writeback half is simply not requested (§5)
<UserDetail user={u()} email={'a@b.c'} />      // ✅
```
