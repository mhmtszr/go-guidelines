# Go Pitfalls

## Nil Interface Trap

An interface holding a nil pointer is NOT nil. This is Go's most common trap.

```go
type Validator interface {
    Validate() error
}

type MyValidator struct{}

func (v *MyValidator) Validate() error { return nil }

func NewValidator() Validator {
    var v *MyValidator // nil pointer
    return v          // interface{type: *MyValidator, value: nil} — NOT nil
}

func main() {
    v := NewValidator()
    if v != nil { // true — the interface is not nil
        v.Validate() // works, but surprising
    }
}
```

Fix — return nil explicitly:
```go
func NewValidator(cfg Config) (Validator, error) {
    if !cfg.Enabled {
        return nil, nil // return bare nil, not a typed nil pointer
    }
    return &MyValidator{}, nil
}
```

Fix — check the concrete value with reflection when needed:
```go
func isNil(v any) bool {
    if v == nil {
        return true
    }
    val := reflect.ValueOf(v)
    return val.Kind() == reflect.Ptr && val.IsNil()
}
```

## Deferred Argument Evaluation

Arguments to deferred function calls are evaluated immediately, not when the deferred function runs.

Bad:
```go
func track(start time.Time) {
    elapsed := time.Since(start)
    slog.Info("elapsed", "duration", elapsed)
}

func process() {
    defer track(time.Now()) // time.Now() evaluated HERE, not on return — this is correct
    // ...
}
```

But this is wrong:
```go
func process() error {
    start := time.Now()
    defer slog.Info("elapsed", "duration", time.Since(start)) // time.Since evaluated NOW — always ~0
    // ...
}
```

Fix — wrap in a closure:
```go
func process() error {
    start := time.Now()
    defer func() {
        slog.Info("elapsed", "duration", time.Since(start)) // evaluated on return
    }()
    // ...
}
```

## Nil Map Write Panic

Writing to a nil map panics. Appending to a nil slice works. Agents constantly mix these up.

```go
var m map[string]int
m["key"] = 1 // panic: assignment to entry in nil map

var s []int
s = append(s, 1) // works fine — append allocates
```

Rule: Always initialize maps before writing:
```go
m := make(map[string]int)
m["key"] = 1
```

Reading from a nil map is safe — it returns the zero value:
```go
var m map[string]int
v := m["key"] // v == 0, no panic
```

## Nil Slice vs Empty Slice JSON

`nil` slices and empty slices behave differently in JSON marshaling. This causes API contract bugs.

```go
var nilSlice []int       // nil
emptySlice := []int{}    // non-nil, length 0

jsonNil, _ := json.Marshal(nilSlice)     // "null"
jsonEmpty, _ := json.Marshal(emptySlice) // "[]"
```

If your API must return `[]` instead of `null`, initialize explicitly:
```go
type Response struct {
    Items []Item `json:"items"`
}

func NewResponse() Response {
    return Response{
        Items: []Item{}, // ensures "[]" in JSON, not "null"
    }
}
```

Alternative — use `omitzero` (Go 1.24+) or `omitempty` to omit the field entirely when empty.

## Short Variable Declaration Shadowing

`:=` in an inner scope creates a new variable, silently shadowing the outer one. The outer variable stays unchanged.

Bad:
```go
func findUser(id string) (*User, error) {
    var user *User
    var err error

    if cached {
        user, err := cache.Get(id) // NEW user and err — shadows outer
        if err != nil {
            return nil, err
        }
        _ = user // this user is discarded at end of block
    }

    // user is still nil here
    return user, err
}
```

Fix — use `=` when the variable already exists:
```go
func findUser(id string) (*User, error) {
    var user *User
    var err error

    if cached {
        user, err = cache.Get(id) // assigns to outer variables
        if err != nil {
            return nil, err
        }
    }

    return user, err
}
```

Detection: Run `go vet -shadow` or enable the `shadow` analyzer in `golangci-lint`.

## Concurrent Map Read/Write Crash

Concurrent read and write on a map causes a **runtime fatal error**, not a data race. The race detector may not catch it in all cases.

```go
m := make(map[string]int)

// goroutine 1
go func() {
    for { m["key"] = 1 }
}()

// goroutine 2
go func() {
    for { _ = m["key"] }
}()

// fatal error: concurrent map read and map write
```

Fixes:
```go
// Option 1: sync.RWMutex
var mu sync.RWMutex
mu.Lock()
m["key"] = 1
mu.Unlock()

mu.RLock()
v := m["key"]
mu.RUnlock()

// Option 2: sync.Map (many reads, few writes)
var sm sync.Map
sm.Store("key", 1)
v, ok := sm.Load("key")
```

## Range Value Copy

`range` over a slice copies each element. Mutating the loop variable does NOT modify the original slice.

Bad:
```go
type Item struct {
    Name   string
    Active bool
}

items := []Item{{Name: "a"}, {Name: "b"}}
for _, item := range items {
    item.Active = true // modifies the COPY, not the original
}
// items[0].Active == false — unchanged
```

Fix — use index:
```go
for i := range items {
    items[i].Active = true
}
```

Fix — use slice of pointers:
```go
items := []*Item{{Name: "a"}, {Name: "b"}}
for _, item := range items {
    item.Active = true // modifies the original through pointer
}
```

## Iota Reset in Const Blocks

`iota` resets to 0 in each `const` block. Splitting related constants into separate blocks breaks the sequence.

Bad:
```go
const (
    StatusPending  = iota // 0
    StatusApproved        // 1
)

const (
    StatusRejected = iota // 0 again — NOT 2
    StatusExpired         // 1 again — NOT 3
)
```

Good — keep related constants in one block:
```go
const (
    StatusPending  = iota // 0
    StatusApproved        // 1
    StatusRejected        // 2
    StatusExpired         // 3
)
```

## Named Return Value Trap with Defer

Named return values can be silently overwritten by deferred closures.

```go
func loadConfig() (cfg Config, err error) {
    defer func() {
        if r := recover(); r != nil {
            err = fmt.Errorf("panic: %v", r) // overwrites err — intentional here
        }
    }()

    cfg = readConfig()
    return cfg, validate(cfg)
}
```

This is useful for `recover` and error capture (see `defer` with error returns in patterns reference), but accidental overwrites are hard to debug. Only use named returns when you need deferred mutation.

## Method Set and Pointer Receiver

A value of type `T` does NOT satisfy an interface if the method is defined on `*T`.

```go
type Sizer interface {
    Size() int
}

type File struct{}
func (f *File) Size() int { return 0 } // pointer receiver

var _ Sizer = File{}  // compile error: File does not implement Sizer
var _ Sizer = &File{} // works
```

Rule: If any method has a pointer receiver, the interface can only be satisfied by a pointer.

## Break in Switch/Select

`break` inside a `switch` or `select` terminates the **switch/select**, not the enclosing `for` loop. This is different from most other languages.

Bad:
```go
for i := 0; i < 10; i++ {
    switch i {
    case 5:
        break // breaks the switch, NOT the loop — loop continues
    }
    fmt.Println(i) // prints 0-4, then 6-9 (5 skipped for Println only)
}
```

Fix — use a label:
```go
loop:
    for i := 0; i < 10; i++ {
        switch i {
        case 5:
            break loop // breaks the for loop
        }
        fmt.Println(i) // prints 0-4 only
    }
```

Same applies to `select`:
```go
loop:
    for {
        select {
        case <-ch:
            // process
        case <-ctx.Done():
            break loop // without label, this only breaks the select
        }
    }
```

## Copying Sync Types

All `sync` types (`Mutex`, `RWMutex`, `WaitGroup`, `Cond`, `Map`, `Pool`) must NOT be copied after first use. Copying creates a separate lock/state, silently breaking synchronization.

Bad:
```go
type Cache struct {
    mu   sync.Mutex
    data map[string]string
}

func (c Cache) Get(key string) string { // value receiver — copies the mutex!
    c.mu.Lock()
    defer c.mu.Unlock()
    return c.data[key]
}
```

Good:
```go
func (c *Cache) Get(key string) string { // pointer receiver — no copy
    c.mu.Lock()
    defer c.mu.Unlock()
    return c.data[key]
}
```

This also applies when passing to functions:
```go
// Bad
func process(wg sync.WaitGroup) { ... }  // copies WaitGroup

// Good
func process(wg *sync.WaitGroup) { ... }
```

Detection: `go vet` detects most sync type copies. Enable `copylocks` in `golangci-lint`.

## Wrong Time Duration

Time functions accept `time.Duration`, which is `int64` (nanoseconds). Passing a raw integer without a unit is almost always a bug.

Bad:
```go
time.Sleep(1000) // sleeps 1000 nanoseconds (1μs), not 1000ms
time.NewTicker(1000) // ticks every 1μs
```

Good:
```go
time.Sleep(1000 * time.Millisecond) // explicit unit
time.NewTicker(1 * time.Second)
```

Bad — variable without unit:
```go
func connect(timeout int) {
    time.Sleep(time.Duration(timeout)) // nanoseconds? milliseconds? unclear
}
```

Good — accept `time.Duration` directly:
```go
func connect(timeout time.Duration) {
    time.Sleep(timeout)
}

connect(5 * time.Second)
```

## time.After Memory Leak

`time.After` creates a `time.Timer` that is not garbage collected until it fires. In loops, this leaks memory rapidly.

Bad:
```go
func consumer(ch <-chan Event) {
    for {
        select {
        case event := <-ch:
            handle(event)
        case <-time.After(time.Hour): // new timer EVERY iteration — leaked until it fires
            log.Println("no events")
        }
    }
}
```

Good — reuse a timer:
```go
func consumer(ch <-chan Event) {
    timer := time.NewTimer(time.Hour)
    defer timer.Stop()

    for {
        select {
        case event := <-ch:
            handle(event)
            if !timer.Stop() {
                <-timer.C
            }
            timer.Reset(time.Hour)
        case <-timer.C:
            log.Println("no events")
            timer.Reset(time.Hour)
        }
    }
}
```

Rule: `time.After` is fine for one-shot use. Never use it inside a loop or a repeatedly-called `select`.

## Missing Return After HTTP Reply

Writing an HTTP response does NOT stop handler execution. Code after `WriteHeader` or `Write` keeps running.

Bad:
```go
func handler(w http.ResponseWriter, r *http.Request) {
    if !isValid(r) {
        http.Error(w, "invalid request", http.StatusBadRequest)
        // execution continues — may write a second response or do unintended work
    }

    // this runs even for invalid requests
    processRequest(r)
    w.Write([]byte("success")) // http: superfluous response.WriteHeader call
}
```

Good:
```go
func handler(w http.ResponseWriter, r *http.Request) {
    if !isValid(r) {
        http.Error(w, "invalid request", http.StatusBadRequest)
        return // stop handler execution
    }

    processRequest(r)
    w.Write([]byte("success"))
}
```

## Type Embedding Pitfalls

Embedding promotes all methods and fields of the embedded type — including ones you didn't intend to expose.

Bad:
```go
type Admin struct {
    sync.Mutex // Lock() and Unlock() are now part of Admin's public API
    users map[string]*User
}

a := Admin{}
a.Lock() // callers can lock/unlock from outside — unintended
```

Good — use a named field:
```go
type Admin struct {
    mu    sync.Mutex // unexported — not part of public API
    users map[string]*User
}
```

Bad — embedding an interface exposes all methods, even unimplemented ones:
```go
type Client struct {
    http.RoundTripper // exposes RoundTrip() — callers may call it directly
}
```

Rule: Only embed when you intentionally want to promote the full method set. Otherwise, use a named field.

## Misusing init Functions

`init()` runs before `main()`, cannot return errors, and makes testing difficult. Agents overuse it.

Bad:
```go
var db *sql.DB

func init() {
    var err error
    db, err = sql.Open("postgres", os.Getenv("DB_URL"))
    if err != nil {
        log.Fatal(err) // crashes the program — no graceful handling
    }
}
```

Good — use an explicit initialization function:
```go
func NewDB(dsn string) (*sql.DB, error) {
    db, err := sql.Open("postgres", dsn)
    if err != nil {
        return nil, fmt.Errorf("open db: %w", err)
    }
    return db, nil
}

func main() {
    db, err := NewDB(os.Getenv("DB_URL"))
    if err != nil {
        log.Fatal(err)
    }
    defer db.Close()
}
```

Problems with `init()`:
- Cannot return errors — forces `log.Fatal` or `panic`
- Execution order depends on file naming and import order
- Makes testing difficult — side effects run on `import`
- Hard to pass configuration

Acceptable uses: setting simple package-level constants, registering drivers (`sql.Register`), initializing lookup tables.

## Trim Function Confusion

`strings.TrimRight` / `strings.TrimLeft` remove a **set of characters**, not a substring. Use `TrimSuffix` / `TrimPrefix` for substrings.

```go
strings.TrimRight("oxdiff", "diff") // "o" — removes any char in {'d','i','f'} from right
strings.TrimSuffix("oxdiff", "diff") // "ox" — removes the exact suffix "diff"

strings.TrimRight("123oxo", "xo")   // "123" — removes 'x' and 'o' from right
strings.TrimSuffix("123oxo", "xo")  // "123o" — removes exact suffix "xo"
```

Rule: Use `TrimSuffix`/`TrimPrefix` for exact string removal. Use `TrimRight`/`TrimLeft` only when stripping a character set.

## String Formatting Can Cause Deadlocks

`fmt.Sprintf` and related functions call the `String()` or `Error()` method on arguments. If that method acquires a lock, and the caller already holds the same lock, it deadlocks.

Bad:
```go
type SafeCounter struct {
    mu sync.Mutex
    n  int
}

func (c *SafeCounter) String() string {
    c.mu.Lock()
    defer c.mu.Unlock()
    return strconv.Itoa(c.n)
}

func (c *SafeCounter) Increment() {
    c.mu.Lock()
    defer c.mu.Unlock()
    c.n++
    slog.Info("incremented", "counter", c) // calls c.String() → deadlock!
}
```

Good — log the primitive value, not the struct:
```go
func (c *SafeCounter) Increment() {
    c.mu.Lock()
    defer c.mu.Unlock()
    c.n++
    slog.Info("incremented", "counter", c.n) // logs the int, no String() call
}
```

Good — extract value before logging:
```go
func (c *SafeCounter) Increment() {
    c.mu.Lock()
    c.n++
    n := c.n
    c.mu.Unlock()
    slog.Info("incremented", "counter", n)
}
```
