# Slices and Maps

## Slice Header

A slice is a 3-field struct: `{pointer, length, capacity}`. Multiple slices can share the same backing array. Understanding this prevents memory leaks and aliasing bugs.

```go
// Under the hood:
type slice struct {
    array unsafe.Pointer // pointer to backing array
    len   int
    cap   int
}
```

## Backing Array Retention (Memory Leak)

Sub-slicing retains the entire backing array. If the original is large, the small sub-slice prevents GC of the whole array.

Bad:
```go
func getHeader(data []byte) []byte {
    return data[:16] // retains the entire backing array (could be MBs)
}
```

Good — copy to release the backing array:
```go
func getHeader(data []byte) []byte {
    header := make([]byte, 16)
    copy(header, data[:16])
    return header
}
```

Good — use `slices.Clone` (Go 1.21+):
```go
func getHeader(data []byte) []byte {
    return slices.Clone(data[:16])
}
```

Good — use `slices.Clip` to reduce capacity to length:
```go
func getHeader(data []byte) []byte {
    return slices.Clip(data[:16]) // cap == len == 16, but still shares backing array
}
```

Note: `slices.Clip` sets `cap == len` preventing further appends from corrupting shared data, but does NOT release the backing array. Use `slices.Clone` when the original slice is large and should be GC'd.

## Append Aliasing Bug

When a slice has spare capacity, `append` writes into the existing backing array. This can silently corrupt data shared by another slice.

```go
a := make([]int, 3, 5) // len=3, cap=5
a[0], a[1], a[2] = 1, 2, 3

b := a[:2]          // b shares a's backing array
b = append(b, 99)   // writes 99 into a's backing array at index 2

fmt.Println(a[2])   // 99 — silently overwritten
```

Fix — use 3-index slice to restrict capacity:
```go
b := a[:2:2]         // len=2, cap=2
b = append(b, 99)    // allocates new backing array — a is safe
fmt.Println(a[2])    // 3 — unchanged
```

## Three-Index Slice Expression

`s[low:high:max]` sets both length and capacity: `len = high-low`, `cap = max-low`. Use this to prevent append from overwriting shared data.

```go
original := []int{1, 2, 3, 4, 5}

// Without max — cap inherited from original
sub := original[1:3]     // [2, 3], cap=4 — append can overwrite original[3]

// With max — cap restricted
safe := original[1:3:3]  // [2, 3], cap=2 — append allocates new array
```

Rule: When returning a sub-slice that callers might append to, always use the 3-index form or `slices.Clone`.

## Pointer-in-Slice Memory Leak

When removing elements from a slice of pointers (or structs containing pointers), the removed elements still reference objects through the backing array. The GC cannot collect them.

Bad:
```go
func removeFirst(s []*User) []*User {
    return s[1:] // s[0] still exists in backing array — *User not GC'd
}
```

Good — nil out the removed element:
```go
func removeFirst(s []*User) []*User {
    s[0] = nil  // allow GC to collect the *User
    return s[1:]
}
```

Good — for removing from the middle:
```go
func removeAt(s []*User, i int) []*User {
    s[i] = nil
    return slices.Delete(s, i, i+1)
}
```

This applies to any slice of pointers, interfaces, slices, maps, or structs containing these types.

## Append Capacity Growth

`append` doubles capacity when `cap < 256`, then grows by ~25% for larger slices. Knowing this helps with pre-allocation decisions.

```go
s := make([]int, 0)
// cap: 0 → 1 → 2 → 4 → 8 → 16 → 32 → 64 → 128 → 256 → 320 → 400 → ...
```

Each reallocation copies the entire slice. Pre-allocate when size is known:
```go
// Bad — O(n) reallocations
var result []Item
for _, raw := range records {
    result = append(result, parse(raw))
}

// Good — single allocation
result := make([]Item, 0, len(records))
for _, raw := range records {
    result = append(result, parse(raw))
}
```

## Nil Slice Behavior

A nil slice is fully functional for reads and appends — no need to defensively initialize.

```go
var s []int

len(s)           // 0
cap(s)           // 0
s = append(s, 1) // works — allocates
for range s {}   // works — no iterations

// But:
json.Marshal(s)  // "null" — not "[]"
```

Do NOT do this:
```go
if s == nil {
    s = []int{} // unnecessary — append handles nil
}
s = append(s, item)
```

Only initialize to `[]T{}` when you need `"[]"` in JSON output (see pitfalls reference).

## Map Pointer Instability

You cannot take the address of a map value. Map values may move in memory during growth.

```go
m := map[string]Point{"a": {X: 1, Y: 2}}

m["a"].X = 10   // compile error: cannot assign to struct field in map
p := &m["a"]    // compile error: cannot take address of map element
```

Fix — use a map of pointers:
```go
m := map[string]*Point{"a": {X: 1, Y: 2}}
m["a"].X = 10   // works
```

Fix — read, modify, write back:
```go
m := map[string]Point{"a": {X: 1, Y: 2}}
p := m["a"]
p.X = 10
m["a"] = p
```

## Map Iteration and Modification

Deleting during iteration is safe. Adding during iteration has undefined behavior — new keys may or may not appear.

Safe — delete during iteration:
```go
for k, v := range m {
    if v.Expired() {
        delete(m, k) // safe
    }
}
```

Unsafe — add during iteration:
```go
for k, v := range m {
    m[k+"_copy"] = v // undefined — new key may or may not be visited
}
```

Fix — collect first, then modify:
```go
var toAdd []struct{ k, v string }
for k, v := range m {
    toAdd = append(toAdd, struct{ k, v string }{k + "_copy", v})
}
for _, item := range toAdd {
    m[item.k] = item.v
}
```

## Maps Never Shrink

A Go map's bucket array can only grow, never shrink. Deleting all entries does NOT free the bucket memory.

```go
m := make(map[int][128]byte)
for i := 0; i < 1_000_000; i++ {
    m[i] = [128]byte{}
}
// memory: ~461 MB

for i := 0; i < 1_000_000; i++ {
    delete(m, i)
}
runtime.GC()
// memory: ~293 MB — buckets retained, only values freed
```

This matters when a map experiences temporary spikes (e.g., caching during high traffic). After the spike, memory stays elevated.

Fix — periodically re-create the map:
```go
newMap := make(map[K]V, len(oldMap))
for k, v := range oldMap {
    newMap[k] = v
}
oldMap = newMap // old map is GC'd with its bucket array
```

Fix — use pointer values to reduce per-bucket memory:
```go
// map[int][128]byte  → 293 MB after delete+GC
// map[int]*[128]byte → 38 MB after delete+GC
```

If a value type is >128 bytes, Go automatically stores a pointer in the bucket, so this optimization only matters for values at or below 128 bytes.

## Map Iteration Order

Map iteration order is randomized by the runtime. Never depend on it.

```go
m := map[string]int{"a": 1, "b": 2, "c": 3}

// Each run produces different order
for k := range m {
    fmt.Print(k) // "bca", "abc", "cab" — random each time
}
```

For deterministic order:
```go
keys := slices.Sorted(maps.Keys(m)) // Go 1.23+
for _, k := range keys {
    fmt.Printf("%s=%d\n", k, m[k])
}
```
