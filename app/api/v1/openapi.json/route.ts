import { getPublicOrigin } from "@/lib/api-v1"

export const runtime = "edge"

export async function GET(request: Request) {
  const origin = getPublicOrigin(request)

  return Response.json({
    openapi: "3.1.0",
    info: {
      title: "MoeMail OTP API",
      version: "1.0.0",
      description: "Stable v1 API for creating temporary inboxes and retrieving OTP codes.",
    },
    servers: [{ url: origin }],
    security: [{ ApiKeyAuth: [] }],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "X-API-Key",
        },
      },
      schemas: {
        ApiSuccess: {
          type: "object",
          required: ["success", "data", "meta"],
          properties: {
            success: { const: true },
            data: { type: "object" },
            meta: {
              type: "object",
              properties: {
                version: { const: "v1" },
                request_id: { type: "string" },
              },
            },
          },
        },
        ApiError: {
          type: "object",
          required: ["success", "error", "meta"],
          properties: {
            success: { const: false },
            error: {
              type: "object",
              properties: {
                code: {
                  type: "string",
                  enum: ["UNAUTHORIZED", "FORBIDDEN", "VALIDATION_ERROR", "NOT_FOUND", "CONFLICT", "WAIT_TIMEOUT", "UPSTREAM_ERROR", "INTERNAL_ERROR"],
                },
                message: { type: "string" },
                details: {},
              },
            },
            meta: {
              type: "object",
              properties: {
                version: { const: "v1" },
                request_id: { type: "string" },
              },
            },
          },
        },
      },
    },
    paths: {
      "/api/v1/otp/create": {
        post: {
          summary: "Create one or more OTP inboxes",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    count: { type: "integer", minimum: 1, maximum: 50, default: 1 },
                    domain: { type: "string", example: "intereloucer.com" },
                    prefix: { type: "string", example: "openai" },
                    mode: { type: "string", enum: ["human", "prefix", "random"], default: "human" },
                    batch_name: { type: "string", example: "0427-openai-01" },
                    tags: { type: "array", items: { type: "string" } },
                    expiry_time_ms: { type: "integer", description: "0 means permanent." },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccess" } } } },
            "4XX": { description: "Client error", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } } },
          },
        },
      },
      "/api/v1/otp/emails": {
        get: {
          summary: "List OTP inboxes with cached latest code metadata",
          parameters: [
            { name: "q", in: "query", schema: { type: "string" } },
            { name: "domain", in: "query", schema: { type: "string" } },
            { name: "batchId", in: "query", schema: { type: "string" } },
            { name: "recentHours", in: "query", schema: { type: "integer" } },
            { name: "used", in: "query", schema: { type: "boolean" } },
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 300 } },
          ],
          responses: {
            "200": { description: "List result", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccess" } } } },
          },
        },
      },
      "/api/v1/otp/latest": {
        get: {
          summary: "Read the latest OTP code for an inbox",
          parameters: [
            { name: "email", in: "query", required: true, schema: { type: "string", format: "email" } },
          ],
          responses: {
            "200": { description: "Latest OTP result", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccess" } } } },
            "404": { description: "Inbox not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } } },
          },
        },
      },
      "/api/v1/otp/wait": {
        get: {
          summary: "Poll until an OTP code arrives or timeout",
          parameters: [
            { name: "email", in: "query", required: true, schema: { type: "string", format: "email" } },
            { name: "timeout", in: "query", schema: { type: "integer", minimum: 1, maximum: 120, default: 60 } },
            { name: "interval", in: "query", schema: { type: "integer", minimum: 1, maximum: 10, default: 3 } },
          ],
          responses: {
            "200": { description: "OTP received", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccess" } } } },
            "408": { description: "Wait timeout", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } } },
          },
        },
      },
      "/api/v1/otp/export": {
        post: {
          summary: "Export inboxes as mail.txt compatible content",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ids: { type: "array", items: { type: "string" } },
                    batchId: { type: "string" },
                    q: { type: "string" },
                    limit: { type: "integer", minimum: 1, maximum: 500 },
                    locale: { type: "string", default: "zh-CN" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Export content", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccess" } } } },
          },
        },
      },
    },
  })
}
