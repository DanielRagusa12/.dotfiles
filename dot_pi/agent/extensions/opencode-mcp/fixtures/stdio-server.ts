import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"; import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"; import * as z from "zod/v4";
const server=new McpServer({name:"fixture",version:"1.0.0"},{instructions:"Fixture instructions"});
server.registerTool("echo.tool",{description:"Echo input",inputSchema:{value:z.string()}},async({value})=>({content:[{type:"text",text:value}],structuredContent:{value}}));
server.registerPrompt("hello",{description:"Hello prompt",argsSchema:{name:z.string()}},async({name})=>({messages:[{role:"user",content:{type:"text",text:`Hello ${name}`}}]}));
server.registerResource("fixture-resource","fixture://hello",{mimeType:"text/plain"},async()=>({contents:[{uri:"fixture://hello",mimeType:"text/plain",text:"fixture text"}]}));
await server.connect(new StdioServerTransport());
