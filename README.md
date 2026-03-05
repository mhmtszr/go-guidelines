# Go Guidelines for Code Agents

A plugin that teaches AI code agents how to write **production-grade Go** — covering modern syntax, generics, performance, concurrency safety, error handling, testing, and best practices.

Drop it into Cursor or Claude Code and every Go file the agent touches gets better.

## Motivation

All coding agents tend to generate outdated and suboptimal Go. Key reasons:

1. **Training data lag.** Models don't know about features added after their training cutoff. They can't use `wg.Go()` (1.25), `new(val)` (1.26), or `errors.AsType[T]` (1.26) if they've never seen them.

2. **Frequency bias.** Even for features the model knows, it picks older patterns. There's more `for i := 0; i < n; i++` in the training data than `for i := range n`, so that's what comes out.

3. **No performance awareness.** Agents don't align struct fields, don't set `GOMAXPROCS` for containers, and spawn unbounded goroutines instead of using pools.

4. **Broken operational patterns.** Generated shutdown code closes the database before draining the HTTP server. Resources get leaked. Signals get ignored.

5. **No post-change verification.** Agents never run `golangci-lint` or tests with the race detector after making changes.

These guidelines fix all of the above by giving the agent an explicit, version-aware reference. The agent detects your Go version from `go.mod` and applies only the features and patterns available up to that version.

This aligns with the Go team's direction. The [`modernize`](https://pkg.go.dev/golang.org/x/tools/gopls/internal/analysis/modernize) analyzer exists to update existing code to use newer idioms. These guidelines serve the same goal for *new* code: agents write modern Go from the start, so there's less to fix later.

## What the Agent Learns

| | |
|---|---|
| **Modern Syntax** | Version-aware features from Go 1.0 through 1.26 — the agent detects your `go.mod` version and stays within bounds |
| **Performance** | Struct alignment, sync.Pool, pre-allocation, buffered channels, pointer semantics, strings.Builder, escape analysis |
| **Patterns** | Naming conventions, context-first parameters, functional options, graceful shutdown, health checks, consumer-side interfaces, guard clauses, defer pitfalls, HTTP client best practices, io.Reader, resource closing |
| **Concurrency** | Goroutine leak prevention, bounded concurrency with errgroup, channel safety, select randomness, nil channels, notification channels, mutex pitfalls, false sharing |
| **Testing** | Table-driven tests, t.Helper/t.Cleanup, httptest, race detector, mockery, goleak, fuzz testing, synctest, benchmark pitfalls, test categorization |
| **Error Handling** | Error types decision matrix, `%w` wrapping, naming conventions, handle-once principle, panic/recover |
| **Generics** | Type parameters, constraints, `comparable`, common mistakes, when to use/avoid, version-specific features |
| **Pitfalls** | Nil interface trap, variable shadowing, nil map panic, break in switch/select, copying sync types, time.After leak, init misuse, type embedding, trim confusion, string formatting deadlocks |
| **Slices & Maps** | Backing array retention, append aliasing, 3-index slice, pointer-in-slice leak, maps never shrink, map pointer instability, nil slice behavior |
| **Context** | Type-safe keys, WithoutCancel, AfterFunc, WithCancelCause, request-scoped propagation, timeout layering |
| **Post-Change** | Automatically runs `golangci-lint` (or `go vet` fallback) and `go test -race` on changed packages |

## File Structure

```
claude/go-guidelines/skills/go-guidelines/
├── SKILL.md                          # Entry point — version detection + reference routing
└── references/
    ├── modern-syntax.md              # Go version-specific syntax (1.0 → 1.26)
    ├── performance.md                # Struct layout, pre-allocation, sync.Pool, escape analysis
    ├── concurrency.md                # errgroup, goroutine leaks, select, false sharing
    ├── patterns.md                   # Naming, interfaces, shutdown, health checks, io.Reader
    ├── testing.md                    # Table tests, httptest, goleak, fuzz, benchmarks
    ├── error-handling.md             # Error types, wrapping, panic/recover
    ├── generics.md                   # Type parameters, constraints, common mistakes
    ├── pitfalls.md                   # Nil traps, shadowing, sync copy, init, time, defer
    ├── slices-and-maps.md            # Backing arrays, append aliasing, map shrinkage
    └── context-patterns.md           # Keys, WithoutCancel, AfterFunc, propagation
```

Only `SKILL.md` is loaded on every invocation (~65 lines). Reference files are loaded on-demand based on the task, keeping context usage minimal.

## Installation

**Cursor** — copy into your project or `~/.cursor/skills/` for global use:

```bash
cp -r claude/go-guidelines/skills/go-guidelines/ <your-project>/.cursor/skills/go-guidelines/
```

**Claude Code:**

```
/plugin marketplace add mhmtszr/go-guidelines
/plugin install go-guidelines
```

## Contributing

PRs welcome. Add concise rules to `SKILL.md` or the relevant `references/*.md` file. Keep examples minimal and practical.
