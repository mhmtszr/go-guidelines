# Modern Go Syntax Reference

Use features up to the project's detected Go version. Never use features from newer versions.
**Stop reading at your project's version boundary.**

## Go 1.0+

- `time.Since(start)` not `time.Now().Sub(start)`

## Go 1.8+

- `time.Until(deadline)` not `deadline.Sub(time.Now())`

## Go 1.13+

- `errors.Is(err, target)` not `err == target`

## Go 1.18+

- `any` not `interface{}`
- `strings.Cut(s, sep)` / `bytes.Cut(b, sep)` not Index+slice

## Go 1.19+

- `fmt.Appendf(buf, "x=%d", x)` not `[]byte(fmt.Sprintf(...))`
- Type-safe atomics: `atomic.Bool` / `atomic.Int64` / `atomic.Pointer[T]` not `atomic.StoreInt32`

```go
var flag atomic.Bool
flag.Store(true)
if flag.Load() { ... }

var ptr atomic.Pointer[Config]
ptr.Store(cfg)
```

## Go 1.20+

- `strings.Clone(s)` / `bytes.Clone(b)` for copies
- `strings.CutPrefix` / `strings.CutSuffix`
- `errors.Join(err1, err2)` to combine errors
- `context.WithCancelCause(parent)` + `context.Cause(ctx)`

## Go 1.21+

- `min(a, b)` / `max(a, b)` not if/else
- `clear(m)` to delete all map entries
- `sync.OnceFunc` / `sync.OnceValue` not `sync.Once` + wrapper
- `context.AfterFunc`, `context.WithTimeoutCause`

### log/slog (Structured Logging)

Use `log/slog` instead of `log.Printf` or third-party loggers for new projects:

```go
slog.Info("user logged in", "user_id", userID, "ip", r.RemoteAddr)
slog.Error("query failed", "err", err, "query", q)

// With context and structured groups
logger := slog.With("service", "auth")
logger.InfoContext(ctx, "request processed",
    slog.Group("request", "method", r.Method, "path", r.URL.Path),
    slog.Duration("latency", elapsed),
)
```

JSON output for production:
```go
logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
    Level: slog.LevelInfo,
}))
slog.SetDefault(logger)
```

### slices Package

```go
slices.Contains(items, x)
slices.Index(items, x)
slices.IndexFunc(items, func(item T) bool { return item.ID == id })
slices.SortFunc(items, func(a, b T) int { return cmp.Compare(a.X, b.X) })
slices.Sort(items)
slices.Max(items)
slices.Min(items)
slices.Reverse(items)
slices.Compact(items)
slices.Clip(s)
slices.Clone(s)
```

### maps Package

```go
maps.Clone(m)
maps.Copy(dst, src)
maps.DeleteFunc(m, func(k K, v V) bool { return condition })
```

### sync Package

```go
f := sync.OnceFunc(func() { ... })
getter := sync.OnceValue(func() T { return computeValue() })
```

## Go 1.22+

- `for i := range n` not `for i := 0; i < n; i++`
- Loop variables are per-iteration scoped (safe to capture in goroutines)
- `reflect.TypeFor[T]()` not `reflect.TypeOf((*T)(nil)).Elem()`
- `cmp.Or(a, b, "default")` returns first non-zero value

### math/rand/v2

`math/rand/v2` is auto-seeded — never call `rand.Seed()`:

```go
import "math/rand/v2"

n := rand.IntN(100)    // not rand.Intn(100)
f := rand.Float64()
```

### cmp.Or

```go
name := cmp.Or(os.Getenv("NAME"), "default")
```

### Enhanced http.ServeMux

```go
mux.HandleFunc("GET /api/{id}", handler)
// In handler:
id := r.PathValue("id")
```

## Go 1.23+

- `maps.Keys(m)` / `maps.Values(m)` return iterators
- `slices.Collect(iter)` / `slices.Sorted(iter)`

```go
keys := slices.Collect(maps.Keys(m))
sortedKeys := slices.Sorted(maps.Keys(m))
for k := range maps.Keys(m) { process(k) }
```

## Go 1.24+

- `t.Context()` not `context.WithCancel(context.Background())` in tests
- `omitzero` not `omitempty` for `time.Duration`, `time.Time`, structs, slices, maps
- `b.Loop()` not `for i := 0; i < b.N; i++` in benchmarks
- `strings.SplitSeq` / `strings.FieldsSeq` / `bytes.SplitSeq` when iterating

### t.Context()

Before:
```go
func TestFoo(t *testing.T) {
    ctx, cancel := context.WithCancel(context.Background())
    defer cancel()
    result := doSomething(ctx)
}
```
After:
```go
func TestFoo(t *testing.T) {
    ctx := t.Context()
    result := doSomething(ctx)
}
```

### omitzero

```go
type Config struct {
    Timeout time.Duration `json:"timeout,omitzero"` // omitempty doesn't work for Duration
    Items   []string      `json:"items,omitzero"`   // omits zero-value structs/slices/maps
}
```

### b.Loop()

Before:
```go
func BenchmarkFoo(b *testing.B) {
    for i := 0; i < b.N; i++ {
        doWork()
    }
}
```
After:
```go
func BenchmarkFoo(b *testing.B) {
    for b.Loop() {
        doWork()
    }
}
```

### SplitSeq / FieldsSeq

```go
// Before:
for _, part := range strings.Split(s, ",") { process(part) }

// After (no intermediate slice allocation):
for part := range strings.SplitSeq(s, ",") { process(part) }
```

Also: `strings.FieldsSeq`, `bytes.SplitSeq`, `bytes.FieldsSeq`.

## Go 1.25+

- `wg.Go(fn)` not `wg.Add(1)` + `go func() { defer wg.Done(); ... }()`
- Runtime automatically reads CPU limits from cgroups — `automaxprocs` is no longer needed
- `net/http.CrossOriginProtection` — built-in CSRF protection using Fetch metadata headers

### wg.Go()

Before:
```go
var wg sync.WaitGroup
for _, item := range items {
    wg.Add(1)
    go func() {
        defer wg.Done()
        process(item)
    }()
}
wg.Wait()
```
After:
```go
var wg sync.WaitGroup
for _, item := range items {
    wg.Go(func() {
        process(item)
    })
}
wg.Wait()
```

## Go 1.26+

- `new(val)` — returns pointer to any value expression (`new(30)` -> `*int`, `new(true)` -> `*bool`)
- `errors.AsType[T](err)` — generic, type-safe version of `errors.As`
- `slog.NewMultiHandler` — fan-out logs to multiple handlers
- `bytes.Buffer.Peek(n)` — read without advancing the buffer position
- `reflect` iterator methods — `Type.Fields()`, `Type.Methods()`, `Type.Ins()`, `Type.Outs()`, `Value.Fields()`
- `netip.Prefix.Compare` — compare and sort IP subnets
- `go fix` — rewritten modernizer tool with 20+ fixers

### new(val)

Before:
```go
timeout := 30
debug := true
cfg := Config{
    Timeout: &timeout,
    Debug:   &debug,
}
```
After:
```go
cfg := Config{
    Timeout: new(30),
    Debug:   new(true),
}
```

Also works with function results and composite literals:
```go
person := Person{
    Age: new(yearsSince(born)),
}
slicePtr := new([]int{1, 2, 3})
```

### errors.AsType

Before:
```go
var pathErr *os.PathError
if errors.As(err, &pathErr) {
    handle(pathErr)
}
```
After:
```go
if pathErr, ok := errors.AsType[*os.PathError](err); ok {
    handle(pathErr)
}
```

Multiple error types:
```go
if dnsErr, ok := errors.AsType[*net.DNSError](err); ok {
    handleDNS(dnsErr)
} else if appErr, ok := errors.AsType[*AppError](err); ok {
    handleApp(appErr)
}
```

### slog.NewMultiHandler

Fan-out logs to multiple destinations without third-party libraries:

```go
stdoutHandler := slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
    Level: slog.LevelInfo,
})
fileHandler := slog.NewJSONHandler(logFile, &slog.HandlerOptions{
    Level: slog.LevelWarn,
})
logger := slog.New(slog.NewMultiHandler(stdoutHandler, fileHandler))
```

Each handler retains its own level filter — an Info log reaches only the stdout handler, while Warn+ reaches both.

### bytes.Buffer.Peek

Read from a buffer without advancing the read position:

```go
buf := bytes.NewBufferString(`{"name":"Go"}`)
header, _ := buf.Peek(1) // inspect first byte, position unchanged
if header[0] == '{' {
    // JSON content
}
```

Useful for content-type detection, protocol parsing, and format sniffing before committing to a read path.

### reflect Iterator Methods

Before (Go 1.25):
```go
for i := range typ.NumField() {
    field := typ.Field(i)
}
```
After (Go 1.26):
```go
for field := range typ.Fields() {
    fmt.Println(field.Name, field.Type)
}
```

Available iterators: `Type.Fields()`, `Type.Methods()`, `Type.Ins()`, `Type.Outs()`, `Value.Fields()`, `Value.Methods()`.

### go fix Modernizers

`go fix` was rewritten using the `go vet` analysis framework with 20+ built-in modernizers:

```bash
go fix .              # apply all fixers
go fix -diff .        # preview changes as diff
go fix -forvar .      # run only a specific fixer
```

Example transformations:
- Loop → `slices.Contains`
- `sort.Slice` → `slices.SortFunc`
- `if/else` → `min`/`max`
- `HasPrefix` + `TrimPrefix` → `CutPrefix`
- `errors.New(fmt.Sprintf(...))` → `fmt.Errorf(...)`

Custom API migration with `//go:fix inline`:
```go
//go:fix inline
func OldAPI(x int) int { return NewAPI(x, defaultOpts) }
```
