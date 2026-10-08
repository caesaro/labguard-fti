import cors from 'cors';
import crypto from 'crypto';
import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import tls from 'tls';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = Number(process.env.PORT || 3000);
const SERVER_HOST = process.env.SERVER_HOST || '0.0.0.0';
app.use(cors());
app.use(express.json());
const ENV_PATH = path.join(__dirname, '.env');
function upsertEnvValue(key, value) {
    const serialized = `${key}="${value}"`;
    const existing = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    const nextContent = pattern.test(existing)
        ? existing.replace(pattern, serialized)
        : `${existing.trimEnd()}\n${serialized}\n`.replace(/^\n/, '');
    fs.writeFileSync(ENV_PATH, nextContent, 'utf8');
}
function ensureSessionSecret() {
    const existingSecret = String(process.env.SESSION_SECRET || '').trim();
    if (existingSecret)
        return existingSecret;
    const generatedSecret = crypto.randomBytes(48).toString('hex');
    process.env.SESSION_SECRET = generatedSecret;
    upsertEnvValue('SESSION_SECRET', generatedSecret);
    return generatedSecret;
}
const DEFAULT_ADMIN_PIN = '123456';
const configuredPin = process.env.ADMIN_PIN || process.env.ADMIN_PASS || DEFAULT_ADMIN_PIN;
const adminPin = /^\d{1,6}$/.test(configuredPin) ? configuredPin : DEFAULT_ADMIN_PIN;
const SESSION_SECRET = ensureSessionSecret();
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_HOURS || 12) * 60 * 60 * 1000;
const REMEMBER_SESSION_TTL_MS = Number(process.env.REMEMBER_SESSION_DAYS || 30) * 24 * 60 * 60 * 1000;
const ROUTER_IP = (process.env.ROUTER_IP || '').trim();
const ROUTER_USER = (process.env.ROUTER_USER || '').trim();
const ROUTER_PASS = process.env.ROUTER_PASS || '';
const HAS_CONFIG = !!(ROUTER_IP && ROUTER_USER);
const ROUTER_API_TLS = process.env.ROUTER_API_TLS === 'true';
const ROUTER_API_PORT = Number(process.env.ROUTER_API_PORT || (ROUTER_API_TLS ? 8729 : 8728));
const ROUTER_TIMEOUT_MS = Number(process.env.ROUTER_TIMEOUT_MS || 8000);
const WAN_INTERFACE_LIST = process.env.WAN_INTERFACE_LIST || 'WAN';
const WAN_INTERFACE = process.env.WAN_INTERFACE || '';
const UPLINK_INTERFACE = (process.env.UPLINK_INTERFACE || WAN_INTERFACE || 'ether2-backboneUKSW').trim();
const NAT_BLOCK_COMMENT_PREFIX = process.env.LABGUARD_NAT_BLOCK_PREFIX || 'LABGUARD_NO_INTERNET';
const STRICT_POLICY_COMMENT_PREFIX = 'LABGUARD_TLS_BLOCK';
const NAT_PLACE_BEFORE = process.env.LABGUARD_NAT_PLACE_BEFORE || '0';
const MAC_BLOCK_COMMENT_PREFIX = (process.env.LABGUARD_MAC_BLOCK_PREFIX || 'LABGUARD_MAC_NO_INTERNET').trim();
const MAC_PLACE_BEFORE = (process.env.LABGUARD_MAC_PLACE_BEFORE || '').trim();
// Cache baca MAC access (ms). Satu kali baca = 2 print RouterOS (filter + nat) ≈ 3-7 detik;
// tanpa cache setiap request browser memicu sesi RouterOS baru dan UI tampak "loading" terus.
const MAC_ACCESS_CACHE_MS = Math.max(0, Number(process.env.MAC_ACCESS_CACHE_MS || 10000));
// Batas keras durasi baca MAC access (ms) supaya request tidak menggantung tanpa batas.
const MAC_ACCESS_TIMEOUT_MS = Math.max(0, Number(process.env.MAC_ACCESS_TIMEOUT_MS || Math.max(ROUTER_TIMEOUT_MS * 4, 20000)));
// Cache baca snapshot RouterOS (ms). Satu sesi RouterOS = 1 baris log login + 1 baris logout di
// router, jadi pembacaan snapshot ditahan sebentar dan request beruntun memakai hasil yang sama.
// 0 = matikan cache. Dituning lewat env, bukan hardcode.
const ROUTER_READ_CACHE_MS = Math.max(0, Number(process.env.ROUTER_READ_CACHE_MS || 8000));
// Cache khusus monitor-traffic (ms). Grafik tetap terisi karena sampel disimpan per interval.
const ROUTER_TRAFFIC_CACHE_MS = Math.max(0, Number(process.env.ROUTER_TRAFFIC_CACHE_MS || 3000));
// Batas keras durasi baca snapshot supaya request tidak menggantung tanpa batas.
const ROUTER_READ_TIMEOUT_MS = Math.max(0, Number(process.env.ROUTER_READ_TIMEOUT_MS || Math.max(ROUTER_TIMEOUT_MS * 4, 20000)));
const LAB_TEACHER_HOST_SUFFIX = Number(process.env.LAB_TEACHER_HOST_SUFFIX || 2);
const LAB_INTERFACE_TERMS = (process.env.LAB_INTERFACE_MATCH || 'lab,vlan')
    .split(',')
    .map((term) => term.trim().toLowerCase())
    .filter(Boolean);
const LABS_ONLY_VLANS = (process.env.LABS_ONLY_VLANS || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
function getDeviceIp() {
    const interfaces = os.networkInterfaces();
    for (const entries of Object.values(interfaces)) {
        for (const entry of entries || []) {
            if (entry.family === 'IPv4' && !entry.internal) {
                return entry.address;
            }
        }
    }
    return '127.0.0.1';
}
function getPublicServerHost() {
    if (process.env.PUBLIC_HOST)
        return process.env.PUBLIC_HOST;
    if (SERVER_HOST !== '0.0.0.0' && SERVER_HOST !== '::')
        return SERVER_HOST;
    return getDeviceIp();
}
let mockInterfaces = [
    { id: '*10', name: 'lab 467', enabled: true, running: true, comment: 'VLAN 67 - Lab Jaringan Utama', type: 'vlan', interfaceEnabled: true, internetBlocked: false, queueTreeId: '*q10', queueTreeName: '467', bandwidthEnabled: true, bandwidthLimit: 100_000_000, bandwidthLimitMbps: 100, hasQueueTree: true, teacherIp: '172.67.17.2', teacherInternetEnabled: true },
    { id: '*11', name: 'lab 461', enabled: false, running: true, comment: 'VLAN 61 - Lab Pemrograman', type: 'vlan', interfaceEnabled: true, internetBlocked: true, queueTreeId: '*q11', queueTreeName: '461', bandwidthEnabled: true, bandwidthLimit: 100_000_000, bandwidthLimitMbps: 100, hasQueueTree: true, teacherIp: '172.67.11.2', teacherInternetEnabled: false },
    { id: '*12', name: 'lab 464', enabled: true, running: true, comment: 'VLAN 64 - Lab Sistem Operasi', type: 'vlan', interfaceEnabled: true, internetBlocked: false, queueTreeId: '*q12', queueTreeName: '464', bandwidthEnabled: true, bandwidthLimit: 100_000_000, bandwidthLimitMbps: 100, hasQueueTree: true, teacherIp: '172.67.13.2', teacherInternetEnabled: true },
    { id: '*13', name: 'vlan-management', enabled: true, running: true, comment: 'VLAN 10 - Management Core', type: 'vlan', interfaceEnabled: true, internetBlocked: false, bandwidthEnabled: false, hasQueueTree: false, teacherInternetEnabled: false },
    { id: '*14', name: 'lab 465', enabled: true, running: true, comment: 'VLAN 65 - Lab IoT & Robotik', type: 'vlan', interfaceEnabled: true, internetBlocked: false, queueTreeId: '*q14', queueTreeName: '465', bandwidthEnabled: true, bandwidthLimit: 100_000_000, bandwidthLimitMbps: 100, hasQueueTree: true, teacherIp: '172.67.14.2', teacherInternetEnabled: true },
    { id: '*15', name: 'lab 462', enabled: true, running: true, comment: 'VLAN 62 - Lab Multimedia', type: 'vlan', interfaceEnabled: true, internetBlocked: false, bandwidthEnabled: false, hasQueueTree: false, teacherIp: '172.67.12.2', teacherInternetEnabled: true },
    { id: '*16', name: 'vlan463', enabled: true, running: true, comment: 'VLAN 63 - Lab Basis Data', type: 'vlan', interfaceEnabled: true, internetBlocked: false, queueTreeId: '*q16', queueTreeName: '463', bandwidthEnabled: true, bandwidthLimit: 100_000_000, bandwidthLimitMbps: 100, hasQueueTree: true, teacherIp: '172.67.12.2', teacherInternetEnabled: true },
    { id: '*16b', name: 'lab 463', enabled: true, running: true, comment: 'VLAN 63 - Lab Basis Data', type: 'vlan', interfaceEnabled: true, internetBlocked: false, queueTreeId: '*q16', queueTreeName: '463', bandwidthEnabled: true, bandwidthLimit: 100_000_000, bandwidthLimitMbps: 100, hasQueueTree: true, teacherIp: '172.67.12.2', teacherInternetEnabled: true },
    { id: '*17', name: 'lab 466', enabled: false, running: true, comment: 'VLAN 66 - Lab Kecerdasan Buatan', type: 'vlan', interfaceEnabled: true, internetBlocked: true, bandwidthEnabled: false, hasQueueTree: false, teacherIp: '172.67.15.2', teacherInternetEnabled: false },
    { id: '*18', name: 'lab 468', enabled: true, running: true, comment: 'VLAN 68 - Lab Keamanan Siber', type: 'vlan', interfaceEnabled: true, internetBlocked: false, bandwidthEnabled: false, hasQueueTree: false, teacherIp: '172.67.18.2', teacherInternetEnabled: true },
    { id: '*19', name: 'lab 469', enabled: true, running: true, comment: 'VLAN 69 - Lab Cloud Computing', type: 'vlan', interfaceEnabled: true, internetBlocked: false, queueTreeId: '*q19', queueTreeName: '469', bandwidthEnabled: true, bandwidthLimit: 100_000_000, bandwidthLimitMbps: 100, hasQueueTree: true, teacherIp: '172.67.19.2', teacherInternetEnabled: true },
    { id: '*20', name: 'vlan-server-farm', enabled: true, running: true, comment: 'VLAN 100 - Data Center Local', type: 'vlan', interfaceEnabled: true, internetBlocked: false, bandwidthEnabled: false, hasQueueTree: false, teacherInternetEnabled: false },
    { id: '*21', name: 'vlan-wifi-mhs', enabled: true, running: true, comment: 'VLAN 200 - Hotspot Mahasiswa', type: 'vlan', interfaceEnabled: true, internetBlocked: false, bandwidthEnabled: false, hasQueueTree: false, teacherInternetEnabled: false },
    { id: '*22', name: 'vlan-wifi-dosen', enabled: true, running: true, comment: 'VLAN 210 - Hotspot Staff & Dosen', type: 'vlan', interfaceEnabled: true, internetBlocked: false, bandwidthEnabled: false, hasQueueTree: false, teacherInternetEnabled: false },
];
let localLogs = [
    { id: 1, time: '20:14:02', event: 'Interface [lab 467] state changed to UP', type: 'info' },
    { id: 2, time: '20:12:44', event: 'New DHCP Lease: Lab-467-PC-01 (192.168.67.10)', type: 'success' },
    { id: 3, time: '20:11:30', event: 'Admin login from 192.168.1.5', type: 'auth' },
    { id: 4, time: '20:05:12', event: 'System Check: All VLAN Gateways reachable', type: 'info' },
    { id: 5, time: '19:55:21', event: 'Interface [lab 461] state changed to DOWN', type: 'warning' },
];
const mockSitePolicies = {
    blockRules: [],
    whitelistRules: [
        {
            id: 'allow-netacad',
            name: 'ACC CISCO NETACAD',
            action: 'accept',
            status: 'active',
            source: 'firewall-filter',
            matcher: 'List: ACC CISCO NETACAD',
            references: ['Address List: ACC CISCO NETACAD'],
        },
    ],
    blacklistResources: [
        {
            id: 'address-list-porno',
            type: 'address-list',
            name: 'porno',
            status: 'active',
            totalEntries: 24,
            sampleTargets: ['xvideos.com', 'xnxx.com', 'xhamster.com'],
        },
        {
            id: 'layer7-blokir-openai',
            type: 'layer7',
            name: 'blokir openai',
            status: 'active',
            totalEntries: 1,
            sampleTargets: ['openai.com'],
        },
    ],
};
const mockAddressListEntries = {
    'drive google': [
        { id: 'mock-drive-1', list: 'drive google', address: 'drive.google.com', comment: 'Google Drive', disabled: false },
    ],
    'porno': [
        { id: 'mock-porno-1', list: 'porno', address: 'xvideos.com', comment: 'Sample Block', disabled: false },
        { id: 'mock-porno-2', list: 'porno', address: 'xnxx.com', comment: 'Sample Block', disabled: false },
    ],
    'ACC CISCO NETACAD': [
        { id: 'mock-netacad-1', list: 'ACC CISCO NETACAD', address: 'netacad.com', comment: 'Cisco NetAcad', disabled: false },
    ],
};
let mockMacBlocks = [
    {
        id: 'mock-mac-1',
        mac: 'D8:BB:C1:E0:85:62',
        label: 'PC Lab 461 - 01',
        scope: 'vlan461',
        action: 'drop',
        outInterface: 'ether2-backboneUKSW',
        internetEnabled: false,
        disabled: false,
    },
    {
        id: 'mock-mac-2',
        mac: '3C:52:82:1A:44:B7',
        label: 'Laptop mahasiswa (demo)',
        scope: '',
        action: 'accept',
        outInterface: 'ether2-backboneUKSW',
        internetEnabled: true,
        disabled: true,
    },
];
function nowTime() {
    return new Intl.DateTimeFormat('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }).format(new Date());
}
function pushLocalLog(event, type = 'info') {
    localLogs = [{ id: Date.now(), time: nowTime(), event, type }, ...localLogs].slice(0, 50);
}
function base64UrlEncode(value) {
    return Buffer.from(value).toString('base64url');
}
function base64UrlDecode(value) {
    return Buffer.from(value, 'base64url').toString('utf8');
}
function signSessionPayload(encodedPayload) {
    return crypto.createHmac('sha256', SESSION_SECRET).update(encodedPayload).digest('base64url');
}
function createSessionToken(remember) {
    const now = Date.now();
    const payload = {
        sub: 'admin',
        iat: now,
        exp: now + (remember ? REMEMBER_SESSION_TTL_MS : SESSION_TTL_MS),
        remember,
    };
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const signature = signSessionPayload(encodedPayload);
    return {
        token: `${encodedPayload}.${signature}`,
        expiresAt: payload.exp,
    };
}
function verifySessionToken(token) {
    const [encodedPayload, signature] = token.split('.');
    if (!encodedPayload || !signature)
        return false;
    const expectedSignature = signSessionPayload(encodedPayload);
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);
    if (signatureBuffer.length !== expectedBuffer.length ||
        !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
        return false;
    }
    try {
        const payload = JSON.parse(base64UrlDecode(encodedPayload));
        return payload.sub === 'admin' && Number(payload.exp) > Date.now();
    }
    catch {
        return false;
    }
}
function formatRouterError(error) {
    if (Array.isArray(error) && error.length > 0) {
        const firstMessage = error.find((item) => item?.field === 'message')?.value;
        if (firstMessage)
            return String(firstMessage);
    }
    if (error?.message)
        return String(error.message);
    if (error?.error?.message)
        return String(error.error.message);
    return 'Router connection failed';
}
function requireSession(req, res, next) {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token || !verifySessionToken(token)) {
        return res.status(401).json({ success: false, error: 'Session tidak valid' });
    }
    next();
}
function toBoolean(value) {
    if (typeof value === 'boolean')
        return value;
    const normalized = String(value ?? '').toLowerCase();
    return normalized === 'true' || normalized === 'yes' || normalized === 'running';
}
function ipv4ToInt(ip) {
    const octets = ip.split('.').map((part) => Number(part));
    if (octets.length !== 4 || octets.some((octet) => Number.isNaN(octet) || octet < 0 || octet > 255)) {
        return null;
    }
    return (((octets[0] << 24) >>> 0) + (octets[1] << 16) + (octets[2] << 8) + octets[3]) >>> 0;
}
function intToIpv4(value) {
    return [
        (value >>> 24) & 255,
        (value >>> 16) & 255,
        (value >>> 8) & 255,
        value & 255,
    ].join('.');
}
function teacherIpFromCidr(cidr) {
    if (!cidr || !cidr.includes('/'))
        return null;
    const [ip, prefixRaw] = cidr.split('/');
    const prefix = Number(prefixRaw);
    const ipInt = ipv4ToInt(ip);
    if (ipInt === null || Number.isNaN(prefix) || prefix < 0 || prefix > 32)
        return null;
    const hostSpace = 2 ** (32 - prefix);
    if (!Number.isInteger(LAB_TEACHER_HOST_SUFFIX) || LAB_TEACHER_HOST_SUFFIX < 0 || LAB_TEACHER_HOST_SUFFIX >= hostSpace) {
        return null;
    }
    const mask = prefix === 0 ? 0 : ((0xffffffff << (32 - prefix)) >>> 0);
    const network = ipInt & mask;
    return intToIpv4((network + LAB_TEACHER_HOST_SUFFIX) >>> 0);
}

function networkCidrFromCidr(cidr) {
    if (!cidr || !cidr.includes('/'))
        return null;
    const [ip, prefixRaw] = cidr.split('/');
    const prefix = Number(prefixRaw);
    const ipInt = ipv4ToInt(ip);
    if (ipInt === null || Number.isNaN(prefix) || prefix < 0 || prefix > 32)
        return null;
    const mask = prefix === 0 ? 0 : ((0xffffffff << (32 - prefix)) >>> 0);
    const network = ipInt & mask;
    return `${intToIpv4(network >>> 0)}/${prefix}`;
}
function encodeRouterLength(length) {
    if (length < 0x80)
        return Buffer.from([length]);
    if (length < 0x4000)
        return Buffer.from([(length >> 8) | 0x80, length & 0xff]);
    if (length < 0x200000)
        return Buffer.from([(length >> 16) | 0xc0, (length >> 8) & 0xff, length & 0xff]);
    if (length < 0x10000000) {
        return Buffer.from([(length >> 24) | 0xe0, (length >> 16) & 0xff, (length >> 8) & 0xff, length & 0xff]);
    }
    return Buffer.from([0xf0, (length >> 24) & 0xff, (length >> 16) & 0xff, (length >> 8) & 0xff, length & 0xff]);
}
function decodeRouterLength(buffer, offset) {
    const first = buffer[offset];
    if (first === undefined)
        return null;
    if ((first & 0x80) === 0x00) {
        return { length: first, size: 1 };
    }
    if ((first & 0xc0) === 0x80) {
        if (offset + 2 > buffer.length)
            return null;
        return { length: ((first & ~0xc0) << 8) + buffer[offset + 1], size: 2 };
    }
    if ((first & 0xe0) === 0xc0) {
        if (offset + 3 > buffer.length)
            return null;
        return { length: ((first & ~0xe0) << 16) + (buffer[offset + 1] << 8) + buffer[offset + 2], size: 3 };
    }
    if ((first & 0xf0) === 0xe0) {
        if (offset + 4 > buffer.length)
            return null;
        return {
            length: ((first & ~0xf0) * 0x1000000) + (buffer[offset + 1] << 16) + (buffer[offset + 2] << 8) + buffer[offset + 3],
            size: 4,
        };
    }
    if (first === 0xf0) {
        if (offset + 5 > buffer.length)
            return null;
        return {
            length: (buffer[offset + 1] * 0x1000000) + (buffer[offset + 2] << 16) + (buffer[offset + 3] << 8) + buffer[offset + 4],
            size: 5,
        };
    }
    throw new Error(`Unsupported RouterOS word length prefix: ${first}`);
}
function sentenceToRecord(words) {
    const record = {};
    for (const word of words) {
        if (!word.startsWith('='))
            continue;
        const secondEqualsIndex = word.indexOf('=', 1);
        if (secondEqualsIndex === -1)
            continue;
        const key = word.slice(1, secondEqualsIndex);
        const value = word.slice(secondEqualsIndex + 1);
        record[key] = value;
    }
    return record;
}
class RouterApiClient {
    socket = null;
    buffer = Buffer.alloc(0);
    queue = [];
    currentSentence = [];
    pendingResolve = null;
    pendingReject = null;
    async connect() {
        await new Promise((resolve, reject) => {
            const handleConnect = () => resolve();
            const handleError = (error) => reject(error);
            const socket = ROUTER_API_TLS
                ? tls.connect({
                    host: ROUTER_IP,
                    port: ROUTER_API_PORT,
                    rejectUnauthorized: process.env.ROUTER_TLS_REJECT_UNAUTHORIZED === 'true',
                }, handleConnect)
                : net.connect({ host: ROUTER_IP, port: ROUTER_API_PORT }, handleConnect);
            socket.setTimeout(ROUTER_TIMEOUT_MS, () => {
                socket.destroy(new Error(`connect ETIMEDOUT ${ROUTER_IP}:${ROUTER_API_PORT}`));
            });
            socket.once('error', handleError);
            socket.on('data', (chunk) => this.handleChunk(chunk));
            socket.on('close', () => {
                const error = new Error('Router API connection closed');
                if (this.pendingReject) {
                    const rejectPending = this.pendingReject;
                    this.pendingReject = null;
                    this.pendingResolve = null;
                    rejectPending(error);
                }
            });
            this.socket = socket;
        });
    }
    close() {
        if (this.socket && !this.socket.destroyed) {
            this.socket.destroy();
        }
        this.socket = null;
        this.buffer = Buffer.alloc(0);
        this.queue = [];
        this.currentSentence = [];
    }
    async login(user, password) {
        await this.sendSentence(['/login', `=name=${user}`, `=password=${password}`]);
        await this.collectCommand();
    }
    async execute(command, options) {
        const words = [command];
        for (const [key, value] of Object.entries(options || {})) {
            words.push(`=${key}=${value}`);
        }
        await this.sendSentence(words);
        return this.collectCommand();
    }
    async sendSentence(words) {
        if (!this.socket)
            throw new Error('Router API socket not connected');
        const payload = Buffer.concat([
            ...words.map((word) => {
                const wordBuffer = Buffer.from(word);
                return Buffer.concat([encodeRouterLength(wordBuffer.length), wordBuffer]);
            }),
            Buffer.from([0]),
        ]);
        await new Promise((resolve, reject) => {
            this.socket.write(payload, (error) => (error ? reject(error) : resolve()));
        });
    }
    async collectCommand() {
        const rows = [];
        const trapMessages = [];
        while (true) {
            const sentence = await this.readSentence();
            const [type, ...words] = sentence;
            if (type === '!re') {
                rows.push(sentenceToRecord(words));
                continue;
            }
            if (type === '!trap') {
                const trapRecord = sentenceToRecord(words);
                trapMessages.push(String(trapRecord.message || trapRecord.category || 'Router trap'));
                continue;
            }
            if (type === '!done') {
                if (trapMessages.length)
                    throw new Error(trapMessages.join('; '));
                return rows;
            }
        }
    }
    async readSentence() {
        if (this.queue.length > 0) {
            return this.queue.shift();
        }
        return new Promise((resolve, reject) => {
            this.pendingResolve = resolve;
            this.pendingReject = reject;
        });
    }
    handleChunk(chunk) {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        let offset = 0;
        while (offset < this.buffer.length) {
            const decoded = decodeRouterLength(this.buffer, offset);
            if (!decoded)
                break;
            if (offset + decoded.size + decoded.length > this.buffer.length)
                break;
            offset += decoded.size;
            if (decoded.length === 0) {
                this.pushSentence(this.currentSentence);
                this.currentSentence = [];
                continue;
            }
            const word = this.buffer.slice(offset, offset + decoded.length).toString('utf8');
            this.currentSentence.push(word);
            offset += decoded.length;
        }
        this.buffer = this.buffer.slice(offset);
    }
    pushSentence(sentence) {
        if (this.pendingResolve) {
            const resolve = this.pendingResolve;
            this.pendingResolve = null;
            this.pendingReject = null;
            resolve(sentence);
            return;
        }
        this.queue.push(sentence);
    }
}
function isManagedInterface(iface) {
    const haystack = `${iface.name || ''} ${iface.comment || ''} ${iface.type || ''}`.toLowerCase();
    if (!LAB_INTERFACE_TERMS.length)
        return iface.type === 'vlan';
    return LAB_INTERFACE_TERMS.some((term) => haystack.includes(term));
}
function isKnownLabVlan(name) {
    const normalized = String(name || '').trim().toLowerCase();
    return LABS_ONLY_VLANS.some((vlan) => vlan.trim().toLowerCase() === normalized);
}
function natBlockComment(ifaceName) {
    return `${NAT_BLOCK_COMMENT_PREFIX}:${ifaceName}`;
}
function isTruthyRouterDisabled(value) {
    const normalized = String(value ?? '').toLowerCase();
    return normalized === 'true' || normalized === 'yes';
}
function findNatBlockRule(rules, ifaceName) {
    const expectedComment = natBlockComment(ifaceName).toLowerCase();
    const normalizedIface = ifaceName.toLowerCase();
    return rules.find((rule) => String(rule.comment || '').toLowerCase() === expectedComment) ||
        rules.find((rule) => String(rule.comment || '').toLowerCase() === `fti:${normalizedIface}`) ||
        rules.find((rule) => rule.chain === 'srcnat' &&
            rule.action === 'accept' &&
            String(rule['in-interface'] || '').toLowerCase() === normalizedIface &&
            hasMatchingWanTarget(rule) &&
            String(rule.comment || '').toLowerCase().startsWith(NAT_BLOCK_COMMENT_PREFIX.toLowerCase()));
}
function hasMatchingWanTarget(rule) {
    return ((WAN_INTERFACE && rule['out-interface'] === WAN_INTERFACE) ||
        (WAN_INTERFACE_LIST && rule['out-interface-list'] === WAN_INTERFACE_LIST) ||
        (!rule['out-interface'] && !rule['out-interface-list']));
}
// ---- Per-MAC internet access control helpers ----
function normalizeMacAddress(value) {
    const raw = String(value ?? '').trim().replace(/[-\s]/g, ':').toUpperCase();
    if (!/^[0-9A-F]{2}(:[0-9A-F]{2}){5}$/.test(raw))
        return null;
    return raw;
}
const MAC_RULE_ACTIONS = ['drop', 'accept'];
function normalizeMacRuleAction(value, fallback = 'drop') {
    const normalized = String(value ?? '').trim().toLowerCase();
    return MAC_RULE_ACTIONS.includes(normalized) ? normalized : fallback;
}
function macBlockComment(macAddress, label, action = 'drop') {
    const cleanLabel = String(label ?? '').replace(/\|/g, ' ').trim().slice(0, 64);
    const cleanAction = normalizeMacRuleAction(action);
    return `${MAC_BLOCK_COMMENT_PREFIX}:${macAddress}${cleanLabel ? ` | ${cleanLabel}` : ''} | ACTION:${cleanAction}`;
}
function isMacBlockRule(rule) {
    return String(rule.comment || '')
        .toUpperCase()
        .startsWith(`${MAC_BLOCK_COMMENT_PREFIX.toUpperCase()}:`);
}
// Comment lama (tanpa "| ACTION:...") tetap dibaca sebagai action=drop -> entri lama aman.
function parseMacBlockComment(comment) {
    const raw = String(comment || '').slice(MAC_BLOCK_COMMENT_PREFIX.length + 1);
    const segments = raw.split('|').map((segment) => segment.trim());
    const macFromComment = normalizeMacAddress(segments[0] || '') || '';
    let action = '';
    const labelParts = [];
    segments.slice(1).forEach((segment) => {
        const match = /^action\s*[:=]\s*(drop|accept)$/i.exec(segment);
        if (match) {
            action = match[1].toLowerCase();
            return;
        }
        if (segment)
            labelParts.push(segment);
    });
    return { macFromComment, label: labelParts.join(' | ').trim(), action };
}
function withWanMatcher(target) {
    if (WAN_INTERFACE)
        target['out-interface'] = WAN_INTERFACE;
    else if (WAN_INTERFACE_LIST)
        target['out-interface-list'] = WAN_INTERFACE_LIST;
    return target;
}
function findStudentNatRule(rules, subnetCidr) {
    if (!subnetCidr)
        return undefined;
    const cleanSubnet = subnetCidr.trim().toLowerCase();
    return rules.find((rule) => {
        const comment = String(rule.comment || '').toLowerCase();
        const action = String(rule.action || '').toLowerCase();
        const chain = String(rule.chain || '').toLowerCase();
        const srcAddr = String(rule['src-address'] || '').trim().toLowerCase();
        return (chain === 'srcnat' &&
            (action === 'src-nat' || action === 'masquerade') &&
            srcAddr === cleanSubnet &&
            hasMatchingWanTarget(rule) &&
            !comment.includes('pengajar'));
    });
}
function findTeacherNatRule(rules, teacherIp) {
    if (!teacherIp)
        return undefined;
    const cleanIp = teacherIp.trim().toLowerCase();
    return rules.find((rule) => {
        const action = String(rule.action || '').toLowerCase();
        const chain = String(rule.chain || '').toLowerCase();
        const srcAddr = String(rule['src-address'] || '').trim().toLowerCase();
        return (chain === 'srcnat' &&
            (action === 'src-nat' || action === 'masquerade') &&
            srcAddr === cleanIp &&
            hasMatchingWanTarget(rule));
    });
}
function isTruthyDisabled(value) {
    const normalized = String(value ?? '').toLowerCase();
    return normalized === 'true' || normalized === 'yes';
}
function formatPolicyStatus(disabled) {
    return isTruthyDisabled(disabled) ? 'disabled' : 'active';
}
function findPolicyListRefs(rule) {
    return [rule['dst-address-list'], rule['src-address-list']].filter(Boolean).map(String);
}
function buildPolicyMatcher(rule) {
    const parts = [];
    if (rule['layer7-protocol'])
        parts.push(`L7: ${rule['layer7-protocol']}`);
    if (rule['tls-host'])
        parts.push(`TLS: ${rule['tls-host']}`);
    if (rule.content)
        parts.push(`Content: ${rule.content}`);
    const listRefs = findPolicyListRefs(rule);
    if (listRefs.length)
        parts.push(`List: ${listRefs.join(', ')}`);
    if (rule['dst-port'])
        parts.push(`Port: ${rule['dst-port']}`);
    return parts.join(' | ') || rule.comment || 'General rule';
}
function hasBlacklistHint(value) {
    return /blok|block|blacklist|porno|adult|openai|chatgpt|drive|onedrive|terabox|easyworship|adobe/i.test(String(value || ''));
}
function hasWhitelistHint(value) {
    return /allow|acc|buka|whitelist|permit|netacad|dev/i.test(String(value || ''));
}
function isBlockPolicyRule(rule) {
    const action = String(rule.action || '').toLowerCase();
    return (['drop', 'reject'].includes(action) &&
        (Boolean(rule['layer7-protocol']) ||
            Boolean(rule['tls-host']) ||
            Boolean(rule.content) ||
            findPolicyListRefs(rule).length > 0 ||
            hasBlacklistHint(rule.comment)));
}
function isWhitelistPolicyRule(rule) {
    const action = String(rule.action || '').toLowerCase();
    return (action === 'accept' &&
        (Boolean(rule['layer7-protocol']) ||
            Boolean(rule['tls-host']) ||
            Boolean(rule.content) ||
            findPolicyListRefs(rule).length > 0 ||
            hasWhitelistHint(rule.comment)));
}
function summarizePolicyRule(rule, source) {
    const listRefs = findPolicyListRefs(rule);
    const references = [
        ...listRefs.map((listName) => `Address List: ${listName}`),
        ...(rule['layer7-protocol'] ? [`Layer7: ${rule['layer7-protocol']}`] : []),
    ];
    return {
        id: `${source}-${rule['.id'] || rule.id || rule.comment || Math.random().toString(36).slice(2)}`,
        name: rule.comment || rule['layer7-protocol'] || rule['tls-host'] || listRefs[0] || `${source} rule`,
        action: String(rule.action || '').toLowerCase(),
        status: formatPolicyStatus(rule.disabled),
        source,
        matcher: buildPolicyMatcher(rule),
        references,
    };
}
function summarizeBlacklistResources(listNames, layer7Names) {
    const addressListResources = [...new Set(listNames.filter(Boolean))].map((name) => ({
        id: `address-list-${name}`,
        type: 'address-list',
        name,
        status: 'active',
        totalEntries: null,
        sampleTargets: [],
    }));
    const layer7Resources = [...new Set(layer7Names.filter(Boolean))].map((name) => ({
        id: `layer7-${name}`,
        type: 'layer7',
        name,
        status: 'active',
        totalEntries: 1,
        sampleTargets: [name],
    }));
    return [...addressListResources, ...layer7Resources];
}
function buildInterfaceAddressMap(rows) {
    const addressMap = new Map();
    for (const row of rows) {
        const ifaceName = String(row.interface || '').trim();
        const address = String(row.address || '').trim();
        if (!ifaceName || !address || !address.includes('.') || !address.includes('/')) {
            continue;
        }
        if (!addressMap.has(ifaceName)) addressMap.set(ifaceName, address);
        const lower = ifaceName.toLowerCase();
        if (!addressMap.has(lower)) addressMap.set(lower, address);
        const normalized = lower.replace(/\s+/g, '');
        if (!addressMap.has(normalized)) addressMap.set(normalized, address);
    }
    return addressMap;
}
function findInterfaceCidr(iface, addressMap, addressRows) {
    if (!iface || !iface.name) return null;
    const name = String(iface.name || '').trim();
    const lower = name.toLowerCase();
    const normalized = lower.replace(/\s+/g, '');
    let cidr = addressMap.get(name) || addressMap.get(lower) || addressMap.get(normalized);
    if (cidr) return cidr;

    const labCode = extractLabCode(name) || extractLabCode(iface.comment || '');
    if (labCode && addressRows && Array.isArray(addressRows)) {
        const match = addressRows.find((row) => {
            const ifName = String(row.interface || '').toLowerCase();
            const addr = String(row.address || '');
            return addr.includes('/') && (ifName.includes(labCode) || extractLabCode(ifName) === labCode);
        });
        if (match?.address) return match.address;
    }

    if (addressRows && Array.isArray(addressRows)) {
        const match = addressRows.find((row) => {
            const ifName = String(row.interface || '').toLowerCase();
            const addr = String(row.address || '');
            return addr.includes('/') && (lower.includes(ifName) || ifName.includes(lower));
        });
        if (match?.address) return match.address;
    }
    return null;
}
function mapInterface(iface) {
    const disabled = String(iface.disabled ?? 'false').toLowerCase();
    const running = iface.running === undefined ? disabled !== 'true' && disabled !== 'yes' : toBoolean(iface.running);
    const interfaceEnabled = disabled !== 'true' && disabled !== 'yes';
    return {
        id: iface['.id'] || iface.id || iface.name,
        name: iface.name || 'unnamed-interface',
        enabled: interfaceEnabled,
        running,
        type: iface.type,
        comment: iface.comment,
        interfaceEnabled,
        internetBlocked: false,
    };
}
function extractLabCode(value) {
    if (!value)
        return null;
    const match = String(value).match(/(\d{3})/);
    return match ? match[1] : null;
}
function toRouterNumber(value) {
    const parsed = Number(String(value ?? '').trim());
    return Number.isFinite(parsed) ? parsed : 0;
}
function toMbps(bitsPerSecond) {
    return Number((bitsPerSecond / 1_000_000).toFixed(2));
}
async function monitorInterfaceTraffic(client, ifaceName, fallbackId = ifaceName) {
    try {
        const rows = await client.execute('/interface/monitor-traffic', {
            interface: ifaceName,
            once: '',
        });
        const traffic = rows[0] || {};
        return {
            id: fallbackId,
            name: ifaceName,
            rxRate: Number(traffic['rx-bits-per-second'] || 0),
            txRate: Number(traffic['tx-bits-per-second'] || 0),
        };
    }
    catch {
        return {
            id: fallbackId,
            name: ifaceName,
            rxRate: 0,
            txRate: 0,
        };
    }
}
function findQueueTreeRule(queueRows, iface) {
    const labCode = extractLabCode(iface.name) || extractLabCode(iface.comment);
    if (!labCode)
        return undefined;
    const normalizedCode = labCode.toLowerCase();
    const candidates = queueRows.filter((row) => {
        const name = String(row.name || '').toLowerCase();
        const comment = String(row.comment || '').toLowerCase();
        const packetMark = String(row['packet-mark'] || '').toLowerCase();
        return (name === normalizedCode ||
            comment === `qtree${normalizedCode}` ||
            packetMark === `${normalizedCode}-packet`);
    });
    if (!candidates.length)
        return undefined;
    return candidates.sort((left, right) => {
        const leftParentScore = String(left.parent || '').toLowerCase().includes('parent-all-lab') ? 1 : 0;
        const rightParentScore = String(right.parent || '').toLowerCase().includes('parent-all-lab') ? 1 : 0;
        return rightParentScore - leftParentScore;
    })[0];
}
async function withRouter(handler) {
    const client = new RouterApiClient();
    try {
        await client.connect();
        await client.login(ROUTER_USER || 'admin', ROUTER_PASS);
        return await handler(client);
    }
    finally {
        client.close();
    }
}
async function runRouterCommand(command, options) {
    return withRouter((client) => client.execute(command, options));
}
// ---- Cache + dedupe baca RouterOS (READ-ONLY) ----
// Setiap sesi RouterOS menulis 1 baris log "user ... logged in ... via api" + 1 baris logout.
// Karena itu pembacaan snapshot ditahan sebentar (TTL) dan request bersamaan berbagi SATU sesi.
// Ini murni jalur baca: tidak ada perintah konfigurasi dan tidak ada perubahan di router.
const routerReadCache = new Map();
const routerReadInFlight = new Map();
function invalidateRouterReadCache(...keys) {
    if (!keys.length) {
        routerReadCache.clear();
        return;
    }
    for (const key of keys)
        routerReadCache.delete(key);
}
async function readThroughCache(key, ttlMs, loader, { force = false } = {}) {
    if (!force) {
        const cached = routerReadCache.get(key);
        if (cached && (Date.now() - cached.at) < ttlMs)
            return cached.data;
        const pending = routerReadInFlight.get(key);
        if (pending)
            return pending;
    }
    const run = withHardTimeout(Promise.resolve().then(loader), ROUTER_READ_TIMEOUT_MS, `Baca ${key}`)
        .then((data) => {
        routerReadCache.set(key, { at: Date.now(), data });
        return data;
    })
        .finally(() => {
        routerReadInFlight.delete(key);
    });
    routerReadInFlight.set(key, run);
    return run;
}
// Satu koneksi untuk SELURUH snapshot (resource + interface + ip address + nat + queue tree).
// Dulu /api/router/status dan /api/interfaces membuka sesi masing-masing, dan
// /api/interfaces/traffic membuka sesi ketiga hanya untuk membaca ulang daftar interface.
async function readRouterSnapshot() {
    return withRouter(async (client) => {
        const resourceRows = await client.execute('/system/resource/print');
        const interfaceRows = await client.execute('/interface/print', {
            '.proplist': '.id,name,disabled,type,comment,running',
        });
        const addressRows = await client.execute('/ip/address/print', {
            '.proplist': 'interface,address,disabled',
        });
        const natRules = await client.execute('/ip/firewall/nat/print', {
            '.proplist': '.id,chain,action,disabled,comment,in-interface,out-interface,out-interface-list,src-address',
        });
        const queueTreeRows = await client.execute('/queue/tree/print', {
            '.proplist': '.id,name,parent,packet-mark,limit-at,max-limit,disabled,comment',
        });
        return { resource: resourceRows[0] || {}, interfaceRows, addressRows, natRules, queueTreeRows };
    });
}
async function getRouterSnapshot({ force = false } = {}) {
    return readThroughCache('router-snapshot', ROUTER_READ_CACHE_MS, readRouterSnapshot, { force });
}
async function getLabInterfaces({ force = false } = {}) {
    return buildManagedInterfaces(await getRouterSnapshot({ force }));
}
function buildManagedInterfaces({ interfaceRows: rows, addressRows, natRules, queueTreeRows }) {
    const addressMap = buildInterfaceAddressMap(addressRows);
    const managedInterfaces = rows.filter(isManagedInterface).map((row) => {
        const iface = mapInterface(row);
        const interfaceCidr = findInterfaceCidr(iface, addressMap, addressRows);
        const subnetCidr = networkCidrFromCidr(interfaceCidr);
        const fallbackMock = mockInterfaces.find(m =>
            m.name.toLowerCase().replace(/\s+/g, '') === iface.name.toLowerCase().replace(/\s+/g, '') ||
            (extractLabCode(m.name) && extractLabCode(m.name) === extractLabCode(iface.name))
        );
        const teacherIp = teacherIpFromCidr(interfaceCidr) || fallbackMock?.teacherIp || undefined;
        const studentNatRule = findStudentNatRule(natRules, subnetCidr || undefined);
        const teacherNatRule = findTeacherNatRule(natRules, teacherIp || undefined);
        const natBlockRule = findNatBlockRule(natRules, iface.name);
        const queueTreeRule = findQueueTreeRule(queueTreeRows, iface);
        const studentsEnabled = studentNatRule ? isTruthyRouterDisabled(studentNatRule.disabled) === false : !natBlockRule;
        const internetBlocked = studentNatRule ? isTruthyRouterDisabled(studentNatRule.disabled) : !!natBlockRule && !isTruthyRouterDisabled(natBlockRule.disabled);
        const bandwidthLimit = queueTreeRule ? toRouterNumber(queueTreeRule['max-limit']) : 0;
        return {
            ...iface,
            enabled: studentsEnabled,
            internetBlocked,
            natRuleId: studentNatRule?.['.id'] || natBlockRule?.['.id'],
            teacherIp: teacherIp || undefined,
            queueTreeId: queueTreeRule?.['.id'],
            queueTreeName: queueTreeRule?.name,
            bandwidthEnabled: queueTreeRule ? !isTruthyRouterDisabled(queueTreeRule.disabled) : false,
            bandwidthLimit: queueTreeRule ? bandwidthLimit : undefined,
            bandwidthLimitMbps: queueTreeRule ? toMbps(bandwidthLimit) : undefined,
            hasQueueTree: !!queueTreeRule,
            teacherInternetEnabled: teacherNatRule ? !isTruthyRouterDisabled(teacherNatRule.disabled) : false,
        };
    });
    return managedInterfaces;
}
// Semua monitor-traffic (interface lab + uplink) dibaca dalam SATU koneksi, lalu ditahan
// singkat supaya dua request browser pada tick yang sama tidak membuka dua sesi RouterOS.
// Perintah monitor-traffic tetap sama seperti sebelumnya (once=, ~1 detik per interface).
async function readRouterTraffic(ifaces) {
    return withRouter(async (client) => {
        const interfaces = [];
        for (const iface of ifaces) {
            interfaces.push(await monitorInterfaceTraffic(client, iface.name, iface.id));
        }
        const uplinkName = UPLINK_INTERFACE || 'ether2-backboneUKSW';
        const uplink = await monitorInterfaceTraffic(client, uplinkName, 'uplink');
        return { interfaces, uplink };
    });
}
async function getRouterTraffic(ifaces, { force = false } = {}) {
    return readThroughCache('router-traffic', ROUTER_TRAFFIC_CACHE_MS, () => readRouterTraffic(ifaces), { force });
}
async function getTrafficForInterfaces(ifaces) {
    return (await getRouterTraffic(ifaces)).interfaces;
}
async function getUplinkTraffic() {
    const ifaces = await getLabInterfaces();
    return (await getRouterTraffic(ifaces)).uplink;
}
function mockTraffic() {
    return mockInterfaces.map((iface) => ({
        id: iface.id,
        name: iface.name,
        rxRate: iface.enabled ? Math.floor(Math.random() * 3_000_000) + 80_000 : 0,
        txRate: iface.enabled ? Math.floor(Math.random() * 900_000) + 20_000 : 0,
    }));
}
function mockUplinkTraffic() {
    return {
        id: 'uplink',
        name: UPLINK_INTERFACE || 'ether2-backboneUKSW',
        rxRate: Math.floor(Math.random() * 180_000_000) + 40_000_000,
        txRate: Math.floor(Math.random() * 120_000_000) + 20_000_000,
    };
}
async function getSitePolicies() {
    return withRouter(async (client) => {
        const filterRows = await client.execute('/ip/firewall/filter/print', {
            '.proplist': '.id,chain,action,disabled,comment,content,tls-host,layer7-protocol,src-address-list,dst-address-list,protocol,dst-port',
        });
        const blockRules = filterRows.filter(isBlockPolicyRule).map((rule) => summarizePolicyRule(rule, 'firewall-filter'));
        const whitelistRules = filterRows.filter(isWhitelistPolicyRule).map((rule) => summarizePolicyRule(rule, 'firewall-filter'));
        const referencedLists = new Set();
        const referencedL7Names = new Set();
        for (const rule of blockRules) {
            for (const reference of rule.references) {
                if (reference.startsWith('Address List: ')) {
                    referencedLists.add(reference.replace('Address List: ', ''));
                }
                if (reference.startsWith('Layer7: ')) {
                    referencedL7Names.add(reference.replace('Layer7: ', ''));
                }
            }
        }
        return {
            blockRules,
            whitelistRules,
            blacklistResources: summarizeBlacklistResources([...referencedLists], [...referencedL7Names]),
        };
    });
}
function mapAddressListEntry(row) {
    return {
        id: row['.id'] || row.id,
        list: String(row.list || ''),
        address: String(row.address || ''),
        comment: String(row.comment || ''),
        disabled: isTruthyDisabled(row.disabled),
    };
}
function isIpv4Address(value) {
    return /^(\d{1,3}\.){3}\d{1,3}$/.test(String(value || '').trim());
}
function isLikelyHostname(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized || normalized.includes('/') || normalized.includes(' ') || normalized.includes('*'))
        return false;
    if (isIpv4Address(normalized))
        return false;
    return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(normalized);
}
function buildPolicyTargets(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (!isLikelyHostname(normalized))
        return [String(value || '').trim()].filter(Boolean);
    const rootHost = normalized.replace(/^www\./, '');
    return [...new Set([rootHost, `www.${rootHost}`])];
}
function buildStrictPolicyTargets(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (!isLikelyHostname(normalized))
        return [];
    const rootHost = normalized.replace(/^www\./, '');
    return [...new Set([rootHost, `*.${rootHost}`])];
}
function strictPolicyRuleComment(listName, target) {
    return `${STRICT_POLICY_COMMENT_PREFIX} ${listName} ${target}`;
}
function hasStrictPolicyRuleForTarget(filterRows, listName, target) {
    const expectedComment = strictPolicyRuleComment(listName, target);
    return filterRows.some((row) => String(row.comment || '') === expectedComment);
}
function findStrictPolicyRuleIds(filterRows, listName, value) {
    return filterRows
        .filter((row) => buildStrictPolicyTargets(value).some((target) => String(row.comment || '') === strictPolicyRuleComment(listName, target)))
        .map((row) => String(row['.id'] || row.id || ''))
        .filter(Boolean);
}
function findStrictPolicyPlaceBefore(filterRows) {
    const firstBlockRule = filterRows.find((row) => isBlockPolicyRule(row));
    return firstBlockRule?.['.id'];
}
async function addStrictBlacklistRules(client, listName, value) {
    const strictTargets = buildStrictPolicyTargets(value);
    if (!strictTargets.length)
        return 0;
    const filterRows = await client.execute('/ip/firewall/filter/print', {
        '.proplist': '.id,chain,action,disabled,comment,tls-host,layer7-protocol,src-address-list,dst-address-list,content',
    });
    const placeBefore = findStrictPolicyPlaceBefore(filterRows);
    let addedCount = 0;
    for (const target of strictTargets) {
        if (hasStrictPolicyRuleForTarget(filterRows, listName, target))
            continue;
        const params = {
            chain: 'forward',
            action: 'drop',
            'tls-host': target,
            comment: strictPolicyRuleComment(listName, target),
            disabled: 'no',
        };
        if (placeBefore) {
            params['place-before'] = placeBefore;
        }
        try {
            await client.execute('/ip/firewall/filter/add', params);
        }
        catch (error) {
            if (!params['place-before'])
                throw error;
            delete params['place-before'];
            await client.execute('/ip/firewall/filter/add', params);
        }
        addedCount += 1;
    }
    return addedCount;
}
async function removeStrictBlacklistRules(client, listName, value) {
    const filterRows = await client.execute('/ip/firewall/filter/print', {
        '.proplist': '.id,comment',
    });
    const ruleIds = findStrictPolicyRuleIds(filterRows, listName, value);
    for (const ruleId of ruleIds) {
        try {
            await client.execute('/ip/firewall/filter/remove', {
                '.id': ruleId,
            });
        }
        catch {
            // ignore already removed rules
        }
    }
    return ruleIds.length;
}
async function getAddressListEntries(listName) {
    return withRouter(async (client) => {
        const rows = await client.execute('/ip/firewall/address-list/print', {
            '.proplist': '.id,list,address,comment,disabled',
        });
        return rows
            .filter((row) => String(row.list || '') === listName)
            .map(mapAddressListEntry)
            .sort((left, right) => left.address.localeCompare(right.address, undefined, { sensitivity: 'base' }));
    });
}
async function addAddressListEntry(listName, address, comment = '', options = {}) {
    return withRouter(async (client) => {
        const rows = await client.execute('/ip/firewall/address-list/print', {
            '.proplist': '.id,list,address',
        });
        const existingTargets = new Set(rows
            .filter((row) => String(row.list || '') === listName)
            .map((row) => String(row.address || '').trim().toLowerCase()));
        for (const target of buildPolicyTargets(address)) {
            if (!target || existingTargets.has(target.toLowerCase()))
                continue;
            await client.execute('/ip/firewall/address-list/add', {
                list: listName,
                address: target,
                comment,
                disabled: 'no',
            });
        }
        if (options.strictBlacklist) {
            await addStrictBlacklistRules(client, listName, address);
        }
        return getAddressListEntries(listName);
    });
}
async function updateAddressListEntry(entryId, payload) {
    return withRouter(async (client) => {
        const rows = await client.execute('/ip/firewall/address-list/print', {
            '.proplist': '.id,list,address,comment,disabled',
        });
        const current = rows.find((row) => String(row['.id'] || row.id) === entryId);
        if (!current) {
            const missingEntry = new Error('Entry address-list tidak ditemukan');
            missingEntry.statusCode = 404;
            throw missingEntry;
        }
        const currentListName = String(current.list || '');
        const currentAddress = String(current.address || '');
        const nextAddress = payload.address ?? current.address;
        const nextComment = payload.comment ?? current.comment ?? '';
        const nextDisabled = typeof payload.disabled === 'boolean'
            ? (payload.disabled ? 'yes' : 'no')
            : (isTruthyDisabled(current.disabled) ? 'yes' : 'no');
        const filterRows = await client.execute('/ip/firewall/filter/print', {
            '.proplist': '.id,comment',
        });
        const shouldSyncStrictRules = Boolean(payload.strictBlacklist) || findStrictPolicyRuleIds(filterRows, currentListName, currentAddress).length > 0;
        await client.execute('/ip/firewall/address-list/set', {
            '.id': entryId,
            address: nextAddress,
            comment: nextComment,
            disabled: nextDisabled,
        });
        if (shouldSyncStrictRules) {
            await removeStrictBlacklistRules(client, currentListName, currentAddress);
            if (!payload.disabled) {
                await addStrictBlacklistRules(client, currentListName, nextAddress);
            }
        }
        return getAddressListEntries(currentListName);
    });
}
async function deleteAddressListEntry(entryId) {
    return withRouter(async (client) => {
        const rows = await client.execute('/ip/firewall/address-list/print', {
            '.proplist': '.id,list,address,comment,disabled',
        });
        const current = rows.find((row) => String(row['.id'] || row.id) === entryId);
        if (!current) {
            const missingEntry = new Error('Entry address-list tidak ditemukan');
            missingEntry.statusCode = 404;
            throw missingEntry;
        }
        const listName = String(current.list || '');
        const currentAddress = String(current.address || '');
        await client.execute('/ip/firewall/address-list/remove', {
            '.id': entryId,
        });
        await removeStrictBlacklistRules(client, listName, currentAddress);
        return {
            listName,
            entries: await getAddressListEntries(listName),
        };
    });
}
function policyRuleComment(listName, type) {
    return type === 'whitelist' ? `ACC ${listName}` : `LABGUARD_BLOCK ${listName}`;
}
async function createPolicyList(listName, type, initialEntries = [], options = {}) {
    return withRouter(async (client) => {
        const filterRows = await client.execute('/ip/firewall/filter/print', {
            '.proplist': '.id,chain,action,disabled,comment,dst-address-list,src-address-list',
        });
        const expectedComment = policyRuleComment(listName, type);
        const alreadyExists = filterRows.find((row) => String(row.comment || '') === expectedComment);
        if (alreadyExists) {
            const duplicateError = new Error(`Rule "${expectedComment}" sudah ada di firewall filter`);
            duplicateError.statusCode = 409;
            throw duplicateError;
        }
        const action = type === 'whitelist' ? 'accept' : 'drop';
        const ruleParams = {
            chain: 'forward',
            action,
            'dst-address-list': listName,
            comment: expectedComment,
        };
        if (type === 'whitelist') {
            const firstBlockIndex = filterRows.findIndex(isBlockPolicyRule);
            if (firstBlockIndex >= 0) {
                const blockRuleId = filterRows[firstBlockIndex]['.id'];
                if (blockRuleId) {
                    ruleParams['place-before'] = blockRuleId;
                }
            }
        }
        await client.execute('/ip/firewall/filter/add', ruleParams);
        const seededTargets = new Set();
        for (const address of initialEntries) {
            const trimmed = address.trim();
            if (!trimmed)
                continue;
            for (const target of buildPolicyTargets(trimmed)) {
                if (target) {
                    seededTargets.add(target);
                }
            }
        }
        for (const target of seededTargets) {
            try {
                await client.execute('/ip/firewall/address-list/add', {
                    list: listName,
                    address: target,
                    comment: `Added by Labguard`,
                    disabled: 'no',
                });
            }
            catch {
                // skip duplicate or invalid entries
            }
        }
        if (type === 'blacklist' && options.strictBlacklist) {
            const strictEntries = [...new Set(initialEntries.map((entry) => String(entry || '').trim()).filter(Boolean))];
            for (const entry of strictEntries) {
                await addStrictBlacklistRules(client, listName, entry);
            }
        }
        return { listName, type, comment: expectedComment };
    });
}
async function deletePolicyList(listName, type) {
    return withRouter(async (client) => {
        const filterRows = await client.execute('/ip/firewall/filter/print', {
            '.proplist': '.id,chain,action,disabled,comment,dst-address-list,src-address-list',
        });
        const expectedComment = policyRuleComment(listName, type);
        const ruleToDelete = filterRows.find((row) => String(row.comment || '') === expectedComment);
        if (ruleToDelete) {
            await client.execute('/ip/firewall/filter/remove', {
                '.id': ruleToDelete['.id'],
            });
        }
        const strictRulePrefix = `${STRICT_POLICY_COMMENT_PREFIX} ${listName} `;
        const strictRulesToDelete = filterRows.filter((row) => String(row.comment || '').startsWith(strictRulePrefix));
        for (const rule of strictRulesToDelete) {
            try {
                await client.execute('/ip/firewall/filter/remove', {
                    '.id': rule['.id'],
                });
            }
            catch {
                // skip already-removed rules
            }
        }
        const addressListRows = await client.execute('/ip/firewall/address-list/print', {
            '.proplist': '.id,list',
        });
        const entriesToDelete = addressListRows.filter((row) => String(row.list || '') === listName);
        for (const entry of entriesToDelete) {
            try {
                await client.execute('/ip/firewall/address-list/remove', {
                    '.id': entry['.id'],
                });
            } catch {
                // skip already-removed entries
            }
        }
        return { listName, type, deletedRule: !!ruleToDelete, deletedEntries: entriesToDelete.length };
    });
}
async function setInternetAccessByNat(interfaceId, internetEnabled) {
    return withRouter(async (client) => {
        const interfaceRows = await client.execute('/interface/print', {
            '.proplist': '.id,name,type,comment',
        });
        const addressRows = await client.execute('/ip/address/print', {
            '.proplist': 'interface,address,disabled',
        });
        // PENTING: map alamat harus dibangun di sini. Sebelumnya fungsi ini memakai
        // `addressMap` yang hanya ada di scope getLabInterfaces() -> ReferenceError
        // "addressMap is not defined" -> endpoint toggle selalu 500 (tombol mati).
        const addressMap = buildInterfaceAddressMap(addressRows);
        const iface = interfaceRows
            .filter(isManagedInterface)
            .map(mapInterface)
            .find((item) => item.id === interfaceId);
        if (!iface) {
            const notFound = new Error('Interface lab tidak ditemukan');
            notFound.statusCode = 404;
            throw notFound;
        }
        const interfaceCidr = findInterfaceCidr(iface, addressMap, addressRows);
        const fallbackMock = mockInterfaces.find(m =>
            m.name.toLowerCase().replace(/\s+/g, '') === iface.name.toLowerCase().replace(/\s+/g, '') ||
            (extractLabCode(m.name) && extractLabCode(m.name) === extractLabCode(iface.name))
        );
        const teacherIp = teacherIpFromCidr(interfaceCidr) || fallbackMock?.teacherIp || undefined;
        const subnetCidr = networkCidrFromCidr(interfaceCidr) || (teacherIp ? `${teacherIp.substring(0, teacherIp.lastIndexOf('.'))}.0/26` : null);
        if (!teacherIp || !subnetCidr) {
            const invalidSubnet = new Error(`Subnet untuk ${iface.name} tidak bisa dibaca, jadi status mahasiswa tidak bisa dikontrol`);
            invalidSubnet.statusCode = 400;
            throw invalidSubnet;
        }
        const natRules = await client.execute('/ip/firewall/nat/print', {
            '.proplist': '.id,chain,action,disabled,comment,in-interface,out-interface,out-interface-list,src-address',
        });
        const studentNatRule = findStudentNatRule(natRules, subnetCidr);
        const natRule = findNatBlockRule(natRules, iface.name);
        if (studentNatRule?.['.id']) {
            await client.execute('/ip/firewall/nat/set', {
                '.id': studentNatRule['.id'],
                disabled: internetEnabled ? 'no' : 'yes',
            });
            return {
                iface,
                natRuleId: studentNatRule['.id'],
                teacherIp,
            };
        }
        if (natRule?.['.id']) {
            await client.execute('/ip/firewall/nat/set', {
                '.id': natRule['.id'],
                disabled: internetEnabled ? 'yes' : 'no',
            });
            return { iface, natRuleId: natRule['.id'] };
        }
        if (internetEnabled) {
            return { iface, natRuleId: undefined };
        }
        // Pengaman: jangan buat rule blokir baru untuk interface yang bukan VLAN lab
        // (grid memuat semua interface ber-kata "vlan", termasuk hotspot/DMZ/backbone).
        if (!isKnownLabVlan(iface.name)) {
            const notLab = new Error(`Interface ${iface.name} bukan VLAN lab dan tidak punya rule NAT mahasiswa, jadi tidak bisa diblokir dari panel ini`);
            notLab.statusCode = 400;
            throw notLab;
        }
        const addOptions = {
            chain: 'srcnat',
            action: 'accept',
            'in-interface': iface.name,
            'src-address': `!${teacherIp}`,
            comment: natBlockComment(iface.name),
            disabled: 'no',
        };
        if (WAN_INTERFACE) {
            addOptions['out-interface'] = WAN_INTERFACE;
        }
        else if (WAN_INTERFACE_LIST) {
            addOptions['out-interface-list'] = WAN_INTERFACE_LIST;
        }
        if (NAT_PLACE_BEFORE) {
            addOptions['place-before'] = NAT_PLACE_BEFORE;
        }
        let addRows = [];
        try {
            addRows = await client.execute('/ip/firewall/nat/add', addOptions);
        }
        catch (error) {
            if (!addOptions['place-before'])
                throw error;
            delete addOptions['place-before'];
            addRows = await client.execute('/ip/firewall/nat/add', addOptions);
        }
        return {
            iface,
            natRuleId: addRows[0]?.['.id'],
            teacherIp,
        };
    });
}
async function setQueueTreeBandwidth(interfaceId, bandwidthMbps) {
    return withRouter(async (client) => {
        const interfaceRows = await client.execute('/interface/print', {
            '.proplist': '.id,name,type,comment',
        });
        const iface = interfaceRows
            .filter(isManagedInterface)
            .map(mapInterface)
            .find((item) => item.id === interfaceId);
        if (!iface) {
            const notFound = new Error('Interface lab tidak ditemukan');
            notFound.statusCode = 404;
            throw notFound;
        }
        const queueTreeRows = await client.execute('/queue/tree/print', {
            '.proplist': '.id,name,parent,packet-mark,limit-at,max-limit,disabled,comment',
        });
        const queueTreeRule = findQueueTreeRule(queueTreeRows, iface);
        if (!queueTreeRule?.['.id']) {
            const missingQueue = new Error(`Queue tree untuk ${iface.name} belum ada di router`);
            missingQueue.statusCode = 404;
            throw missingQueue;
        }
        const bandwidthBits = Math.max(1, Math.round(bandwidthMbps * 1_000_000));
        await client.execute('/queue/tree/set', {
            '.id': queueTreeRule['.id'],
            'max-limit': String(bandwidthBits),
        });
        return {
            iface,
            queueTreeId: queueTreeRule['.id'],
            queueTreeName: queueTreeRule.name,
            bandwidthLimit: bandwidthBits,
            bandwidthLimitMbps: toMbps(bandwidthBits),
            bandwidthEnabled: !isTruthyRouterDisabled(queueTreeRule.disabled),
        };
    });
}
app.get('/api/config/labs-only-order', (_req, res) => {
    // Satu sumber untuk UI: daftar lab + nilai env lain yang ditampilkan di panel,
    // supaya tidak ada nilai yang di-hardcode di frontend.
    res.json({
        vlans: LABS_ONLY_VLANS,
        wanInterface: WAN_INTERFACE || WAN_INTERFACE_LIST,
        uplinkInterface: UPLINK_INTERFACE,
        labInterfaceMatch: LAB_INTERFACE_TERMS,
    });
});
app.post('/api/login', (req, res) => {
    const pin = String(req.body.pin ?? req.body.password ?? '').trim();
    const remember = Boolean(req.body.remember);
    if (!/^\d{1,6}$/.test(pin)) {
        return res.status(400).json({ success: false, error: 'PIN harus angka maksimal 6 digit' });
    }
    if (pin === adminPin) {
        const session = createSessionToken(remember);
        pushLocalLog(`Admin login from ${req.ip}`, 'auth');
        return res.json({ success: true, ...session });
    }
    res.status(401).json({ success: false, error: 'PIN salah' });
});
app.get('/api/router/status', requireSession, async (_req, res) => {
    if (!HAS_CONFIG) {
        return res.json({
            status: 'simulated',
            message: 'No Router Credentials Found',
            resource: {
                'board-name': 'Cloud Core Router CCR2004',
                'cpu-load': Math.floor(Math.random() * 20) + 5,
                uptime: '26w4d12h',
                version: '7.14.2',
            },
        });
    }
    try {
        // Snapshot yang sama dipakai /api/interfaces, jadi satu tick browser = satu sesi RouterOS
        // (sebelumnya status dan daftar interface membuka sesi terpisah).
        const snapshot = await getRouterSnapshot();
        res.json({
            status: 'connected',
            resource: snapshot.resource,
            config: {
                ip: ROUTER_IP,
                user: ROUTER_USER,
            },
        });
    }
    catch (error) {
        res.status(500).json({ status: 'error', message: formatRouterError(error) });
    }
});
app.get('/api/interfaces', requireSession, async (_req, res) => {
    if (!HAS_CONFIG) {
        return res.json(mockInterfaces);
    }
    try {
        res.json(await getLabInterfaces());
    }
    catch (error) {
        res.status(500).json({ error: formatRouterError(error) });
    }
});
app.get('/api/interfaces/traffic', requireSession, async (_req, res) => {
    if (!HAS_CONFIG) {
        return res.json(mockTraffic());
    }
    try {
        const ifaces = await getLabInterfaces();
        res.json(await getTrafficForInterfaces(ifaces));
    }
    catch (error) {
        res.status(500).json({ error: formatRouterError(error) });
    }
});
app.get('/api/router/uplink-traffic', requireSession, async (_req, res) => {
    if (!HAS_CONFIG) {
        return res.json(mockUplinkTraffic());
    }
    try {
        res.json(await getUplinkTraffic());
    }
    catch (error) {
        res.status(500).json({ error: formatRouterError(error) });
    }
});
app.get('/api/site-policies', requireSession, async (_req, res) => {
    if (!HAS_CONFIG) {
        return res.json(mockSitePolicies);
    }
    try {
        res.json(await getSitePolicies());
    }
    catch (error) {
        res.status(500).json({ error: formatRouterError(error) });
    }
});
app.get('/api/site-policies/address-list/:listName', requireSession, async (req, res) => {
    const listName = decodeURIComponent(req.params.listName);
    if (!listName) {
        return res.status(400).json({ success: false, error: 'Nama address-list wajib diisi' });
    }
    if (!HAS_CONFIG) {
        return res.json({
            listName,
            entries: mockAddressListEntries[listName] || [],
        });
    }
    try {
        res.json({
            listName,
            entries: await getAddressListEntries(listName),
        });
    }
    catch (error) {
        res.status(error.statusCode || 500).json({ success: false, error: formatRouterError(error) });
    }
});
app.post('/api/site-policies/address-list', requireSession, async (req, res) => {
    const listName = String(req.body.listName || '').trim();
    const address = String(req.body.address || '').trim();
    const comment = String(req.body.comment || '').trim();
    const strictBlacklist = Boolean(req.body.strictBlacklist);
    if (!listName || !address) {
        return res.status(400).json({ success: false, error: 'Nama list dan target address wajib diisi' });
    }
    if (!HAS_CONFIG) {
        const currentEntries = mockAddressListEntries[listName] || [];
        const nextEntry = {
            id: `mock-${Date.now()}`,
            list: listName,
            address,
            comment,
            disabled: false,
        };
        mockAddressListEntries[listName] = [...currentEntries, nextEntry];
        return res.json({ success: true, listName, entries: mockAddressListEntries[listName] });
    }
    try {
        const entries = await addAddressListEntry(listName, address, comment, { strictBlacklist });
        pushLocalLog(`Address-list [${listName}] tambah target ${address}${strictBlacklist ? ' (strict tls-host)' : ''}`, 'info');
        res.json({ success: true, listName, entries });
    }
    catch (error) {
        res.status(error.statusCode || 500).json({ success: false, error: formatRouterError(error) });
    }
});
app.patch('/api/site-policies/address-list/:entryId', requireSession, async (req, res) => {
    const entryId = decodeURIComponent(req.params.entryId);
    const address = req.body.address !== undefined ? String(req.body.address || '').trim() : undefined;
    const comment = req.body.comment !== undefined ? String(req.body.comment || '').trim() : undefined;
    const disabled = typeof req.body.disabled === 'boolean' ? req.body.disabled : undefined;
    const strictBlacklist = Boolean(req.body.strictBlacklist);
    if (!entryId) {
        return res.status(400).json({ success: false, error: 'Entry id wajib diisi' });
    }
    if (!HAS_CONFIG) {
        const listName = String(req.body.listName || '').trim();
        const entries = mockAddressListEntries[listName] || [];
        const updatedEntries = entries.map((entry) => entry.id === entryId
            ? {
                ...entry,
                address: address ?? entry.address,
                comment: comment ?? entry.comment,
                disabled: disabled ?? entry.disabled,
            }
            : entry);
        mockAddressListEntries[listName] = updatedEntries;
        return res.json({ success: true, listName, entries: updatedEntries });
    }
    try {
        const entries = await updateAddressListEntry(entryId, { address, comment, disabled, strictBlacklist });
        pushLocalLog(`Address-list entry [${entryId}] diperbarui${strictBlacklist ? ' dengan strict tls-host' : ''}`, 'info');
        res.json({ success: true, entries });
    }
    catch (error) {
        res.status(error.statusCode || 500).json({ success: false, error: formatRouterError(error) });
    }
});
app.delete('/api/site-policies/address-list/:entryId', requireSession, async (req, res) => {
    const entryId = decodeURIComponent(req.params.entryId);
    const listName = String(req.body?.listName || req.query?.listName || '').trim();
    if (!entryId) {
        return res.status(400).json({ success: false, error: 'Entry id wajib diisi' });
    }
    if (!HAS_CONFIG) {
        if (!listName) {
            return res.status(400).json({ success: false, error: 'Nama list wajib diisi untuk mode simulasi' });
        }
        const entries = mockAddressListEntries[listName] || [];
        const updatedEntries = entries.filter((entry) => entry.id !== entryId);
        mockAddressListEntries[listName] = updatedEntries;
        return res.json({ success: true, listName, entries: updatedEntries });
    }
    try {
        const result = await deleteAddressListEntry(entryId);
        pushLocalLog(`Address-list entry [${entryId}] dihapus dari [${result.listName}]`, 'warning');
        res.json({ success: true, listName: result.listName, entries: result.entries });
    }
    catch (error) {
        res.status(error.statusCode || 500).json({ success: false, error: formatRouterError(error) });
    }
});
app.post('/api/site-policies/create-list', requireSession, async (req, res) => {
    const listName = String(req.body.listName || '').trim();
    const type = String(req.body.type || 'blacklist').trim().toLowerCase();
    const initialEntries = Array.isArray(req.body.initialEntries) ? req.body.initialEntries : [];
    const strictBlacklist = Boolean(req.body.strictBlacklist);
    if (!listName) {
        return res.status(400).json({ success: false, error: 'Nama list wajib diisi' });
    }
    if (type !== 'blacklist' && type !== 'whitelist') {
        return res.status(400).json({ success: false, error: 'Type harus blacklist atau whitelist' });
    }
    if (!HAS_CONFIG) {
        const comment = policyRuleComment(listName, type);
        if (type === 'blacklist') {
            const alreadyExists = mockSitePolicies.blacklistResources.find((r) => r.name === listName);
            if (alreadyExists) {
                return res.status(409).json({ success: false, error: `Blacklist "${listName}" sudah ada` });
            }
            mockSitePolicies.blockRules.push({
                id: `firewall-filter-mock-${Date.now()}`,
                name: comment,
                action: 'drop',
                status: 'active',
                source: 'firewall-filter',
                matcher: `List: ${listName}`,
                references: [`Address List: ${listName}`],
            });
            mockSitePolicies.blacklistResources.push({
                id: `address-list-${listName}`,
                type: 'address-list',
                name: listName,
                status: 'active',
                totalEntries: initialEntries.length,
                sampleTargets: initialEntries.slice(0, 3),
            });
        } else {
            const alreadyExists = mockSitePolicies.whitelistRules.find((r) => r.references?.some((ref) => ref === `Address List: ${listName}`));
            if (alreadyExists) {
                return res.status(409).json({ success: false, error: `Whitelist "${listName}" sudah ada` });
            }
            mockSitePolicies.whitelistRules.push({
                id: `firewall-filter-mock-${Date.now()}`,
                name: comment,
                action: 'accept',
                status: 'active',
                source: 'firewall-filter',
                matcher: `List: ${listName}`,
                references: [`Address List: ${listName}`],
            });
        }
        mockAddressListEntries[listName] = initialEntries
            .filter((addr) => String(addr || '').trim())
            .map((addr, idx) => ({
                id: `mock-${Date.now()}-${idx}`,
                list: listName,
                address: String(addr).trim(),
                comment: 'Added by Labguard',
                disabled: false,
            }));
        pushLocalLog(`Policy list [${listName}] (${type}) dibuat dengan ${initialEntries.length} entries`, 'success');
        return res.json({ success: true, listName, type });
    }
    try {
        const result = await createPolicyList(listName, type, initialEntries, { strictBlacklist });
        pushLocalLog(`Policy list [${result.listName}] (${type}) dibuat: ${result.comment}${strictBlacklist ? ' + strict tls-host' : ''}`, 'success');
        res.json({ success: true, ...result });
    }
    catch (error) {
        res.status(error.statusCode || 500).json({ success: false, error: formatRouterError(error) });
    }
});
app.delete('/api/site-policies/delete-list', requireSession, async (req, res) => {
    const listName = String(req.body?.listName || req.query?.listName || '').trim();
    const type = String(req.body?.type || req.query?.type || 'blacklist').trim().toLowerCase();
    if (!listName) {
        return res.status(400).json({ success: false, error: 'Nama list wajib diisi' });
    }
    if (!HAS_CONFIG) {
        if (type === 'blacklist') {
            mockSitePolicies.blockRules = mockSitePolicies.blockRules.filter(
                (r) => !r.references?.some((ref) => ref === `Address List: ${listName}`)
            );
            mockSitePolicies.blacklistResources = mockSitePolicies.blacklistResources.filter(
                (r) => r.name !== listName
            );
        } else {
            mockSitePolicies.whitelistRules = mockSitePolicies.whitelistRules.filter(
                (r) => !r.references?.some((ref) => ref === `Address List: ${listName}`)
            );
        }
        delete mockAddressListEntries[listName];
        pushLocalLog(`Policy list [${listName}] (${type}) dihapus`, 'warning');
        return res.json({ success: true, listName, type });
    }
    try {
        const result = await deletePolicyList(listName, type);
        pushLocalLog(`Policy list [${result.listName}] (${type}) dihapus — rule: ${result.deletedRule}, entries: ${result.deletedEntries}`, 'warning');
        res.json({ success: true, ...result });
    }
    catch (error) {
        res.status(error.statusCode || 500).json({ success: false, error: formatRouterError(error) });
    }
});
app.post('/api/interfaces/:id/toggle', requireSession, async (req, res) => {
    const id = decodeURIComponent(req.params.id);
    const enabled = Boolean(req.body.enabled);
    if (!HAS_CONFIG) {
        const found = mockInterfaces.find((iface) => iface.id === id);
        if (!found)
            return res.status(404).json({ success: false, error: 'Interface tidak ditemukan' });
        mockInterfaces = mockInterfaces.map((iface) => iface.id === id ? { ...iface, enabled, internetBlocked: !enabled } : iface);
        pushLocalLog(`Internet mahasiswa [${found.name}] ${enabled ? 'enabled' : 'blocked'} via NAT`, enabled ? 'success' : 'warning');
        return res.json({ success: true, simulated: true, id, enabled });
    }
    try {
        const result = await setInternetAccessByNat(id, enabled);
        pushLocalLog(`Internet mahasiswa [${result.iface.name}] ${enabled ? 'enabled' : 'blocked'} via NAT (pengajar ${result.teacherIp} tetap aktif)`, enabled ? 'success' : 'warning');
        // WAJIB: frontend langsung memanggil fetchCoreData() setelah toggle. Tanpa invalidasi,
        // /api/interfaces akan menjawab dari cache snapshot lama dan status di UI balik lagi.
        invalidateRouterReadCache('router-snapshot');
        res.json({
            success: true,
            id,
            enabled,
            internetBlocked: !enabled,
            natRuleId: result.natRuleId,
            teacherIp: result.teacherIp,
        });
    }
    catch (error) {
        res.status(error.statusCode || 500).json({ success: false, error: formatRouterError(error) });
    }
});
app.post('/api/interfaces/:id/bandwidth', requireSession, async (req, res) => {
    const id = decodeURIComponent(req.params.id);
    const bandwidthMbps = Number(req.body.bandwidthMbps);
    if (!Number.isFinite(bandwidthMbps) || bandwidthMbps <= 0) {
        return res.status(400).json({ success: false, error: 'Bandwidth harus angka lebih dari 0 Mbps' });
    }
    if (!HAS_CONFIG) {
        const found = mockInterfaces.find((iface) => iface.id === id);
        if (!found)
            return res.status(404).json({ success: false, error: 'Interface tidak ditemukan' });
        if (!found.hasQueueTree) {
            return res.status(404).json({ success: false, error: `Queue tree untuk ${found.name} belum ada di mode simulasi` });
        }
        mockInterfaces = mockInterfaces.map((iface) => iface.id === id
            ? {
                ...iface,
                bandwidthLimit: Math.round(bandwidthMbps * 1_000_000),
                bandwidthLimitMbps: Number(bandwidthMbps.toFixed(2)),
            }
            : iface);
        pushLocalLog(`Bandwidth [${found.name}] di-set ke ${bandwidthMbps} Mbps`, 'info');
        return res.json({ success: true, id, bandwidthLimitMbps: Number(bandwidthMbps.toFixed(2)) });
    }
    try {
        const result = await setQueueTreeBandwidth(id, bandwidthMbps);
        pushLocalLog(`Queue tree [${result.iface.name}] di-set ke ${result.bandwidthLimitMbps} Mbps`, 'info');
        // Sama seperti toggle: paksa pembacaan ulang supaya UI tidak menampilkan limit lama.
        invalidateRouterReadCache('router-snapshot');
        res.json({
            success: true,
            id,
            queueTreeId: result.queueTreeId,
            queueTreeName: result.queueTreeName,
            bandwidthEnabled: result.bandwidthEnabled,
            bandwidthLimit: result.bandwidthLimit,
            bandwidthLimitMbps: result.bandwidthLimitMbps,
        });
    }
    catch (error) {
        res.status(error.statusCode || 500).json({ success: false, error: formatRouterError(error) });
    }
});
app.get('/api/router/clients', requireSession, async (_req, res) => {
    if (!HAS_CONFIG) {
        return res.json({
            leases: [
                { address: '192.168.67.10', 'mac-address': '00:1B:44:11:3A:B7', 'host-name': 'Lab-467-PC-01', status: 'bound' },
                { address: '192.168.61.12', 'mac-address': 'E4:5F:01:A2:33:F1', 'host-name': 'Lab-461-PC-05', status: 'bound' },
                { address: '192.168.64.44', 'mac-address': 'BC:D0:74:11:92:02', 'host-name': 'Lab-464-Tablet', status: 'bound' },
                { address: '192.168.65.20', 'mac-address': 'AA:BB:CC:DD:EE:01', 'host-name': 'Lab-465-IoT-Node', status: 'bound' },
                { address: '192.168.68.101', 'mac-address': 'DE:AD:BE:EF:CA:FE', 'host-name': 'Lab-468-Kali-Linux', status: 'bound' },
                { address: '192.168.200.55', 'mac-address': 'F0:E1:D2:C3:B4:A5', 'host-name': 'Smartphone-Android', status: 'bound' },
            ],
        });
    }
    try {
        // leases + arp dibaca BERURUTAN dalam satu koneksi. Sebelumnya Promise.all memanggil
        // runRouterCommand dua kali = dua socket = dua baris log login di router.
        const data = await withRouter(async (client) => {
            const leases = await client.execute('/ip/dhcp-server/lease/print');
            const arp = await client.execute('/ip/arp/print');
            return { leases, arp };
        });
        res.json(data);
    }
    catch (error) {
        res.status(500).json({ error: formatRouterError(error) });
    }
});
app.get('/api/logs', requireSession, async (_req, res) => {
    if (!HAS_CONFIG) {
        return res.json(localLogs);
    }
    try {
        const rows = await runRouterCommand('/log/print', {
            '.proplist': '.id,time,topics,message',
        });
        const routerLogs = rows.slice(-20).reverse().map((row) => ({
            id: row['.id'] || `${row.time}-${row.message}`,
            time: row.time || nowTime(),
            event: row.message || row.topics || 'Router log entry',
            type: String(row.topics || '').includes('error') ? 'warning' : 'info',
        }));
        res.json([...localLogs.slice(0, 5), ...routerLogs].slice(0, 30));
    }
    catch {
        res.json(localLogs);
    }
});
/* ---------------------------------------------------------------------------
 * Kontrol internet per MAC address -- kontrol TERPISAH per perangkat (menu "Akses MAC").
 *
 * Mekanisme: /ip/firewall/filter chain=forward action=drop src-mac-address=<MAC>
 * (+ opsional in-interface=<vlan lab>) dengan out-interface = WAN.
 *   disabled=yes -> rule idle  -> internet AKTIF (perangkat 100% ikut aturan lab)
 *   disabled=no  -> rule aktif -> internet DIBLOKIR (hanya trafik ke WAN yang di-drop)
 *
 * KENAPA BUKAN TABEL NAT (sudah diuji langsung di router, 17 Sep 2026):
 *   /ip/firewall/nat set disabled=no pada rule chain=srcnat + src-mac-address ->
 *   "failure: source mac address matching not possible in output and postrouting chains".
 *   Action drop juga tidak dikenal di chain NAT ("input does not match any value of action").
 *   Jadi MAC hanya bisa di-match di chain filter; rule NAT per-MAC tidak bisa diaktifkan
 *   di RouterOS 6.49.13. Rule di sini TIDAK menyentuh rule NAT / VLAN lab sama sekali,
 *   dan admin pun memakai pola yang sama (38 rule MAC manual di filter chain).
 *
 * Menghapus entri = rule dihapus -> perangkat kembali mengikuti menu Access Control (lab).
 * Hanya rule ber-tag MAC_BLOCK_COMMENT_PREFIX yang boleh diubah/dihapus.
 * ------------------------------------------------------------------------- */
const MAC_RULE_PROP_LIST = '.id,chain,action,disabled,comment,src-mac-address,in-interface,out-interface,out-interface-list';
function macBlockValidationError(message) {
    const error = new Error(message);
    error.statusCode = 400;
    return error;
}
function macBlockNotFoundError(message = 'Entri MAC access tidak ditemukan di router') {
    const error = new Error(message);
    error.statusCode = 404;
    return error;
}
function normalizeMacBlockInput(payload = {}) {
    const mac = normalizeMacAddress(payload.mac);
    if (!mac)
        throw macBlockValidationError('Format MAC address tidak valid. Gunakan format AA:BB:CC:DD:EE:FF');
    const rawAction = String(payload.action ?? 'drop').trim().toLowerCase();
    if (!MAC_RULE_ACTIONS.includes(rawAction))
        throw macBlockValidationError(`Action rule harus salah satu dari: ${MAC_RULE_ACTIONS.join(', ')}`);
    return {
        mac,
        label: String(payload.label ?? '').trim().slice(0, 64),
        scope: String(payload.scope ?? '').trim(),
        action: rawAction,
        internetEnabled: payload.internetEnabled === undefined ? true : toBoolean(payload.internetEnabled),
    };
}
async function printMacFilterRows(client) {
    return client.execute('/ip/firewall/filter/print', { '.proplist': MAC_RULE_PROP_LIST });
}
async function printMacNatRows(client) {
    return client.execute('/ip/firewall/nat/print', { '.proplist': MAC_RULE_PROP_LIST });
}
function findManagedMacRule(rows, ruleId) {
    return rows.find((rule) => rule['.id'] === ruleId && isMacBlockRule(rule));
}
// Rule MAC harus berada SEBELUM rule accept apa pun di chain forward, kalau tidak blokir
// bisa dilewati (mis. rule whitelist youtube/pengajar).
function resolveMacPlaceBefore(filterRows) {
    if (MAC_PLACE_BEFORE)
        return MAC_PLACE_BEFORE;
    const firstForwardRule = filterRows.find((rule) => String(rule.chain || '').toLowerCase() === 'forward' && rule['.id']);
    return firstForwardRule ? firstForwardRule['.id'] : '';
}
function macRuleFields(row) {
    const parsed = parseMacBlockComment(row.comment);
    const ruleAction = normalizeMacRuleAction(row.action, parsed.action || 'drop');
    return {
        id: row['.id'],
        mac: normalizeMacAddress(row['src-mac-address']) || parsed.macFromComment,
        label: parsed.label,
        scope: String(row['in-interface'] || ''),
        action: ruleAction,
        outInterface: String(row['out-interface'] || row['out-interface-list'] || ''),
        // disabled=yes -> rule tidak aktif (internet mengikuti aturan lab / blokir lain);
        // disabled=no  -> rule aktif (drop = internet mati, accept = perangkat diizinkan).
        internetEnabled: isTruthyRouterDisabled(row.disabled),
        disabled: isTruthyRouterDisabled(row.disabled),
        ruleActive: !isTruthyRouterDisabled(row.disabled),
    };
}
function mapUnmanagedMacRule(row, table) {
    return {
        id: row['.id'],
        table,
        chain: String(row.chain || ''),
        action: String(row.action || ''),
        mac: normalizeMacAddress(row['src-mac-address']) || String(row['src-mac-address']),
        comment: String(row.comment || ''),
        scope: String(row['in-interface'] || ''),
        active: !isTruthyRouterDisabled(row.disabled),
    };
}
function managedMacRules(filterRows) {
    return filterRows.filter((rule) => String(rule.chain || '').toLowerCase() === 'forward' && isMacBlockRule(rule));
}
async function assertInterfaceExists(client, interfaceName) {
    if (!interfaceName)
        return true;
    const rows = await client.execute('/interface/print', { '.proplist': 'name' });
    if (!rows.some((row) => String(row.name || '') === interfaceName))
        throw macBlockValidationError(`Interface ${interfaceName} tidak ditemukan di router`);
    return true;
}
function buildMacRuleOptions(input, placeBefore) {
    const options = {
        chain: 'forward',
        action: normalizeMacRuleAction(input.action),
        'src-mac-address': input.mac,
        comment: macBlockComment(input.mac, input.label, input.action),
        disabled: input.internetEnabled ? 'yes' : 'no',
    };
    withWanMatcher(options);
    if (input.scope)
        options['in-interface'] = input.scope;
    if (placeBefore)
        options['place-before'] = placeBefore;
    return options;
}
async function addMacRuleRow(client, options) {
    try {
        return await client.execute('/ip/firewall/filter/add', options);
    }
    catch (error) {
        if (!options['place-before'])
            throw error;
        const retryOptions = { ...options };
        delete retryOptions['place-before'];
        return client.execute('/ip/firewall/filter/add', retryOptions);
    }
}
// ---- Cache + dedupe untuk baca data MAC access ----
// Tujuan: "loading" data ditangani di backend, bukan diulang-ulang oleh frontend.
// - cache pendek (MAC_ACCESS_CACHE_MS) -> request beruntun dilayani instan
// - dedupe in-flight -> dua request bersamaan hanya memakai SATU sesi RouterOS
// - timeout keras -> request selalu selesai (504) dan tidak menggantung
let macAccessCache = { at: 0, data: null };
let macAccessInFlight = null;
function invalidateMacAccessCache() {
    macAccessCache = { at: 0, data: null };
}
function withHardTimeout(promise, timeoutMs, label) {
    if (!timeoutMs || timeoutMs <= 0)
        return promise;
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            const error = new Error(`${label} melebihi batas ${timeoutMs} ms — router tidak merespons`);
            error.statusCode = 504;
            reject(error);
        }, timeoutMs);
        promise.then((value) => {
            clearTimeout(timer);
            resolve(value);
        }, (error) => {
            clearTimeout(timer);
            reject(error);
        });
    });
}
async function loadMacAccessData({ force = false } = {}) {
    const now = Date.now();
    const isFresh = !!macAccessCache.data && (now - macAccessCache.at) < MAC_ACCESS_CACHE_MS;
    if (!force && isFresh) {
        return { ...macAccessCache.data, cached: true, fetchedAt: macAccessCache.at };
    }
    if (!force && macAccessInFlight)
        return macAccessInFlight;
    const run = withHardTimeout(readMacAccessData(), MAC_ACCESS_TIMEOUT_MS, 'Baca data MAC access');
    macAccessInFlight = run
        .then((data) => {
        macAccessCache = { at: Date.now(), data };
        return { ...data, cached: false, fetchedAt: macAccessCache.at };
    })
        .finally(() => {
        macAccessInFlight = null;
    });
    return macAccessInFlight;
}
// CATATAN: RouterApiClient hanya punya satu queue balasan, jadi semua perintah pada satu
// koneksi WAJIB sekuensial (jangan Promise.all dua execute pada client yang sama).
async function readMacAccessData() {
    return withRouter(async (client) => {
        const filterRows = await printMacFilterRows(client);
        const natRows = await printMacNatRows(client);
        const entries = managedMacRules(filterRows).map((row) => {
            const fields = macRuleFields(row);
            return { ...fields, table: 'filter', ruleTarget: `forward / ${fields.action}` };
        });
        const unmanaged = [
            ...filterRows
                .filter((rule) => rule['src-mac-address'] && !isMacBlockRule(rule))
                .map((rule) => mapUnmanagedMacRule(rule, 'filter')),
            ...natRows
                .filter((rule) => rule['src-mac-address'] && !isMacBlockRule(rule))
                .map((rule) => mapUnmanagedMacRule(rule, 'nat')),
        ];
        return { entries, unmanaged };
    });
}
async function addMacBlock(payload = {}) {
    const input = normalizeMacBlockInput(payload);
    return withRouter(async (client) => {
        const filterRows = await printMacFilterRows(client);
        const duplicateMac = managedMacRules(filterRows).find((rule) => (normalizeMacAddress(rule['src-mac-address']) ||
            parseMacBlockComment(rule.comment).macFromComment) === input.mac);
        if (duplicateMac) {
            const conflict = new Error(`${input.mac} sudah terdaftar di router — ubah entri yang ada atau hapus dulu`);
            conflict.statusCode = 409;
            throw conflict;
        }
        await assertInterfaceExists(client, input.scope);
        const addRows = await addMacRuleRow(client, buildMacRuleOptions(input, resolveMacPlaceBefore(filterRows)));
        pushLocalLog(`Entri MAC ${input.mac} ditambahkan (kontrol terpisah, internet ${input.internetEnabled ? 'aktif' : 'diblokir'})`, input.internetEnabled ? 'info' : 'warning');
        // Reply /ip/firewall/filter/add mengirim "=ret=<.id>"; sebagian versi RouterOS tidak
        // mengirim ".id" sehingga perlu fallback baca ulang tabel filter dan cocokkan MAC.
        let ruleId = addRows[0]?.['.id'] || addRows[0]?.ret || '';
        if (!ruleId) {
            const verifyRows = await printMacFilterRows(client);
            const created = managedMacRules(verifyRows).find((rule) => (normalizeMacAddress(rule['src-mac-address']) ||
                parseMacBlockComment(rule.comment).macFromComment) === input.mac);
            ruleId = created?.['.id'] || '';
        }
        const storedOptions = buildMacRuleOptions(input, '');
        return {
            id: ruleId,
            mac: input.mac,
            label: input.label,
            scope: input.scope,
            action: input.action,
            table: 'filter',
            ruleTarget: `forward / ${input.action}`,
            outInterface: String(storedOptions['out-interface'] || storedOptions['out-interface-list'] || ''),
            internetEnabled: input.internetEnabled,
            disabled: input.internetEnabled,
        };
    });
}
async function updateMacBlock(ruleId, patch = {}) {
    return withRouter(async (client) => {
        const filterRows = await printMacFilterRows(client);
        const target = findManagedMacRule(filterRows, ruleId);
        if (!target)
            throw macBlockNotFoundError();
        const current = macRuleFields(target);
        const nextMac = patch.mac === undefined ? current.mac : normalizeMacAddress(patch.mac);
        if (!nextMac)
            throw macBlockValidationError('Format MAC address tidak valid. Gunakan format AA:BB:CC:DD:EE:FF');
        const nextLabel = patch.label === undefined ? current.label : String(patch.label).trim().slice(0, 64);
        const nextScope = patch.scope === undefined ? current.scope : String(patch.scope).trim();
        const nextAction = patch.action === undefined ? current.action : normalizeMacRuleAction(patch.action, '');
        if (!nextAction)
            throw macBlockValidationError(`Action rule harus salah satu dari: ${MAC_RULE_ACTIONS.join(', ')}`);
        const nextInternetEnabled = patch.internetEnabled === undefined ? current.internetEnabled : toBoolean(patch.internetEnabled);
        if (nextMac !== current.mac || nextScope !== current.scope) {
            const duplicate = managedMacRules(filterRows).find((rule) => rule['.id'] !== ruleId &&
                (normalizeMacAddress(rule['src-mac-address']) || parseMacBlockComment(rule.comment).macFromComment) === nextMac);
            if (duplicate) {
                const conflict = new Error(`${nextMac} sudah terdaftar di router — ubah entri yang ada atau hapus dulu`);
                conflict.statusCode = 409;
                throw conflict;
            }
        }
        if (patch.scope !== undefined && nextScope !== current.scope)
            await assertInterfaceExists(client, nextScope);
        // RouterOS mengabaikan nilai kosong pada set in-interface -> kalau scope dilepas,
        // rule dihapus lalu dibuat ulang tanpa in-interface (field lain dipertahankan).
        if (patch.scope !== undefined && !nextScope && current.scope) {
            await client.execute('/ip/firewall/filter/remove', { '.id': ruleId });
            // place-before HARUS dihitung ulang setelah rule lama dihapus: kalau tidak,
            // kandidat teratas bisa menunjuk rule itu sendiri -> add gagal & rule jatuh ke bawah.
            const freshRows = await printMacFilterRows(client);
            const options = buildMacRuleOptions({ mac: nextMac, label: nextLabel, scope: '', action: nextAction, internetEnabled: nextInternetEnabled }, resolveMacPlaceBefore(freshRows));
            const addRows = await addMacRuleRow(client, options);
            let newId = addRows[0]?.['.id'] || addRows[0]?.ret || '';
            if (!newId) {
                const verifyRows = await printMacFilterRows(client);
                const created = managedMacRules(verifyRows).find((rule) => (normalizeMacAddress(rule['src-mac-address']) || '') === nextMac);
                newId = created?.['.id'] || '';
            }
            pushLocalLog(`Scope lab untuk ${nextMac} dilepas (rule dibuat ulang)`, 'info');
            return {
                id: newId,
                mac: nextMac,
                label: nextLabel,
                scope: '',
                table: 'filter',
                action: nextAction,
                ruleTarget: `forward / ${nextAction}`,
                outInterface: current.outInterface,
                internetEnabled: nextInternetEnabled,
                disabled: nextInternetEnabled,
            };
        }
        const setOptions = { '.id': ruleId };
        if (patch.internetEnabled !== undefined)
            setOptions.disabled = nextInternetEnabled ? 'yes' : 'no';
        if (patch.mac !== undefined || patch.label !== undefined || patch.action !== undefined)
            setOptions.comment = macBlockComment(nextMac, nextLabel, nextAction);
        if (patch.mac !== undefined)
            setOptions['src-mac-address'] = nextMac;
        if (patch.action !== undefined)
            setOptions.action = nextAction;
        // in-interface hanya dikirim bila ada nilainya: RouterOS menolak nilai kosong
        // ("ambiguous value of interface, more than one possible value matches input").
        // Melepas scope ditangani jalur hapus + buat ulang di atas.
        if (patch.scope !== undefined && nextScope)
            setOptions['in-interface'] = nextScope;
        if (Object.keys(setOptions).length === 1)
            return { ...current, table: 'filter', ruleTarget: `forward / ${current.action}` };
        await client.execute('/ip/firewall/filter/set', setOptions);
        if (patch.internetEnabled !== undefined && patch.mac === undefined && patch.label === undefined && patch.scope === undefined)
            pushLocalLog(`Internet ${nextMac} ${nextInternetEnabled ? 'dibuka' : 'diblokir'} (kontrol per-MAC)`, nextInternetEnabled ? 'success' : 'warning');
        else
            pushLocalLog(`Entri MAC ${current.mac} diubah${nextMac !== current.mac ? ` -> ${nextMac}` : ''}${nextScope ? ` (${nextScope})` : ' (semua lab)'}`, 'info');
        return {
            id: ruleId,
            mac: nextMac,
            label: nextLabel,
            scope: nextScope,
            table: 'filter',
            action: nextAction,
            ruleTarget: `forward / ${nextAction}`,
            outInterface: current.outInterface,
            internetEnabled: nextInternetEnabled,
            disabled: nextInternetEnabled,
        };
    });
}
async function removeMacBlock(ruleId) {
    return withRouter(async (client) => {
        const filterRows = await printMacFilterRows(client);
        const target = findManagedMacRule(filterRows, ruleId);
        if (!target)
            throw macBlockNotFoundError('Entri MAC access tidak ditemukan (hanya rule ber-tag LabGuard yang bisa dihapus)');
        const mapped = macRuleFields(target);
        await client.execute('/ip/firewall/filter/remove', { '.id': ruleId });
        pushLocalLog(`Entri MAC ${mapped.mac} dihapus — perangkat kembali mengikuti kontrol lab`, 'warning');
        return { ...mapped, table: 'filter' };
    });
}
app.get('/api/mac-access', requireSession, async (req, res) => {
    if (!HAS_CONFIG) {
        return res.json({ success: true, simulated: true, entries: mockMacBlocks.map((item) => ({ ...item })), unmanaged: [] });
    }
    try {
        const force = String(req.query?.refresh || '') === '1';
        const { entries, unmanaged, cached, fetchedAt } = await loadMacAccessData({ force });
        res.json({
            success: true,
            entries,
            unmanaged,
            cached,
            fetchedAt,
            cacheTtlMs: MAC_ACCESS_CACHE_MS,
        });
    }
    catch (error) {
        res.status(error.statusCode || 500).json({ success: false, error: formatRouterError(error) });
    }
});
app.post('/api/mac-access', requireSession, async (req, res) => {
    let input;
    try {
        input = normalizeMacBlockInput(req.body || {});
    }
    catch (error) {
        return res.status(error.statusCode || 400).json({ success: false, error: formatRouterError(error) });
    }
    if (!HAS_CONFIG) {
        const duplicate = mockMacBlocks.find((item) => item.mac === input.mac);
        if (duplicate)
            return res.status(409).json({ success: false, error: `${input.mac} sudah terdaftar` });
        const created = { id: `mock-mac-${Date.now()}`, ...input, table: 'filter', ruleTarget: `forward / ${input.action}`, outInterface: UPLINK_INTERFACE, disabled: input.internetEnabled };
        mockMacBlocks = [created, ...mockMacBlocks];
        pushLocalLog(`Entri MAC ${input.mac} ditambahkan (simulasi)`, 'info');
        return res.json({ success: true, simulated: true, entry: created });
    }
    try {
        const entry = await addMacBlock(input);
        invalidateMacAccessCache();
        res.json({ success: true, entry });
    }
    catch (error) {
        res.status(error.statusCode || 500).json({ success: false, error: formatRouterError(error) });
    }
});
app.patch('/api/mac-access/:ruleId', requireSession, async (req, res) => {
    const ruleId = decodeURIComponent(req.params.ruleId);
    const body = req.body || {};
    if (body.mac !== undefined && !normalizeMacAddress(body.mac)) {
        return res.status(400).json({ success: false, error: 'Format MAC address tidak valid. Gunakan format AA:BB:CC:DD:EE:FF' });
    }
    if (body.action !== undefined && !MAC_RULE_ACTIONS.includes(String(body.action).trim().toLowerCase())) {
        return res.status(400).json({ success: false, error: `Action rule harus salah satu dari: ${MAC_RULE_ACTIONS.join(', ')}` });
    }
    if (!HAS_CONFIG) {
        const found = mockMacBlocks.find((item) => item.id === ruleId);
        if (!found)
            return res.status(404).json({ success: false, error: 'Entri MAC tidak ditemukan' });
        const updated = {
            ...found,
            mac: body.mac === undefined ? found.mac : normalizeMacAddress(body.mac),
            label: body.label === undefined ? found.label : String(body.label).trim(),
            scope: body.scope === undefined ? found.scope : String(body.scope).trim(),
            action: body.action === undefined ? found.action : normalizeMacRuleAction(body.action, found.action),
            internetEnabled: body.internetEnabled === undefined ? found.internetEnabled : toBoolean(body.internetEnabled),
        };
        mockMacBlocks = mockMacBlocks.map((item) => (item.id === ruleId ? updated : item));
        pushLocalLog(`Entri MAC ${updated.mac} diperbarui (simulasi)`, 'info');
        return res.json({ success: true, simulated: true, entry: updated });
    }
    try {
        const entry = await updateMacBlock(ruleId, body);
        invalidateMacAccessCache();
        res.json({ success: true, entry });
    }
    catch (error) {
        res.status(error.statusCode || 500).json({ success: false, error: formatRouterError(error) });
    }
});
app.delete('/api/mac-access/:ruleId', requireSession, async (req, res) => {
    const ruleId = decodeURIComponent(req.params.ruleId);
    if (!HAS_CONFIG) {
        const found = mockMacBlocks.find((item) => item.id === ruleId);
        if (!found)
            return res.status(404).json({ success: false, error: 'Entri MAC tidak ditemukan' });
        mockMacBlocks = mockMacBlocks.filter((item) => item.id !== ruleId);
        pushLocalLog(`Entri MAC ${found.mac} dihapus (simulasi)`, 'warning');
        return res.json({ success: true, simulated: true, entry: found });
    }
    try {
        const entry = await removeMacBlock(ruleId);
        invalidateMacAccessCache();
        res.json({ success: true, entry });
    }
    catch (error) {
        res.status(error.statusCode || 500).json({ success: false, error: formatRouterError(error) });
    }
});
async function setupVite() {
    if (process.env.NODE_ENV !== 'production') {
        const vite = await createViteServer({
            server: { middlewareMode: true },
            appType: 'spa',
        });
        app.use(vite.middlewares);
    }
    else {
        const distPath = path.join(__dirname, 'dist');
        app.use(express.static(distPath));
        app.get('*', (_req, res) => {
            res.sendFile(path.join(distPath, 'index.html'));
        });
    }
    app.listen(PORT, SERVER_HOST, () => {
        const publicUrl = `http://${getPublicServerHost()}:${PORT}`;
        console.log(`Server running on ${publicUrl}`);
    });
}
setupVite();
