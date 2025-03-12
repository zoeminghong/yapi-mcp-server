#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";

const YAPI_BASE_URL = process.env.YAPI_BASE_URL;
const YAPI_TOKEN = process.env.YAPI_TOKEN;

if (!YAPI_TOKEN) {
  throw new Error("YAPI_TOKEN environment variable is required");
}

interface YapiInterface {
  _id: number;
  title: string;
  path: string;
  method: string;
}

class YapiServer {
  private server: Server;
  private axiosInstance;

  constructor() {
    this.server = new Server(
      {
        name: "yapi-mcp-service",
        version: "0.1.0",
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    this.axiosInstance = axios.create({
      baseURL: YAPI_BASE_URL,
      headers: {
        Authorization: `Bearer ${YAPI_TOKEN}`,
      },
      params: {
        token: YAPI_TOKEN,
      },
    });

    this.setupResourceHandlers();
    this.setupToolHandlers();
    
    this.server.onerror = (error) => console.error("[MCP Error]", error);
    process.on("SIGINT", async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupResourceHandlers() {
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [
        {
          uri: "yapi://interfaces",
          name: "YAPI Interfaces",
          mimeType: "application/json",
          description: "List of all YAPI interfaces",
        },
      ],
    }));

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      if (request.params.uri === "yapi://interfaces") {
        const response = await this.axiosInstance.get("/api/interface/list");
        return {
          contents: [
            {
              uri: request.params.uri,
              mimeType: "application/json",
              text: JSON.stringify(response.data.data, null, 2),
            },
          ],
        };
      }
      throw new Error("Unknown resource");
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: [
          {
            name: "get_interfaces",
            description: "Get list of YAPI interfaces",
            inputSchema: {
              type: "object",
              properties: {
                project_id: {
                  type: "number",
                  description: "YAPI project ID",
                },
              },
              required: ["project_id"],
            },
          },
          {
            name: "get_interface_detail",
            description: "Get detailed interface definition",
            inputSchema: {
              type: "object",
              properties: {
                id: {
                  type: "number",
                  description: "Interface ID",
                },
              },
              required: ["id"],
            },
          },
        ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name === "get_interfaces") {
        const projectId = request.params.arguments?.project_id;
        const response = await this.axiosInstance.get("/api/interface/list", {
          params: {
            project_id: projectId,
            token: YAPI_TOKEN,
          },
        });

        process.stderr.write("YAPI response: " + JSON.stringify(response.data, null, 2) + "\n");

        if (!response.data?.data?.list) {
          throw new Error("Invalid YAPI response format");
        }

        const interfaces = Array.isArray(response.data.data.list) 
          ? response.data.data.list.map((item: YapiInterface) => ({
              id: item._id,
              name: item.title,
              path: item.path,
              method: item.method,
            }))
          : [];

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(interfaces, null, 2),
            },
          ],
        };
      } else if (request.params.name === "get_interface_detail") {
        const interfaceId = request.params.arguments?.id;
        const response = await this.axiosInstance.get("/api/interface/get", {
          params: {
            id: interfaceId,
            token: YAPI_TOKEN,
          },
        });

        if (!response.data?.data) {
          throw new Error("Invalid YAPI response format");
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response.data.data, null, 2),
            },
          ],
        };
      }
      throw new Error("Unknown tool");
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("YAPI MCP server running on stdio");
  }
}

const server = new YapiServer();
server.run().catch(console.error);
