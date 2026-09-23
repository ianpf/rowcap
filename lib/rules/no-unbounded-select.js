import { isPostgrestChain, methodsAfter, methodsBefore, isHeadOnly } from "../shared.js";

const DEFAULT_BOUNDS = ["limit", "range", "single", "maybeSingle", "csv", "explain"];
const DEFAULT_FROM = ["from", "rpc"];
const DEFAULT_WRITES = ["insert", "update", "upsert", "delete"];

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require every PostgREST select() to declare a bound, so it cannot silently truncate at the server row cap.",
      recommended: true,
    },
    schema: [
      {
        type: "object",
        properties: {
          boundMethods: { type: "array", items: { type: "string" } },
          fromMethods: { type: "array", items: { type: "string" } },
          writeMethods: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      unbounded:
        "This select() declares no bound, so PostgREST caps it at max-rows (1,000 by default) and still returns 200. Add .range() to paginate, .limit() if a partial result is intended, or .single()/.maybeSingle() for one row.",
    },
  },

  create(context) {
    const opts = context.options[0] || {};
    const bounds = opts.boundMethods || DEFAULT_BOUNDS;
    const fromMethods = opts.fromMethods || DEFAULT_FROM;
    const writeMethods = opts.writeMethods || DEFAULT_WRITES;

    return {
      CallExpression(node) {
        if (node.callee.type !== "MemberExpression") return;
        if (node.callee.computed || node.callee.property.name !== "select") return;
        if (!isPostgrestChain(node, fromMethods)) return;
        if (isHeadOnly(node)) return;

        const before = methodsBefore(node);
        if (before.some((m) => writeMethods.includes(m))) return;

        const chain = [...before, ...methodsAfter(node)];
        if (chain.some((m) => bounds.includes(m))) return;

        context.report({ node: node.callee.property, messageId: "unbounded" });
      },
    };
  },
};
