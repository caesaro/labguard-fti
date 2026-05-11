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
const NAT_PLACE_BEFORE = process.env.LABGUARD_NAT_PLACE_BEFORE || '0';
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
    { id: '*16', name: 'lab 463', enabled: true, running: true, comment: 'VLAN 63 - Lab Basis Data', type: 'vlan', interfaceEnabled: true, internetBlocked: false, queueTreeId: '*q16', queueTreeName: '463', bandwidthEnabled: true, bandwidthLimit: 100_000_000, bandwidthLimitMbps: 100, hasQueueTree: true, teacherIp: '172.67.12.66', teacherInternetEnabled: true },
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
function natBlockComment(ifaceName) {
    return `${NAT_BLOCK_COMMENT_PREFIX}:${ifaceName}`;
}
function isTruthyRouterDisabled(value) {
    const normalized = String(value ?? '').toLowerCase();
    return normalized === 'true' || normalized === 'yes';
}
function findNatBlockRule(rules, ifaceName) {
    const expectedComment = natBlockComment(ifaceName);
    return rules.find((rule) => rule.comment === expectedComment) ||
        rules.find((rule) => rule.chain === 'srcnat' &&
            rule.action === 'accept' &&
            rule['in-interface'] === ifaceName &&
            ((WAN_INTERFACE && rule['out-interface'] === WAN_INTERFACE) ||
                (WAN_INTERFACE_LIST && rule['out-interface-list'] === WAN_INTERFACE_LIST) ||
                (!rule['out-interface'] && !rule['out-interface-list'])) &&
            String(rule.comment || '').startsWith(NAT_BLOCK_COMMENT_PREFIX));
}
function hasMatchingWanTarget(rule) {
    return ((WAN_INTERFACE && rule['out-interface'] === WAN_INTERFACE) ||
        (WAN_INTERFACE_LIST && rule['out-interface-list'] === WAN_INTERFACE_LIST) ||
        (!rule['out-interface'] && !rule['out-interface-list']));
}
function findStudentNatRule(rules, subnetCidr) {
    if (!subnetCidr)
        return undefined;
    return rules.find((rule) => {
        const comment = String(rule.comment || '').toLowerCase();
        const action = String(rule.action || '').toLowerCase();
        const chain = String(rule.chain || '').toLowerCase();
        return (chain === 'srcnat' &&
            (action === 'src-nat' || action === 'masquerade') &&
            String(rule['src-address'] || '') === subnetCidr &&
            hasMatchingWanTarget(rule) &&
            !comment.includes('pengajar'));
    });
}
function findTeacherNatRule(rules, teacherIp) {
    if (!teacherIp)
        return undefined;
    return rules.find((rule) => {
        const action = String(rule.action || '').toLowerCase();
        const chain = String(rule.chain || '').toLowerCase();
        return (chain === 'srcnat' &&
            (action === 'src-nat' || action === 'masquerade') &&
            String(rule['src-address'] || '') === teacherIp &&
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
        const ifaceName = String(row.interface || '');
        const address = String(row.address || '');
        if (!ifaceName || !address || addressMap.has(ifaceName) || !address.includes('.') || !address.includes('/')) {
            continue;
        }
        addressMap.set(ifaceName, address);
    }
    return addressMap;
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
async function getLabInterfaces() {
    return withRouter(async (client) => {
        const rows = await client.execute('/interface/print', {
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
        const addressMap = buildInterfaceAddressMap(addressRows);
        const managedInterfaces = rows.filter(isManagedInterface).map((row) => {
            const iface = mapInterface(row);
            const interfaceCidr = addressMap.get(iface.name);
            const subnetCidr = networkCidrFromCidr(interfaceCidr);
            const studentNatRule = findStudentNatRule(natRules, subnetCidr || undefined);
            const teacherIp = teacherIpFromCidr(interfaceCidr);
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
    });
}
async function getTrafficForInterfaces(ifaces) {
    if (!ifaces.length)
        return [];
    return withRouter(async (client) => {
        const trafficRows = [];
        for (const iface of ifaces) {
            trafficRows.push(await monitorInterfaceTraffic(client, iface.name, iface.id));
        }
        return trafficRows;
    });
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
async function getUplinkTraffic() {
    return withRouter((client) => monitorInterfaceTraffic(client, UPLINK_INTERFACE || 'ether2-backboneUKSW', 'uplink'));
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
async function addAddressListEntry(listName, address, comment = '') {
    return withRouter(async (client) => {
        await client.execute('/ip/firewall/address-list/add', {
            list: listName,
            address,
            comment,
            disabled: 'no',
        });
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
        const nextAddress = payload.address ?? current.address;
        const nextComment = payload.comment ?? current.comment ?? '';
        const nextDisabled = typeof payload.disabled === 'boolean'
            ? (payload.disabled ? 'yes' : 'no')
            : (isTruthyDisabled(current.disabled) ? 'yes' : 'no');
        await client.execute('/ip/firewall/address-list/set', {
            '.id': entryId,
            address: nextAddress,
            comment: nextComment,
            disabled: nextDisabled,
        });
        return getAddressListEntries(String(current.list || ''));
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
        await client.execute('/ip/firewall/address-list/remove', {
            '.id': entryId,
        });
        return {
            listName,
            entries: await getAddressListEntries(listName),
        };
    });
}
function policyRuleComment(listName, type) {
    return type === 'whitelist' ? `ACC ${listName}` : `LABGUARD_BLOCK ${listName}`;
}
async function createPolicyList(listName, type, initialEntries = []) {
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
        for (const address of initialEntries) {
            const trimmed = address.trim();
            if (!trimmed) continue;
            try {
                await client.execute('/ip/firewall/address-list/add', {
                    list: listName,
                    address: trimmed,
                    comment: `Added by Labguard`,
                    disabled: 'no',
                });
            } catch {
                // skip duplicate or invalid entries
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
        const iface = interfaceRows
            .filter(isManagedInterface)
            .map(mapInterface)
            .find((item) => item.id === interfaceId);
        if (!iface) {
            const notFound = new Error('Interface lab tidak ditemukan');
            notFound.statusCode = 404;
            throw notFound;
        }
        const addressMap = buildInterfaceAddressMap(addressRows);
        const interfaceCidr = addressMap.get(iface.name);
        const teacherIp = teacherIpFromCidr(interfaceCidr);
        const subnetCidr = networkCidrFromCidr(interfaceCidr);
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
    res.json({ vlans: LABS_ONLY_VLANS });
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
        const rows = await runRouterCommand('/system/resource/print');
        res.json({
            status: 'connected',
            resource: rows[0] || {},
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
        const entries = await addAddressListEntry(listName, address, comment);
        pushLocalLog(`Address-list [${listName}] tambah target ${address}`, 'info');
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
        const entries = await updateAddressListEntry(entryId, { address, comment, disabled });
        pushLocalLog(`Address-list entry [${entryId}] diperbarui`, 'info');
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
        const result = await createPolicyList(listName, type, initialEntries);
        pushLocalLog(`Policy list [${result.listName}] (${type}) dibuat: ${result.comment}`, 'success');
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
        const [leases, arp] = await Promise.all([
            runRouterCommand('/ip/dhcp-server/lease/print'),
            runRouterCommand('/ip/arp/print'),
        ]);
        res.json({ leases, arp });
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
