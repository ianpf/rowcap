# rowcap

**Your Supabase query stopped at 1,000 rows and told you it succeeded.**

An ESLint plugin that catches PostgREST reads which can silently return partial data.

```
HTTP/2 200
content-range: 0-999/4812
```

4,812 rows exist. 1,000 came back. Status 200. Nothing in the logs, nothing in Sentry, no exception to catch. Your export is short, your total is wrong, your sync is missing records, and the only symptom is that a number looks slightly off weeks later.

This is not a bug in PostgREST. It is documented behaviour: every response is capped at the project's `max-rows` setting, which defaults to 1,000. It is a bug in almost every codebase that talks to it, because the failure is invisible at the call site.

## What it catches

```js
// ✗ rowcap/no-unbounded-select
const { data } = await supabase.from("tasks").select("*");
// silently capped at max-rows, returns 200

// ✓
const { data } = await supabase.from("tasks").select("*").range(0, 999);
const { data } = await supabase.from("tasks").select("*").limit(50);
const { data } = await supabase.from("tasks").select("*").eq("id", id).single();
```

```js
// ✗ rowcap/require-order-with-range
await supabase.from("tasks").select("*").range(1000, 1999);
// no ORDER BY, so page 2 can repeat rows from page 1 and skip others

// ✓
await supabase.from("tasks").select("*").order("id").range(1000, 1999);
```

The second one is the subtler of the two. Without an explicit `ORDER BY`, Postgres makes no promise about row order between queries, so a paginated loop over an unordered result can hand you the same record twice and never show you another one at all. Code that looks like correct pagination quietly loses rows.

## Install

```bash
npm install --save-dev eslint-plugin-rowcap
```

Flat config (`eslint.config.js`):

```js
import rowcap from "eslint-plugin-rowcap";

export default [
  rowcap.configs.recommended,
];
```

Or wire the rules yourself:

```js
import rowcap from "eslint-plugin-rowcap";

export default [
  {
    plugins: { rowcap },
    rules: {
      "rowcap/no-unbounded-select": "error",
      "rowcap/require-order-with-range": "error",
    },
  },
];
```

## Rules

### `rowcap/no-unbounded-select`

Reports any `.select()` in a `.from()` or `.rpc()` chain that declares no bound.

A call counts as bounded when the chain includes `.limit()`, `.range()`, `.single()`, `.maybeSingle()`, `.csv()`, `.explain()`, or when `select()` is called with `{ head: true }` (which returns no rows at all).

Note that `.order()` alone does **not** bound a query. Ordering changes which 1,000 rows you get, not how many.

A `.select()` after `.insert()`, `.update()`, `.upsert()` or `.delete()` is not reported. It asks for the written rows back (`RETURNING`), and PostgREST has not applied `max-rows` to those since v10. Adding `.limit()` there would be wrong: on an update or delete it limits how many rows the write touches.

```js
// options
"rowcap/no-unbounded-select": ["error", {
  boundMethods: ["limit", "range", "single", "maybeSingle", "csv", "explain"],
  fromMethods: ["from", "rpc"],
  writeMethods: ["insert", "update", "upsert", "delete"]
}]
```

### `rowcap/require-order-with-range`

Reports `.range()` in a `.from()` or `.rpc()` chain with no `.order()` anywhere in it. Order on a unique, stable column; ordering on a non-unique column has the same instability at the page boundary.

```js
// options
"rowcap/require-order-with-range": ["error", {
  checkLimit: false,   // true also reports .limit() without .order()
  fromMethods: ["from", "rpc"]
}]
```

`checkLimit` is off by default because `.limit(1)` for "any one row" is often deliberate. Turn it on if your codebase paginates with `limit`/`offset`.

## Why this exists

I ran a sync in production that had been hitting the 1,000-row ceiling for weeks. It returned 200 every time. Thousands of records were missing from the destination and nothing anywhere said so. I found it by accident, while looking for something else. Nothing was exposed and nothing crashed; the data just quietly stopped arriving, which is exactly what makes this class of bug so easy to ship and so hard to notice.

Raising `max-rows` does not fix this, it moves the cliff. The only real fix is that every read states its own bound, and the only practical way to enforce that across a codebase is at lint time.

## Limitations

- Static analysis. A chain built dynamically across variables (`let q = supabase.from(t); q = q.select()`) is not tracked.
- It does not know that `.eq("id", x)` on a primary key returns at most one row. Use `.single()` or `.maybeSingle()`, which is better practice regardless and silences the rule.
- It only looks at chains rooted in `from()` or `rpc()`, so other libraries' `.select()` is left alone. Extend `fromMethods` if you wrap the client.

## Contributing

Issues and pull requests welcome, particularly false positives. If the rule fires on code that is genuinely bounded, that is a bug worth reporting: paste the chain.

## License

MIT
