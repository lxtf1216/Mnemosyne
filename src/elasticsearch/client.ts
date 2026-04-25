import { z } from "zod";

// ES URL from env
const ES_URL = process.env.MNEMOSYNE_ES_URL || "http://localhost:9200";

export interface EsClient {
  baseUrl: string;
  headers: Record<string, string>;
}

export function getEsClient(): EsClient {
  return {
    baseUrl: ES_URL,
    headers: {
      "Content-Type": "application/json",
    },
  };
}

export async function esRequest<T>(
  client: EsClient,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: object | string
): Promise<T> {
  const url = `${client.baseUrl}${path}`;
  const opts: RequestInit = {
    method,
    headers: client.headers,
  };
  if (body !== undefined) {
    opts.body = typeof body === "string" ? body : JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ES ${method} ${path} failed: ${res.status} ${text}`);
  }
  if (res.status === 204) {
    return {} as T;
  }
  return res.json() as Promise<T>;
}

export async function checkConnection(client: EsClient): Promise<boolean> {
  try {
    await esRequest<{ status: number }>(client, "GET", "/");
    return true;
  } catch {
    return false;
  }
}

// Common schemas
export const paperIdSchema = z.string().uuid();
export const arxivIdSchema = z.string().regex(/^\d{4}\.\d{4,5}(v\d+)?$/);
export const doiSchema = z.string().regex(/^10\.\d{4,9}\//);

export const embeddingStatusSchema = z.enum(["done", "pending", "failed"]);
export const paperSourceSchema = z.enum(["arxiv", "semantic_scholar", "manual"]);
export const insightSourceSchema = z.enum(["manual", "reading", "brainstorm"]);
export const maturitySchema = z.enum(["raw", "developing", "solid"]);
