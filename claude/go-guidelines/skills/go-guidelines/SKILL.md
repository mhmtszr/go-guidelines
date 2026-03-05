---
name: go-guidelines
description: Go best practices for performance, modern syntax, generics, patterns, testing, error handling, and concurrency. Use when writing or reviewing Go code.
---

# Go Guidelines

## Detected Go Version

!`grep -rh "^go " --include="go.mod" . 2>/dev/null | cut -d' ' -f2 | sort | uniq -c | sort -nr | head -1 | xargs | cut -d' ' -f2 | grep . || echo unknown`

## How to Use

DO NOT search for go.mod files or try to detect the version yourself. Use ONLY the version shown above.

**If version detected (not "unknown"):**
- Say: "This project is using Go X.XX, so I'll follow Go best practices and modern syntax up to and including this version. If you'd prefer a different target version, just let me know."
- Do NOT list features, do NOT ask for confirmation

**If version is "unknown":**
- Say: "Could not detect Go version in this repository"
- Use AskUserQuestion: "Which Go version should I target?" with options ... / [1.20] / [1.21] / [1.22] / [1.23] / [1.24] / [1.25] / [1.26] / ...

## Reference Loading

**Read ONLY the reference file(s) relevant to your current task. Do NOT load all files at once.**

When reading reference files, **stop at the detected Go version boundary** — ignore features from newer versions.

| When you are... | Read this reference |
|---|---|
| Using version-specific Go syntax or idioms | [references/modern-syntax.md](references/modern-syntax.md) |
| Optimizing performance, struct layout, escape analysis | [references/performance.md](references/performance.md) |
| Working with goroutines, channels, sync, select, false sharing | [references/concurrency.md](references/concurrency.md) |
| Writing HTTP servers, shutdown, health checks, middleware, interfaces, io.Reader | [references/patterns.md](references/patterns.md) |
| Writing tests, mocks, benchmarks, fuzz tests | [references/testing.md](references/testing.md) |
| Handling errors, wrapping, custom error types | [references/error-handling.md](references/error-handling.md) |
| Working with slices, maps, append, memory leaks | [references/slices-and-maps.md](references/slices-and-maps.md) |
| Using context.Context, values, cancellation, timeouts | [references/context-patterns.md](references/context-patterns.md) |
| Using generics, type parameters, constraints | [references/generics.md](references/generics.md) |
| Debugging subtle bugs, nil traps, shadowing, sync copying, defer, time | [references/pitfalls.md](references/pitfalls.md) |

**Multiple topics may apply.** For example, writing a concurrent function with tests: load `modern-syntax.md` + `concurrency.md` + `testing.md`.

---

## After Making Changes

After making Go code changes, run static analysis and tests on the changed packages:

```bash
which golangci-lint >/dev/null 2>&1 && golangci-lint run ./path/to/changed/package/... || go vet ./path/to/changed/package/...
go test ./path/to/changed/package/... -race
```

- Prefer `golangci-lint` when available, fall back to `go vet`
- Always run tests with the race detector
- Fix all reported issues in the changed code before finishing
- Do not fix pre-existing issues in unrelated code
- If neither linter is available, skip silently and continue

