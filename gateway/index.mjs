import { createServer, request } from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Nạp file .env từ thư mục gốc monorepo
const envPaths = [
  path.resolve(__dirname, '../.env'),
  path.resolve(process.cwd(), '.env'),
];
for (const p of envPaths) {
  if (fs.existsSync(p) && typeof process.loadEnvFile === 'function') {
    try {
      process.loadEnvFile(p);
      break;
    } catch {}
  }
}

const GATEWAY_PORT = parseInt(process.env.PORT || '3000', 10);
const CLIENT_PORT = parseInt(process.env.CLIENT_PORT || '3002', 10);
const SERVER_PORT = parseInt(process.env.SERVER_PORT || '3001', 10);

const clientTarget = new URL(process.env.INTERNAL_CLIENT_URL || `http://127.0.0.1:${CLIENT_PORT}`);
const serverTarget = new URL(process.env.INTERNAL_SERVER_URL || `http://127.0.0.1:${SERVER_PORT}`);

function isBackendRoute(url) {
  if (!url) return false;
  return (
    url.startsWith('/socket.io') ||
    url.startsWith('/.proxy/backend') ||
    url.startsWith('/api/backend')
  );
}

function proxyHttp(req, res, target) {
  const options = {
    hostname: target.hostname,
    port: target.port,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: target.host,
      'x-forwarded-for': req.socket?.remoteAddress,
      'x-forwarded-proto': 'http',
      'x-forwarded-host': req.headers.host,
    },
  };

  const proxyReq = request(options, (proxyRes) => {
    proxyRes.on('error', (err) => {
      res.destroy(err);
    });

    if (!res.headersSent) {
      res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
    }
    proxyRes.pipe(res, { end: true });
  });

  req.on('error', () => {
    proxyReq.destroy();
  });

  res.on('error', () => {
    proxyReq.destroy();
  });

  proxyReq.on('error', (err) => {
    if (err.code === 'ECONNRESET' || err.code === 'EPIPE' || err.code === 'ECONNABORTED') return;
    console.warn(`[Gateway HTTP Error] ${req.url} -> ${err.message}`);
    if (!res.headersSent) {
      try {
        res.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <html>
            <head><title>502 Bad Gateway</title></head>
            <body style="font-family:sans-serif;padding:40px;background:#111;color:#eee;text-align:center;">
              <h2>502 - Service Starting</h2>
              <p>Target service is currently starting up or compiling. Please reload in a few moments.</p>
            </body>
          </html>
        `);
      } catch {}
    }
  });

  req.pipe(proxyReq, { end: true });
}

function proxyWs(req, clientSocket, head, target) {
  clientSocket.setTimeout(0);
  clientSocket.setKeepAlive(true, 10000);

  clientSocket.on('error', (err) => {
    clientSocket.destroy();
  });

  const options = {
    hostname: target.hostname,
    port: target.port,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: target.host,
      'x-forwarded-for': clientSocket.remoteAddress,
      'x-forwarded-proto': 'http',
      'x-forwarded-host': req.headers.host,
    },
  };

  const proxyReq = request(options);

  proxyReq.on('upgrade', (proxyRes, serverSocket, proxyHead) => {
    serverSocket.setTimeout(0);
    serverSocket.setKeepAlive(true, 10000);

    serverSocket.on('error', () => {
      clientSocket.destroy();
    });
    clientSocket.on('error', () => {
      serverSocket.destroy();
    });

    serverSocket.on('close', () => {
      clientSocket.destroy();
    });
    clientSocket.on('close', () => {
      serverSocket.destroy();
    });

    try {
      clientSocket.write(
        `HTTP/1.1 101 Switching Protocols\r\n` +
          Object.entries(proxyRes.headers)
            .map(([k, v]) => `${k}: ${v}`)
            .join('\r\n') +
          `\r\n\r\n`,
      );
      if (proxyHead && proxyHead.length) clientSocket.write(proxyHead);
      if (head && head.length) serverSocket.write(head);
      serverSocket.pipe(clientSocket);
      clientSocket.pipe(serverSocket);
    } catch {
      serverSocket.destroy();
      clientSocket.destroy();
    }
  });

  proxyReq.on('error', (err) => {
    if (err.code === 'ECONNRESET' || err.code === 'EPIPE' || err.code === 'ECONNABORTED') {
      clientSocket.destroy();
      return;
    }
    console.warn(`[Gateway WS Error] ${req.url} -> ${err.message}`);
    clientSocket.destroy();
  });

  proxyReq.end();
}

const server = createServer((req, res) => {
  const target = isBackendRoute(req.url) ? serverTarget : clientTarget;
  proxyHttp(req, res, target);
});
server.keepAliveTimeout = 120000;
server.headersTimeout = 125000;

server.on('upgrade', (req, socket, head) => {
  const target = isBackendRoute(req.url) ? serverTarget : clientTarget;
  proxyWs(req, socket, head, target);
});

server.on('clientError', (err, socket) => {
  if (err.code === 'ECONNRESET' || err.code === 'ECONNABORTED' || !socket.writable) {
    socket.destroy();
    return;
  }
  socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});

process.on('uncaughtException', (err) => {
  if (err.code === 'ECONNRESET' || err.code === 'ECONNABORTED' || err.code === 'EPIPE') {
    return;
  }
  console.error('[Gateway Uncaught Exception]', err);
});

server.listen(GATEWAY_PORT, () => {
  console.log(`====================================================`);
  console.log(`[API GATEWAY] Listening on http://localhost:${GATEWAY_PORT}`);
  console.log(`  -> Backend (NestJS Socket + API): ${serverTarget.origin}`);
  console.log(`  -> Frontend (Next.js UI):         ${clientTarget.origin}`);
  console.log(`====================================================`);
});
