# Concurrency Reference

## errgroup for Goroutine Groups

Use `golang.org/x/sync/errgroup` to manage groups of goroutines and propagate the first error.

### Basic Usage

**Go 1.22+** — loop variables are per-iteration scoped, safe to capture directly:
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

**Go < 1.22** — loop variables are shared across iterations. Re-assign before capturing in the closure:
```go
for i, url := range urls {
    i, url := i, url // shadow with per-iteration copy
    g.Go(func() error {
        resp, err := fetch(ctx, url)
        if err != nil {
            return fmt.Errorf("fetch %s: %w", url, err)
        }
        responses[i] = resp
        return nil
    })
}
```

### Bounded Concurrency with SetLimit

```go
g, ctx := errgroup.WithContext(ctx)
g.SetLimit(10)

for _, item := range items {
    item := item // Go < 1.22: shadow loop variable
    g.Go(func() error {
        return process(ctx, item)
    })
}
return g.Wait()
```

### Pipeline Pattern

Producer feeds items, workers process with bounded concurrency:

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

    for range 5 { // Go 1.22+ syntax
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

Key rules:
- Use `errgroup.WithContext` when goroutines should be cancelled on first error
- Use `SetLimit` to prevent unbounded goroutine spawning
- Prefer `errgroup` over manual `sync.WaitGroup` + error channel patterns

---

## Goroutine Leak Prevention

Every goroutine MUST have a clear exit path. A leaked goroutine (~2KB+ each) holds memory, file descriptors, and network connections indefinitely.

### Rules

- Every `select` MUST include `case <-ctx.Done(): return`
- Never send on unbuffered channels without a guaranteed receiver — use `make(chan T, 1)` when the receiver may exit early
- Always `close(ch)` when done sending — `for range ch` blocks forever otherwise
- Always `defer ticker.Stop()` and listen to `ctx.Done()` in ticker loops
- Never operate on nil channels — always initialize before use
- Use `r.Context()` in HTTP handlers to stop goroutines when the client disconnects
- Call `wg.Add(1)` inside the condition, not before it
- Always `defer conn.Close()` in stream/connection handlers and exit on read error

### Scenario 1: Blocked Channel Send (Early Return)

A sender blocks because the receiver exits early.

Bad:
```go
func process() error {
    ch := make(chan int)
    go func() {
        ch <- expensiveComputation() // blocks forever if process() returns early
    }()
    if err := validate(); err != nil {
        return err // goroutine leaked
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
        return err // goroutine completes, ch is GC'd
    }
    return handle(<-ch)
}
```

### Scenario 2: Missing Channel Close with Range

`for range ch` blocks forever if the channel is never closed.

Bad:
```go
func produce(ch chan int) {
    for i := 0; i < 10; i++ {
        ch <- i
    }
    // channel never closed
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
```

### Scenario 3: Select Without Context Cancellation

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

### Scenario 4: Forgotten Ticker

Bad:
```go
func startMetrics() {
    go func() {
        ticker := time.NewTicker(30 * time.Second)
        for range ticker.C {
            collectMetrics() // runs forever, no way to stop
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

### Scenario 5: WaitGroup Misuse

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

### Scenario 6: Blocked Channel Receive

A goroutine waits for a value that is never sent.

Bad:
```go
ch := make(chan int)
go func() {
    val := <-ch // blocks forever, no sender
    fmt.Println(val)
}()
```

Good:
```go
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
```

### Scenario 7: Nil Channel Operations

Send or receive on a nil channel blocks forever.

Bad:
```go
var ch chan int // nil channel
go func() { ch <- 1 }()  // blocks forever
go func() { <-ch }()     // blocks forever
```

Good:
```go
ch := make(chan int, 1) // always initialize
go func() { ch <- 1 }()
fmt.Println(<-ch)
```

### Scenario 8: HTTP Handler Fire-and-Forget

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

### Scenario 10: Multiple Goroutines Without Coordinated Shutdown

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

---

## Select is Random

When multiple `select` cases are ready simultaneously, Go picks one **at random**. Do not assume any ordering.

```go
ch := make(chan int, 1)
ch <- 1

select {
case v := <-ch:
    fmt.Println("received", v)
case ch <- 2:
    fmt.Println("sent")
}
// either case may execute — nondeterministic
```

If you need priority, use nested selects or check the high-priority channel first:
```go
for {
    select {
    case <-ctx.Done():
        return // always check cancellation first
    default:
    }

    select {
    case <-ctx.Done():
        return
    case msg := <-ch:
        handle(msg)
    }
}
```

## Notification Channels (chan struct{})

Use `chan struct{}` for signaling without data. It conveys intent and uses zero memory per element.

```go
done := make(chan struct{})

go func() {
    defer close(done)
    doWork()
}()

<-done // wait for completion
```

Bad — using `chan bool` for signals:
```go
done := make(chan bool) // what does true/false mean? unclear
done <- true
```

Good — `struct{}` makes the intent explicit:
```go
ready := make(chan struct{})
close(ready) // broadcast to all receivers — all <-ready unblock
```

Closing a channel is the idiomatic way to broadcast a signal to multiple goroutines. Multiple receivers can wait on the same channel.

## Nil Channels Are Useful

A nil channel blocks on both send and receive forever. This is useful in `select` to dynamically disable cases.

```go
func merge(ch1, ch2 <-chan int) <-chan int {
    out := make(chan int)
    go func() {
        defer close(out)
        for ch1 != nil || ch2 != nil {
            select {
            case v, ok := <-ch1:
                if !ok {
                    ch1 = nil // disable this case — select skips nil channels
                    continue
                }
                out <- v
            case v, ok := <-ch2:
                if !ok {
                    ch2 = nil
                    continue
                }
                out <- v
            }
        }
    }()
    return out
}
```

Without setting channels to nil, a closed channel returns the zero value immediately, causing a busy loop.

## Mutex Does Not Protect Data — It Protects a Code Section

A mutex protects the critical section between `Lock()` and `Unlock()`. If you copy the protected data and pass it outside, the copy is unprotected.

Bad:
```go
type Cache struct {
    mu   sync.RWMutex
    data map[string]int
}

func (c *Cache) Data() map[string]int {
    c.mu.RLock()
    defer c.mu.RUnlock()
    return c.data // returns the same map reference — caller can mutate without lock
}
```

Good — return a copy:
```go
func (c *Cache) Data() map[string]int {
    c.mu.RLock()
    defer c.mu.RUnlock()
    return maps.Clone(c.data) // caller gets an independent copy
}
```

Same applies to slices:
```go
// Bad — returns the slice header, backing array is shared
func (c *Cache) Items() []Item {
    c.mu.RLock()
    defer c.mu.RUnlock()
    return c.items // caller can mutate through shared backing array
}

// Good
func (c *Cache) Items() []Item {
    c.mu.RLock()
    defer c.mu.RUnlock()
    return slices.Clone(c.items)
}
```

## False Sharing (Cache Line Contention)

When goroutines write to variables on the same CPU cache line (~64 bytes), all cores invalidate each other's caches even though they access different variables. This is called false sharing.

Bad:
```go
type Result struct {
    sumA int64 // goroutine 1 writes here
    sumB int64 // goroutine 2 writes here — same cache line as sumA
}

func count(inputs []Input) Result {
    var result Result
    var wg sync.WaitGroup
    wg.Add(2)

    go func() {
        for i := range inputs {
            result.sumA += inputs[i].a
        }
        wg.Done()
    }()

    go func() {
        for i := range inputs {
            result.sumB += inputs[i].b // invalidates sumA's cache line on every write
        }
        wg.Done()
    }()

    wg.Wait()
    return result
}
```

Good — pad to separate cache lines:
```go
type Result struct {
    sumA int64
    _    [56]byte // padding to push sumB to next cache line (64 - 8 = 56)
    sumB int64
}
```

The padded version runs ~40% faster. This matters in high-throughput concurrent code where goroutines write to adjacent fields in tight loops.

Alternative — use local variables and merge results:
```go
go func() {
    var localSum int64
    for i := range inputs {
        localSum += inputs[i].a
    }
    result.sumA = localSum // single write at the end
    wg.Done()
}()
```

---

## Detection

Use [goleak](https://github.com/uber-go/goleak) in tests — see [testing reference](testing.md) for setup.