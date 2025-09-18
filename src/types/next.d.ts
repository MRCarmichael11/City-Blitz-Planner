declare module 'next' {
  export interface NextApiRequest {
    method?: string;
    query: Record<string, string | string[]>;
    body?: unknown;
  }

  export interface NextApiResponse<T = unknown> {
    status(code: number): NextApiResponse<T>;
    json(body: T): void;
    end(): void;
  }
}

