import * as path from "std/path/mod.ts";
import { listPorts, SerialPort } from "jsr:@paltaio/serialport@0.2.2";

const baseDir = import.meta.dirname ?? ".";
const publicDir = path.join(baseDir, "public");
const TARGET_VENDOR_ID = "2e3c";
const TARGET_PRODUCT_ID = "5740";
const TARGET_PNP_ID_SUBSTRING = "USB Modem";
const textEncoder = new TextEncoder();

const sockets = new Set<WebSocket>();
let serialPort: SerialPort | null = null;

function toHex(data: ArrayBuffer | ArrayBufferView): string {
  const view = data instanceof ArrayBuffer
    ? new Uint8Array(data)
    : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return Array.from(view).map((b) => b.toString(16).padStart(2, "0")).join(" ");
}

function contentType(filePath: string): string {
  switch (path.extname(filePath)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    default:
      return "application/octet-stream";
  }
}

function resolvePublicPath(urlPath: string): string | null {
  const normalized = path.posix.normalize(urlPath);
  const cleaned = normalized.replace(/^\/+/, "");
  const joined = path.join(publicDir, cleaned || "index.html");
  const resolved = path.normalize(joined);
  if (!resolved.startsWith(path.normalize(publicDir))) return null; // prevent traversal
  return resolved;
}

function readFileMaybe(filePath: string): Uint8Array | null {
  try {
    return Deno.readFileSync(filePath);
  } catch {
    return null;
  }
}

function parsePort(args: string[]): number {
  const portFlagIndex = args.findIndex((arg) => arg === "--port" || arg === "-p");
  if (portFlagIndex >= 0 && args[portFlagIndex + 1]) {
    const parsed = Number(args[portFlagIndex + 1]);
    if (Number.isFinite(parsed) && parsed > 0 && parsed < 65536) return parsed;
  }
  return 8000;
}

async function connectSerial() {
  try {
    // Check for explicit serial port path from environment variable
    const explicitPath = Deno.env.get("SERIAL_PORT");

    let portPath: string;

    if (explicitPath) {
      console.log(`Serial: using explicit path from SERIAL_PORT env: ${explicitPath}`);
      portPath = explicitPath;
    } else {
      // Auto-detect DPS-150 device
      const ports = await listPorts();
      console.log("Serial: available ports:", ports.map((p) => p.path).join(", "));
      const match = ports.find((p) =>
        (p.vendorId?.toLowerCase() === TARGET_VENDOR_ID &&
          p.productId?.toLowerCase() === TARGET_PRODUCT_ID) ||
        p.pnpId?.toLowerCase()?.includes(TARGET_PNP_ID_SUBSTRING.toLowerCase())
      );

      if (!match) {
        console.warn("Serial: DPS-150 device not found (vid:pid 2e3c:5740)");
        console.warn(
          "Serial: Set SERIAL_PORT environment variable to specify device path manually",
        );
        Deno.exit(1);
      }

      portPath = match.path;
    }

    const port = new SerialPort({
      path: portPath,
      baudRate: 115200,
      dataBits: 8,
      stopBits: 1,
      parity: "none",
      autoOpen: false,
    });

    await port.open();
    serialPort = port;
    console.log(`Serial: opened ${portPath} @115200`);
    void startSerialReader(port);
  } catch (err) {
    console.error("Serial: failed to open", err);
  }
}

async function startSerialReader(port: SerialPort) {
  try {
    console.log("Serial: starting read loop");
    let buffer = new Uint8Array(0);
    while (true) {
      const chunk = await port.read();
      if (chunk === null) {
        console.warn("Serial: port closed");
        break;
      }
      if (chunk.length === 0) continue;
      buffer = new Uint8Array([...buffer, ...chunk]);
      let start = buffer.indexOf(0xF0);
      while (start !== -1) {
        const end = buffer.indexOf(0xF0, start + 1);
        if (end === -1) break;
        const frame = buffer.slice(start, end);
        console.debug(`Serial <= ${toHex(frame)}`);
        for (const ws of sockets) {
          if (ws.readyState === WebSocket.OPEN) ws.send(frame);
        }
        start = end;
      }
      // keep the remaining bytes in the buffer
      if (start !== -1) {
        buffer = buffer.slice(start);
      } else {
        buffer = new Uint8Array(0);
      }
    }
  } catch (err) {
    console.error("Serial read error", err);
  } finally {
    serialPort = null;
    console.warn("Serial: connection closed");
  }
}

const port = parsePort(Deno.args);
await connectSerial();
console.log(`Starting web server on http://localhost:${port}`);

const handler = (req: Request): Response => {
  const { pathname } = new URL(req.url);

  if (pathname === "/ws") {
    const { socket, response } = Deno.upgradeWebSocket(req);
    sockets.add(socket);

    socket.addEventListener("open", () => {
      console.log("WebSocket: client connected");
    });

    socket.addEventListener("message", async (event) => {
      const data = event.data;
      let bytes: Uint8Array | null = null;

      if (typeof data === "string") {
        bytes = textEncoder.encode(data);
      } else if (data instanceof ArrayBuffer) {
        bytes = new Uint8Array(data);
      } else if (data instanceof Blob) {
        bytes = new Uint8Array(await data.arrayBuffer());
      }

      if (!bytes) {
        console.warn("WebSocket: unsupported message type", typeof data);
        return;
      }

      console.debug(`WebSocket <= ${toHex(bytes)}`);

      if (serialPort?.isPortOpen) {
        serialPort.write(bytes).catch((err) => {
          console.error("Serial write error", err);
        });
      }
    });

    socket.addEventListener("close", () => {
      sockets.delete(socket);
      console.log("WebSocket: client disconnected");
    });

    socket.addEventListener("error", (err) => {
      console.error("WebSocket error", err);
    });

    return response;
  }

  const target = resolvePublicPath(pathname);
  if (!target) {
    return new Response("Bad request", {
      status: 400,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const file = readFileMaybe(target);
  if (file === null) {
    return new Response("Not found", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const bytes = new Uint8Array(file.byteLength);
  bytes.set(file);

  return new Response(bytes, {
    headers: {
      "content-type": contentType(target),
      "cache-control": "no-store",
    },
  });
};

const server = Deno.serve({ port }, handler);
await server.finished;
