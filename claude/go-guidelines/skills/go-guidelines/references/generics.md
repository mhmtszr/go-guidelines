# Generics

## Version History

- **Go 1.18+**: Type parameters, constraints, `comparable`, `any`
- **Go 1.20+**: Comparable types fully satisfy `comparable` constraint
- **Go 1.21+**: Built-in generic functions (`min`, `max`, `clear`), improved type inference
- **Go 1.26+**: Self-referential type parameter constraints

## When to Use Generics

Use generics when the logic is **identical** across types and only the type changes:

```go
// Good — same logic, different types
func Filter[T any](items []T, fn func(T) bool) []T {
    var result []T
    for _, item := range items {
        if fn(item) {
            result = append(result, item)
        }
    }
    return result
}
```

## When NOT to Use Generics

### Don't replace interfaces with generics

Bad — generics for polymorphism:
```go
func Process[T Processor](p T) error {
    return p.Process()
}
```

Good — interfaces handle this naturally:
```go
func Process(p Processor) error {
    return p.Process()
}
```

Rule: If the function body only calls methods on the type parameter, use an interface instead.

### Don't genericize for one or two types

Bad — over-abstraction:
```go
func FormatID[T int64 | string](id T) string {
    return fmt.Sprintf("%v", id)
}
```

Good — just write two functions if the logic differs, or use `any` with a type switch if it doesn't:
```go
func FormatID(id any) string {
    return fmt.Sprintf("%v", id)
}
```

### Don't use generics for JSON/serialization helpers

Bad:
```go
func Decode[T any](r io.Reader) (T, error) {
    var v T
    err := json.NewDecoder(r).Decode(&v)
    return v, err
}
```

This saves almost nothing over the non-generic version and confuses callers about what `T` should be.

## Constraints

### Built-in Constraints

```go
any           // no constraint — accepts everything
comparable    // supports == and != (maps keys, dedup)
```

### The `cmp.Ordered` constraint (Go 1.21+)

For types that support `<`, `>`, `<=`, `>=`:

```go
import "cmp"

func Max[T cmp.Ordered](a, b T) T {
    if a > b {
        return a
    }
    return b
}
```

### Custom Constraints

```go
type Number interface {
    ~int | ~int8 | ~int16 | ~int32 | ~int64 |
    ~float32 | ~float64
}

func Sum[T Number](nums []T) T {
    var total T
    for _, n := range nums {
        total += n
    }
    return total
}
```

### The `~` (Tilde) Operator

`~T` matches any type whose **underlying type** is `T`. Without `~`, only the exact type matches.

```go
type Celsius float64
type Fahrenheit float64

// Without ~: Celsius and Fahrenheit do NOT match float64
type Exact interface { float64 }

// With ~: Celsius and Fahrenheit match because their underlying type is float64
type Approx interface { ~float64 }
```

Rule: Almost always use `~` in constraints unless you specifically want to restrict to the exact named type.

## Common Mistakes

### Mistake 1: Zero Value of Type Parameter

The zero value of a type parameter is not always what you expect.

Bad:
```go
func First[T any](items []T) T {
    if len(items) == 0 {
        return nil // compile error: cannot use nil as T
    }
    return items[0]
}
```

Good — return zero value with ok pattern:
```go
func First[T any](items []T) (T, bool) {
    if len(items) == 0 {
        var zero T
        return zero, false
    }
    return items[0], true
}
```

### Mistake 2: Type Assertion on Type Parameters

You cannot use type assertions directly on type parameters.

Bad:
```go
func Process[T any](v T) {
    if s, ok := v.(string); ok { // compile error
        fmt.Println(s)
    }
}
```

Good — convert to `any` first:
```go
func Process[T any](v T) {
    if s, ok := any(v).(string); ok {
        fmt.Println(s)
    }
}
```

But if you're doing type switches on a generic, you probably shouldn't be using generics.

### Mistake 3: Methods Cannot Have Type Parameters

Go does not allow type parameters on methods. Only types and functions can be generic.

Bad:
```go
type Store struct{}

func (s *Store) Get[T any](key string) (T, error) { // compile error
    // ...
}
```

Good — use a top-level function:
```go
func Get[T any](s *Store, key string) (T, error) {
    // ...
}
```

Good — make the type generic:
```go
type Store[T any] struct{}

func (s *Store[T]) Get(key string) (T, error) {
    // ...
}
```

### Mistake 4: Pointer Receiver Constraint

When you need to call a method with a pointer receiver on a generic type:

Bad:
```go
type Validator interface {
    Validate() error
}

func ValidateAll[T Validator](items []T) error {
    for _, item := range items {
        if err := item.Validate(); err != nil { // fails if Validate is on *T
            return err
        }
    }
    return nil
}
```

Good — constrain the pointer type:
```go
func ValidateAll[T any, PT interface{ *T; Validate() error }](items []T) error {
    for i := range items {
        if err := PT(&items[i]).Validate(); err != nil {
            return err
        }
    }
    return nil
}
```

This pattern is complex — prefer interfaces over generics when pointer receivers are involved.

### Mistake 5: Comparable Gotcha

Not all `comparable` types are safe for map keys in practice.

```go
func Dedup[T comparable](items []T) []T {
    seen := make(map[T]struct{})
    var result []T
    for _, item := range items {
        if _, ok := seen[item]; !ok {
            seen[item] = struct{}{}
            result = append(result, item)
        }
    }
    return result
}

// Works:
Dedup([]int{1, 2, 2, 3})
Dedup([]string{"a", "b", "a"})

// Compiles but panics at runtime if interface value contains uncomparable type:
// Dedup([]any{[]int{1}}) // panic: runtime error: hash of unhashable type []int
```

### Mistake 6: Constraint Too Loose

Using `any` when a narrower constraint communicates intent better.

Bad:
```go
func Contains[T any](items []T, target T) bool {
    for _, item := range items {
        if item == target { // compile error: == not defined on any
            return true
        }
    }
    return false
}
```

Good:
```go
func Contains[T comparable](items []T, target T) bool {
    for _, item := range items {
        if item == target {
            return true
        }
    }
    return false
}
```

Prefer `slices.Contains` (Go 1.21+) over writing your own.

## Self-Referential Constraints (Go 1.26+)

Go 1.26 lifts the restriction that a generic type cannot refer to itself in its type parameter list:

```go
type Adder[A Adder[A]] interface {
    Add(A) A
}

type Vector2D struct {
    X, Y float64
}

func (v Vector2D) Add(other Vector2D) Vector2D {
    return Vector2D{X: v.X + other.X, Y: v.Y + other.Y}
}

// Vector2D satisfies Adder[Vector2D]
func Sum[T Adder[T]](items []T) T {
    var total T
    for _, item := range items {
        total = total.Add(item)
    }
    return total
}
```

## Generic Type Instantiation

Generic types must be instantiated with concrete type arguments:

```go
type Stack[T any] struct {
    items []T
}

func (s *Stack[T]) Push(v T) { s.items = append(s.items, v) }
func (s *Stack[T]) Pop() (T, bool) {
    if len(s.items) == 0 {
        var zero T
        return zero, false
    }
    v := s.items[len(s.items)-1]
    s.items = s.items[:len(s.items)-1]
    return v, true
}

// Usage — always specify the type
var intStack Stack[int]
var strStack Stack[string]
```

## Prefer Standard Library Generics

Before writing generic utilities, check the standard library:

| Need | Use | Since |
|---|---|---|
| Contains, Index, Sort | `slices` package | Go 1.21+ |
| Min, Max | `min()`, `max()` builtins | Go 1.21+ |
| Clone, Copy maps | `maps` package | Go 1.21+ |
| Ordered comparison | `cmp.Compare`, `cmp.Or` | Go 1.21+ / 1.22+ |
| Type-safe error matching | `errors.AsType[T]` | Go 1.26+ |
