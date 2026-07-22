# Patterns Reference

## Naming Conventions

- **MixedCaps**: `PascalCase` for exported, `camelCase` for unexported. Never use underscores.
- **Acronyms**: All caps — `ID` not `Id`, `URL` not `Url`, `HTTP` not `Http`, `API` not `Api`
- **Getters**: `Name()` not `GetName()` — Go convention omits the `Get` prefix
- **Single-method interfaces**: `-er` suffix — `Reader`, `Writer`, `Stringer`, `Closer`
- **Package names**: Short, single lowercase word. No underscores, no mixedCaps. `httputil` not `http_util`.
- **Error vars**: `ErrNotFound` (exported), `errNotFound` (unexported)
- **Error types**: `NotFoundError` suffix, not `NotFoundErr`

## Context as First Parameter

Every function that accepts a `context.Context` must take it as the first parameter:

```go
func GetUser(ctx context.Context, id string) (User, error) { ... }
```

Never store `context.Context` in a struct field.

## Guard Clauses

Reduce nesting by returning early for error/edge cases. Handle the unhappy path first, keep the happy path at the lowest indentation level.

Bad:
```go
func (s *Service) CreateOrder(ctx context.Context, req CreateOrderRequest) (*Order, error) {
    if req.UserID != "" {
        user, err := s.users.FindByID(ctx, req.UserID)
        if err == nil {
            if user.IsActive() {
                if len(req.Items) > 0 {
                    return s.orders.Create(ctx, user, req.Items)
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
    return s.orders.Create(ctx, user, req.Items)
}
```

## Defer Pitfalls

### Defer in loops

Deferred calls execute when the **function** returns, not when the loop iteration ends.

Bad:
```go
for _, name := range files {
    f, err := os.Open(name)
    if err != nil {
        return err
    }
    defer f.Close() // all files stay open until function returns
    process(f)
}
```

Good:
```go
for _, name := range files {
    if err := processFile(name); err != nil {
        return err
    }
}

func processFile(name string) error {
    f, err := os.Open(name)
    if err != nil {
        return err
    }
    defer f.Close()
    return process(f)
}
```

### Defer with error returns

Capture errors from `Close()` on writable resources:

```go
func writeFile(path string, data []byte) (err error) {
    f, err := os.Create(path)
    if err != nil {
        return err
    }
    defer func() {
        if cerr := f.Close(); err == nil {
            err = cerr
        }
    }()
    _, err = f.Write(data)
    return err
}
```

## HTTP Client Best Practices

Never use `http.DefaultClient` — it has no timeout and will hang indefinitely:

Bad:
```go
resp, err := http.Get(url)
```

Good:
```go
client := &http.Client{
    Timeout: 10 * time.Second,
}
resp, err := client.Get(url)
```

For production services, configure the transport:

```go
client := &http.Client{
    Timeout: 10 * time.Second,
    Transport: &http.Transport{
        MaxIdleConns:        100,
        MaxIdleConnsPerHost: 10,
        IdleConnTimeout:     90 * time.Second,
    },
}
```

Reuse `*http.Client` — create it once and share across goroutines. It is safe for concurrent use.

## Functional Options

Use functional options for constructors with 3+ optional arguments:

```go
type options struct {
    cache  bool
    logger Logger
}

type Option func(*options)

func WithCache(c bool) Option {
    return func(o *options) { o.cache = c }
}

func WithLogger(log Logger) Option {
    return func(o *options) { o.logger = log }
}

func Open(addr string, opts ...Option) (*Connection, error) {
    o := options{
        cache:  defaultCache,
        logger: NewLogger(),
    }
    for _, opt := range opts {
        opt(&o)
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

## Graceful Shutdown

Listen for `SIGTERM` and `SIGINT`, then close resources in **reverse order** of initialization. Every resource that is opened must be closed.

```go
func main() {
    ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
    defer stop()

    db := initDB()
    cache := initCache()
    server := &http.Server{Addr: ":8080", Handler: initRoutes(db, cache)}

    go func() {
        if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
            log.Printf("server: %v", err)
        }
    }()

    <-ctx.Done()
    log.Println("shutting down...")

    shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
    defer cancel()

    if err := server.Shutdown(shutdownCtx); err != nil {
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

Shutdown ordering:
1. **HTTP/gRPC servers** — stop accepting new requests, drain in-flight
2. **Message consumers** — stop consuming, finish current batch
3. **Message producers** — flush pending messages
4. **Caches** — close connections
5. **Databases** — close connection pools
6. **Telemetry** — flush remaining traces/metrics

Key rules:
- **Reverse order**: Stop accepting new work before closing dependencies
- **Timeout**: Always set a shutdown timeout to prevent hanging
- **No leaks**: Every `Open`/`Dial`/`Listen` must have a corresponding `Close`/`Shutdown`
- **Log errors**: Log shutdown errors but continue closing remaining resources

## Health Checks

Configure liveness and readiness probes in Kubernetes:

- **Liveness**: Is the process alive? Restart if not. Keep it simple — return 200.
- **Readiness**: Can the pod serve traffic? Check all critical dependencies.
- **Startup**: Use for slow-starting services to avoid premature liveness failures.

When adding a new dependency (database, cache, message broker, external service), add it to the readiness probe — if the resource is unavailable, the pod should not receive traffic.

```go
func readinessHandler(db *sql.DB, cache *redis.Client) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
        defer cancel()

        if err := db.PingContext(ctx); err != nil {
            http.Error(w, "db: "+err.Error(), http.StatusServiceUnavailable)
            return
        }
        if err := cache.Ping(ctx).Err(); err != nil {
            http.Error(w, "cache: "+err.Error(), http.StatusServiceUnavailable)
            return
        }
        w.WriteHeader(http.StatusOK)
    }
}
```

## Interface Design

- Accept interfaces, return structs
- Define interfaces on the consumer side, not the producer side
- Keep interfaces small — prefer single-method interfaces
- Don't create interfaces until you need them

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
```

**Good** — each consumer defines only what it needs:
```go
// Consumer defines its own interface
type UserFinder interface {
    FindByID(ctx context.Context, id string) (User, error)
}
func NewOrderService(finder UserFinder) *OrderService { ... }

// Producer returns concrete type
func NewPostgresUserRepo(db *sql.DB) *PostgresUserRepo {
    return &PostgresUserRepo{db: db}
}
```

Why consumer-side interfaces:
- `OrderService` only needs `FindByID`, not full CRUD — smaller interface = easier to mock
- Different consumers can define different slices of the same concrete type
- Avoids forcing all consumers to mock methods they don't use

## Accept io.Reader, Not Filenames

Functions that accept filenames are hard to test and limited to file I/O. Accept `io.Reader` instead.

Bad:
```go
func CountWords(filename string) (int, error) {
    f, err := os.Open(filename)
    if err != nil {
        return 0, err
    }
    defer f.Close()
    // count words from f...
}

// Testing requires creating temp files
func TestCountWords(t *testing.T) {
    tmpFile := createTempFile(t, "hello world")
    count, err := CountWords(tmpFile.Name())
}
```

Good:
```go
func CountWords(r io.Reader) (int, error) {
    scanner := bufio.NewScanner(r)
    scanner.Split(bufio.ScanWords)
    count := 0
    for scanner.Scan() {
        count++
    }
    return count, scanner.Err()
}

// Testing is trivial — no files needed
func TestCountWords(t *testing.T) {
    count, err := CountWords(strings.NewReader("hello world"))
    // assert count == 2
}
```

This works with files, HTTP bodies, buffers, compressed streams, network connections — anything implementing `io.Reader`.

## Close Transient Resources

HTTP response bodies, `sql.Rows`, and `os.File` must always be closed. Failing to close leaks file descriptors and connections.

HTTP response body:
```go
resp, err := http.Get(url)
if err != nil {
    return err
}
defer resp.Body.Close() // MUST close — leaks connection otherwise

body, err := io.ReadAll(resp.Body)
```

SQL rows:
```go
rows, err := db.QueryContext(ctx, query)
if err != nil {
    return err
}
defer rows.Close() // MUST close — leaks connection from pool

for rows.Next() {
    // scan...
}
if err := rows.Err(); err != nil { // MUST check rows.Err()
    return err
}
```

Rule: If a function returns a resource with a `Close()` method, defer the close immediately after the error check.
