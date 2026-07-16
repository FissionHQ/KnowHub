import net from "net";
import { logger } from "./logger.js";

export interface ScanResult {
  clean: boolean;
  reason?: string | undefined;
}

export class VirusScanner {
  constructor(
    private host: string,
    private port: number,
  ) {}

  async scan(buffer: Buffer): Promise<ScanResult> {
    try {
      const result = await this.sendToClam(buffer);
      const clean = result.includes("OK") && !result.includes("FOUND");
      return {
        clean,
        reason: clean ? undefined : result.trim(),
      };
    } catch (err) {
      logger.warn("ClamAV scan failed, allowing file through (fail-open)", { err });
      // Fail-open: if ClamAV is unavailable, allow the file
      return { clean: true, reason: "scan_unavailable" };
    }
  }

  private sendToClam(buffer: Buffer): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(this.port, this.host);
      const chunks: Buffer[] = [];
      let timeout: ReturnType<typeof setTimeout>;

      timeout = setTimeout(() => {
        socket.destroy();
        reject(new Error("ClamAV timeout"));
      }, 30_000);

      socket.on("connect", () => {
        // INSTREAM command: send zINSTREAM\0, then chunks with 4-byte big-endian length prefix, then 0-length chunk
        socket.write("zINSTREAM\0");

        const lengthBuf = Buffer.alloc(4);
        lengthBuf.writeUInt32BE(buffer.length, 0);
        socket.write(lengthBuf);
        socket.write(buffer);

        // End with zero-length chunk
        const endBuf = Buffer.alloc(4, 0);
        socket.write(endBuf);
      });

      socket.on("data", (data) => chunks.push(data));

      socket.on("end", () => {
        clearTimeout(timeout);
        resolve(Buffer.concat(chunks).toString("utf-8"));
      });

      socket.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  async ping(): Promise<boolean> {
    try {
      const result = await new Promise<string>((resolve, reject) => {
        const socket = net.createConnection(this.port, this.host);
        const timeout = setTimeout(() => { socket.destroy(); reject(new Error("timeout")); }, 5000);
        socket.on("connect", () => socket.write("zPING\0"));
        socket.on("data", (d) => { clearTimeout(timeout); socket.end(); resolve(d.toString()); });
        socket.on("error", (e) => { clearTimeout(timeout); reject(e); });
      });
      return result.trim() === "PONG";
    } catch {
      return false;
    }
  }
}
