// Custom flat-config ESLint rule: ban physical-direction Tailwind utilities
// (pl-/pr-/ml-/mr-/left-/right-/text-left/text-right) in className values.
// Arabic is RTL and English is LTR in this app — logical utilities
// (ps-/pe-/ms-/me-/start-/end-/text-start/text-end) are required so the
// layout mirrors instead of silently staying LTR under `dir="rtl"`.
//
// Scope: src/app/** and src/components/** excluding components/ui/**, which
// is vendored shadcn code we don't hand-edit (see eslint.config.mjs).

const BANNED = /^-?(?:pl|pr|ml|mr)-|^-?(?:left|right)-|^text-(?:left|right)$/;

function tokenIsBanned(token) {
  // Strip variant prefixes, e.g. "lg:hover:pl-4" -> "pl-4".
  const parts = token.split(":");
  const utility = parts[parts.length - 1];
  return BANNED.test(utility);
}

function checkClassString(context, node, value) {
  const banned = value.split(/\s+/).filter(Boolean).filter(tokenIsBanned);
  if (banned.length > 0) {
    context.report({
      node,
      message:
        "Physical-direction class(es) {{classes}} found. Use logical utilities " +
        "(ps-/pe-/ms-/me-/start-/end-/text-start/text-end) so RTL mirrors instead of staying LTR.",
      data: { classes: banned.join(", ") },
    });
  }
}

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow physical-direction Tailwind classes; require logical properties for RTL support.",
    },
    schema: [],
  },
  create(context) {
    return {
      JSXAttribute(node) {
        if (node.name.name !== "className") return;
        const value = node.value;
        if (!value) return;

        if (value.type === "Literal" && typeof value.value === "string") {
          checkClassString(context, node, value.value);
        } else if (
          value.type === "JSXExpressionContainer" &&
          value.expression.type === "TemplateLiteral"
        ) {
          for (const quasi of value.expression.quasis) {
            checkClassString(context, node, quasi.value.raw);
          }
        }
      },
    };
  },
};

const plugin = {
  rules: {
    "no-physical-direction": rule,
  },
};

export default plugin;
