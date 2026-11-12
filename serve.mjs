/* 极简静态服务器：双击 start.bat 或运行 `node serve.mjs --open`，然后访问 http://127.0.0.1:5173 */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : here);
const basePort = Number(process.env.PORT ?? 5173);
const openBrowser = process.argv.includes('--open') && !process.env.NO_BROWSER;

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp'
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const file = resolve(root, '.' + rel);
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    const data = await readFile(file);
    res.writeHead(200, {
      'Content-Type': types[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  } catch (err) {
    res.writeHead(err && err.code === 'ENOENT' ? 404 : 500).end('Not found');
  }
});

function openExternal(url) {
  const command = process.platform === 'win32'
    ? `start "" "${url}"`
    : process.platform === 'darwin'
      ? `open "${url}"`
      : `xdg-open "${url}"`;
  exec(command, (err) => {
    if (err) {
      console.warn('无法自动打开浏览器，请手动访问 ' + url);
    }
  });
}

function listen(port, attempt = 0) {
  const onError = (err) => {
    server.removeListener('error', onError);
    if (err.code === 'EADDRINUSE' && attempt < 20) {
      listen(port + 1, attempt + 1);
      return;
    }
    console.error('\n[错误] 服务器无法启动：' + (err.message || err));
    console.error('如果是端口被占用，可以设置 PORT=8080 后重试，或关闭占用端口的程序。\n');
    process.exitCode = 1;
  };

  server.on('error', onError);
  server.listen(port, '127.0.0.1', () => {
    server.removeListener('error', onError);
    const url = `http://127.0.0.1:${port}`;
    console.log('\n  动态树 · Web 复刻');
    console.log('  → ' + url);
    if (port !== basePort) console.log(`  （端口 ${basePort} 被占用，已自动改用 ${port}）`);
    console.log('  按 Ctrl+C 停止服务器\n');
    if (openBrowser) openExternal(url);
  });
}

listen(basePort);
