# Go Guidelines

Make your AI code agent write **production-grade Go** instead of tutorial-grade Go.

A composable skill plugin for coding agents — covering modern syntax, generics, performance, concurrency safety, error handling, testing, and post-change verification including [`go fix`](https://go.dev/blog/gofix) on Go 1.26+.

## Quickstart

Install Go Guidelines for your agent: [Claude Code](#claude-code), [Codex CLI](#codex-cli), [Cursor](#cursor), [OpenCode](#opencode).

## Motivation

All coding agents tend to generate outdated and suboptimal Go. Key reasons:

1. **Training data lag.** Models don't know about features added after their training cutoff. They can't use `wg.Go()` (1.25), `new(val)` (1.26), or `errors.AsType[T]` (1.26) if they've never seen them.

2. **Frequency bias.** Even for features the model knows, it picks older patterns. There's more `for i := 0; i < n; i++` in the training data than `for i := range n`, so that's what comes out.

3. **No performance awareness.** Agents don't align struct fields, don't set `GOMAXPROCS` for containers, and spawn unbounded goroutines instead of using pools.

4. **Broken operational patterns.** Generated shutdown code closes the database before draining the HTTP server. Resources get leaked. Signals get ignored.

5. **No post-change verification.** Agents never run `golangci-lint`, `go fix` (Go 1.26+), or tests with the race detector after making changes.

These guidelines fix all of the above by giving the agent an explicit, version-aware reference. The agent detects your Go version from `go.mod` and applies only the features and patterns available up to that version.

This aligns with the Go team's direction. The rewritten [`go fix`](https://go.dev/blog/gofix) command (Go 1.26+) modernizes existing code with analyzers for newer idioms. These guidelines serve the same goal for *new* code — and on Go 1.26+ they also require agents to run `go fix` after changes.

## How it works

1. Agent detects your Go version from `go.mod`.
2. Loads only the reference files relevant to the task (modern syntax, concurrency, testing, …).
3. Writes code using idioms available up to that version.
4. After changes: lint (or `go vet`), `go test -race`, and on **Go 1.26+** also `go fix`.

## Installation

Installation differs by harness. If you use more than one, install Go Guidelines separately for each one.

### Claude Code

* Register the marketplace:

```
/plugin marketplace add mhmtszr/go-guidelines
```

* Install the plugin:

```
/plugin install go-guidelines@go-guidelines-marketplace
```

### Codex CLI

* Register this repository as a marketplace:

```
codex plugin marketplace add mhmtszr/go-guidelines
```

* Install the plugin (TUI):

```
/plugins
```

Then select `go-guidelines` and install.

### Cursor

Install locally:

```bash
git clone https://github.com/mhmtszr/go-guidelines.git ~/.cursor/plugins/local/go-guidelines
```

Then restart Cursor (or Developer: Reload Window). Update with `git -C ~/.cursor/plugins/local/go-guidelines pull`.

### OpenCode

OpenCode uses its own plugin install; install Go Guidelines separately even if you already use it in another harness.

* Tell OpenCode:

```
Fetch and follow instructions from https://raw.githubusercontent.com/mhmtszr/go-guidelines/refs/heads/master/.opencode/INSTALL.md
```

* Or add to `opencode.json`:

```json
{
  "plugin": ["go-guidelines@git+https://github.com/mhmtszr/go-guidelines.git"]
}
```

* Detailed docs: [docs/README.opencode.md](docs/README.opencode.md)

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
| **Post-Change** | Runs `golangci-lint` (or `go vet`), `go test -race`, and on Go 1.26+ also [`go fix`](https://go.dev/blog/gofix) |

## File Structure

```
skills/go-guidelines/
├── SKILL.md                          # Entry point — version detection + reference routing
└── references/
    ├── modern-syntax.md              # Go version-specific syntax (1.0 → 1.26) + go fix
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

Plugin manifests (Superpowers-style multi-harness layout):

```
.claude-plugin/     # Claude Code marketplace + plugin.json
.cursor-plugin/     # Cursor plugin.json
.agents/plugins/    # Codex CLI marketplace
.opencode/          # OpenCode INSTALL.md + plugin JS
package.json        # OpenCode package entry
```

Only `SKILL.md` is loaded on every invocation. Reference files are loaded on-demand based on the task, keeping context usage minimal.

## Contributing

PRs welcome. Add concise rules to `SKILL.md` or the relevant `references/*.md` file. Keep examples minimal and practical.

## License

MIT License — see [LICENSE](LICENSE).
