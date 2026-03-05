# Go Guidelines for Code Agents

A plugin that teaches AI code agents how to write **production-grade Go** — covering modern syntax, performance, concurrency safety, error handling, testing, and operational best practices.

Drop it into Cursor or Claude Code and every Go file the agent touches gets better.

## Motivation

All coding agents tend to generate outdated and suboptimal Go. Key reasons:

1. **Training data lag.** Models don't know about features added after their training cutoff. They can't use `wg.Go()` (1.25), `new(val)` (1.26), or `errors.AsType[T]` (1.26) if they've never seen them.

2. **Frequency bias.** Even for features the model knows, it picks older patterns. There's more `for i := 0; i < n; i++` in the training data than `for i := range n`, so that's what comes out.

3. **No performance awareness.** Agents don't align struct fields, don't set `GOMAXPROCS` for containers, use `encoding/json` instead of faster alternatives, and spawn unbounded goroutines instead of using pools.

4. **Broken operational patterns.** Generated shutdown code closes the database before draining the HTTP server. Resources get leaked. Signals get ignored.

5. **No post-change verification.** Agents never run `golangci-lint` or tests with the race detector after making changes.

These guidelines fix all of the above by giving the agent an explicit, version-aware reference. The agent detects your Go version from `go.mod` and applies only the features and patterns available up to that version.

This aligns with the Go team's direction. The [`modernize`](https://pkg.go.dev/golang.org/x/tools/gopls/internal/analysis/modernize) analyzer exists to update existing code to use newer idioms. These guidelines serve the same goal for *new* code: agents write modern Go from the start, so there's less to fix later.

## What the Agent Learns

| | |
|---|---|
| **Modern Syntax** | Version-aware features from Go 1.0 through 1.26 — the agent detects your `go.mod` version and stays within bounds |
| **Performance** | Struct alignment, goroutine pools, sonic JSON, sync.Pool, zero-copy conversions, pre-allocation, buffered channels, pointer semantics |
| **Patterns** | Context-first parameters, functional options, graceful shutdown, consumer-side interfaces, guard clauses, errgroup |
| **Concurrency** | Goroutine leak prevention across 10 real-world scenarios, bounded concurrency with errgroup |
| **Testing** | Table-driven tests, race detector, mockery mocks, goroutine leak detection with goleak, fuzz testing |
| **Error Handling** | Error types decision matrix, `%w` wrapping, naming conventions, handle-once principle |
| **Post-Change** | Automatically runs `golangci-lint` (or `go vet` fallback) and `go test -race` on changed packages |
| **Operational** | Health checks, escape analysis, pprof profiling |

## Installation

**Cursor** — copy into your project or `~/.cursor/skills/` for global use:

```bash
cp -r skills/go-guidelines/ <your-project>/.cursor/skills/go-guidelines/
```

**Claude Code:**

```
/plugin marketplace add mhmtszr/go-guidelines
/plugin install go-guidelines
```

**Manual reference:**
[SKILL.md](skills/go-guidelines/SKILL.md) (concise rules) | [reference.md](skills/go-guidelines/reference.md) (full examples & benchmarks)

## Contributing

PRs welcome. Add concise rules to `SKILL.md`, detailed examples to `reference.md`.
