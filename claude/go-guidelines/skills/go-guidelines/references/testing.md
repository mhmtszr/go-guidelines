# Testing Reference

## Table-Driven Tests

Use table-driven tests for functions with multiple input/output combinations:

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

## t.Helper()

Always call `t.Helper()` in test helper functions so failures report the caller's line number:

```go
func assertStatusCode(t *testing.T, got, want int) {
    t.Helper()
    if got != want {
        t.Errorf("status code = %d, want %d", got, want)
    }
}
```

## t.Cleanup()

Use `t.Cleanup()` for teardown instead of `defer` — runs after the test and all its subtests complete:

```go
func setupTestDB(t *testing.T) *sql.DB {
    t.Helper()
    db, err := sql.Open("postgres", testDSN)
    if err != nil {
        t.Fatal(err)
    }
    t.Cleanup(func() { db.Close() })
    return db
}
```

## httptest for HTTP Handlers

Use `net/http/httptest` to test HTTP handlers without starting a real server:

```go
func TestGetUser(t *testing.T) {
    handler := NewUserHandler(mockStore)

    req := httptest.NewRequest(http.MethodGet, "/users/123", nil)
    w := httptest.NewRecorder()

    handler.ServeHTTP(w, req)

    if w.Code != http.StatusOK {
        t.Errorf("status = %d, want %d", w.Code, http.StatusOK)
    }
}
```

For testing HTTP clients, use a test server:

```go
func TestAPIClient(t *testing.T) {
    srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(http.StatusOK)
        w.Write([]byte(`{"id": "123"}`))
    }))
    t.Cleanup(srv.Close)

    client := NewAPIClient(srv.URL)
    user, err := client.GetUser("123")
    // assert...
}
```

## Race Detector

Always run tests with the race detector:

```
go test ./... -race
```

## Parallel Tests

When using `t.Parallel()`, capture loop variables (Go < 1.22):

```go
for _, tt := range tests {
    tt := tt
    t.Run(tt.name, func(t *testing.T) {
        t.Parallel()
        // ...
    })
}
```

Go >= 1.22: Loop variables are per-iteration scoped, so re-assignment is unnecessary.

## Mock Generation with mockery

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

## Goroutine Leak Detection with goleak

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

Ignore known background goroutines:

```go
defer goleak.VerifyNone(t,
    goleak.IgnoreTopFunction("internal/poll.runtime_pollWait"),
)
```

## Fuzz Testing

Use Go's native fuzz testing (Go 1.18+) for parsing, validation, and security-critical code:

```go
func FuzzParseInput(f *testing.F) {
    f.Add("valid input")
    f.Add("")
    f.Add("edge;case")

    f.Fuzz(func(t *testing.T, input string) {
        result, err := ParseInput(input)
        if err != nil {
            return // invalid input is expected
        }
        // verify properties of valid results
        if result.Raw != input {
            t.Errorf("roundtrip failed: got %q, want %q", result.Raw, input)
        }
    })
}
```

Run: `go test -fuzz=FuzzParseInput -fuzztime=30s`

Best for: parsing/encoding, data validation, complex algorithms, security-critical code.

## Don't Sleep in Tests

`time.Sleep` in tests makes them slow and flaky. Use synchronization instead.

Bad:
```go
func TestPublish(t *testing.T) {
    ch := make(chan string, 1)
    go publish(ch)
    time.Sleep(500 * time.Millisecond) // flaky — may not be enough
    assert(t, <-ch, "event")
}
```

Good — use channels, WaitGroups, or polling with deadline:
```go
func TestPublish(t *testing.T) {
    ch := make(chan string, 1)
    go publish(ch)

    select {
    case msg := <-ch:
        assert(t, msg, "event")
    case <-time.After(5 * time.Second):
        t.Fatal("timed out waiting for event")
    }
}
```

For periodic assertions, use a retry helper:
```go
func eventually(t *testing.T, fn func() bool) {
    t.Helper()
    deadline := time.Now().Add(5 * time.Second)
    for time.Now().Before(deadline) {
        if fn() {
            return
        }
        time.Sleep(10 * time.Millisecond) // short poll interval is acceptable
    }
    t.Fatal("condition not met within deadline")
}
```

## Test Categorization

Separate fast unit tests from slow integration tests using build tags or `-short` mode.

Build tags:
```go
//go:build integration

package store_test

func TestDatabaseQuery(t *testing.T) {
    // requires running database
}
```

Run: `go test -tags=integration ./...`

Short mode — skip long-running tests:
```go
func TestSlowOperation(t *testing.T) {
    if testing.Short() {
        t.Skip("skipping in short mode")
    }
    // slow test...
}
```

Run fast only: `go test -short ./...`

## Benchmark Pitfalls

### Compiler eliminating function calls

The compiler inlines and eliminates functions with unused results, making benchmarks measure an empty loop.

Bad:
```go
func BenchmarkPopcnt(b *testing.B) {
    for i := 0; i < b.N; i++ {
        popcnt(uint64(i)) // result unused — compiler may eliminate the call
    }
}
// Result: ~0.3 ns/op — impossibly fast
```

Good — assign to local, then to package-level var:
```go
var sink uint64

func BenchmarkPopcnt(b *testing.B) {
    var v uint64
    for i := 0; i < b.N; i++ {
        v = popcnt(uint64(i))
    }
    sink = v // prevents elimination without slowing the loop
}
// Result: ~2.0 ns/op — actual cost
```

### Observer effect (CPU cache warming)

Reusing the same input data across iterations warms the CPU cache, producing results that don't match production.

Bad:
```go
func BenchmarkProcess(b *testing.B) {
    data := generateLargeData() // same data cached across all iterations
    b.ResetTimer()
    for i := 0; i < b.N; i++ {
        process(data)
    }
}
```

Good — recreate data each iteration:
```go
func BenchmarkProcess(b *testing.B) {
    for i := 0; i < b.N; i++ {
        b.StopTimer()
        data := generateLargeData()
        b.StartTimer()
        process(data)
    }
}
```

### Timer management

Use `b.ResetTimer()` after expensive setup. Use `b.StopTimer()`/`b.StartTimer()` around per-iteration setup:

```go
func BenchmarkQuery(b *testing.B) {
    db := setupTestDB(b) // expensive one-time setup
    b.ResetTimer()

    for i := 0; i < b.N; i++ {
        b.StopTimer()
        seedData(db) // per-iteration setup
        b.StartTimer()
        query(db)
    }
}
```

### Use benchstat for reliable results

Run benchmarks multiple times and use `benchstat` for statistical analysis:
```
go test -bench=. -count=10 | tee bench.txt
benchstat bench.txt
```

## testing/synctest (Go 1.25+)

Use `synctest.Test` for deterministic testing of concurrent code with virtualized time:

```go
func TestWorker(t *testing.T) {
    synctest.Test(t, func(t *testing.T) {
        ctx := t.Context()
        ch := make(chan int)

        go worker(ctx, ch)

        ch <- 42
        synctest.Wait() // wait for all goroutines in the bubble to block

        // assert results...
    })
}
```
