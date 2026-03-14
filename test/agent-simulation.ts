import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "path";
import os from "os";

async function main() {
  console.log('🤖 Starting Agent Simulation...');
  
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", path.join(process.cwd(), "src/mcp-server.ts")],
    env: {
      ...process.env,
      WHYCODE_PROJECT_ROOT: process.cwd()
    }
  });

  const client = new Client({ name: "agent-simulator", version: "1.0.0" });
  await client.connect(transport);
  
  console.log('✅ Connected to WhyCode MCP Server\n');

  try {
    // 1. Agent asks: What tools are available?
    const tools = await client.listTools();
    console.log('🛠 Available Tools:');
    tools.tools.forEach(t => console.log(`  - ${t.name}: ${t.description.split('.')[0]}`));

    // 2. Agent decides to write a tricky function and documents the decision
    console.log('\n📝 Agent makes a decision about auth token rotation...');
    const resultAdd = await client.callTool({
      name: "whycode_add_decision",
      arguments: {
        file: "src/auth/token.ts",
        lines: "112",
        why: "Rotating token every 5 minutes instead of 15 because the identity provider has a hard limit on session bursts.",
        alternatives_rejected: ["15-min rotation (hit upstream limits during peak hours)"]
      }
    });
    console.log(resultAdd.content[0].text);

    // 3. A new agent session starts and opens that file
    console.log('\n🔍 New Agent Session opens src/auth/token.ts...');
    const resultGet = await client.callTool({
      name: "whycode_get_decisions",
      arguments: {
        file: "src/auth/token.ts"
      }
    });
    
    console.log('Agent received context:');
    console.log('----------------------------------------');
    console.log(resultGet.content[0].text);
    console.log('----------------------------------------');

    // 4. Agent searches the knowledge base
    console.log('\n🕵️ Agent searches for "identity provider" decisions...');
    const resultSearch = await client.callTool({
      name: "whycode_query_decisions",
      arguments: { question: "identity provider" }
    });
    console.log(resultSearch.content[0].text);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    // Clean up
    await transport.close();
  }
}

main();
