import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useEffect, useState } from 'react';
import { WifiOff, ShieldCheck, RefreshCcw, Activity, Settings as SettingsIcon, AlertCircle, Layers, Search, CheckCircle2, XCircle, Unlock, Lock, LogIn, KeyRound, Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import mikrotikLogo from './assets/mikrotik-logo.svg';
// Simulated traffic data generator
const generateHistory = () => {
    return Array.from({ length: 20 }, (_, i) => ({
        time: i,
        download: Math.floor(Math.random() * 100),
        upload: Math.floor(Math.random() * 30),
    }));
};
const formatBandwidthMbps = (value) => {
    if (value === undefined || value === null || Number.isNaN(value))
        return '--';
    const normalized = Number(value);
    return Number.isInteger(normalized) ? `${normalized}` : normalized.toFixed(2).replace(/\.?0+$/, '');
};
const formatRateMbps = (value) => {
    const normalized = Number(value || 0);
    return normalized >= 1_000_000
        ? `${(normalized / 1_000_000).toFixed(1).replace(/\.0$/, '')} Mbps`
        : `${(normalized / 1_000).toFixed(0)} Kbps`;
};
function UplinkTrafficCard({ uplinkTraffic }) {
    return (<div className="bg-white dark:bg-[#1C1C1E] rounded-3xl p-4 sm:p-5 border border-gray-100 dark:border-white/5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
              <Activity size={18}/>
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-gray-400">Backbone Uplink (Total Bandwith yang Terpakai)</p>
              <h3 className="text-sm sm:text-base font-black uppercase tracking-tight text-white truncate">{uplinkTraffic?.name || 'ether2-backboneUKSW'}</h3>
            </div>
          </div>
        </div>
        <div className="px-2 py-1 rounded-md text-[8px] font-black uppercase border border-blue-500/20 text-blue-400 bg-blue-500/10 shrink-0">
          Live
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-2xl border border-gray-100 dark:border-white/5 bg-gray-50/80 dark:bg-white/[0.03] px-4 py-3">
          <p className="text-[8px] font-black uppercase tracking-[0.18em] text-gray-400">Download</p>
          <p className="text-lg font-black tracking-tight text-white mt-1">{formatRateMbps(uplinkTraffic?.rxRate)}</p>
        </div>
        <div className="rounded-2xl border border-gray-100 dark:border-white/5 bg-gray-50/80 dark:bg-white/[0.03] px-4 py-3">
          <p className="text-[8px] font-black uppercase tracking-[0.18em] text-gray-400">Upload</p>
          <p className="text-lg font-black tracking-tight text-white mt-1">{formatRateMbps(uplinkTraffic?.txRate)}</p>
        </div>
      </div>
    </div>);
}
const LABS_ONLY_ORDER = [
    'vlan461',
    'vlan463',
    'vlan467',
    'vlan464',
    'vlan465',
    'vlan469',
    'vlan459',
    'vlan457',
    'vlan455',
    'vlan454',
    'vlan453',
    'vlan451',
    'vlan431',
    'vlan402',
    'vlan506',
    'vlan507',
    'vlan301',
];
const normalizeLabName = (value) => value.toLowerCase().replace(/\s+/g, '');
const labsOnlyOrderIndex = new Map(LABS_ONLY_ORDER.map((name, index) => [normalizeLabName(name), index]));
const SESSION_TOKEN_KEY = 'labguard_token';
const LEGACY_AUTH_KEY = 'labguard_auth';
const connectionAlertStyles = {
    success: {
        container: 'bg-green-50 dark:bg-green-900/20 border-green-100 dark:border-green-900/30 text-green-700 dark:text-green-400',
        icon: 'bg-green-100 dark:bg-green-500/10 text-green-600 dark:text-green-400',
        iconNode: _jsx(CheckCircle2, { size: 20 }),
    },
    error: {
        container: 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-900/30 text-red-600 dark:text-red-400',
        icon: 'bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-400',
        iconNode: _jsx(XCircle, { size: 20 }),
    },
    warning: {
        container: 'bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-900/30 text-blue-700 dark:text-blue-400',
        icon: 'bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400',
        iconNode: _jsx(AlertCircle, { size: 20 }),
    },
};
export default function App() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [rememberMe, setRememberMe] = useState(false);
    const [activeTab, setActiveTab] = useState('control');
    const [password, setPassword] = useState('');
    const [loginError, setLoginError] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [sessionToken, setSessionToken] = useState('');
    const [routerStatus, setRouterStatus] = useState({ status: 'loading' });
    const [interfaces, setInterfaces] = useState([]);
    const [trafficHistory, setTrafficHistory] = useState({});
    const [clients, setClients] = useState([]);
    const [logs, setLogs] = useState([]);
    const [uplinkTraffic, setUplinkTraffic] = useState({ id: 'uplink', name: 'ether2-backboneUKSW', rxRate: 0, txRate: 0 });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [connectionAlert, setConnectionAlert] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [showOnlyLabs, setShowOnlyLabs] = useState(false);
    const [bandwidthDrafts, setBandwidthDrafts] = useState({});
    useEffect(() => {
        document.documentElement.classList.add('dark');
        document.body.classList.add('dark');
        document.documentElement.style.colorScheme = 'dark';
        document.body.style.backgroundColor = '#0A0A0B';
        return () => {
            document.documentElement.classList.remove('dark');
            document.body.classList.remove('dark');
            document.documentElement.style.colorScheme = '';
            document.body.style.backgroundColor = '';
        };
    }, []);
    const clearSession = () => {
        setIsAuthenticated(false);
        setSessionToken('');
        localStorage.removeItem(SESSION_TOKEN_KEY);
        localStorage.removeItem(LEGACY_AUTH_KEY);
        sessionStorage.removeItem(SESSION_TOKEN_KEY);
    };
    const saveSession = (token, remember) => {
        setSessionToken(token);
        setIsAuthenticated(true);
        localStorage.removeItem(LEGACY_AUTH_KEY);
        if (remember) {
            localStorage.setItem(SESSION_TOKEN_KEY, token);
            sessionStorage.removeItem(SESSION_TOKEN_KEY);
        }
        else {
            sessionStorage.setItem(SESSION_TOKEN_KEY, token);
            localStorage.removeItem(SESSION_TOKEN_KEY);
        }
    };
    const authorizedFetch = async (input, init = {}) => {
        const headers = {
            ...init.headers,
            Authorization: `Bearer ${sessionToken}`,
        };
        const response = await fetch(input, { ...init, headers });
        if (response.status === 401) {
            clearSession();
            throw new Error('Session expired. Silakan login ulang.');
        }
        return response;
    };
    const ensureTrafficHistory = (ifaces) => {
        setTrafficHistory(prev => {
            const next = { ...prev };
            ifaces.forEach(iface => {
                if (!next[iface.id]) {
                    next[iface.id] = generateHistory();
                }
            });
            return next;
        });
    };
    const appendTrafficSamples = (samples, ifaces) => {
        const activeIds = new Set(ifaces.map(iface => iface.id));
        setTrafficHistory(prev => {
            const next = {};
            Object.entries(prev).forEach(([id, history]) => {
                if (activeIds.has(id))
                    next[id] = history;
            });
            ifaces.forEach(iface => {
                if (!next[iface.id])
                    next[iface.id] = generateHistory();
            });
            samples.forEach(sample => {
                const current = next[sample.id] || [];
                next[sample.id] = [
                    ...current,
                    {
                        time: Date.now(),
                        download: Math.round((sample.rxRate || 0) / 1024),
                        upload: Math.round((sample.txRate || 0) / 1024),
                    },
                ].slice(-20);
            });
            return next;
        });
    };
    const syncBandwidthDrafts = (ifaces) => {
        setBandwidthDrafts(prev => {
            const next = { ...prev };
            ifaces.forEach(iface => {
                if (!(iface.id in next)) {
                    next[iface.id] = iface.bandwidthLimitMbps ? formatBandwidthMbps(iface.bandwidthLimitMbps) : '';
                }
            });
            return next;
        });
    };
    const fetchData = async () => {
        if (!isAuthenticated || !sessionToken)
            return;
        try {
            setLoading(true);
            setError(null);
            const [routerRes, ifacesRes, trafficRes, uplinkRes, clientsRes, logsRes] = await Promise.allSettled([
                authorizedFetch('/api/router/status').then(r => r.ok ? r.json() : Promise.reject('Status API failed')),
                authorizedFetch('/api/interfaces').then(r => r.ok ? r.json() : Promise.reject('Interfaces API failed')),
                authorizedFetch('/api/interfaces/traffic').then(r => r.ok ? r.json() : Promise.reject('Traffic API failed')),
                authorizedFetch('/api/router/uplink-traffic').then(r => r.ok ? r.json() : Promise.reject('Uplink API failed')),
                authorizedFetch('/api/router/clients').then(r => r.ok ? r.json() : Promise.reject('Clients API failed')),
                authorizedFetch('/api/logs').then(r => r.ok ? r.json() : Promise.reject('Logs API failed'))
            ]);
            if (routerRes.status === 'fulfilled') {
                const statusData = routerRes.value;
                setRouterStatus(statusData);
                if (statusData.status === 'connected') {
                    const boardName = statusData.resource?.['board-name'] || 'MikroTik CCR';
                    setConnectionAlert({
                        type: 'success',
                        title: 'Router CCR Connected',
                        message: `Koneksi ke ${boardName} Sukses!, gass bro akses kontrol internet mahasiswa.`,
                    });
                }
                else if (statusData.status === 'simulated') {
                    setConnectionAlert({
                        type: 'warning',
                        title: 'Simulation Mode Active',
                        message: 'Kredensial router belum aktif, dashboard masih memakai data simulasi.',
                    });
                }
                else {
                    setConnectionAlert({
                        type: 'error',
                        title: 'Router CCR Connection Failed',
                        message: statusData.message || 'Gagal membaca status router CCR.',
                    });
                }
            }
            else {
                setConnectionAlert({
                    type: 'error',
                    title: 'Router CCR Connection Failed',
                    message: 'Gagal menghubungi API status router CCR.',
                });
            }
            if (ifacesRes.status === 'fulfilled') {
                setInterfaces(ifacesRes.value);
                ensureTrafficHistory(ifacesRes.value);
                syncBandwidthDrafts(ifacesRes.value);
                if (trafficRes.status === 'fulfilled') {
                    appendTrafficSamples(trafficRes.value, ifacesRes.value);
                }
            }
            if (uplinkRes.status === 'fulfilled') {
                setUplinkTraffic(uplinkRes.value);
            }
            if (logsRes.status === 'fulfilled')
                setLogs(logsRes.value);
            if (clientsRes.status === 'fulfilled') {
                const clientsData = clientsRes.value;
                const leases = clientsData.leases || [];
                const mappedClients = leases.map((l) => ({
                    address: l.address,
                    mac: l['mac-address'],
                    hostName: l['host-name'],
                    status: l.status,
                    comment: l.comment
                }));
                setClients(mappedClients);
            }
            if (ifacesRes.status === 'rejected') {
                setError('Gagal memuat daftar interface. Silakan cek koneksi router.');
            }
        }
        catch (err) {
            setConnectionAlert({
                type: 'error',
                title: 'Router CCR Connection Failed',
                message: 'System connection error. Please try again.',
            });
            setError('System connection error. Please try again.');
        }
        finally {
            setLoading(false);
        }
    };
    useEffect(() => {
        const savedToken = localStorage.getItem(SESSION_TOKEN_KEY) || sessionStorage.getItem(SESSION_TOKEN_KEY);
        if (savedToken) {
            setSessionToken(savedToken);
            setIsAuthenticated(true);
        }
        else {
            localStorage.removeItem(LEGACY_AUTH_KEY);
        }
    }, []);
    useEffect(() => {
        if (isAuthenticated && sessionToken) {
            fetchData();
            const interval = setInterval(fetchData, 15000);
            return () => clearInterval(interval);
        }
    }, [isAuthenticated, sessionToken]);
    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pin: password, remember: rememberMe })
            });
            const data = await res.json();
            if (data.success) {
                saveSession(data.token, rememberMe);
                setLoginError('');
            }
            else {
                setLoginError('PIN salah. Silakan coba lagi.');
            }
        }
        catch (err) {
            setLoginError('Gagal menghubungi server.');
        }
        finally {
            setLoading(false);
        }
    };
    const toggleInterface = async (id, currentEnabled) => {
        try {
            setLoading(true);
            const res = await authorizedFetch(`/api/interfaces/${encodeURIComponent(id)}/toggle`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ enabled: !currentEnabled })
            });
            if (res.ok) {
                setInterfaces(prev => prev.map(i => i.id === id ? { ...i, enabled: !currentEnabled, internetBlocked: currentEnabled } : i));
                fetchData();
            }
            else {
                const data = await res.json().catch(() => null);
                setError(data?.error || 'Toggle akses internet gagal. Silakan cek koneksi router.');
            }
        }
        catch (err) {
            setError('Toggle akses internet gagal: ' + err.message);
        }
        finally {
            setLoading(false);
        }
    };
    const saveBandwidth = async (iface) => {
        const draft = bandwidthDrafts[iface.id] ?? '';
        const bandwidthMbps = Number(draft);
        if (!Number.isFinite(bandwidthMbps) || bandwidthMbps <= 0) {
            setError(`Bandwidth untuk ${iface.name} harus lebih dari 0 Mbps.`);
            return;
        }
        try {
            setLoading(true);
            const res = await authorizedFetch(`/api/interfaces/${encodeURIComponent(iface.id)}/bandwidth`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ bandwidthMbps }),
            });
            if (res.ok) {
                const data = await res.json();
                setInterfaces(prev => prev.map(item => (item.id === iface.id
                    ? {
                        ...item,
                        bandwidthLimitMbps: data.bandwidthLimitMbps,
                        bandwidthLimit: data.bandwidthLimit,
                        bandwidthEnabled: data.bandwidthEnabled,
                        queueTreeId: data.queueTreeId ?? item.queueTreeId,
                        queueTreeName: data.queueTreeName ?? item.queueTreeName,
                        hasQueueTree: true,
                    }
                    : item)));
                setBandwidthDrafts(prev => ({
                    ...prev,
                    [iface.id]: formatBandwidthMbps(data.bandwidthLimitMbps),
                }));
                fetchData();
            }
            else {
                const data = await res.json().catch(() => null);
                setError(data?.error || `Gagal mengubah bandwidth ${iface.name}.`);
            }
        }
        catch (err) {
            setError(`Gagal mengubah bandwidth ${iface.name}: ${err.message}`);
        }
        finally {
            setLoading(false);
        }
    };
    const filteredInterfaces = interfaces
        .filter(iface => {
        const matchesSearch = iface.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (iface.comment && iface.comment.toLowerCase().includes(searchQuery.toLowerCase()));
        const isLab = (item) => {
            const normalizedName = normalizeLabName(item.name);
            const comment = (item.comment || '').toLowerCase();
            return labsOnlyOrderIndex.has(normalizedName) ||
                normalizedName.includes('lab') ||
                normalizedName.includes('vlan') ||
                normalizedName.startsWith('4') ||
                comment.includes('lab');
        };
        if (showOnlyLabs)
            return isLab(iface) && matchesSearch;
        return matchesSearch;
    })
        .sort((left, right) => {
        if (!showOnlyLabs)
            return 0;
        const leftIndex = labsOnlyOrderIndex.get(normalizeLabName(left.name));
        const rightIndex = labsOnlyOrderIndex.get(normalizeLabName(right.name));
        if (leftIndex !== undefined && rightIndex !== undefined) {
            return leftIndex - rightIndex;
        }
        if (leftIndex !== undefined)
            return -1;
        if (rightIndex !== undefined)
            return 1;
        return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' });
    });
    const activeConnectionAlertStyle = connectionAlert ? connectionAlertStyles[connectionAlert.type] : null;
    if (!isAuthenticated) {
        return (_jsx("div", { className: "dark bg-[#0A0A0B] min-h-screen flex items-center justify-center p-6 transition-colors duration-500", children: _jsxs(motion.div, { initial: { opacity: 0, scale: 0.9 }, animate: { opacity: 1, scale: 1 }, className: "max-w-md w-full bg-white dark:bg-[#1C1C1E] rounded-[3rem] p-10 shadow-2xl dark:shadow-black/50 border border-gray-100 dark:border-white/5 space-y-10", children: [_jsxs("div", { className: "flex flex-col items-center text-center space-y-4", children: [_jsx("div", { className: "w-16 h-16 bg-blue-600 rounded-3xl flex items-center justify-center text-white shadow-xl shadow-blue-600/20 mb-2", children: _jsx("img", { src: mikrotikLogo, alt: "MikroTik", className: "w-9 h-9 brightness-0 invert" }) }), _jsxs("div", { children: [_jsx("h1", { className: "text-3xl font-black tracking-tighter italic uppercase dark:text-white", children: "Labguard FTI UKSW" }), _jsx("p", { className: "text-gray-400 dark:text-gray-500 text-sm font-bold tracking-widest uppercase mt-1", children: "Please Insert Pin To Login" })] })] }), _jsxs("form", { onSubmit: handleLogin, className: "space-y-6", children: [_jsxs("div", { className: "space-y-2", children: [_jsx("label", { className: "text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 pl-4", children: "Admin PIN Authentication" }), _jsxs("div", { className: "relative group", children: [_jsx(KeyRound, { className: "absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors", size: 20 }), _jsx("input", { type: showPassword ? "text" : "password", value: password, onChange: (e) => setPassword(e.target.value.replace(/\D/g, '').slice(0, 6)), placeholder: "Enter 6 Digit PIN...", inputMode: "numeric", maxLength: 6, pattern: "[0-9]{1,6}", autoComplete: "one-time-code", className: "w-full pl-14 pr-14 py-5 bg-gray-50 dark:bg-[#2C2C2E] border-none rounded-[1.5rem] text-sm font-bold dark:text-white placeholder:text-gray-300 dark:placeholder:text-gray-600 focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-900/30 transition-all outline-none", required: true }), _jsx("button", { type: "button", onClick: () => setShowPassword(!showPassword), className: "absolute right-5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-500", children: showPassword ? _jsx(EyeOff, { size: 20 }) : _jsx(Eye, { size: 20 }) })] }), loginError && (_jsx(motion.p, { initial: { opacity: 0, x: -10 }, animate: { opacity: 1, x: 0 }, className: "text-red-500 text-[10px] font-black uppercase tracking-widest pl-4 mt-2", children: loginError }))] }), _jsx("div", { className: "flex items-center gap-3 px-4 py-2", children: _jsxs("label", { className: "flex items-center gap-3 cursor-pointer group", children: [_jsxs("div", { className: "relative", children: [_jsx("input", { type: "checkbox", checked: rememberMe, onChange: (e) => setRememberMe(e.target.checked), className: "sr-only" }), _jsx("div", { className: `w-10 h-5 rounded-full transition-colors ${rememberMe ? 'bg-blue-600' : 'bg-gray-200 dark:bg-white/10'}` }), _jsx("div", { className: `absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${rememberMe ? 'translate-x-5' : ''}` })] }), _jsx("span", { className: "text-[10px] font-black uppercase tracking-widest text-gray-400 group-hover:text-gray-300 transition-colors", children: "Remember Session" })] }) }), _jsxs("button", { type: "submit", disabled: loading, className: "w-full py-5 bg-blue-600 hover:bg-blue-700 text-white rounded-[1.5rem] text-xs font-black uppercase tracking-[0.3em] shadow-xl shadow-blue-600/20 transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50", children: [_jsx(LogIn, { size: 18 }), loading ? 'Authenticating...' : 'Authorize Access'] })] }), _jsx("div", { className: "pt-6 border-t border-gray-50 dark:border-white/5 flex flex-col items-center justify-center text-center gap-4", children: _jsx("p", { className: "text-[10px] text-gray-300 dark:text-gray-600 font-bold uppercase tracking-widest", children: "Developed by: NCP-Laboran FTI UKSW" }) })] }) }));
    }
    return (_jsxs("div", { className: "dark bg-[#0A0A0B] min-h-screen text-[#F2F2F7] font-sans selection:bg-blue-100 pb-16 sm:pb-20 transition-colors duration-500", children: [_jsx("header", { className: "sticky top-0 z-50 bg-white/70 dark:bg-[#1C1C1E]/70 backdrop-blur-xl border-b border-gray-200 dark:border-white/5", children: _jsxs("div", { className: "max-w-[1600px] mx-auto px-4 sm:px-6 min-h-16 py-3 sm:py-0 flex items-center justify-between gap-3", children: [_jsxs("div", { className: "flex items-center gap-2.5 sm:gap-3 min-w-0", children: [_jsx("div", { className: "w-9 h-9 sm:w-10 sm:h-10 bg-black dark:bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-xl shadow-black/10 transition-colors shrink-0", children: _jsx("img", { src: mikrotikLogo, alt: "MikroTik", className: "w-5 h-5 sm:w-[22px] sm:h-[22px] brightness-0 invert" }) }), _jsxs("div", { className: "min-w-0", children: [_jsxs("div", { className: "flex items-center gap-1.0", children: [_jsx("h1", { className: "font-ex-black text-lg sm:text-xl tracking-tighter leading-tight italic uppercase truncate", children: "Labguard FTI UKSW" }), _jsx("span", { className: "bg-blue-600 text-white text-[8px] font-black px-1 py-0.5 rounded leading-none", children: "PRO" })] }), _jsx("span", { className: "text-[9px] font-bold tracking-widest text-gray-400 uppercase leading-none", children: "Developed By: NCP-Laboran" })] })] }), _jsxs("div", { className: "flex items-center gap-2 sm:gap-6 shrink-0", children: [_jsxs("div", { className: "hidden md:flex items-center gap-6", children: [_jsxs("div", { className: "flex flex-col items-end", children: [_jsx("span", { className: "text-[9px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-1", children: "Role" }), _jsx("span", { className: "text-[10px] font-black uppercase dark:text-blue-400", children: "System Admin" })] }), _jsx("div", { className: "w-px h-6 bg-gray-200 dark:bg-white/10" })] }), _jsxs("div", { className: "flex items-center gap-2 sm:gap-3", children: [_jsx("button", { onClick: fetchData, className: "p-2 sm:p-2.5 rounded-xl bg-white dark:bg-white/5 border border-gray-200 dark:border-white/5 text-gray-500 dark:text-gray-400 hover:border-blue-600 transition-all active:scale-95 shadow-sm", children: _jsx(RefreshCcw, { size: 18, className: loading ? 'animate-spin' : '' }) }), _jsx("button", { onClick: clearSession, className: "p-2 sm:p-2.5 rounded-xl bg-red-50 dark:bg-red-900/20 border border-transparent hover:border-red-500 text-red-600 dark:text-red-400 transition-all active:scale-95 shadow-sm", children: _jsx(LogIn, { size: 18, className: "rotate-180" }) })] })] })] }) }), _jsxs("main", { className: "max-w-[1600px] mx-auto px-4 sm:px-6 py-4 sm:py-6", children: [connectionAlert && activeConnectionAlertStyle && (_jsxs(motion.div, { initial: { opacity: 0, y: -8 }, animate: { opacity: 1, y: 0 }, className: `mb-6 border p-4 sm:p-5 rounded-2xl sm:rounded-[2rem] flex items-center gap-3 sm:gap-4 shadow-sm ${activeConnectionAlertStyle.container}`, children: [_jsx("div", { className: `w-10 h-10 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center shrink-0 ${activeConnectionAlertStyle.icon}`, children: activeConnectionAlertStyle.iconNode }), _jsxs("div", { className: "flex-grow min-w-0", children: [_jsx("p", { className: "text-[9px] sm:text-[10px] font-black uppercase tracking-[0.14em] sm:tracking-[0.25em] leading-none mb-2", children: connectionAlert.title }), _jsx("p", { className: "text-xs font-bold opacity-80 leading-relaxed", children: connectionAlert.message })] }), _jsx("button", { onClick: fetchData, className: "hidden sm:flex px-4 py-2 bg-white/70 dark:bg-white/5 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-sm active:scale-95 transition-all", children: "Recheck" })] })), error && (_jsxs("div", { className: "mb-6 sm:mb-10 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 p-4 sm:p-6 rounded-2xl sm:rounded-[2rem] flex items-center gap-3 sm:gap-4 text-red-600 dark:text-red-400", children: [_jsx(AlertCircle, { size: 24, className: "shrink-0" }), _jsxs("div", { className: "flex-grow", children: [_jsx("p", { className: "text-sm font-black uppercase tracking-widest leading-none mb-1", children: "System Error" }), _jsx("p", { className: "text-xs font-bold opacity-80", children: error })] }), _jsx("button", { onClick: fetchData, className: "hidden sm:block px-4 py-2 bg-red-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-red-600/20", children: "Try Again" })] })), _jsxs("div", { className: "space-y-6 sm:space-y-8", children: [_jsxs("div", { className: "flex p-1 bg-gray-100 dark:bg-white/5 rounded-2xl w-full max-w-md mx-auto mb-6 sm:mb-8 shadow-inner border border-gray-200 dark:border-white/5", children: [_jsxs("button", { onClick: () => setActiveTab('control'), className: `flex-1 flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 rounded-xl text-[8px] sm:text-[9px] font-black uppercase tracking-[0.08em] sm:tracking-[0.2em] transition-all ${activeTab === 'control'
                                            ? 'bg-white dark:bg-blue-600 text-blue-600 dark:text-white shadow-lg'
                                            : 'text-gray-400 dark:text-gray-500 hover:text-blue-500'}`, children: [_jsx(SettingsIcon, { size: 14 }), "Access Control"] }), _jsxs("button", { onClick: () => setActiveTab('monitoring'), className: `flex-1 flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 rounded-xl text-[8px] sm:text-[9px] font-black uppercase tracking-[0.08em] sm:tracking-[0.2em] transition-all ${activeTab === 'monitoring'
                                            ? 'bg-white dark:bg-blue-600 text-blue-600 dark:text-white shadow-lg'
                                            : 'text-gray-400 dark:text-gray-500 hover:text-blue-500'}`, children: [_jsx(Activity, { size: 14 }), "Traffic Monitor"] })] }), _jsx(AnimatePresence, { mode: "wait", children: activeTab === 'monitoring' ? (_jsx(motion.div, { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -10 }, transition: { duration: 0.2 }, className: "space-y-6 sm:space-y-10", children: _jsxs("div", { className: "space-y-5 sm:space-y-6", children: [_jsxs("div", { className: "flex items-center gap-3 px-1 sm:px-4", children: [_jsx("div", { className: "w-1.5 h-6 bg-blue-600 rounded-full shrink-0" }), _jsx("h2", { className: "text-xs sm:text-sm font-black uppercase tracking-[0.14em] sm:tracking-[0.3em] text-gray-400", children: "Live Traffic Monitoring" })] }), _jsx(UplinkTrafficCard, { uplinkTraffic: uplinkTraffic }), _jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-4", children: _jsx(AnimatePresence, { mode: "popLayout", children: filteredInterfaces.length > 0 ? (filteredInterfaces.map((iface, idx) => (_jsxs(motion.div, { initial: { opacity: 0, y: 15 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, scale: 0.98 }, transition: { delay: idx * 0.01 }, className: "bg-white dark:bg-[#1C1C1E] rounded-3xl p-4 border border-gray-100 dark:border-white/5 shadow-sm hover:border-blue-500/30 transition-all group flex flex-col h-full", children: [_jsxs("div", { className: "flex items-center justify-between mb-4", children: [_jsx("div", { className: `w-9 h-9 rounded-xl flex items-center justify-center transition-colors shadow-inner ${iface.enabled ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' : 'bg-gray-100 dark:bg-white/5 text-gray-400 dark:text-gray-600'}`, children: iface.enabled ? _jsx(Unlock, { size: 20 }) : _jsx(Lock, { size: 20 }) }), _jsx("div", { className: `px-2 py-1 rounded-md text-[8px] font-black uppercase tracking-widest border transition-colors ${iface.enabled
                                                                            ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border-green-100 dark:border-green-900/30'
                                                                            : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-100 dark:border-red-900/30'}`, children: iface.enabled ? 'NET ON' : 'BLOCK' })] }), _jsxs("div", { className: "space-y-0.5 mb-4 flex-grow", children: [_jsx("h4", { className: "text-sm font-black tracking-tighter uppercase italic line-clamp-1 dark:text-white", children: iface.name }), _jsx("p", { className: "text-[8px] font-bold text-gray-400 uppercase tracking-widest truncate", children: iface.comment || 'VLAN Interface' })] }), _jsx("div", { className: "h-12 w-full mt-auto bg-gray-50/50 dark:bg-white/5 rounded-lg overflow-hidden border border-gray-100 dark:border-white/5 group-hover:bg-blue-50/30 dark:group-hover:bg-blue-900/10 transition-colors", children: iface.enabled ? (_jsx(ResponsiveContainer, { width: "100%", height: "100%", children: _jsxs(AreaChart, { data: trafficHistory[iface.id] || [], margin: { top: 5, right: 0, left: 0, bottom: 0 }, children: [_jsx("defs", { children: _jsxs("linearGradient", { id: `color-${iface.id}`, x1: "0", y1: "0", x2: "0", y2: "1", children: [_jsx("stop", { offset: "5%", stopColor: "#2563eb", stopOpacity: 0.3 }), _jsx("stop", { offset: "95%", stopColor: "#2563eb", stopOpacity: 0 })] }) }), _jsx(Area, { type: "monotone", dataKey: "download", stroke: "#3b82f6", strokeWidth: 1.5, fillOpacity: 1, fill: `url(#color-${iface.id})` })] }) })) : (_jsx("div", { className: "h-full w-full flex items-center justify-center opacity-10 grayscale", children: _jsx(WifiOff, { size: 14 }) })) })] }, iface.id)))) : (_jsxs("div", { className: "col-span-full py-12 sm:py-16 flex flex-col items-center justify-center text-gray-400 bg-white dark:bg-[#1C1C1E] rounded-3xl border border-dashed border-gray-200 dark:border-white/10", children: [_jsx(Search, { size: 32, className: "mb-4 opacity-20" }), _jsx("p", { className: "text-[9px] font-black uppercase tracking-[0.2em]", children: "Interface Not Found" })] })) }) })] }) }, "monitoring")) : (_jsxs(motion.div, { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -10 }, transition: { duration: 0.2 }, className: "space-y-6 sm:space-y-8", children: [_jsxs("div", { className: "flex flex-col lg:flex-row lg:items-center justify-between gap-5 sm:gap-6 px-1 sm:px-4", children: [_jsxs("div", { className: "space-y-1", children: [_jsx("h2", { className: "text-xl sm:text-2xl font-ex-black tracking-tighter italic uppercase dark:text-white leading-tight", children: "Laboratory Internet Control" }), _jsx("p", { className: "text-gray-400 dark:text-gray-500 text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.16em] sm:tracking-widest", children: "Authorized Access Panel" })] }), _jsxs("div", { className: "flex flex-col sm:flex-row items-stretch sm:items-center gap-3", children: [_jsxs("div", { className: "relative group w-full sm:w-64", children: [_jsx(Search, { className: "absolute left-4 top-1/2 -translate-y-1/2 text-gray-400", size: 16 }), _jsx("input", { type: "text", placeholder: "Quick Search...", value: searchQuery, onChange: (e) => setSearchQuery(e.target.value), className: "w-full pl-10 pr-4 py-2.5 bg-white dark:bg-[#1C1C1E] border border-gray-100 dark:border-white/5 rounded-xl text-xs font-bold dark:text-white focus:ring-2 focus:ring-blue-500/20 transition-all outline-none" })] }), _jsxs("button", { onClick: () => setShowOnlyLabs(!showOnlyLabs), className: `flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border ${showOnlyLabs
                                                                ? 'bg-blue-600 border-blue-600 text-white shadow-lg'
                                                                : 'bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-400 dark:text-gray-500'}`, children: [showOnlyLabs ? _jsx(CheckCircle2, { size: 14 }) : _jsx(XCircle, { size: 14 }), "Labs Only"] })] })] }), _jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4", children: _jsx(AnimatePresence, { mode: "popLayout", children: filteredInterfaces.map((iface, idx) => (_jsxs(motion.div, { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, scale: 0.98 }, transition: { delay: idx * 0.01 }, className: "bg-white dark:bg-[#1C1C1E] rounded-3xl p-5 border border-gray-100 dark:border-white/5 shadow-sm hover:border-blue-500/30 transition-all flex flex-col gap-5", children: [_jsxs("div", { className: "flex items-center justify-between gap-3", children: [_jsxs("div", { className: "flex items-center gap-3 min-w-0", children: [_jsx("div", { className: `w-9 h-9 rounded-lg flex items-center justify-center ${iface.enabled ? 'bg-blue-500/10 text-blue-500' : 'bg-gray-500/10 text-gray-500'}`, children: _jsx(Layers, { size: 18 }) }), _jsxs("div", { className: "flex flex-col min-w-0", children: [_jsx("h3", { className: "text-sm font-black uppercase italic tracking-tighter dark:text-white truncate max-w-[120px]", children: iface.name }), _jsxs("div", { className: "flex items-center gap-1.5", children: [_jsx("div", { className: `w-1.5 h-1.5 rounded-full ${iface.running ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}` }), _jsx("span", { className: "text-[8px] font-black uppercase text-gray-400 tracking-widest", children: iface.running ? 'Active' : 'Idle' })] })] })] }), _jsx("div", { className: `px-2 py-1 rounded-md text-[8px] font-black uppercase border shrink-0 ${iface.enabled ? 'border-blue-500/20 text-blue-500 bg-blue-500/10' : 'border-red-500/20 text-red-500 bg-red-500/10'}`, children: iface.enabled ? 'Students On' : 'Students Off' })] }), _jsxs("div", { className: "rounded-2xl border border-gray-100 dark:border-white/5 bg-gray-50/80 dark:bg-white/[0.03] p-3 space-y-3", children: [_jsxs("div", { className: "flex items-center justify-between gap-3", children: [_jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "text-[8px] font-black uppercase tracking-[0.18em] text-gray-400", children: "Queue Tree (Default 100Mbps)" }), _jsx("p", { className: "text-[11px] font-black uppercase tracking-wider text-white truncate", children: iface.hasQueueTree ? (iface.queueTreeName || iface.name) : 'Queue Missing' })] }), _jsx("div", { className: `px-2 py-1 rounded-md text-[8px] font-black uppercase border shrink-0 ${iface.hasQueueTree
                                                                                ? (iface.bandwidthEnabled
                                                                                    ? 'border-emerald-500/20 text-emerald-400 bg-emerald-500/10'
                                                                                    : 'border-amber-500/20 text-amber-400 bg-amber-500/10')
                                                                                : 'border-gray-500/20 text-gray-400 bg-gray-500/10'}`, children: iface.hasQueueTree ? (iface.bandwidthEnabled ? 'Queue On' : 'Queue Off') : 'No Queue' })] }), _jsxs("div", { className: "flex items-center justify-between gap-3", children: [_jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "text-[8px] font-black uppercase tracking-[0.18em] text-gray-400", children: "Current Limit" }), _jsx("p", { className: "text-sm font-black tracking-tight text-white", children: iface.hasQueueTree ? `${formatBandwidthMbps(iface.bandwidthLimitMbps)} Mbps` : '--' })] }), _jsxs("div", { className: "text-right min-w-0", children: [_jsx("p", { className: "text-[8px] font-black uppercase tracking-[0.18em] text-gray-400", children: "Teacher" }), _jsx("p", { className: "text-[10px] font-bold text-gray-300 dark:text-gray-500 truncate", children: iface.teacherIp || '--' })] })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("input", { type: "number", min: "1", step: "1", inputMode: "numeric", value: bandwidthDrafts[iface.id] ?? '', onChange: (e) => setBandwidthDrafts(prev => ({ ...prev, [iface.id]: e.target.value })), placeholder: "Mbps", disabled: !iface.hasQueueTree, className: "flex-1 min-w-0 px-3 py-2 bg-white dark:bg-[#141416] border border-gray-200 dark:border-white/10 rounded-xl text-[11px] font-bold text-white placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-40" }), _jsx("button", { onClick: () => saveBandwidth(iface), disabled: !iface.hasQueueTree || loading, className: "px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest bg-blue-600 hover:bg-blue-700 text-white shadow-md transition-all shrink-0 disabled:opacity-40", children: "Save BW" })] })] }), _jsxs("div", { className: "flex items-center justify-between gap-3 pt-1", children: [_jsx("span", { className: "text-[9px] font-bold text-gray-300 dark:text-gray-600 uppercase tracking-tighter truncate min-w-0", children: iface.comment || '-- No Comm --' }), _jsx("button", { onClick: () => toggleInterface(iface.id, iface.enabled), className: `px-4 sm:px-5 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all shrink-0 ${iface.enabled
                                                                        ? 'bg-red-500 hover:bg-red-600 text-white shadow-md'
                                                                        : 'bg-green-500 hover:bg-green-600 text-white shadow-md'}`, children: iface.enabled ? 'Off Inet Mhs' : 'On Inet Mhs' })] })] }, iface.id))) }) })] }, "control")) })] })] }), _jsxs("footer", { className: "max-w-[1600px] mx-auto px-4 sm:px-10 py-8 sm:py-10 border-t border-gray-100 dark:border-white/5 flex flex-col items-center justify-center text-center gap-5 sm:gap-6 text-gray-300 dark:text-gray-700", children: [_jsxs("div", { className: "flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 ", children: [_jsx(ShieldCheck, { size: 24, className: "shrink-0" }), _jsxs("div", { className: "flex flex-col", children: [_jsx("span", { className: "text-[9px] font-black uppercase tracking-[0.18em] sm:tracking-[0.4em] leading-tight", children: "Labguard FTI Protocol 1.0" }), _jsx("span", { className: "text-[8px] font-bold uppercase tracking-[0.12em] sm:tracking-[0.2em] leading-relaxed", children: "Encrypted Node Access Control" })] })] }), _jsxs("p", { className: "text-[10px] sm:text-[10px] font-black uppercase tracking-[0.14em] sm:tracking-[0.3em] leading-relaxed", children: ["\u00A9 ", new Date().getFullYear(), " Developed by: NCP-Laboran FTI UKSW"] })] })] }));
}
