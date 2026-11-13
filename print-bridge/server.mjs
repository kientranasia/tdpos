import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import { execFile, spawn } from 'node:child_process';

const config = {
  host: process.env.PRINT_BRIDGE_HOST || '127.0.0.1',
  port: Number(process.env.PRINT_BRIDGE_PORT || 17650),
  token: process.env.PRINT_BRIDGE_TOKEN || '',
  mode: String(process.env.PRINT_BRIDGE_PRINTER_MODE || 'network').toLowerCase(),
  printerHost: process.env.PRINT_BRIDGE_PRINTER_HOST || '',
  printerPort: Number(process.env.PRINT_BRIDGE_PRINTER_PORT || 9100),
  printerName: process.env.PRINT_BRIDGE_PRINTER_NAME || '',
  paperWidth: Number(process.env.PRINT_BRIDGE_PAPER_WIDTH || 42),
  encoding: String(process.env.PRINT_BRIDGE_ENCODING || 'ascii').toLowerCase(),
  origin: process.env.PRINT_BRIDGE_ALLOWED_ORIGINS || '*',
};

const MAX_BODY_BYTES = 256 * 1024;
const allowedOrigins = config.origin === '*'
  ? null
  : new Set(config.origin.split(',').map((value) => value.trim()).filter(Boolean));

const json = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
};

const setCors = (req, res) => {
  const requestOrigin = req.headers.origin;
  if (!allowedOrigins || (requestOrigin && allowedOrigins.has(requestOrigin))) {
    res.setHeader('Access-Control-Allow-Origin', requestOrigin || '*');
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Print-Bridge-Token');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
};

const isAuthorized = (req) => !config.token || req.headers['x-print-bridge-token'] === config.token;

const readJson = (req) => new Promise((resolve, reject) => {
  let size = 0;
  let raw = '';
  req.setEncoding('utf8');
  req.on('data', (chunk) => {
    size += Buffer.byteLength(chunk);
    if (size > MAX_BODY_BYTES) {
      reject(Object.assign(new Error('Payload quá lớn.'), { statusCode: 413 }));
      req.destroy();
      return;
    }
    raw += chunk;
  });
  req.on('end', () => {
    try {
      resolve(raw ? JSON.parse(raw) : {});
    } catch {
      reject(Object.assign(new Error('Dữ liệu JSON không hợp lệ.'), { statusCode: 400 }));
    }
  });
  req.on('error', reject);
});

const transliterate = (value) => String(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/Đ/g, 'D')
  .replace(/đ/g, 'd');

const wrapLine = (line, width) => {
  const value = String(line || '').replace(/\s+/g, ' ').trim();
  if (!value) return [''];
  const result = [];
  let remaining = value;
  while (remaining.length > width) {
    let splitAt = remaining.lastIndexOf(' ', width);
    if (splitAt < Math.floor(width * 0.55)) splitAt = width;
    result.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }
  result.push(remaining);
  return result;
};

const formatReceipt = (text) => {
  const width = config.paperWidth === 32 ? 32 : 42;
  const source = config.encoding === 'utf8' ? String(text) : transliterate(text);
  const lines = source.replace(/\r/g, '').split('\n').flatMap((line) => wrapLine(line, width));
  const content = Buffer.from(`${lines.join('\n')}\n\n`, config.encoding === 'utf8' ? 'utf8' : 'ascii');
  return Buffer.concat([
    Buffer.from([0x1b, 0x40]),
    Buffer.from([0x1b, 0x61, 0x00]),
    content,
    Buffer.from([0x1d, 0x56, 0x00]),
  ]);
};

const sendToNetworkPrinter = (data) => new Promise((resolve, reject) => {
  if (!config.printerHost) {
    reject(new Error('Chưa cấu hình PRINT_BRIDGE_PRINTER_HOST.'));
    return;
  }
  const socket = net.createConnection({ host: config.printerHost, port: config.printerPort });
  let settled = false;
  const finish = (error) => {
    if (settled) return;
    settled = true;
    socket.destroy();
    if (error) reject(error); else resolve();
  };
  socket.setTimeout(8000, () => finish(new Error('Kết nối máy in quá thời gian.')));
  socket.once('connect', () => socket.end(data, () => finish()));
  socket.once('error', (error) => finish(error));
});

const sendToSystemPrinter = (data) => new Promise((resolve, reject) => {
  if (!config.printerName) {
    reject(new Error('Chưa cấu hình PRINT_BRIDGE_PRINTER_NAME.'));
    return;
  }
  if (process.platform === 'win32') {
    const script = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class HkdRawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct DocInfo { public string pDocName; public string pOutputFile; public string pDataType; }
  [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool OpenPrinter(string name, out IntPtr handle, IntPtr defaults);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool ClosePrinter(IntPtr handle);
  [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)] public static extern int StartDocPrinter(IntPtr handle, int level, ref DocInfo docInfo);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool EndDocPrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError=true)] public static extern int StartPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool EndPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool WritePrinter(IntPtr handle, byte[] bytes, int count, out int written);
}
"@
$printer = $env:PRINT_BRIDGE_PRINTER_NAME
$data = [Convert]::FromBase64String($env:PRINT_BRIDGE_DATA_B64)
$handle = [IntPtr]::Zero
if (-not [HkdRawPrinter]::OpenPrinter($printer, [ref]$handle, [IntPtr]::Zero)) { throw "Không mở được máy in: $printer" }
try {
  $doc = New-Object HkdRawPrinter+DocInfo
  $doc.pDocName = 'HKD Smart receipt'
  $doc.pDataType = 'RAW'
  if ([HkdRawPrinter]::StartDocPrinter($handle, 1, [ref]$doc) -le 0) { throw "Không tạo được lệnh in" }
  [HkdRawPrinter]::StartPagePrinter($handle) | Out-Null
  $written = 0
  if (-not [HkdRawPrinter]::WritePrinter($handle, $data, $data.Length, [ref]$written)) { throw "Không gửi được dữ liệu tới máy in" }
  [HkdRawPrinter]::EndPagePrinter($handle) | Out-Null
} finally {
  [HkdRawPrinter]::EndDocPrinter($handle) | Out-Null
  [HkdRawPrinter]::ClosePrinter($handle) | Out-Null
}
`;
    execFile('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true,
      env: { ...process.env, PRINT_BRIDGE_PRINTER_NAME: config.printerName, PRINT_BRIDGE_DATA_B64: data.toString('base64') },
      timeout: 15000,
    }, (error, _stdout, stderr) => error ? reject(new Error(stderr.trim() || error.message)) : resolve());
    return;
  }
  const child = spawn('lp', ['-d', config.printerName, '-o', 'raw'], { stdio: ['pipe', 'ignore', 'pipe'] });
  let errorText = '';
  child.stderr.on('data', (chunk) => { errorText += chunk.toString(); });
  child.once('error', reject);
  child.once('close', (code) => code === 0 ? resolve() : reject(new Error(errorText.trim() || `Lệnh in thất bại (${code}).`)));
  child.stdin.end(data);
});

const printText = async (text, copies = 1) => {
  const data = formatReceipt(text);
  const count = Math.max(1, Math.min(Number(copies) || 1, 3));
  for (let index = 0; index < count; index += 1) {
    if (config.mode === 'network') await sendToNetworkPrinter(data);
    else if (config.mode === 'system' || config.mode === 'windows') await sendToSystemPrinter(data);
    else throw new Error(`Chế độ máy in không hỗ trợ: ${config.mode}`);
  }
};

const printerInfo = () => ({
  mode: config.mode,
  host: config.printerHost || null,
  port: config.mode === 'network' ? config.printerPort : null,
  name: config.printerName || null,
  paperWidth: config.paperWidth,
});

const listSystemPrinters = () => new Promise((resolve) => {
  if (process.platform === 'win32') {
    execFile('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', 'Get-Printer | Select-Object Name,PrinterStatus,Default | ConvertTo-Json -Compress'], { timeout: 10000 }, (error, stdout) => {
      if (error) return resolve([]);
      try {
        const parsed = JSON.parse(stdout || '[]');
        resolve((Array.isArray(parsed) ? parsed : [parsed]).filter(Boolean));
      } catch { resolve([]); }
    });
    return;
  }
  execFile('lpstat', ['-a'], { timeout: 10000 }, (error, stdout) => {
    if (error) return resolve([]);
    resolve(stdout.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => ({ name: line.split(/\s+/)[0], description: line })));
  });
});

const server = http.createServer(async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname === '/health' && req.method === 'GET') {
      json(res, 200, { ok: true, service: 'hkd-print-bridge', platform: process.platform, printer: printerInfo() });
      return;
    }
    if (!isAuthorized(req)) { json(res, 401, { error: 'Print Bridge token không hợp lệ.' }); return; }
    if (url.pathname === '/printers' && req.method === 'GET') {
      json(res, 200, { configured: printerInfo(), system: await listSystemPrinters() });
      return;
    }
    if ((url.pathname === '/print' || url.pathname === '/test') && req.method === 'POST') {
      const payload = await readJson(req);
      const text = url.pathname === '/test'
        ? 'HKD SMART\nPRINT BRIDGE\n\nKet noi may in thanh cong.'
        : String(payload.text || '').trim();
      if (!text) { json(res, 400, { error: 'Thiếu nội dung phiếu in.' }); return; }
      await printText(text, url.pathname === '/test' ? 1 : payload.copies);
      json(res, 200, { ok: true, documentNo: payload.documentNo || null, printer: printerInfo() });
      return;
    }
    json(res, 404, { error: 'Không tìm thấy endpoint.' });
  } catch (error) {
    const status = Number(error?.statusCode) || 502;
    json(res, status, { error: error instanceof Error ? error.message : 'Không thể in phiếu.' });
  }
});

server.listen(config.port, config.host, () => {
  console.log(`[hkd-print-bridge] listening on http://${config.host}:${config.port}`);
  console.log(`[hkd-print-bridge] mode=${config.mode} printer=${JSON.stringify(printerInfo())}`);
  if (config.host === '0.0.0.0') console.log(`[hkd-print-bridge] LAN addresses: ${Object.values(os.networkInterfaces()).flat().filter((item) => item?.family === 'IPv4' && !item.internal).map((item) => item.address).join(', ')}`);
});
