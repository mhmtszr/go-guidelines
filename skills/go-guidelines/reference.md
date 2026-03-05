# Go Guidelines - Detailed Reference

## Modern Go Syntax - Detailed Examples

### Go 1.19+ - Type-Safe Atomics

```go
var flag atomic.Bool
flag.Store(true)
if flag.Load() { ... }

var ptr atomic.Pointer[Config]
ptr.Store(cfg)
```

### Go 1.21+ - slices Package

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

### Go 1.21+ - maps Package

```go
maps.Clone(m)
maps.Copy(dst, src)
maps.DeleteFunc(m, func(k K, v V) bool { return condition })
```

### Go 1.21+ - sync Package

```go
f := sync.OnceFunc(func() { ... })
getter := sync.OnceValue(func() T { return computeValue() })
```

### Go 1.22+ - cmp.Or

```go
// Instead of:
name := os.Getenv("NAME")
if name == "" {
    name = "default"
}
// Use:
name := cmp.Or(os.Getenv("NAME"), "default")
```

### Go 1.22+ - Enhanced http.ServeMux

```go
mux.HandleFunc("GET /api/{id}", handler)
// In handler:
id := r.PathValue("id")
```

### Go 1.23+ - Iterators

```go
keys := slices.Collect(maps.Keys(m))
sortedKeys := slices.Sorted(maps.Keys(m))
for k := range maps.Keys(m) { process(k) }
```

### Go 1.24+ - t.Context()

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

### Go 1.24+ - omitzero

Before:
```go
type Config struct {
    Timeout time.Duration `json:"timeout,omitempty"` // doesn't work for Duration!
}
```
After:
```go
type Config struct {
    Timeout time.Duration `json:"timeout,omitzero"`
}
```

### Go 1.24+ - b.Loop()

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

### Go 1.24+ - SplitSeq / FieldsSeq

Before:
```go
for _, part := range strings.Split(s, ",") {
    process(part)
}
```
After:
```go
for part := range strings.SplitSeq(s, ",") {
    process(part)
}
```
Also: `strings.FieldsSeq`, `bytes.SplitSeq`, `bytes.FieldsSeq`.

### Go 1.25+ - wg.Go()

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

### Go 1.26+ - new(val)

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

### Go 1.26+ - errors.AsType

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

---

## Performance

### GOMAXPROCS in Containers

**Go >= 1.25 (August 2025)**: The Go runtime automatically reads CPU bandwidth limits from the cgroup containing the process. On Linux, if the CPU limit (`cpu.cfs_quota_us`/`cpu.cfs_period_us` for cgroup v1, `cpu.max` for cgroup v2) is lower than the total available logical CPUs, `GOMAXPROCS` defaults to that lower limit. No third-party dependency needed.

**Go < 1.25**: Use `automaxprocs` to prevent the Go scheduler from using all host CPUs in a shared Kubernetes node:

```go
import _ "go.uber.org/automaxprocs"
```

Benefits:
- Better resource efficiency by preventing excessive CPU usage
- Improved stability in multi-tenant Kubernetes clusters
- Automatic scaling based on defined resource constraints

### Struct Memory Layout - Full Example

```go
// Bad: 32 bytes due to padding
type testStruct struct {
    testBool1  bool    // 1 byte + 7 padding
    testFloat1 float64 // 8 bytes
    testBool2  bool    // 1 byte + 7 padding
    testFloat2 float64 // 8 bytes
}

// Good: 24 bytes with optimal ordering
type testStruct struct {
    testFloat1 float64 // 8 bytes
    testFloat2 float64 // 8 bytes
    testBool1  bool    // 1 byte
    testBool2  bool    // 1 byte
}

func main() {
    a := testStruct{}
    fmt.Println(unsafe.Sizeof(a))
}
```

Fix automatically:
```
fieldalignment -fix ./...
```

Reference: [Data structure alignment](https://en.wikipedia.org/wiki/Data_structure_alignment)

### Goroutine Pool with ants - Full Example

```go
package main

import (
    "sync"

    "github.com/panjf2000/ants/v2"
)

func main() {
    defer ants.Release()

    var wg sync.WaitGroup

    p, _ := ants.NewPool(10000)
    defer p.Release()

    for i := 0; i < 100000; i++ {
        wg.Add(1)
        _ = p.Submit(func() {
            doWork()
            wg.Done()
        })
    }

    wg.Wait()
}
```

Benchmark: ~90% memory reduction, ~60% execution time improvement for large numbers of short-lived tasks.

### Pointers vs Values - Benchmark

```go
type LargeStruct struct {
    Data [1024]int
}

func ProcessByValue(data LargeStruct) {
    for i := range data.Data {
        data.Data[i]++
    }
}

func ProcessByPointer(data *LargeStruct) {
    for i := range data.Data {
        data.Data[i]++
    }
}

func BenchmarkByValue(b *testing.B) {
    data := LargeStruct{}
    b.ResetTimer()
    for i := 0; i < b.N; i++ {
        ProcessByValue(data)
    }
}

func BenchmarkByPointer(b *testing.B) {
    data := LargeStruct{}
    b.ResetTimer()
    for i := 0; i < b.N; i++ {
        ProcessByPointer(&data)
    }
}
```

| Benchmark            | Operations | ns/op    |
|----------------------|-----------|----------|
| BenchmarkByValue     | 2044063   | 572.9    |
| BenchmarkByPointer   | 3079296   | 390.7    |

When to use pointers:
- Large structs (>64 bytes)
- Need to modify original data
- Slices with large underlying arrays
- Frequently called functions with substantial data

When to use values:
- Small structs (<64 bytes) for better cache locality
- Immutable data

### Buffered vs Unbuffered Channels - Benchmark

```go
func BenchmarkUnbufferedChannel(b *testing.B) {
    for i := 0; i < b.N; i++ {
        ch := make(chan int)
        go func() {
            for i := 0; i < 100; i++ {
                ch <- i
            }
            close(ch)
        }()
        for range ch {
        }
    }
}

func BenchmarkBufferedChannel(b *testing.B) {
    for i := 0; i < b.N; i++ {
        ch := make(chan int, 100)
        go func() {
            for i := 0; i < 100; i++ {
                ch <- i
            }
            close(ch)
        }()
        for range ch {
        }
    }
}
```

| Benchmark                   | Operations | ns/op  |
|-----------------------------|-----------|--------|
| BenchmarkUnbufferedChannel  | 85735     | 13745  |
| BenchmarkBufferedChannel    | 281250    | 4132   |

### Concurrent Swiss Map - Full Example

```go
package main

import (
    csmap "github.com/mhmtszr/concurrent-swiss-map"
)

func main() {
    myMap := csmap.New[string, int](
        csmap.WithShardCount[string, int](32),
        csmap.WithSize[string, int](1000),
    )

    myMap.Store("key", 42)
    value, exists := myMap.Load("key")
    count := myMap.Count()
    myMap.Delete("key")

    myMap.Range(func(key string, value int) (stop bool) {
        return false
    })
}
```

Key features:
- Thread-safe with minimal lock contention via map sharding
- Lower memory usage than `sync.Map` and `RWMutexMap` in all scenarios
- Generic support (Go 1.18+)

### bytedance/sonic - Custom Transcoders

When using sonic, configure it as the JSON encoder/decoder across the application, including libraries that accept custom transcoders.

**fiber**:
```go
app := fiber.New(fiber.Config{
    JSONEncoder: sonic.Marshal,
    JSONDecoder: sonic.Unmarshal,
})
```

**pgx (PostgreSQL) - JSON/JSONB columns**:
```go
import (
    "github.com/jackc/pgx/v5"
    "github.com/jackc/pgx/v5/pgtype"
    "github.com/bytedance/sonic"
)

connConfig, _ := pgx.ParseConfig(databaseURL)

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

**Generic pattern** for any library:
```go
type Config struct {
    JSONEncoder func(v any) ([]byte, error)
    JSONDecoder func(data []byte, v any) error
}

cfg := Config{
    JSONEncoder: sonic.Marshal,
    JSONDecoder: sonic.Unmarshal,
}
```

Always check if the library you use supports custom JSON marshal/unmarshal functions and configure sonic there.

### sync.Pool - Full Example

```go
type Person struct {
    Name string
}

var pool = sync.Pool{
    New: func() any {
        return &Person{}
    },
}

func main() {
    person := pool.Get().(*Person)
    person.Name = "Mehmet"

    pool.Put(person)

    reused := pool.Get().(*Person) // returns &{Mehmet}
    newObj := pool.Get().(*Person) // creates new instance
}
```

Real-world impact: [New Relic Go Agent memory leak fix](https://github.com/newrelic/go-agent/pull/620) — pooling gzip writers reduced CPU usage by ~40% and memory usage by ~22%.

### strconv vs fmt - Benchmark

| Benchmark         | ns/op | allocs/op |
|-------------------|-------|-----------|
| BenchmarkFmtSprint| 143   | 2         |
| BenchmarkStrconv  | 64.2  | 1         |

### Slice Pre-allocation - Benchmark

| Benchmark      | Time     |
|----------------|----------|
| Without cap    | 2.48s    |
| With cap       | 0.21s    |

### String-to-Byte Conversion - Benchmark

| Benchmark     | ns/op |
|---------------|-------|
| Repeated conv | 22.2  |
| Convert once  | 3.25  |

---

## Patterns

### Functional Options - Full Implementation

```go
type options struct {
    cache  bool
    logger *zap.Logger
}

type Option interface {
    apply(*options)
}

type cacheOption bool

func (c cacheOption) apply(opts *options) {
    opts.cache = bool(c)
}

func WithCache(c bool) Option {
    return cacheOption(c)
}

type loggerOption struct {
    Log *zap.Logger
}

func (l loggerOption) apply(opts *options) {
    opts.logger = l.Log
}

func WithLogger(log *zap.Logger) Option {
    return loggerOption{Log: log}
}

func Open(addr string, opts ...Option) (*Connection, error) {
    options := options{
        cache:  defaultCache,
        logger: zap.NewNop(),
    }

    for _, o := range opts {
        o.apply(&options)
    }

    // ...
}
```

Usage:
```go
db.Open(addr)
db.Open(addr, db.WithLogger(log))
db.Open(addr, db.WithCache(false), db.WithLogger(log))
```

Use the interface-based approach over closures for:
- Comparability in tests and mocks
- Implementing `fmt.Stringer` for readable representations
- Better debuggability

References:
- [Self-referential functions and the design of options](https://commandcenter.blogspot.com/2014/01/self-referential-functions-and-design.html)
- [Functional options for friendly APIs](https://dave.cheney.net/2014/10/17/functional-options-for-friendly-apis)

### Graceful Shutdown - Full Implementation

```go
package main

import (
    "context"
    "log"
    "os/signal"
    "syscall"
    "time"

    "github.com/gofiber/fiber/v2"
)

func main() {
    ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
    defer stop()

    db := initDB()
    cache := initRedis()
    producer := initKafkaProducer()
    consumer := initKafkaConsumer()
    app := initFiberApp(db, cache, producer)

    go func() {
        if err := app.Listen(":8080"); err != nil {
            log.Printf("server listen: %v", err)
        }
    }()

    go func() {
        consumer.Start(ctx)
    }()

    <-ctx.Done()
    log.Println("shutdown signal received, draining...")

    shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
    defer cancel()

    // Phase 1: Stop accepting new work
    if err := app.ShutdownWithContext(shutdownCtx); err != nil {
        log.Printf("server shutdown: %v", err)
    }

    // Phase 2: Stop consumers
    if err := consumer.Close(); err != nil {
        log.Printf("consumer close: %v", err)
    }

    // Phase 3: Flush producers
    if err := producer.Close(); err != nil {
        log.Printf("producer close: %v", err)
    }

    // Phase 4: Close data stores
    if err := cache.Close(); err != nil {
        log.Printf("cache close: %v", err)
    }
    if err := db.Close(); err != nil {
        log.Printf("db close: %v", err)
    }

    log.Println("shutdown complete")
}
```

Shutdown ordering rules:
1. **HTTP/gRPC servers** — stop accepting new requests, drain in-flight
2. **Message consumers** — stop consuming, finish processing current batch
3. **Message producers** — flush pending messages
4. **Caches** — close connections
5. **Databases** — close connection pools
6. **Telemetry** — flush remaining traces/metrics

### Interface Design - Rationale and Examples

**Accept interfaces, return structs** — the consumer defines the contract, the producer returns a concrete type:

```go
type OrderService struct {
    finder UserFinder
}

type UserFinder interface {
    FindByID(ctx context.Context, id string) (User, error)
}

func NewOrderService(finder UserFinder) *OrderService {
    return &OrderService{finder: finder}
}
```

The producer (repository) has no knowledge of the interface:

```go
type PostgresUserRepo struct {
    db *sql.DB
}

func NewPostgresUserRepo(db *sql.DB) *PostgresUserRepo {
    return &PostgresUserRepo{db: db}
}

func (r *PostgresUserRepo) FindByID(ctx context.Context, id string) (User, error) {
    var u User
    err := r.db.QueryRowContext(ctx, "SELECT id, name FROM users WHERE id = $1", id).Scan(&u.ID, &u.Name)
    return u, err
}

func (r *PostgresUserRepo) Create(ctx context.Context, user User) error { ... }
func (r *PostgresUserRepo) Update(ctx context.Context, user User) error { ... }
func (r *PostgresUserRepo) Delete(ctx context.Context, id string) error { ... }
```

Why consumer-side interfaces:
- `OrderService` only needs `FindByID`, not the full CRUD — smaller interface = easier to mock and test
- If `OrderService` defined a 5-method interface, tests would need to mock all 5 methods even when only 1 is used
- Different consumers can define different slices of the same concrete type

**Bad** — producer-side "god interface":
```go
type UserRepository interface {
    FindByID(ctx context.Context, id string) (User, error)
    Create(ctx context.Context, user User) error
    Update(ctx context.Context, user User) error
    Delete(ctx context.Context, id string) error
    List(ctx context.Context) ([]User, error)
}

func NewOrderService(repo UserRepository) *OrderService { ... }
func NewNotificationService(repo UserRepository) *NotificationService { ... }
```

**Good** — each consumer defines only what it needs:
```go
type UserFinder interface {
    FindByID(ctx context.Context, id string) (User, error)
}
func NewOrderService(finder UserFinder) *OrderService { ... }

type UserLister interface {
    List(ctx context.Context) ([]User, error)
}
func NewNotificationService(lister UserLister) *NotificationService { ... }
```

### Guard Clauses - Examples

**Nested conditionals** make code hard to follow. Guard clauses flatten the logic:

Bad:
```go
func (s *Service) CreateOrder(ctx context.Context, req CreateOrderRequest) (*Order, error) {
    if req.UserID != "" {
        user, err := s.users.FindByID(ctx, req.UserID)
        if err == nil {
            if user.IsActive() {
                if len(req.Items) > 0 {
                    order, err := s.orders.Create(ctx, user, req.Items)
                    if err == nil {
                        return order, nil
                    }
                    return nil, fmt.Errorf("create order: %w", err)
                }
                return nil, errors.New("empty cart")
            }
            return nil, errors.New("inactive user")
        }
        return nil, fmt.Errorf("find user: %w", err)
    }
    return nil, errors.New("missing user id")
}
```

Good:
```go
func (s *Service) CreateOrder(ctx context.Context, req CreateOrderRequest) (*Order, error) {
    if req.UserID == "" {
        return nil, errors.New("missing user id")
    }
    user, err := s.users.FindByID(ctx, req.UserID)
    if err != nil {
        return nil, fmt.Errorf("find user: %w", err)
    }
    if !user.IsActive() {
        return nil, errors.New("inactive user")
    }
    if len(req.Items) == 0 {
        return nil, errors.New("empty cart")
    }
    order, err := s.orders.Create(ctx, user, req.Items)
    if err != nil {
        return nil, fmt.Errorf("create order: %w", err)
    }
    return order, nil
}
```

### errgroup - Full Examples

**Basic usage** — fetch multiple URLs concurrently, cancel all on first error:

```go
func fetchAll(ctx context.Context, urls []string) ([]Response, error) {
    g, ctx := errgroup.WithContext(ctx)
    responses := make([]Response, len(urls))

    for i, url := range urls {
        g.Go(func() error {
            resp, err := fetch(ctx, url)
            if err != nil {
                return fmt.Errorf("fetch %s: %w", url, err)
            }
            responses[i] = resp
            return nil
        })
    }

    if err := g.Wait(); err != nil {
        return nil, err
    }
    return responses, nil
}
```

**Bounded concurrency with SetLimit** — process items with at most N goroutines:

```go
func processAll(ctx context.Context, items []Item) error {
    g, ctx := errgroup.WithContext(ctx)
    g.SetLimit(10)

    for _, item := range items {
        g.Go(func() error {
            if err := ctx.Err(); err != nil {
                return err
            }
            return process(ctx, item)
        })
    }

    return g.Wait()
}
```

**Pipeline pattern** — producer feeds items, workers process with bounded concurrency:

```go
func pipeline(ctx context.Context, ids []string) error {
    g, ctx := errgroup.WithContext(ctx)
    ch := make(chan string)

    g.Go(func() error {
        defer close(ch)
        for _, id := range ids {
            select {
            case ch <- id:
            case <-ctx.Done():
                return ctx.Err()
            }
        }
        return nil
    })

    workers := 5
    for range workers {
        g.Go(func() error {
            for id := range ch {
                if err := handle(ctx, id); err != nil {
                    return err
                }
            }
            return nil
        })
    }

    return g.Wait()
}
```

**errgroup vs manual WaitGroup + error channel:**

Bad — manual error collection is verbose and error-prone:
```go
func fetchAllManual(ctx context.Context, urls []string) error {
    var wg sync.WaitGroup
    errCh := make(chan error, len(urls))

    for _, url := range urls {
        wg.Add(1)
        go func() {
            defer wg.Done()
            if err := fetch(ctx, url); err != nil {
                errCh <- err
            }
        }()
    }

    wg.Wait()
    close(errCh)

    for err := range errCh {
        return err
    }
    return nil
}
```

Good — `errgroup` handles synchronization, error propagation, and context cancellation:
```go
func fetchAllErrgroup(ctx context.Context, urls []string) error {
    g, ctx := errgroup.WithContext(ctx)
    for _, url := range urls {
        g.Go(func() error {
            return fetch(ctx, url)
        })
    }
    return g.Wait()
}
```

---

## Goroutine Leak Prevention - Detailed Scenarios

### Scenario 1: Blocked Channel Receive

A goroutine waits for a value that is never sent.

Bad:
```go
func main() {
    ch := make(chan int)
    go func() {
        val := <-ch // blocks forever, no sender
        fmt.Println(val)
    }()
}
```

Good:
```go
func main() {
    ch := make(chan int)
    go func() {
        select {
        case val := <-ch:
            fmt.Println(val)
        case <-time.After(5 * time.Second):
            fmt.Println("timeout, exiting")
        }
    }()
    ch <- 42
}
```

### Scenario 2: Blocked Channel Send (Early Return)

A sender blocks because the receiver exits early due to an error.

Bad:
```go
func process() error {
    ch := make(chan int)
    go func() {
        result := expensiveComputation()
        ch <- result // blocks forever if process() returns early
    }()

    if err := validate(); err != nil {
        return err // ch is never read, goroutine leaked
    }
    return handle(<-ch)
}
```

Good:
```go
func process() error {
    ch := make(chan int, 1) // buffered: sender won't block even without receiver
    go func() {
        ch <- expensiveComputation()
    }()

    if err := validate(); err != nil {
        return err // goroutine completes and ch is GC'd
    }
    return handle(<-ch)
}
```

### Scenario 3: Missing Channel Close with Range

`for range ch` blocks forever if the channel is never closed.

Bad:
```go
func produce(ch chan int) {
    for i := 0; i < 10; i++ {
        ch <- i
    }
    // channel never closed
}

func main() {
    ch := make(chan int)
    go produce(ch)
    for val := range ch { // blocks forever after 10 values
        fmt.Println(val)
    }
}
```

Good:
```go
func produce(ch chan int) {
    defer close(ch)
    for i := 0; i < 10; i++ {
        ch <- i
    }
}

func main() {
    ch := make(chan int)
    go produce(ch)
    for val := range ch { // exits when channel is closed
        fmt.Println(val)
    }
}
```

### Scenario 4: Nil Channel Operations

Send or receive on a nil channel blocks forever.

Bad:
```go
func main() {
    var ch chan int // nil channel
    go func() {
        ch <- 1 // blocks forever
    }()
    go func() {
        <-ch // blocks forever
    }()
}
```

Good:
```go
func main() {
    ch := make(chan int, 1) // always initialize
    go func() {
        ch <- 1
    }()
    fmt.Println(<-ch)
}
```

### Scenario 5: Select Without Context Cancellation

A goroutine in a select loop never exits because there's no `ctx.Done()` case.

Bad:
```go
func worker(ch chan Task) {
    for {
        select {
        case task := <-ch:
            task.Execute()
        }
    }
}
```

Good:
```go
func worker(ctx context.Context, ch chan Task) {
    for {
        select {
        case task := <-ch:
            task.Execute()
        case <-ctx.Done():
            return
        }
    }
}
```

### Scenario 6: Forgotten Ticker

A ticker goroutine runs forever without a stop mechanism.

Bad:
```go
func startMetrics() {
    go func() {
        ticker := time.NewTicker(30 * time.Second)
        for range ticker.C {
            collectMetrics()
        }
    }()
}
```

Good:
```go
func startMetrics(ctx context.Context) {
    go func() {
        ticker := time.NewTicker(30 * time.Second)
        defer ticker.Stop()
        for {
            select {
            case <-ticker.C:
                collectMetrics()
            case <-ctx.Done():
                return
            }
        }
    }()
}
```

### Scenario 7: HTTP Handler Fire-and-Forget

A goroutine spawned in an HTTP handler outlives the request.

Bad:
```go
func handler(w http.ResponseWriter, r *http.Request) {
    go func() {
        time.Sleep(30 * time.Second)
        sendNotification() // runs even if client disconnected
    }()
    w.WriteHeader(http.StatusAccepted)
}
```

Good:
```go
func handler(w http.ResponseWriter, r *http.Request) {
    ctx := r.Context()
    go func() {
        select {
        case <-time.After(30 * time.Second):
            sendNotification()
        case <-ctx.Done():
            return
        }
    }()
    w.WriteHeader(http.StatusAccepted)
}
```

### Scenario 8: WaitGroup Misuse

`wg.Add(1)` called before a condition that may skip the goroutine.

Bad:
```go
var wg sync.WaitGroup
wg.Add(1)
if shouldProcess {
    go func() {
        defer wg.Done()
        process()
    }()
}
wg.Wait() // deadlock if shouldProcess is false
```

Good:
```go
var wg sync.WaitGroup
if shouldProcess {
    wg.Add(1)
    go func() {
        defer wg.Done()
        process()
    }()
}
wg.Wait()
```

### Scenario 9: Stream/Connection Handler Without Cleanup

WebSocket, gRPC stream, or TCP connection handlers that don't exit on connection close.

Bad:
```go
func handleConn(conn net.Conn) {
    go func() {
        scanner := bufio.NewScanner(conn)
        for scanner.Scan() {
            process(scanner.Text())
        }
        // if conn is never closed by the remote, this goroutine leaks
    }()
}
```

Good:
```go
func handleConn(ctx context.Context, conn net.Conn) {
    go func() {
        defer conn.Close()

        done := make(chan struct{})
        go func() {
            defer close(done)
            scanner := bufio.NewScanner(conn)
            for scanner.Scan() {
                process(scanner.Text())
            }
        }()

        select {
        case <-done:
        case <-ctx.Done():
            conn.Close() // forces scanner.Scan() to return
        }
    }()
}
```

### Scenario 10: Multiple Goroutines With Shared Done Channel

When multiple goroutines need coordinated shutdown, a single context cancellation handles all of them.

Bad:
```go
func startWorkers() {
    for i := 0; i < 10; i++ {
        go func() {
            for {
                doWork()
                time.Sleep(time.Second)
            }
        }()
    }
}
```

Good:
```go
func startWorkers(ctx context.Context) {
    var wg sync.WaitGroup
    for i := 0; i < 10; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            for {
                select {
                case <-ctx.Done():
                    return
                default:
                    doWork()
                }

                select {
                case <-ctx.Done():
                    return
                case <-time.After(time.Second):
                }
            }
        }()
    }
    // wg.Wait() on shutdown
}
```

### Detection in Tests

Use goleak to automatically catch leaked goroutines:

```go
func TestMain(m *testing.M) {
    goleak.VerifyTestMain(m)
}

func TestWorker(t *testing.T) {
    defer goleak.VerifyNone(t)

    ctx, cancel := context.WithCancel(context.Background())
    startWorker(ctx)

    cancel() // must cancel to prevent leak
    time.Sleep(100 * time.Millisecond) // allow goroutine to exit
}
```

### Detection in Production

```go
import _ "net/http/pprof"

func main() {
    go func() {
        log.Println(http.ListenAndServe("localhost:6060", nil))
    }()
    // Access: http://localhost:6060/debug/pprof/goroutine?debug=1
}
```

Monitor `runtime.NumGoroutine()` as a metric and set alerts for unexpected growth.

---

## Testing

### Mockery Configuration

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

### Table-Driven Tests - Full Example

```go
func TestSum(t *testing.T) {
    tests := []struct {
        name     string
        a, b     int
        expected int
    }{
        {"both positive", 3, 5, 8},
        {"positive and negative", 7, -2, 5},
        {"both negative", -4, -6, -10},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result := Sum(tt.a, tt.b)
            if result != tt.expected {
                t.Errorf("expected %d, got %d", tt.expected, result)
            }
        })
    }
}
```

### Goroutine Leak Detection - Custom Options

```go
func TestWithOptions(t *testing.T) {
    opts := []goleak.Option{
        goleak.IgnoreTopFunction("internal/poll.runtime_pollWait"),
        goleak.IgnoreTopFunction("net/http.(*Transport).dialConn"),
    }

    defer goleak.VerifyNone(t, opts...)

    // test code
}
```

When a leak is detected, goleak provides stack traces:
```
Found 1 unexpected goroutines:
#1: created by example/service.StartWorker
        /path/to/your/code/service.go:42 +0x123
```

Fix leaks by:
1. Adding context cancellation
2. Implementing shutdown mechanisms
3. Ensuring channels are properly closed

### Fuzz Testing - Full Example

```go
func Reverse(s string) string {
    b := []byte(s)
    for i, j := 0, len(b)-1; i < len(b)/2; i, j = i+1, j-1 {
        b[i], b[j] = b[j], b[i]
    }
    return string(b)
}

func FuzzReverse(f *testing.F) {
    testcases := []string{"Hello, world", "", "!12345"}
    for _, tc := range testcases {
        f.Add(tc)
    }

    f.Fuzz(func(t *testing.T, orig string) {
        if !utf8.ValidString(orig) {
            return
        }

        rev := Reverse(orig)
        doubleRev := Reverse(rev)

        if orig != doubleRev {
            t.Errorf("Reverse(Reverse(%q)) = %q, want %q", orig, doubleRev, orig)
        }

        if len(orig) != len(rev) {
            t.Errorf("len(%q) = %d, len(%q) = %d", orig, len(orig), rev, len(rev))
        }
    })
}
```

Running:
```bash
go test -fuzz=FuzzReverse -fuzztime=30s
```

Best practices:
- Verify properties, not specific outputs
- Provide seed corpus with known edge cases
- Handle invalid inputs gracefully
- Add regression tests for discovered bugs

Best for: parsing/encoding, data validation, complex algorithms, security-critical code.

---

## Error Handling

### Error Types - Decision Examples

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

// caller
var notFound *NotFoundError
if errors.As(err, &notFound) {
    // handle
}
```

### Error Wrapping - Context Examples

Bad (noise accumulates):
```
failed to x: failed to y: failed to create new store: the error
```

Good (concise chain):
```
x: y: new store: the error
```

### Handle Errors Once - Examples

**Bad** - log and return:
```go
u, err := getUser(id)
if err != nil {
    log.Printf("Could not get user %q: %v", id, err)
    return err
}
```

**Good** - wrap and return:
```go
u, err := getUser(id)
if err != nil {
    return fmt.Errorf("get user %q: %w", id, err)
}
```

**Good** - log and degrade gracefully:
```go
if err := emitMetrics(); err != nil {
    log.Printf("Could not emit metrics: %v", err)
}
```

**Good** - match and degrade gracefully:
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

### Error Naming Convention

```go
var (
    ErrBrokenLink = errors.New("link is broken")   // exported
    errNotFound   = errors.New("not found")         // unexported
)

type NotFoundError struct {  // exported custom type
    File string
}

type resolveError struct {   // unexported custom type
    Path string
}
```
