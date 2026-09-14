import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const packageDir = fileURLToPath(new URL("..", import.meta.url));

async function freePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  server.close();
  await once(server, "close");
  return port;
}

test("MCP catalog exposes structured extraction alongside run controls", async () => {
  const port = await freePort();
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["dist/index.js"],
    cwd: packageDir,
    env: { ...process.env, EDITH_BRIDGE_PORT: String(port) },
    stderr: "pipe",
  });
  const client = new Client({ name: "edith-catalog-test", version: "1.0.0" });

  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.deepEqual(
      tools.map((tool) => tool.name),
      [
        "edith_run",
        "edith_extract",
        "edith_status",
        "edith_respond",
        "edith_abort",
        "edith_connection",
      ],
    );

    const extract = tools.find((tool) => tool.name === "edith_extract");
    assert.ok(extract, "structured extraction tool is missing");
    assert.deepEqual(extract.inputSchema.required, ["task", "output_schema"]);
    assert.equal(extract.inputSchema.properties.output_schema.type, "object");
    assert.match(extract.description, /always uses EDITH Ask mode/i);

    const respond = tools.find((tool) => tool.name === "edith_respond");
    assert.ok(respond, "respond tool is missing");
    assert.match(respond.description, /exact stable value shown by EDITH: 'once', 'always', or 'deny'/i);
    assert.match(respond.inputSchema.properties.answer.description, /one-time approval maps to 'once'/i);
  } finally {
    await client.close().catch(() => {});
  }
});
