import { RuleTester } from "eslint";
import test from "node:test";
import noUnboundedSelect from "../lib/rules/no-unbounded-select.js";
import requireOrderWithRange from "../lib/rules/require-order-with-range.js";

RuleTester.describe = test.describe;
RuleTester.it = test.it;

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

ruleTester.run("no-unbounded-select", noUnboundedSelect, {
  valid: [
    "supabase.from('tasks').select('*').range(0, 999)",
    "supabase.from('tasks').select('*').limit(50)",
    "supabase.from('tasks').select('*').eq('id', id).single()",
    "supabase.from('tasks').select('*').maybeSingle()",
    "supabase.from('tasks').select('*', { count: 'exact', head: true })",
    "await supabase.from('tasks').select('id').order('id').range(0, 99)",
    // select() after a write returns the written rows, which max-rows does not cap
    "supabase.from('tasks').insert(rows).select()",
    "supabase.from('tasks').update({ done: true }).eq('org_id', org).select('id')",
    "supabase.from('tasks').upsert(rows).select('id')",
    "supabase.from('tasks').delete().eq('org_id', org).select('id')",
    // not a PostgREST chain
    "d3.select('body')",
    "knex('tasks').select('*')",
  ],
  invalid: [
    {
      code: "supabase.from('tasks').select('*')",
      errors: [{ messageId: "unbounded" }],
    },
    {
      code: "const { data } = await supabase.from('tasks').select('id, name').eq('org_id', org)",
      errors: [{ messageId: "unbounded" }],
    },
    {
      code: "supabase.from('tasks').select('*').order('created_at')",
      errors: [{ messageId: "unbounded" }],
    },
    {
      code: "supabase.from('tasks').select('*', { count: 'exact' })",
      errors: [{ messageId: "unbounded" }],
    },
    {
      // a write method name after select() does not exempt a read
      code: "supabase.from('tasks').select('*').eq('status', 'delete')",
      errors: [{ messageId: "unbounded" }],
    },
    {
      code: "supabase.from('tasks').update({ done: true }).select('id')",
      options: [{ writeMethods: [] }],
      errors: [{ messageId: "unbounded" }],
    },
  ],
});

ruleTester.run("require-order-with-range", requireOrderWithRange, {
  valid: [
    "supabase.from('tasks').select('*').order('id').range(0, 999)",
    "supabase.from('tasks').select('*').range(0, 999).order('id')",
    "supabase.from('tasks').select('*').limit(10)",
    "somethingElse.range(0, 10)",
  ],
  invalid: [
    {
      code: "supabase.from('tasks').select('*').range(0, 999)",
      errors: [{ messageId: "unordered" }],
    },
    {
      code: "supabase.from('tasks').select('*').limit(10)",
      options: [{ checkLimit: true }],
      errors: [{ messageId: "unordered" }],
    },
  ],
});
