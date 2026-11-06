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

Go 1.26 rewrote `go fix` on the `go vet` analysis framework with 20+ built-in modernizers ([blog](https://go.dev/blog/gofix)). **Always run it on Go 1.26+ projects after toolchain upgrades and after agent code changes.**

```bash
go fix ./...          # apply all fixers
go fix -diff ./...    # preview changes as diff
go fix -forvar ./...  # run only a specific fixer
go tool fix help      # list registered analyzers
```

Guidance from the Go team:
- Start from a clean git state so reviews contain only `go fix` edits
- Run more than once until a fixed point (twice is usually enough) — one fix can unlock another
- For multi-platform tags, re-run with different `GOOS`/`GOARCH`
- Modernizers only apply in files whose effective Go version meets the feature minimum (`go` directive or `//go:build`)

Example transformations:
- Loop → `slices.Contains`
- `sort.Slice` → `slices.SortFunc`
- `if/else` → `min`/`max`
- `HasPrefix` + `TrimPrefix` → `CutPrefix`
- `errors.New(fmt.Sprintf(...))` → `fmt.Errorf(...)`
- `newInt`-style helpers → `new(expr)` (`-newexpr`)

Custom API migration with `//go:fix inline`:
```go
//go:fix inline
func OldAPI(x int) int { return NewAPI(x, defaultOpts) }
```

## Go 1.27+

- Generic methods may declare their own type parameters. Interface methods still cannot be generic, and a generic method cannot implement a non-generic interface method.
- Embedded fields may be keyed directly in struct literals.
- Generic function type inference works in every assignment context, including composite literals, conversions, and channel sends.
- `strings.CutLast` / `bytes.CutLast` replace `LastIndex` followed by manual slicing.
- `net/url.URL.Clone` / `url.Values.Clone` create deep copies.
- `testing/synctest.Sleep` advances fake time and waits for other goroutines in the bubble to block.
- `encoding/json/v2` offers stricter defaults and configurable marshaling; `encoding/json/jsontext` supports token/value-level streaming.
- The standard `uuid` package generates and parses UUIDs; prefer it over adding a dependency for basic UUID needs.
- `go test` runs the `stdversion` vet analyzer by default; do not use standard-library APIs newer than the effective Go version of a file.
- `go fix` adds the `atomictypes`, `embedlit`, `slicesbackward`, and `unsafefuncs` modernizers.

### Generic Methods

Use generic methods when an operation naturally belongs to a concrete type. Do not introduce a receiver solely to avoid a package-level generic function.

```go
type Store struct {
    values map[string]any
}

func (s *Store) Get[T any](key string) (T, bool) {
    value, ok := s.values[key].(T)
    return value, ok
}
```

Interface methods still cannot declare type parameters:

```go
// Invalid even in Go 1.27:
type Store interface {
    Get[T any](key string) (T, bool)
}
```

### Embedded Fields in Struct Literals

```go
type Habitat struct {
    Burrow string
}

type Gopher struct {
    Name string
    Habitat
}

g := Gopher{
    Name:   "Gopher",
    Burrow: "Burrow #42",
}
```

Prefer the promoted field name when it makes literals shorter and remains unambiguous. When two embedded structs promote the same name, keep nested literals such as `Habitat: Habitat{Burrow: "home"}` to disambiguate. Do not initialize the same promoted field twice.

### Generalized Function Type Inference

```go
func Format[T any](v T) string { return fmt.Sprint(v) }

type IntFormatter func(int) string

formatters := []IntFormatter{Format}
formatter := IntFormatter(Format)
ch := make(chan IntFormatter, 1)
ch <- Format
```

The target function type supplies the type argument, so explicit instantiation such as `Format[int]` is unnecessary in these contexts. Inference still needs a concrete target: `formatter := Format` has no function type to infer from and remains invalid. Use `formatter := Format[int]` instead.

### JSON v2

Use `encoding/json/v2` for new Go 1.27+ code when its stricter defaults are appropriate. It rejects invalid UTF-8 and duplicate object member names by default. Migration from `encoding/json` v1 requires compatibility testing; do not mechanically change imports because defaults and error text differ.

```go
import json "encoding/json/v2"

if err := json.UnmarshalRead(r.Body, &request); err != nil {
    return err
}
if err := json.MarshalWrite(w, response); err != nil {
    return err
}
```

Use `encoding/json/jsontext.Decoder` and `Encoder` when processing JSON as a validated stream of tokens or values.

#### Migration Is a Wire-Contract Change

Go 1.27 backs the existing `encoding/json` API with the v2 implementation while preserving v1 semantics. Updating the toolchain is not the same as migrating imports to `encoding/json/v2`; v1 remains supported. Test behavior and error types rather than exact error strings, which may change.

| Behavior | v1 default | v2 default |
|---|---|---|
| Duplicate object names | Accepted | Rejected |
| Invalid UTF-8 | Replaced with U+FFFD | Rejected |
| Struct field matching | Case-insensitive fallback | Case-sensitive |
| Nil slices / maps | `null` | `[]` / `{}` |
| Map member order | Sorted keys | Unspecified |
| `omitempty` | Empty Go values | Empty JSON values; `0` and `false` are retained |

Use `omitzero` when omission should follow Go zero-value semantics. Unknown members are still ignored by default; opt into `json.RejectUnknownMembers(true)` when the API contract requires rejection. Test existing payloads, custom marshalers, tags, and nil collections before migrating. For older experimental v2 examples, re-check the API: `inline` was renamed to `embed`, and `format` and `unknown` tags were removed in Go 1.27.

```go
// For repeatable golden files, opt into deterministic output.
stock := map[string]int{"zebra": 10, "apple": 20}
data, err := json.Marshal(stock, json.Deterministic(true))
if err != nil {
    return err
}
// data contains {"apple":20,"zebra":10}
```

`Deterministic(true)` is not a canonical JSON protocol for cryptographic signatures. Use the canonicalization scheme required by that protocol. Do not promise a fixed speedup from migrating; benchmark representative payloads.

### Standard UUIDs

```go
id := uuid.New() // currently equivalent to uuid.NewV4()

parsed, err := uuid.Parse(input)
if err != nil {
    return err
}
```

Use `uuid.NewV7()` when time-ordered UUIDs are an explicit storage or indexing requirement; otherwise prefer `uuid.New()`. V7 exposes a timestamp and is not a substitute for an authorization token. Its ordering can be disrupted by a backwards system clock; benchmark database locality rather than assuming an indexing speedup. Use `Parse` for external input and reserve `MustParse` for trusted constants.

### CutLast

```go
prefix, value, found := strings.CutLast("service.region.instance", ".")
if !found {
    // No separator: prefix is the entire input and value is empty.
    return errors.New("missing separator")
}
// prefix == "service.region", value == "instance"
```

Unlike `Cut`, this splits at the last occurrence. Check `found`: an empty suffix can also mean a separator was present at the end. Use `bytes.CutLast` for byte slices; the returned slices alias the input, so clone them if independent ownership is required. For filesystem paths, use `filepath` operations instead of assuming that a dot or slash is the correct separator.

### Deep-Copy URLs

```go
clonedURL := originalURL.Clone()
clonedQuery := originalURL.Query().Clone()
```

Prefer these methods over hand-copying `url.URL` or `url.Values`, especially before mutating query parameters.

### Explicit Integer Division Rounding

Use `math/big.Int.Divide` when rounding is part of the domain rule, rather than patching the result of `Quo` with ad-hoc arithmetic.

```go
x, y := big.NewInt(-7), big.NewInt(2)
var quotient, remainder big.Int
quotient.Divide(x, y, &remainder, big.Floor)
// quotient == -4, remainder == 1: x == y*quotient + remainder
```

| Mode | Quotient of -7 / 2 | Remainder |
|---|---|---|
| `big.Trunc` | -3 | -1 |
| `big.Floor` | -4 | 1 |
| `big.Ceil` | -3 | -1 |
| `big.Round` | -4 | 1 |

`Round` rounds to the nearest integer with ties to even (`-5 / 2` rounds to `-2`, not `-3`). A remainder may be negative, including for positive operands with `Ceil`. Validate a user-supplied divisor before calling: division by zero panics. Use separate result values when both quotient and remainder are needed.

### Review go fix Modernizers

```bash
go fix -diff ./...          # preview before changing files
go fix -atomictypes ./...  # migrate eligible atomic operations
go fix -embedlit ./...     # simplify embedded-field literals (Go 1.27+)
```

The Go 1.27 tool adds `atomictypes`, `embedlit`, `slicesbackward`, and `unsafefuncs`. The analyzer version is not the minimum version of every rewrite: typed atomics require Go 1.19+, `slices.Backward` requires Go 1.23+, and embedded-field literal selectors require Go 1.27+. Keep the module's Go directive accurate, review diffs, and rerun tests. Typed atomic values must not be copied after first use; `unsafe.Add` does not make invalid pointer arithmetic safe.

The old `waitgroup` analyzer is now named `waitgroupgo`, and `fmtappendf` was removed. Update scripts that select these analyzers explicitly.

Sources: [Go 1.27 release notes](https://go.dev/doc/go1.27), [JSON migration](https://pkg.go.dev/encoding/json#hdr-Migrating_to_v2), [Int.Divide](https://pkg.go.dev/math/big#Int.Divide).
