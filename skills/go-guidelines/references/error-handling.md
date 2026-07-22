# Error Handling Reference

Error messages must be lowercase.

## Error Types

| Caller needs match? | Message  | Use                                    |
|----------------------|----------|----------------------------------------|
| No                   | static   | `errors.New("msg")`                    |
| No                   | dynamic  | `fmt.Errorf("msg %v", val)`           |
| Yes                  | static   | exported `var ErrX = errors.New(...)` |
| Yes                  | dynamic  | custom `error` type                    |

### Examples

**No matching, static message:**
```go
func Open() error {
    return errors.New("could not open")
}
```

**Matching needed, static message:**
```go
var ErrCouldNotOpen = errors.New("could not open")

func Open() error {
    return ErrCouldNotOpen
}

// caller
if errors.Is(err, foo.ErrCouldNotOpen) {
    // handle
}
```

**No matching, dynamic message:**
```go
func Open(file string) error {
    return fmt.Errorf("file %q not found", file)
}
```

**Matching needed, dynamic message:**
```go
type NotFoundError struct {
    File string
}

func (e *NotFoundError) Error() string {
    return fmt.Sprintf("file %q not found", e.File)
}

func Open(file string) error {
    return &NotFoundError{File: file}
}

// caller (Go < 1.26)
var notFound *NotFoundError
if errors.As(err, &notFound) {
    // handle
}

// caller (Go 1.26+) — prefer errors.AsType
if notFound, ok := errors.AsType[*NotFoundError](err); ok {
    // handle
}
```

## errors.AsType (Go 1.26+)

`errors.AsType[T]` is a generic, type-safe replacement for `errors.As`. It provides compile-time safety, better performance (~3x faster), and shorter syntax.

Before:
```go
var appErr *AppError
if errors.As(err, &appErr) {
    handle(appErr)
}
```

After:
```go
if appErr, ok := errors.AsType[*AppError](err); ok {
    handle(appErr)
}
```

Compile-time safety advantage: `errors.As` with a non-pointer target panics at runtime, while `errors.AsType` catches this at compile time:
```go
// errors.As — runtime panic if target is not a pointer:
//   var bad AppError
//   errors.As(err, &bad) → panic

// errors.AsType — compile error:
//   errors.AsType[AppError](err) → AppError does not satisfy error
```

## Error Wrapping

Use `fmt.Errorf` with `%w` to add context. Avoid "failed to" prefix:

Bad (noise accumulates):
```
failed to x: failed to y: failed to create new store: the error
```

Good (concise chain):
```
x: y: new store: the error
```

## Error Naming

```go
var (
    ErrBrokenLink = errors.New("link is broken")   // exported sentinel
    errNotFound   = errors.New("not found")         // unexported sentinel
)

type NotFoundError struct {  // exported custom type — suffix "Error"
    File string
}

type resolveError struct {   // unexported custom type
    Path string
}
```

## Handle Errors Once

Do not log and return the same error. Either wrap and return, or log and degrade gracefully.

**Bad** — log and return:
```go
u, err := getUser(id)
if err != nil {
    log.Printf("Could not get user %q: %v", id, err)
    return err
}
```

**Good** — wrap and return:
```go
u, err := getUser(id)
if err != nil {
    return fmt.Errorf("get user %q: %w", id, err)
}
```

**Good** — log and degrade gracefully:
```go
if err := emitMetrics(); err != nil {
    log.Printf("Could not emit metrics: %v", err)
}
```

**Good** — match and degrade gracefully:
```go
tz, err := getUserTimeZone(id)
if err != nil {
    if errors.Is(err, ErrUserNotFound) {
        tz = time.UTC
    } else {
        return fmt.Errorf("get user %q: %w", id, err)
    }
}
```

## panic and recover

### When to panic

- **Program initialization**: Unrecoverable setup failures in `main()` or `init()` (e.g., missing required config, invalid regex)
- **Programmer error**: Truly impossible states that indicate a bug (e.g., unreachable default in a type switch)

### When NOT to panic

- **Never in library code** — return errors instead. Let the caller decide.
- **Never for expected failures** — network errors, invalid user input, file not found
- **Never as a substitute for error handling**

### recover

Use `recover` only at top-level boundaries (HTTP middleware, goroutine wrappers) to prevent one panic from crashing the entire process:

```go
func recoveryMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        defer func() {
            if rec := recover(); rec != nil {
                slog.Error("panic recovered", "panic", rec, "stack", string(debug.Stack()))
                http.Error(w, "internal server error", http.StatusInternalServerError)
            }
        }()
        next.ServeHTTP(w, r)
    })
}
```

Never use `panic`/`recover` for control flow — it is not an exception system.
