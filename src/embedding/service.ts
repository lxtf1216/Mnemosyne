import { spawn } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PYTHON_PATH = process.env.PYTHON || "python3";

export class EmbeddingService {
  private proc: ReturnType<typeof spawn> | null = null;
  private pending: Map<string, { resolve: (v: unknown) => void; reject: (e: unknown) => void }> = new Map();
  private seq = 0;
  private _dim: number | null = null;

  async start(): Promise<void> {
    if (this.proc) return;

    const scriptPath = resolve(__dirname, "embed.py");
    this.proc = spawn(PYTHON_PATH, [scriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.proc.stdout?.on("data", (data: Buffer) => {
      const lines = data.toString().split("\n").filter(Boolean);
      for (const line of lines) {
        this.handleMessage(line);
      }
    });

    this.proc.stderr?.on("data", (data: Buffer) => {
      console.error("Embedding service:", data.toString().trim());
    });

    this.proc.on("error", (err: Error) => {
      console.error("Embedding service error:", err);
      this.proc = null;
    });

    // Wait for ready
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Embedding service timeout")), 30000);
      this.pending.set("_init", {
        resolve: () => { clearTimeout(timeout); resolve(); },
        reject: (e: unknown) => { clearTimeout(timeout); reject(e); },
      });

      // Send init message to probe dimension
      this.send({ type: "dim", _seq: "_init" });
    });

    this._dim = await this.probeDim();
  }

  private send(msg: object): void {
    if (!this.proc?.stdin) return;
    this.proc.stdin.write(JSON.stringify(msg) + "\n");
  }

  private handleMessage(data: string): void {
    try {
      const msg = JSON.parse(data);
      const seq = msg._seq as string | undefined;
      if (seq && this.pending.has(seq)) {
        const { resolve, reject } = this.pending.get(seq)!;
        this.pending.delete(seq);
        if (msg.error) reject(new Error(msg.error));
        else resolve(msg);
      } else if (msg._seq === "_init" && this.pending.has("_init")) {
        const { resolve } = this.pending.get("_init")!;
        resolve(undefined);
      }
    } catch (e) {
      console.error("Failed to parse embedding message:", e);
    }
  }

  private async probeDim(): Promise<number> {
    const result = await this.request<{ dim: number }>({ type: "dim" });
    return result.dim;
  }

  private request<T>(msg: object): Promise<T> {
    return new Promise((resolve, reject) => {
      const seq = String(++this.seq);
      this.send({ ...msg, _seq: seq });
      this.pending.set(seq, { resolve: resolve as unknown as (v: unknown) => void, reject });
    });
  }

  get dimension(): number {
    if (this._dim === null) throw new Error("Embedding service not started");
    return this._dim;
  }

  get isStarted(): boolean {
    return this.proc !== null;
  }

  async embed(text: string): Promise<number[]> {
    if (!this.proc) await this.start();
    const result = await this.request<{ embedding: number[] }>({ type: "embed", text });
    return result.embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!this.proc) await this.start();
    const result = await this.request<{ embeddings: number[][] }>({ type: "embed_batch", texts });
    return result.embeddings;
  }

  stop(): void {
    this.proc?.kill();
    this.proc = null;
    this._dim = null;
  }
}

// Singleton
export const embeddingService = new EmbeddingService();
