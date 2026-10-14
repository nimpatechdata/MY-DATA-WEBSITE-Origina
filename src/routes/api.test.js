const assert = require("node:assert/strict");
const { test } = require("node:test");

const api = require("./api");

test("does not expose a global order listing endpoint", () => {
  const exposesGlobalOrders = api.stack.some((layer) =>
    layer.route?.path === "/admin/orders" || layer.route?.path === "/orders"
  );
  assert.equal(exposesGlobalOrders, false);
});