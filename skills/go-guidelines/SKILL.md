---
name: go-guidelines
description: Go best practices for performance, modern syntax, patterns, testing, error handling, and operational guidelines. Use when writing or reviewing Go code.
---

# Go Guidelines

## Detected Go Version

!`grep -rh "^go " --include="go.mod" . 2>/dev/null | cut -d' ' -f2 | sort | uniq -c | sort -nr | head -1 | xargs | cut -d' ' -f2 | grep . || echo unknown`

## How to Use

DO NOT search for go.mod files or try to detect the version yourself. Use ONLY the version shown above.

**If version detected (not "unknown"):**
- Say: "This project is using Go X.XX, so I'll follow Go best practices and modern syntax up to and including this version. If you'd prefer a different target version, just let me know."
- Do NOT list features, do NOT ask for confirmation

**If version is "unknown":**
- Say: "Could not detect Go version in this repository"
- Use AskUserQuestion: "Which Go version should I target?" with options [1.22] / [1.23] / [1.24] / [1.25] / [1.26]

**When writing Go code**, apply ALL guidelines from this document:
- Use modern syntax features up to the target version
- Never use features from newer Go versions than the target
- Never use outdated patterns when a modern alternative is available
- Apply performance, testing, error handling, and operational guidelines

---

## Modern Go Syntax

### Go 1.0+

- `time.Since(start)` not `time.Now().Sub(start)`

### Go 1.8+

- `time.Until(deadline)` not `deadline.Sub(time.Now())`

### Go 1.13+

- `errors.Is(err, target)` not `err == target`

### Go 1.18+

- `any` not `interface{}`
- `strings.Cut(s, sep)` / `bytes.Cut(b, sep)` not Index+slice

### Go 1.19+

- `fmt.Appendf(buf, "x=%d", x)` not `[]byte(fmt.Sprintf(...))`
- `atomic.Bool` / `atomic.Int64` / `atomic.Pointer[T]` not `atomic.StoreInt32`

### Go 1.20+

- `strings.Clone(s)` / `bytes.Clone(b)` for copies
- `strings.CutPrefix` / `strings.CutSuffix`
- `errors.Join(err1, err2)` to combine errors
- `context.WithCancelCause(parent)` + `context.Cause(ctx)`

### Go 1.21+

- `min(a, b)` / `max(a, b)` not if/else
- `clear(m)` to delete all map entries
- `slices.Contains`, `slices.Sort`, `slices.SortFunc`, `slices.Index`, `slices.Reverse`, `slices.Compact`, `slices.Clone`
- `maps.Clone`, `maps.Copy`, `maps.DeleteFunc`
- `sync.OnceFunc` / `sync.OnceValue` not `sync.Once` + wrapper
- `context.AfterFunc`, `context.WithTimeoutCause`

### Go 1.22+

- `for i := range n` not `for i := 0; i < n; i++`
- Loop variables are per-iteration scoped (safe to capture in goroutines)
- `cmp.Or(a, b, "default")` returns first non-zero value
- `reflect.TypeFor[T]()` not `reflect.TypeOf((*T)(nil)).Elem()`
- `mux.HandleFunc("GET /api/{id}", handler)` + `r.PathValue("id")`

### Go 1.23+

- `maps.Keys(m)` / `maps.Values(m)` return iterators
- `slices.Collect(iter)` / `slices.Sorted(iter)`
- `time.Tick` is safe to use without Stop (GC recovers unreferenced tickers)

### Go 1.24+

- `t.Context()` not `context.WithCancel(context.Background())` in tests
- `omitzero` not `omitempty` for `time.Duration`, `time.Time`, structs, slices, maps
- `b.Loop()` not `for i := 0; i < b.N; i++` in benchmarks
- `strings.SplitSeq` / `strings.FieldsSeq` / `bytes.SplitSeq` when iterating

### Go 1.25+

- `wg.Go(fn)` not `wg.Add(1)` + `go func() { defer wg.Done(); ... }()`
- Runtime automatically reads CPU limits from cgroups — `automaxprocs` is no longer needed

### Go 1.26+

- `new(val)` not `x := val; &x` — returns pointer to any value (`new(30)` -> `*int`, `new(true)` -> `*bool`)
- `errors.AsType[T](err)` not `errors.As(err, &target)`

See [reference.md](reference.md) for detailed examples of each feature.

---

## Performance

### GOMAXPROCS in Containers

**Go >= 1.25**: The runtime automatically reads CPU bandwidth limits from cgroups. No third-party library needed.

**Go < 1.25**: Use [automaxprocs](https://github.com/uber-go/automaxprocs) to align `GOMAXPROCS` with container CPU limits:

```go
import _ "go.uber.org/automaxprocs"
```

Without this, Go defaults to the host's total CPU count, causing resource contention in Kubernetes.

### Struct Memory Layout

Field ordering affects memory due to alignment padding. Use `fieldalignment` to optimize:

```
fieldalignment -fix ./...
```

Bad (32 bytes):
```go
type S struct {
    B1 bool    // 1 byte + 7 padding
    F1 float64 // 8 bytes
    B2 bool    // 1 byte + 7 padding
    F2 float64 // 8 bytes
}
```

Good (24 bytes):
```go
type S struct {
    F1 float64
    F2 float64
    B1 bool
    B2 bool
}
```

### Goroutine Pool with ants

Consider [ants](https://github.com/panjf2000/ants) to reuse goroutines in high-concurrency scenarios instead of spawning a new goroutine per task. Reduces memory usage by ~90% and improves execution time by ~60% for large numbers of short-lived tasks.

```go
p, _ := ants.NewPool(10000)
defer p.Release()

_ = p.Submit(func() {
    doWork()
})
```

### Pointers for Large Structs

Pass large structs (>64 bytes) by pointer to avoid copies. For small structs (<64 bytes), pass by value for better cache locality.

Bad:
```go
func Process(data LargeStruct) { ... }
```

Good:
```go
func Process(data *LargeStruct) { ... }
```

### Buffered Channels

Use buffered channels to reduce synchronization overhead (~3x faster than unbuffered for producer-consumer workloads).

```go
ch := make(chan int, 100)
```

Buffer sizing guidelines:
- Predictable producer-consumer: match expected burst size
- Throttling: set to max concurrent operations allowed
- Too large wastes memory and can mask deadlocks

### fiber Web Framework

Consider [fiber](https://github.com/gofiber/fiber) for high-performance HTTP. Built on fasthttp, optimized for speed and low memory.

### Concurrent Swiss Map

Consider [concurrent-swiss-map](https://github.com/mhmtszr/concurrent-swiss-map) for high-performance thread-safe maps. Uses sharding to minimize lock contention. Outperforms `sync.Map` and `RWMutexMap` under high concurrency.

```go
myMap := csmap.New[string, int](
    csmap.WithShardCount[string, int](32),
    csmap.WithSize[string, int](1000),
)

myMap.Store("key", 42)
value, exists := myMap.Load("key")
```

### Zero-Copy String/Byte Conversion

Use `unsafe` for zero-copy conversion when the underlying data will not change:

```go
func StringToBytes(s string) []byte {
    return unsafe.Slice(unsafe.StringData(s), len(s))
}

func BytesToString(b []byte) string {
    return unsafe.String(unsafe.SliceData(b), len(b))
}
```

Do NOT use if the byte/string values may change later.

### bytedance/sonic for JSON Encoding/Decoding

Consider [sonic](https://github.com/bytedance/sonic) as a drop-in replacement for `encoding/json` (linux/darwin, amd64/arm64 only). Significantly faster serialization/deserialization with lower memory overhead.

```go
import "github.com/bytedance/sonic"

sonic.Marshal(&data)
sonic.Unmarshal(input, &data)
```

If using sonic, configure it as the JSON transcoder in libraries that support it:

**fiber**:
```go
app := fiber.New(fiber.Config{
    JSONEncoder: sonic.Marshal,
    JSONDecoder: sonic.Unmarshal,
})
```

**pgx (PostgreSQL)**:
```go
connConfig.TypeMap.RegisterType(&pgtype.Type{
    Name:  "json",
    OID:   pgtype.JSONOID,
    Codec: &pgtype.JSONCodec{Marshal: sonic.Marshal, Unmarshal: sonic.Unmarshal},
})
connConfig.TypeMap.RegisterType(&pgtype.Type{
    Name:  "jsonb",
    OID:   pgtype.JSONBOID,
    Codec: &pgtype.JSONBCodec{Marshal: sonic.Marshal, Unmarshal: sonic.Unmarshal},
})
```

If sonic is adopted, check whether each library in the project supports custom JSON marshal/unmarshal functions and configure them accordingly.

### sync.Pool for Object Reuse

Reuse frequently allocated objects to reduce GC pressure:

```go
var pool = sync.Pool{
    New: func() any { return &Person{} },
}

obj := pool.Get().(*Person)
defer pool.Put(obj)
```

### strconv over fmt

Use `strconv` for primitive-to-string conversions (~2x faster, fewer allocations):

Bad: `fmt.Sprint(rand.Int())`
Good: `strconv.Itoa(rand.Int())`

### Pre-allocate Slices and Maps

Specify capacity when the size is known or estimable (~10x faster):

Bad: `make([]int, 0)`
Good: `make([]int, 0, size)`

### Prefer Returning Values Over Pointers

Returning pointers may cause heap escape. When the struct is small, return values directly to keep allocations on the stack:

Bad:
```go
func NewPerson(name string) *Person {
    return &Person{Name: name}
}
```

Good:
```go
func NewPerson(name string) Person {
    return Person{Name: name}
}
```

This is why `io.Reader.Read` takes a `[]byte` parameter instead of returning one.

### Avoid Repeated String-to-Byte Conversions

Convert once and reuse:

Bad:
```go
for i := 0; i < b.N; i++ {
    w.Write([]byte("Hello world"))
}
```

Good:
```go
data := []byte("Hello world")
for i := 0; i < b.N; i++ {
    w.Write(data)
}
```

---

## Patterns

### Context as First Parameter

Every function that accepts a `context.Context` must take it as the first parameter:

```go
func GetUser(ctx context.Context, id string) (User, error) { ... }
```

Never store `context.Context` in a struct field.



### Functional Options

Use functional options for constructors with 3+ optional arguments:

```go
type Option interface {
    apply(*options)
}

func Open(addr string, opts ...Option) (*Connection, error) {
    // ...
}

db.Open(addr)
db.Open(addr, db.WithLogger(log))
db.Open(addr, db.WithCache(false), db.WithLogger(log))
```

Prefer the interface-based approach over closures for better debuggability and testability. See [reference.md](reference.md) for the full implementation.

### Graceful Shutdown

Listen for `SIGTERM` and `SIGINT`, then close resources in **reverse order** of initialization. Every resource that is opened must be closed — no resource should be left behind.

```go
func main() {
    ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
    defer stop()

    db := initDB()
    cache := initCache()
    server := initHTTPServer(db, cache)

    go func() {
        if err := server.Listen(":8080"); err != nil {
            log.Printf("server listen: %v", err)
        }
    }()

    <-ctx.Done()
    log.Println("shutting down...")

    shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
    defer cancel()

    if err := server.ShutdownWithContext(shutdownCtx); err != nil {
        log.Printf("server shutdown: %v", err)
    }
    if err := cache.Close(); err != nil {
        log.Printf("cache close: %v", err)
    }
    if err := db.Close(); err != nil {
        log.Printf("db close: %v", err)
    }
}
```

Key rules:
- **Reverse order**: Stop accepting new work (HTTP server) before closing dependencies (DB, cache, message brokers)
- **Timeout**: Always set a shutdown timeout to prevent hanging indefinitely
- **No leaks**: Every `Open`, `Dial`, `Connect`, `Listen` must have a corresponding `Close`/`Shutdown`
- **Log errors**: Log shutdown errors but continue closing remaining resources

### Interface Design

- Accept interfaces, return structs
- Define interfaces on the consumer side, not the producer side
- Keep interfaces small — prefer single-method interfaces (e.g., `io.Reader`, `io.Writer`)
- Don't create interfaces until you need them — avoid premature abstraction

Bad:
```go
type UserStore interface {
    FindByID(ctx context.Context, id string) (User, error)
    Create(ctx context.Context, user User) error
    Update(ctx context.Context, user User) error
    Delete(ctx context.Context, id string) error
    List(ctx context.Context) ([]User, error)
}

func NewOrderService(store UserStore) *OrderService { ... }
```

Good:
```go
type UserFinder interface {
    FindByID(ctx context.Context, id string) (User, error)
}

func NewOrderService(finder UserFinder) *OrderService { ... }

func NewPostgresUserRepo(db *sql.DB) *PostgresUserRepo {
    return &PostgresUserRepo{db: db}
}
```

See [reference.md](reference.md) for the full rationale and examples.

### Guard Clauses

Reduce nesting by returning early for error/edge cases. Handle the unhappy path first, keep the happy path at the lowest indentation level.

Bad:
```go
func process(u *User) error {
    if u != nil {
        if u.IsActive() {
            if u.HasPermission("admin") {
                return doWork(u)
            }
            return ErrNoPermission
        }
        return ErrInactive
    }
    return ErrNilUser
}
```

Good:
```go
func process(u *User) error {
    if u == nil {
        return ErrNilUser
    }
    if !u.IsActive() {
        return ErrInactive
    }
    if !u.HasPermission("admin") {
        return ErrNoPermission
    }
    return doWork(u)
}
```

### errgroup for Goroutine Groups

Use `golang.org/x/sync/errgroup` to manage groups of goroutines and propagate the first error. Cancels remaining goroutines on first failure via context.

```go
g, ctx := errgroup.WithContext(ctx)
for _, url := range urls {
    g.Go(func() error {
        return fetch(ctx, url)
    })
}
if err := g.Wait(); err != nil {
    return fmt.Errorf("fetch urls: %w", err)
}
```

Use `SetLimit` for bounded concurrency:

```go
g, ctx := errgroup.WithContext(ctx)
g.SetLimit(10)
for _, item := range items {
    g.Go(func() error {
        return process(ctx, item)
    })
}
if err := g.Wait(); err != nil {
    return err
}
```

Key rules:
- Use `errgroup.WithContext` when goroutines should be cancelled on first error
- Use `SetLimit` to prevent unbounded goroutine spawning
- Prefer `errgroup` over manual `sync.WaitGroup` + error channel patterns
- Always check the error returned by `g.Wait()`

See [reference.md](reference.md) for detailed examples.

---

## Goroutine Leak Prevention

Every goroutine MUST have a clear exit path. A leaked goroutine (~2KB+ each) holds memory, file descriptors, and network connections indefinitely.

Rules:
- Every `select` MUST include `case <-ctx.Done(): return`
- Never send on unbuffered channels without a guaranteed receiver — use `make(chan T, 1)` when the receiver may exit early
- Always `close(ch)` when done sending — `for range ch` blocks forever otherwise
- Always `defer ticker.Stop()` and listen to `ctx.Done()` in ticker loops
- Never operate on nil channels — always initialize before use
- Use `r.Context()` in HTTP handlers to stop goroutines when the client disconnects
- Call `wg.Add(1)` inside the condition, not before it — avoids deadlock when the goroutine is skipped
- Always `defer conn.Close()` in stream/connection handlers and exit on read error

Detection:
- Use [goleak](https://github.com/uber-go/goleak) in tests to catch leaks early
- Monitor `runtime.NumGoroutine()` in production metrics
- Use `pprof` at `/debug/pprof/goroutine` to diagnose leaks

See [reference.md](reference.md) for detailed bad/good examples of each scenario.

---

## Testing

### Unit Tests for Usecases

Write unit tests for `usecase` packages. Abstract third-party interactions behind interfaces for mocking. Do not create interfaces solely for mocking — only when they provide clear benefits.

### Mock Generation with mockery

Use [mockery](https://github.com/vektra/mockery) for generating mocks from interfaces.

Recommended `.mockery.yml`:
```yaml
with-expecter: true
mockname: "{{.InterfaceName}}"
outpkg: "mocks"
filename: "{{.InterfaceName | snakecase}}.go"
packages:
  <your-app-name>:
    config:
      dir: "mocks"
      recursive: true
```

### Table-Driven Tests

Use table-driven tests for functions with multiple input/output combinations:

```go
tests := []struct {
    name     string
    a, b     int
    expected int
}{
    {"both positive", 3, 5, 8},
    {"positive and negative", 7, -2, 5},
}

for _, tt := range tests {
    t.Run(tt.name, func(t *testing.T) {
        if result := Sum(tt.a, tt.b); result != tt.expected {
            t.Errorf("expected %d, got %d", tt.expected, result)
        }
    })
}
```

### Race Detector

Always run tests with the race detector:

```
go test ./... -race
```

### Parallel Tests

When using `t.Parallel()`, capture loop variables (Go < 1.22):

```go
for _, tt := range tests {
    tt := tt
    t.Run(tt.give, func(t *testing.T) {
        t.Parallel()
        // ...
    })
}
```

Go >= 1.22: Loop variables are per-iteration scoped, so re-assignment is unnecessary.

### Goroutine Leak Detection with goleak

Use [goleak](https://github.com/uber-go/goleak) to detect goroutine leaks:

```go
func TestMain(m *testing.M) {
    goleak.VerifyTestMain(m)
}

func TestFunction(t *testing.T) {
    defer goleak.VerifyNone(t)
    // ...
}
```

### Fuzz Testing

Use Go's native fuzz testing (Go 1.18+) for parsing, validation, and security-critical code:

```go
func FuzzReverse(f *testing.F) {
    f.Add("Hello, world")
    f.Fuzz(func(t *testing.T, orig string) {
        rev := Reverse(orig)
        doubleRev := Reverse(rev)
        if orig != doubleRev {
            t.Errorf("mismatch: %q", orig)
        }
    })
}
```

Run: `go test -fuzz=FuzzReverse -fuzztime=30s`

---

## Error Handling

Error messages must be lowercase.

### Error Types

| Caller needs match? | Message  | Use                                    |
|----------------------|----------|----------------------------------------|
| No                   | static   | `errors.New("msg")`                    |
| No                   | dynamic  | `fmt.Errorf("msg %v", val)`           |
| Yes                  | static   | exported `var ErrX = errors.New(...)` |
| Yes                  | dynamic  | custom `error` type                    |

### Error Wrapping

Use `fmt.Errorf` with `%w` to add context. Avoid "failed to" prefix:

Bad: `fmt.Errorf("failed to create new store: %w", err)`
Good: `fmt.Errorf("new store: %w", err)`

### Error Naming

- Exported error vars: `ErrBrokenLink`
- Unexported error vars: `errNotFound`
- Custom error types: `NotFoundError` (suffix `Error`)

### Handle Errors Once

Do not log and return the same error. Either wrap and return, or log and degrade gracefully.

Bad:
```go
log.Printf("Could not get user %q: %v", id, err)
return err
```

Good:
```go
return fmt.Errorf("get user %q: %w", id, err)
```

---

## After Making Changes

After making Go code changes, run static analysis and tests on the changed packages:

```bash
golangci-lint run ./path/to/changed/package/... 2>/dev/null || go vet ./path/to/changed/package/...
go test ./path/to/changed/package/... -race
```

- Prefer `golangci-lint` when available, fall back to `go vet`
- Always run tests with the race detector
- Fix all reported issues in the changed code before finishing
- Do not fix pre-existing issues in unrelated code
- If neither linter is available, skip silently and continue

---

## Operational Guidelines

- **Health Checks**: Configure liveness and readiness probes in Kubernetes
- **Escape Analysis**: Review with `go build -gcflags='-m'` to find unnecessary heap allocations
- **Profiling**: Use `pprof` for CPU/memory profiling before deployment
