# Context Patterns

## Type-Safe Context Keys

Never use built-in types (string, int) as context keys — they collide across packages.

Bad:
```go
ctx = context.WithValue(ctx, "userID", "abc")      // any package using "userID" collides
ctx = context.WithValue(ctx, "requestID", "xyz")
```

Good — unexported type as key:
```go
type contextKey int

const (
    userIDKey contextKey = iota
    requestIDKey
)

func WithUserID(ctx context.Context, id string) context.Context {
    return context.WithValue(ctx, userIDKey, id)
}

func UserID(ctx context.Context) (string, bool) {
    id, ok := ctx.Value(userIDKey).(string)
    return id, ok
}
```

Rules:
- Key type MUST be unexported to prevent cross-package collision
- Provide exported setter/getter functions
- Getter should return `(T, bool)` — never panic on missing key
- Group related keys with `iota` in a single type

## Never Store Context in Structs

`context.Context` is request-scoped. Storing it in a struct couples the struct's lifetime to a single request.

Bad:
```go
type Server struct {
    ctx context.Context // stale after the first request
    db  *sql.DB
}

func (s *Server) Query(q string) (*sql.Rows, error) {
    return s.db.QueryContext(s.ctx, q) // uses the wrong context
}
```

Good — pass context as a parameter:
```go
type Server struct {
    db *sql.DB
}

func (s *Server) Query(ctx context.Context, q string) (*sql.Rows, error) {
    return s.db.QueryContext(ctx, q)
}
```

The only exception is storing context in a struct that is itself request-scoped (e.g., a request-specific handler struct created per request), but even then, prefer passing it explicitly.

## context.WithCancelCause (Go 1.20+)

Standard `context.WithCancel` only tells you the context was cancelled. `WithCancelCause` tells you **why**.

Before:
```go
ctx, cancel := context.WithCancel(parent)
cancel()
fmt.Println(ctx.Err()) // "context canceled" — but why?
```

After:
```go
ctx, cancel := context.WithCancelCause(parent)
cancel(fmt.Errorf("user %s disconnected", userID))

fmt.Println(ctx.Err())           // "context canceled"
fmt.Println(context.Cause(ctx))  // "user abc123 disconnected"
```

Use `context.Cause(ctx)` instead of `ctx.Err()` when you need the root cause. `Cause` returns the error passed to `cancel`, or falls back to `ctx.Err()` if no cause was set.

Also available: `context.WithTimeoutCause` and `context.WithDeadlineCause`:
```go
ctx, cancel := context.WithTimeoutCause(parent, 5*time.Second,
    fmt.Errorf("database query exceeded 5s timeout"))
defer cancel()
```

## context.WithoutCancel (Go 1.21+)

Creates a context that inherits values but NOT cancellation. Use when spawning background work that must outlive the request.

Bad — background work cancelled when request ends:
```go
func handler(w http.ResponseWriter, r *http.Request) {
    go audit(r.Context(), event) // cancelled when response is sent
    w.WriteHeader(http.StatusOK)
}
```

Good:
```go
func handler(w http.ResponseWriter, r *http.Request) {
    bgCtx := context.WithoutCancel(r.Context()) // inherits values (trace ID, user ID), not cancellation
    go audit(bgCtx, event)
    w.WriteHeader(http.StatusOK)
}
```

When to use:
- Background audit/logging that must complete
- Async event publishing after responding
- Cleanup tasks spawned from a request

When NOT to use:
- Operations that should respect the request lifecycle (DB queries, upstream calls)
- Anything that should stop when the caller cancels

## context.AfterFunc (Go 1.21+)

Registers a function to run when the context is cancelled. Cleaner than spawning a goroutine with a select loop.

Before:
```go
func watchContext(ctx context.Context, conn *websocket.Conn) {
    go func() {
        <-ctx.Done()
        conn.Close()
    }()
}
```

After:
```go
func watchContext(ctx context.Context, conn *websocket.Conn) (stop func() bool) {
    return context.AfterFunc(ctx, func() {
        conn.Close()
    })
}
```

`AfterFunc` returns a `stop` function. Call `stop()` to prevent the callback from running if the resource is already cleaned up:
```go
stop := context.AfterFunc(ctx, func() {
    conn.Close()
})
defer stop() // prevent double-close if we close conn normally
```

The callback runs in its own goroutine, so it's safe to block.

## Request-Scoped Context Propagation

Pass the request context through every layer: handler -> service -> repository -> external call. Never create a new `context.Background()` mid-chain.

Bad:
```go
func (s *OrderService) Create(ctx context.Context, req CreateOrderReq) error {
    user, err := s.userClient.Get(context.Background(), req.UserID) // loses trace ID, deadline, cancellation
    if err != nil {
        return err
    }
    return s.repo.Insert(context.Background(), order) // same problem
}
```

Good:
```go
func (s *OrderService) Create(ctx context.Context, req CreateOrderReq) error {
    user, err := s.userClient.Get(ctx, req.UserID) // propagates everything
    if err != nil {
        return fmt.Errorf("get user: %w", err)
    }
    return s.repo.Insert(ctx, order)
}
```

`context.Background()` should only appear in:
- `main()` for the root context
- `init()` or startup code
- Tests (or `t.Context()` in Go 1.24+)
- Background workers with `context.WithoutCancel`

## Context Timeout Layering

When an outer context has a deadline, an inner `WithTimeout` uses the **shorter** of the two. Don't assume your timeout will be honored.

```go
func handler(w http.ResponseWriter, r *http.Request) {
    // r.Context() has 30s timeout from server config
    ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second) // effective: 10s
    defer cancel()

    // If server timeout was 5s instead, effective timeout would be 5s, not 10s
    result, err := slowQuery(ctx)
}
```

Check remaining time with `context.Deadline`:
```go
if deadline, ok := ctx.Deadline(); ok {
    remaining := time.Until(deadline)
    if remaining < 100*time.Millisecond {
        return ErrInsufficientTime
    }
}
```

## Context and Goroutines

When spawning goroutines from a request handler, decide explicitly whether the goroutine should be tied to the request lifecycle.

Tied to request — use the request context:
```go
func handler(w http.ResponseWriter, r *http.Request) {
    g, ctx := errgroup.WithContext(r.Context())
    g.Go(func() error {
        return fetchData(ctx) // cancelled when request ends
    })
    // ...
}
```

Independent of request — use `WithoutCancel` or a separate context:
```go
func handler(w http.ResponseWriter, r *http.Request) {
    bgCtx := context.WithoutCancel(r.Context())
    go sendNotification(bgCtx, event) // outlives the request

    w.WriteHeader(http.StatusAccepted)
}
```

Never use a bare `go func()` with a request context and ignore the result — the goroutine will be cancelled when the response is sent.
