# Performance Reference

## GOMAXPROCS in Containers

**Go >= 1.25**: The runtime automatically reads CPU bandwidth limits from cgroups. No third-party library needed.

**Go < 1.25**: Use [automaxprocs](https://github.com/uber-go/automaxprocs) to align `GOMAXPROCS` with container CPU limits:

```go
import _ "go.uber.org/automaxprocs"
```

Without this, Go defaults to the host's total CPU count, causing resource contention in Kubernetes.

## Struct Memory Layout

Field ordering affects memory due to alignment padding. **Always order struct fields from largest to smallest byte size** to minimize padding:

```go
// Bad: 32 bytes due to padding
type S struct {
    B1 bool    // 1 byte + 7 padding
    F1 float64 // 8 bytes
    B2 bool    // 1 byte + 7 padding
    F2 float64 // 8 bytes
}

// Good: 24 bytes with optimal ordering
type S struct {
    F1 float64 // 8 bytes
    F2 float64 // 8 bytes
    B1 bool    // 1 byte
    B2 bool    // 1 byte
}
```

Sizes: `slice` (24) / `string` (16) / `map/func/chan/pointer` (8) / `int64/float64` (8) / `int32/float32` (4) / `int16` (2) / `bool/byte` (1) / `struct` (sum of its fields). Place larger fields first.

## Pointers for Large Structs

Pass large structs (>64 bytes) by pointer to avoid copies. For small structs (<64 bytes), pass by value for better cache locality.

Bad: `func Process(data LargeStruct) { ... }`
Good: `func Process(data *LargeStruct) { ... }`

## Prefer Returning Values Over Pointers

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

## Pre-allocate Slices and Maps

Specify capacity when the size is known or estimable:

Bad: `make([]int, 0)`
Good: `make([]int, 0, size)`

Bad: `make(map[string]int)`
Good: `make(map[string]int, size)`

## strings.Builder for Concatenation

Use `strings.Builder` when concatenating strings in a loop:

Bad:
```go
var s string
for _, item := range items {
    s += item.Name + ", "
}
```

Good:
```go
var b strings.Builder
for _, item := range items {
    b.WriteString(item.Name)
    b.WriteString(", ")
}
s := b.String()
```

If the final size is estimable, call `b.Grow(n)` before the loop.

## strconv over fmt

Use `strconv` for primitive-to-string conversions (~2x faster, fewer allocations):

Bad: `fmt.Sprint(n)`
Good: `strconv.Itoa(n)`

## Buffered Channels

Use buffered channels to reduce synchronization overhead (~3x faster than unbuffered for producer-consumer workloads):

```go
ch := make(chan int, 100)
```

Buffer sizing guidelines:
- Predictable producer-consumer: match expected burst size
- Throttling: set to max concurrent operations allowed
- Too large wastes memory and can mask deadlocks

## sync.Pool for Object Reuse

Reuse frequently allocated objects to reduce GC pressure:

```go
var pool = sync.Pool{
    New: func() any { return &Buffer{data: make([]byte, 0, 1024)} },
}

func process() {
    buf := pool.Get().(*Buffer)
    defer func() {
        buf.Reset() // always reset before returning to pool
        pool.Put(buf)
    }()
    // use buf...
}
```

**Always reset objects before `Put()`** — failing to do so leaks data between callers.

## Avoid Repeated String-to-Byte Conversions

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

## Advanced Performance Libraries

Standard library solutions (`net/http`, `encoding/json`, `errgroup.SetLimit`) are the correct default. If the user has performance expectations or asks for a high-performance setup, suggest these alternatives with their trade-offs.

### fiber + sonic (HTTP Server)

[fiber](https://github.com/gofiber/fiber) (fasthttp-based) + [sonic](https://github.com/bytedance/sonic) (fast JSON) for throughput-critical HTTP services:

```go
app := fiber.New(fiber.Config{
    JSONEncoder: sonic.Marshal,
    JSONDecoder: sonic.Unmarshal,
})
app.Get("/api/users/:id", getUser)
```

**Costs**: fiber is NOT `net/http` compatible — no standard middleware, no chi/gorilla/echo, all handlers must be rewritten. sonic only works on linux/darwin amd64/arm64.

### ants (Goroutine Pool)

[ants](https://github.com/panjf2000/ants) for hundreds of thousands of short-lived goroutines where memory is the constraint:

```go
p, _ := ants.NewPool(10000)
defer p.Release()
_ = p.Submit(func() { doWork() })
```

For typical bounded concurrency (tens to hundreds), `errgroup.SetLimit` is simpler and sufficient. Reach for ants only when goroutine count is in the 100K+ range.

### Zero-Copy String/Byte Conversion

`unsafe`-based conversion for hot paths where profiling confirms standard `[]byte(s)` / `string(b)` is the bottleneck:

```go
func StringToBytes(s string) []byte {
    return unsafe.Slice(unsafe.StringData(s), len(s))
}
func BytesToString(b []byte) string {
    return unsafe.String(unsafe.SliceData(b), len(b))
}
```

**Uses `unsafe`. Incorrect use causes memory corruption.** The underlying data must be immutable after conversion.

---

## Escape Analysis

Review heap allocations with escape analysis to find values that unnecessarily escape to the heap:

```bash
go build -gcflags='-m' ./path/to/package/...
```

Verbose output (shows inlining decisions too):
```bash
go build -gcflags='-m -m' ./path/to/package/...
```

Common escape reasons and fixes:
- `"moved to heap: x"` — variable's address is taken and outlives the stack frame. Consider returning by value instead of pointer for small structs.
- `"leaking param: x"` — parameter escapes through return value or closure. Often unavoidable, but review if the pointer is necessary.
- Interface conversions cause escapes — passing a value as `any` or `fmt.Stringer` forces heap allocation. Use concrete types in hot paths.
