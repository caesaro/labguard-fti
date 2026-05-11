import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useEffect, useRef, useState } from 'react';
import { WifiOff, ShieldCheck, RefreshCcw, Activity, Settings as SettingsIcon, AlertCircle, Layers, Search, CheckCircle2, XCircle, Unlock, Lock, LogIn, KeyRound, Eye, EyeOff, ShieldAlert } from 'lucide-react';
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
const CONTROL_REFRESH_MS = 3000;
const AUX_REFRESH_MS = 20000;
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
function SitePolicySection({ title, subtitle, emptyLabel, items, renderItem }) {
    return (<div className="space-y-4">
      <div className="flex items-center justify-between gap-3 px-1 sm:px-2">
        <div className="min-w-0">
          <h3 className="text-sm sm:text-base font-black uppercase tracking-[0.16em] text-white">{title}</h3>
          <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400 mt-1">{subtitle}</p>
        </div>
        <div className="px-2 py-1 rounded-md text-[8px] font-black uppercase border border-blue-500/20 text-blue-400 bg-blue-500/10 shrink-0">
          {items.length} Rules
        </div>
      </div>
      {items.length > 0 ? (<div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {items.map(renderItem)}
        </div>) : (<div className="bg-white dark:bg-[#1C1C1E] rounded-3xl border border-dashed border-gray-200 dark:border-white/10 px-5 py-10 text-center text-gray-400">
          <p className="text-[10px] font-black uppercase tracking-[0.2em]">{emptyLabel}</p>
        </div>)}
    </div>);
}
const LABS_ONLY_ORDER_FALLBACK = [
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
const addressListNameFromReference = (reference) => reference.startsWith('Address List: ') ? reference.replace('Address List: ', '') : '';
const buildLabsOnlyIndex = (order) => new Map(order.map((name, index) => [normalizeLabName(name), index]));
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
    const [sitePolicies, setSitePolicies] = useState({
        blockRules: [],
        whitelistRules: [],
        blacklistResources: [],
    });
    const [sitePolicySearchQuery, setSitePolicySearchQuery] = useState('');
    const [policyAccordion, setPolicyAccordion] = useState({
        manager: true,
        whitelist: false,
        blacklist: false,
    });
    const [policyManagerType, setPolicyManagerType] = useState('blacklist');
    const [selectedPolicyList, setSelectedPolicyList] = useState('');
    const [policyEntries, setPolicyEntries] = useState([]);
    const [policyEntryDrafts, setPolicyEntryDrafts] = useState({});
    const [newPolicyEntry, setNewPolicyEntry] = useState({ address: '', comment: '' });
    const [newPolicyList, setNewPolicyList] = useState({ name: '', type: 'blacklist', entriesText: '' });
    const [policyManagerLoading, setPolicyManagerLoading] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [connectionAlert, setConnectionAlert] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [showOnlyLabs, setShowOnlyLabs] = useState(false);
    const [bandwidthDrafts, setBandwidthDrafts] = useState({});
    const [labsOnlyOrder, setLabsOnlyOrder] = useState(LABS_ONLY_ORDER_FALLBACK);
    const labsOnlyOrderIndex = buildLabsOnlyIndex(labsOnlyOrder);
    const coreFetchInFlightRef = useRef(false);
    const auxFetchInFlightRef = useRef(false);
    useEffect(() => {
        fetch('/api/config/labs-only-order')
            .then(r => r.ok ? r.json() : Promise.reject())
            .then(data => {
                if (Array.isArray(data.vlans) && data.vlans.length > 0) {
                    setLabsOnlyOrder(data.vlans);
                }
            })
            .catch(() => { /* keep fallback */ });
    }, []);
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
    const applyRouterStatus = (statusData) => {
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
    };
    const fetchCoreData = async ({ silent = false } = {}) => {
        if (!isAuthenticated || !sessionToken || coreFetchInFlightRef.current)
            return;
        coreFetchInFlightRef.current = true;
        try {
            if (!silent) {
                setLoading(true);
                setError(null);
            }
            const [routerRes, ifacesRes, trafficRes, uplinkRes] = await Promise.allSettled([
                authorizedFetch('/api/router/status').then(r => r.ok ? r.json() : Promise.reject('Status API failed')),
                authorizedFetch('/api/interfaces').then(r => r.ok ? r.json() : Promise.reject('Interfaces API failed')),
                authorizedFetch('/api/interfaces/traffic').then(r => r.ok ? r.json() : Promise.reject('Traffic API failed')),
                authorizedFetch('/api/router/uplink-traffic').then(r => r.ok ? r.json() : Promise.reject('Uplink API failed'))
            ]);
            if (routerRes.status === 'fulfilled') {
                applyRouterStatus(routerRes.value);
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
            if (ifacesRes.status === 'rejected') {
                setError('Gagal memuat daftar interface. Silakan cek koneksi router.');
            }
        }
        catch (err) {
            if (!silent) {
                setConnectionAlert({
                    type: 'error',
                    title: 'Router CCR Connection Failed',
                    message: 'System connection error. Please try again.',
                });
                setError('System connection error. Please try again.');
            }
        }
        finally {
            coreFetchInFlightRef.current = false;
            if (!silent) {
                setLoading(false);
            }
        }
    };
    const fetchAuxData = async () => {
        if (!isAuthenticated || !sessionToken || auxFetchInFlightRef.current)
            return;
        auxFetchInFlightRef.current = true;
        try {
            const [clientsRes, logsRes] = await Promise.allSettled([
                authorizedFetch('/api/router/clients').then(r => r.ok ? r.json() : Promise.reject('Clients API failed')),
                authorizedFetch('/api/logs').then(r => r.ok ? r.json() : Promise.reject('Logs API failed'))
            ]);
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
        }
        finally {
            auxFetchInFlightRef.current = false;
        }
    };
    const fetchSitePolicies = async () => {
        if (!isAuthenticated || !sessionToken)
            return;
        try {
            const response = await authorizedFetch('/api/site-policies');
            if (!response.ok) {
                throw new Error('Gagal memuat data site policy.');
            }
            const data = await response.json();
            setSitePolicies({
                blockRules: Array.isArray(data.blockRules) ? data.blockRules : [],
                whitelistRules: Array.isArray(data.whitelistRules) ? data.whitelistRules : [],
                blacklistResources: Array.isArray(data.blacklistResources) ? data.blacklistResources : [],
            });
        }
        catch (err) {
            setError(err.message || 'Gagal memuat data site policy.');
        }
    };
    const syncPolicyEntryDrafts = (entries) => {
        const drafts = {};
        entries.forEach((entry) => {
            drafts[entry.id] = {
                address: entry.address || '',
                comment: entry.comment || '',
            };
        });
        setPolicyEntryDrafts(drafts);
    };
    const fetchAddressListEntries = async (listName) => {
        if (!isAuthenticated || !sessionToken || !listName)
            return;
        try {
            setPolicyManagerLoading(true);
            const response = await authorizedFetch(`/api/site-policies/address-list/${encodeURIComponent(listName)}`);
            if (!response.ok) {
                throw new Error(`Gagal memuat entry untuk list ${listName}.`);
            }
            const data = await response.json();
            const entries = Array.isArray(data.entries) ? data.entries : [];
            setPolicyEntries(entries);
            syncPolicyEntryDrafts(entries);
        }
        catch (err) {
            setError(err.message || 'Gagal memuat entry address-list.');
        }
        finally {
            setPolicyManagerLoading(false);
        }
    };
    const fetchData = async () => {
        await fetchCoreData();
        await fetchAuxData();
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
            const coreInterval = setInterval(() => {
                fetchCoreData({ silent: true });
            }, CONTROL_REFRESH_MS);
            const auxInterval = setInterval(() => {
                fetchAuxData();
            }, AUX_REFRESH_MS);
            return () => {
                clearInterval(coreInterval);
                clearInterval(auxInterval);
            };
        }
    }, [isAuthenticated, sessionToken]);
    useEffect(() => {
        if (isAuthenticated && sessionToken && activeTab === 'site-policy') {
            fetchSitePolicies();
            const sitePolicyInterval = setInterval(() => {
                fetchSitePolicies();
            }, AUX_REFRESH_MS);
            return () => {
                clearInterval(sitePolicyInterval);
            };
        }
    }, [activeTab, isAuthenticated, sessionToken]);
    const getPolicyListOptions = (type = policyManagerType) => {
        if (type === 'whitelist') {
            return [...new Set(sitePolicies.whitelistRules
                    .flatMap((rule) => (rule.references || []).map(addressListNameFromReference))
                    .filter(Boolean))]
                .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
        }
        return [...new Set(sitePolicies.blacklistResources
                .filter((resource) => resource.type === 'address-list')
                .map((resource) => resource.name)
                .filter(Boolean))]
            .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
    };
    useEffect(() => {
        if (activeTab !== 'site-policy')
            return;
        const options = getPolicyListOptions();
        if (!options.length) {
            setSelectedPolicyList('');
            setPolicyEntries([]);
            setPolicyEntryDrafts({});
            return;
        }
        if (!selectedPolicyList || !options.includes(selectedPolicyList)) {
            setSelectedPolicyList(options[0]);
        }
    }, [activeTab, policyManagerType, sitePolicies]);
    useEffect(() => {
        if (activeTab === 'site-policy' && selectedPolicyList) {
            fetchAddressListEntries(selectedPolicyList);
        }
    }, [activeTab, selectedPolicyList, isAuthenticated, sessionToken]);
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
                fetchCoreData({ silent: true });
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
                fetchCoreData({ silent: true });
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
        return (_jsx("div", { className: "dark bg-[#0A0A0B] min-h-screen flex items-center justify-center p-6 transition-colors duration-500", children: _jsxs(motion.div, { initial: { opacity: 0, scale: 0.9 }, animate: { opacity: 1, scale: 1 }, className: "max-w-md w-full bg-white dark:bg-[#1C1C1E] rounded-[3rem] p-10 shadow-2xl dark:shadow-black/50 border border-gray-100 dark:border-white/5 space-y-10", children: [_jsxs("div", { className: "flex flex-col items-center text-center space-y-4", children: [_jsx("div", { className: "w-16 h-16 bg-blue-600 rounded-3xl flex items-center justify-center text-white shadow-xl shadow-blue-600/20 mb-2", children: _jsx("img", { src: mikrotikLogo, alt: "MikroTik", className: "w-9 h-9 brightness-0 invert" }) }), _jsxs("div", { children: [_jsx("h1", { className: "text-3xl font-black tracking-tighter italic uppercase dark:text-white", children: "Labguard FTI UKSW" }), _jsx("p", { className: "text-gray-400 dark:text-gray-500 text-sm font-bold tracking-widest uppercase mt-1", children: "Please Insert Pin To Login" })] })] }), _jsxs("form", { onSubmit: handleLogin, className: "space-y-6", children: [_jsxs("div", { className: "space-y-2", children: [_jsx("label", { className: "text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 pl-4", children: "Admin PIN Authentication" }), _jsxs("div", { className: "relative group", children: [_jsx(KeyRound, { className: "absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors", size: 20 }), _jsx("input", { type: showPassword ? "text" : "password", value: password, onChange: (e) => setPassword(e.target.value.replace(/\D/g, '').slice(0, 6)), placeholder: "Enter 6 Digit PIN...", inputMode: "numeric", maxLength: 6, pattern: "[0-9]{1,6}", autoComplete: "one-time-code", className: "w-full pl-14 pr-14 py-5 bg-gray-50 dark:bg-[#2C2C2E] border-none rounded-[1.5rem] text-sm font-bold dark:text-white placeholder:text-gray-300 dark:placeholder:text-gray-600 focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-900/30 transition-all outline-none", required: true }), _jsx("button", { type: "button", onClick: () => setShowPassword(!showPassword), className: "absolute right-5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-500", children: showPassword ? _jsx(EyeOff, { size: 20 }) : _jsx(Eye, { size: 20 }) })] }), loginError && (_jsx(motion.p, { initial: { opacity: 0, x: -10 }, animate: { opacity: 1, x: 0 }, className: "text-red-500 text-[10px] font-black uppercase tracking-widest pl-4 mt-2", children: loginError }))] }), _jsx("div", { className: "flex items-center gap-3 px-4 py-2", children: _jsxs("label", { className: "flex items-center gap-3 cursor-pointer group", children: [_jsxs("div", { className: "relative", children: [_jsx("input", { type: "checkbox", checked: rememberMe, onChange: (e) => setRememberMe(e.target.checked), className: "sr-only" }), _jsx("div", { className: `w-10 h-5 rounded-full transition-colors ${rememberMe ? 'bg-blue-600' : 'bg-gray-200 dark:bg-white/10'}` }), _jsx("div", { className: `absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${rememberMe ? 'translate-x-5' : ''}` })] }), _jsx("span", { className: "text-[10px] font-black uppercase tracking-widest text-gray-400 group-hover:text-gray-300 transition-colors", children: "Remember Session" })] }) }), _jsxs("button", { type: "submit", disabled: loading, className: "w-full py-5 bg-blue-600 hover:bg-blue-700 text-white rounded-[1.5rem] text-xs font-black uppercase tracking-[0.3em] shadow-xl shadow-blue-600/20 transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50", children: [_jsx(LogIn, { size: 18 }), loading ? 'Loading...' : 'Login'] })] }), _jsx("div", { className: "pt-6 border-t border-gray-50 dark:border-white/5 flex flex-col items-center justify-center text-center gap-4", children: _jsx("p", { className: "text-[10px] text-gray-300 dark:text-gray-600 font-bold uppercase tracking-widest", children: "Developed by: NCP-Laboran FTI UKSW" }) })] }) }));
    }
    const handleRefresh = () => {
        if (activeTab === 'site-policy') {
            fetchSitePolicies();
            if (selectedPolicyList) {
                fetchAddressListEntries(selectedPolicyList);
            }
            return;
        }
        fetchData();
    };
    const addPolicyEntry = async () => {
        if (!selectedPolicyList) {
            setError('Pilih address-list dulu sebelum menambah target baru.');
            return;
        }
        if (!newPolicyEntry.address.trim()) {
            setError('Target address/host wajib diisi.');
            return;
        }
        try {
            setPolicyManagerLoading(true);
            const response = await authorizedFetch('/api/site-policies/address-list', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    listName: selectedPolicyList,
                    address: newPolicyEntry.address.trim(),
                    comment: newPolicyEntry.comment.trim(),
                }),
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data?.error || 'Gagal menambah target baru.');
            }
            const entries = Array.isArray(data.entries) ? data.entries : [];
            setPolicyEntries(entries);
            syncPolicyEntryDrafts(entries);
            setNewPolicyEntry({ address: '', comment: '' });
            fetchSitePolicies();
        }
        catch (err) {
            setError(err.message || 'Gagal menambah target baru.');
        }
        finally {
            setPolicyManagerLoading(false);
        }
    };
    const savePolicyEntry = async (entry) => {
        const draft = policyEntryDrafts[entry.id] || { address: entry.address || '', comment: entry.comment || '' };
        if (!draft.address.trim()) {
            setError('Target address/host tidak boleh kosong.');
            return;
        }
        try {
            setPolicyManagerLoading(true);
            const response = await authorizedFetch(`/api/site-policies/address-list/${encodeURIComponent(entry.id)}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    listName: selectedPolicyList,
                    address: draft.address.trim(),
                    comment: draft.comment.trim(),
                }),
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data?.error || 'Gagal menyimpan perubahan entry.');
            }
            const entries = Array.isArray(data.entries) ? data.entries : [];
            setPolicyEntries(entries);
            syncPolicyEntryDrafts(entries);
            fetchSitePolicies();
        }
        catch (err) {
            setError(err.message || 'Gagal menyimpan perubahan entry.');
        }
        finally {
            setPolicyManagerLoading(false);
        }
    };
    const togglePolicyEntry = async (entry) => {
        try {
            setPolicyManagerLoading(true);
            const response = await authorizedFetch(`/api/site-policies/address-list/${encodeURIComponent(entry.id)}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    listName: selectedPolicyList,
                    disabled: !entry.disabled,
                }),
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data?.error || 'Gagal mengubah status entry.');
            }
            const entries = Array.isArray(data.entries) ? data.entries : [];
            setPolicyEntries(entries);
            syncPolicyEntryDrafts(entries);
            fetchSitePolicies();
        }
        catch (err) {
            setError(err.message || 'Gagal mengubah status entry.');
        }
        finally {
            setPolicyManagerLoading(false);
        }
    };
    const deletePolicyEntry = async (entry) => {
        try {
            setPolicyManagerLoading(true);
            const response = await authorizedFetch(`/api/site-policies/address-list/${encodeURIComponent(entry.id)}?listName=${encodeURIComponent(selectedPolicyList)}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    listName: selectedPolicyList,
                }),
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data?.error || 'Gagal menghapus entry.');
            }
            const entries = Array.isArray(data.entries) ? data.entries : [];
            setPolicyEntries(entries);
            syncPolicyEntryDrafts(entries);
            fetchSitePolicies();
        }
        catch (err) {
            setError(err.message || 'Gagal menghapus entry.');
        }
        finally {
            setPolicyManagerLoading(false);
        }
    };
    const handleCreatePolicyList = async () => {
        const listName = newPolicyList.name.trim();
        const type = newPolicyList.type;
        if (!listName) {
            setError('Nama list wajib diisi.');
            return;
        }
        const initialEntries = newPolicyList.entriesText
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean);
        try {
            setPolicyManagerLoading(true);
            const response = await authorizedFetch('/api/site-policies/create-list', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ listName, type, initialEntries }),
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data?.error || 'Gagal membuat list baru.');
            }
            setNewPolicyList({ name: '', type: 'blacklist', entriesText: '' });
            await fetchSitePolicies();
            setPolicyManagerType(type);
            setTimeout(() => setSelectedPolicyList(listName), 100);
        }
        catch (err) {
            setError(err.message || 'Gagal membuat list baru.');
        }
        finally {
            setPolicyManagerLoading(false);
        }
    };
    const handleDeletePolicyList = async () => {
        if (!selectedPolicyList) {
            setError('Pilih address-list yang ingin dihapus.');
            return;
        }
        const confirmed = window.confirm(`Hapus list "${selectedPolicyList}" beserta semua entry dan firewall rule-nya?`);
        if (!confirmed) return;
        try {
            setPolicyManagerLoading(true);
            const response = await authorizedFetch('/api/site-policies/delete-list', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ listName: selectedPolicyList, type: policyManagerType }),
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data?.error || 'Gagal menghapus list.');
            }
            setSelectedPolicyList('');
            setPolicyEntries([]);
            setPolicyEntryDrafts({});
            await fetchSitePolicies();
        }
        catch (err) {
            setError(err.message || 'Gagal menghapus list.');
        }
        finally {
            setPolicyManagerLoading(false);
        }
    };
    const renderPolicyReferences = (rule) => ((rule.references || []).length > 0 ? (rule.references.map((reference) => (<span key={`${rule.id}-${reference}`} className="px-2 py-1 rounded-md bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 text-[8px] font-black uppercase tracking-wide text-gray-300">
          {reference}
        </span>))) : (<span className="text-[9px] font-bold uppercase tracking-wide text-gray-500">No Linked List</span>));
    const renderSampleTargets = (resource) => ((resource.sampleTargets || []).length > 0 ? (resource.sampleTargets.map((target) => (<span key={`${resource.id}-${target}`} className="px-2 py-1 rounded-md bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 text-[8px] font-black uppercase tracking-wide text-gray-300">
          {target}
        </span>))) : (<span className="text-[9px] font-bold uppercase tracking-wide text-gray-500">No Sample Target</span>));
    const availablePolicyLists = getPolicyListOptions();
    const normalizedSitePolicySearch = sitePolicySearchQuery.trim().toLowerCase();
    const filteredWhitelistRules = sitePolicies.whitelistRules.filter((rule) => {
        if (!normalizedSitePolicySearch)
            return true;
        const haystack = [
            rule.name,
            rule.source,
            rule.matcher,
            ...(rule.references || []),
        ].join(' ').toLowerCase();
        return haystack.includes(normalizedSitePolicySearch);
    });
    const filteredBlacklistResources = sitePolicies.blacklistResources.filter((resource) => {
        if (!normalizedSitePolicySearch)
            return true;
        const haystack = [
            resource.name,
            resource.type,
            ...(resource.sampleTargets || []),
        ].join(' ').toLowerCase();
        return haystack.includes(normalizedSitePolicySearch);
    });
    const filteredPolicyEntries = policyEntries.filter((entry) => {
        if (!normalizedSitePolicySearch)
            return true;
        const haystack = [
            entry.id,
            entry.list,
            entry.address,
            entry.comment,
            entry.disabled ? 'disabled' : 'active',
        ].join(' ').toLowerCase();
        return haystack.includes(normalizedSitePolicySearch);
    });
    const togglePolicyAccordion = (section) => {
        setPolicyAccordion((prev) => ({
            ...prev,
            [section]: !prev[section],
        }));
    };
    return (<div className="dark bg-[#0A0A0B] min-h-screen text-[#F2F2F7] font-sans selection:bg-blue-100 pb-16 sm:pb-20 transition-colors duration-500">
      <header className="sticky top-0 z-50 bg-white/70 dark:bg-[#1C1C1E]/70 backdrop-blur-xl border-b border-gray-200 dark:border-white/5">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 min-h-16 py-3 sm:py-0 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-black dark:bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-xl shadow-black/10 transition-colors shrink-0">
              <img src={mikrotikLogo} alt="MikroTik" className="w-5 h-5 sm:w-[22px] sm:h-[22px] brightness-0 invert"/>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.0">
                <h1 className="font-ex-black text-lg sm:text-xl tracking-tighter leading-tight italic uppercase truncate">Labguard FTI UKSW</h1>
                <span className="bg-blue-600 text-white text-[8px] font-black px-1 py-0.5 rounded leading-none">PRO</span>
              </div>
              <span className="text-[9px] font-bold tracking-widest text-gray-400 uppercase leading-none">Developed By: NCP-Laboran</span>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-6 shrink-0">
            <div className="hidden md:flex items-center gap-6">
              <div className="flex flex-col items-end">
                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-1">Role</span>
                <span className="text-[10px] font-black uppercase dark:text-blue-400">System Admin</span>
              </div>
              <div className="w-px h-6 bg-gray-200 dark:bg-white/10"/>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <button onClick={handleRefresh} className="p-2 sm:p-2.5 rounded-xl bg-white dark:bg-white/5 border border-gray-200 dark:border-white/5 text-gray-500 dark:text-gray-400 hover:border-blue-600 transition-all active:scale-95 shadow-sm">
                <RefreshCcw size={18} className={loading ? 'animate-spin' : ''}/>
              </button>
              <button onClick={clearSession} className="p-2 sm:p-2.5 rounded-xl bg-red-50 dark:bg-red-900/20 border border-transparent hover:border-red-500 text-red-600 dark:text-red-400 transition-all active:scale-95 shadow-sm">
                <LogIn size={18} className="rotate-180"/>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-4 sm:py-6">
        {connectionAlert && activeConnectionAlertStyle && (<motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className={`mb-6 border p-4 sm:p-5 rounded-2xl sm:rounded-[2rem] flex items-center gap-3 sm:gap-4 shadow-sm ${activeConnectionAlertStyle.container}`}>
            <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center shrink-0 ${activeConnectionAlertStyle.icon}`}>
              {activeConnectionAlertStyle.iconNode}
            </div>
            <div className="flex-grow min-w-0">
              <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.14em] sm:tracking-[0.25em] leading-none mb-2">{connectionAlert.title}</p>
              <p className="text-xs font-bold opacity-80 leading-relaxed">{connectionAlert.message}</p>
            </div>
            <button onClick={fetchData} className="hidden sm:flex px-4 py-2 bg-white/70 dark:bg-white/5 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-sm active:scale-95 transition-all">
              Recheck
            </button>
          </motion.div>)}

        {error && (<div className="mb-6 sm:mb-10 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 p-4 sm:p-6 rounded-2xl sm:rounded-[2rem] flex items-center gap-3 sm:gap-4 text-red-600 dark:text-red-400">
            <AlertCircle size={24} className="shrink-0"/>
            <div className="flex-grow">
              <p className="text-sm font-black uppercase tracking-widest leading-none mb-1">System Error</p>
              <p className="text-xs font-bold opacity-80">{error}</p>
            </div>
            <button onClick={handleRefresh} className="hidden sm:block px-4 py-2 bg-red-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-red-600/20">
              Try Again
            </button>
          </div>)}

        <div className="space-y-6 sm:space-y-8">
          <div className="flex p-1 bg-gray-100 dark:bg-white/5 rounded-2xl w-full max-w-xl mx-auto mb-6 sm:mb-8 shadow-inner border border-gray-200 dark:border-white/5">
            <button onClick={() => setActiveTab('control')} className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 rounded-xl text-[8px] sm:text-[9px] font-black uppercase tracking-[0.08em] sm:tracking-[0.2em] transition-all ${activeTab === 'control'
                    ? 'bg-white dark:bg-blue-600 text-blue-600 dark:text-white shadow-lg'
                    : 'text-gray-400 dark:text-gray-500 hover:text-blue-500'}`}>
              <SettingsIcon size={14}/>
              Access Control
            </button>
            <button onClick={() => setActiveTab('monitoring')} className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 rounded-xl text-[8px] sm:text-[9px] font-black uppercase tracking-[0.08em] sm:tracking-[0.2em] transition-all ${activeTab === 'monitoring'
                    ? 'bg-white dark:bg-blue-600 text-blue-600 dark:text-white shadow-lg'
                    : 'text-gray-400 dark:text-gray-500 hover:text-blue-500'}`}>
              <Activity size={14}/>
              Traffic Monitor
            </button>
            <button onClick={() => setActiveTab('site-policy')} className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 rounded-xl text-[8px] sm:text-[9px] font-black uppercase tracking-[0.08em] sm:tracking-[0.2em] transition-all ${activeTab === 'site-policy'
                    ? 'bg-white dark:bg-blue-600 text-blue-600 dark:text-white shadow-lg'
                    : 'text-gray-400 dark:text-gray-500 hover:text-blue-500'}`}>
              <ShieldAlert size={14}/>
              Site Policy
            </button>
          </div>

          <AnimatePresence mode="wait">
            {activeTab === 'monitoring' ? (<motion.div key="monitoring" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="space-y-6 sm:space-y-10">
                <div className="space-y-5 sm:space-y-6">
                  <div className="flex items-center gap-3 px-1 sm:px-4">
                    <div className="w-1.5 h-6 bg-blue-600 rounded-full shrink-0"/>
                    <h2 className="text-xs sm:text-sm font-black uppercase tracking-[0.14em] sm:tracking-[0.3em] text-gray-400">Live Traffic Monitoring</h2>
                  </div>
                  <UplinkTrafficCard uplinkTraffic={uplinkTraffic}/>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-4">
                    <AnimatePresence mode="popLayout">
                      {filteredInterfaces.length > 0 ? (filteredInterfaces.map((iface, idx) => (<motion.div key={iface.id} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ delay: idx * 0.01 }} className="bg-white dark:bg-[#1C1C1E] rounded-3xl p-4 border border-gray-100 dark:border-white/5 shadow-sm hover:border-blue-500/30 transition-all group flex flex-col h-full">
                            <div className="flex items-center justify-between mb-4">
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors shadow-inner ${iface.enabled ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' : 'bg-gray-100 dark:bg-white/5 text-gray-400 dark:text-gray-600'}`}>
                                {iface.enabled ? <Unlock size={20}/> : <Lock size={20}/>}
                              </div>
                              <div className={`px-2 py-1 rounded-md text-[8px] font-black uppercase tracking-widest border transition-colors ${iface.enabled
                                        ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border-green-100 dark:border-green-900/30'
                                        : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-100 dark:border-red-900/30'}`}>
                                {iface.enabled ? 'NET UP' : 'DOWN'}
                              </div>
                            </div>
                            <div className="space-y-0.5 mb-4 flex-grow">
                              <h4 className="text-sm font-black tracking-tighter uppercase italic line-clamp-1 dark:text-white">{iface.name}</h4>
                              <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest truncate">{iface.comment || 'VLAN Interface'}</p>
                            </div>
                            <div className="h-12 w-full mt-auto bg-gray-50/50 dark:bg-white/5 rounded-lg overflow-hidden border border-gray-100 dark:border-white/5 group-hover:bg-blue-50/30 dark:group-hover:bg-blue-900/10 transition-colors">
                              {iface.enabled ? (<ResponsiveContainer width="100%" height="100%">
                                  <AreaChart data={trafficHistory[iface.id] || []} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                                    <defs>
                                      <linearGradient id={`color-${iface.id}`} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                                      </linearGradient>
                                    </defs>
                                    <Area type="monotone" dataKey="download" stroke="#3b82f6" strokeWidth={1.5} fillOpacity={1} fill={`url(#color-${iface.id})`}/>
                                  </AreaChart>
                                </ResponsiveContainer>) : (<div className="h-full w-full flex items-center justify-center opacity-10 grayscale">
                                  <WifiOff size={14}/>
                                </div>)}
                            </div>
                          </motion.div>))) : (<div className="col-span-full py-12 sm:py-16 flex flex-col items-center justify-center text-gray-400 bg-white dark:bg-[#1C1C1E] rounded-3xl border border-dashed border-gray-200 dark:border-white/10">
                          <Search size={32} className="mb-4 opacity-20"/>
                          <p className="text-[9px] font-black uppercase tracking-[0.2em]">Interface Not Found</p>
                        </div>)}
                    </AnimatePresence>
                  </div>
                </div>
              </motion.div>) : activeTab === 'site-policy' ? (<motion.div key="site-policy" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="space-y-6 sm:space-y-8">
                <div className="space-y-6 sm:space-y-8">
                  <div className="flex items-center gap-3 px-1 sm:px-4">
                    <div className="w-1.5 h-6 bg-blue-600 rounded-full shrink-0"/>
                    <h2 className="text-xs sm:text-sm font-black uppercase tracking-[0.14em] sm:tracking-[0.3em] text-gray-400">Site Access Policy</h2>
                  </div>
                  <div className="px-1 sm:px-2">
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16}/>
                      <input type="text" value={sitePolicySearchQuery} onChange={(e) => setSitePolicySearchQuery(e.target.value)} placeholder="Search rules, list names, targets..." className="w-full pl-10 pr-4 py-3 bg-white dark:bg-[#1C1C1E] border border-gray-100 dark:border-white/5 rounded-2xl text-xs font-bold dark:text-white focus:ring-2 focus:ring-blue-500/20 transition-all outline-none"/>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <button onClick={() => togglePolicyAccordion('manager')} className="w-full flex items-center justify-between gap-3 px-5 py-4 bg-white dark:bg-[#1C1C1E] rounded-3xl border border-gray-100 dark:border-white/5 shadow-sm text-left">
                      <div className="min-w-0">
                        <h3 className="text-sm sm:text-base font-black uppercase tracking-[0.16em] text-white">Policy List Manager</h3>
                        <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400 mt-1">Edit target whitelist atau blacklist berbasis address-list yang sudah dipakai router.</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="px-2 py-1 rounded-md text-[8px] font-black uppercase border border-blue-500/20 text-blue-400 bg-blue-500/10">
                          {filteredPolicyEntries.length} Entries
                        </div>
                        <span className="text-lg font-black text-gray-400">{policyAccordion.manager ? '−' : '+'}</span>
                      </div>
                    </button>

                    {policyAccordion.manager && (<div className="bg-white dark:bg-[#1C1C1E] rounded-3xl p-5 border border-gray-100 dark:border-white/5 shadow-sm space-y-5">
                        <div className="rounded-2xl border border-dashed border-blue-500/30 bg-blue-500/[0.03] p-4 space-y-3">
                          <p className="text-[8px] font-black uppercase tracking-[0.18em] text-blue-400">Create New List</p>
                          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_160px] gap-3">
                            <input type="text" value={newPolicyList.name} onChange={(e) => setNewPolicyList((prev) => ({ ...prev, name: e.target.value }))} placeholder="Nama list baru (cth: gaming, streaming)" className="px-4 py-3 bg-white dark:bg-[#141416] border border-gray-200 dark:border-white/10 rounded-2xl text-[11px] font-bold text-white placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500/20"/>
                            <select value={newPolicyList.type} onChange={(e) => setNewPolicyList((prev) => ({ ...prev, type: e.target.value }))} className="px-4 py-3 bg-white dark:bg-[#141416] border border-gray-200 dark:border-white/10 rounded-2xl text-[11px] font-black uppercase tracking-wide text-white outline-none focus:ring-2 focus:ring-blue-500/20">
                              <option value="blacklist">Blacklist</option>
                              <option value="whitelist">Whitelist</option>
                            </select>
                          </div>
                          <textarea value={newPolicyList.entriesText} onChange={(e) => setNewPolicyList((prev) => ({ ...prev, entriesText: e.target.value }))} placeholder={"Initial entries (opsional, satu per baris)\ncth:\nsteam.com\nepicgames.com"} rows={3} className="w-full px-4 py-3 bg-white dark:bg-[#141416] border border-gray-200 dark:border-white/10 rounded-2xl text-[11px] font-bold text-white placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"/>
                          <button onClick={handleCreatePolicyList} disabled={policyManagerLoading || !newPolicyList.name.trim()} className="px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-blue-600 hover:bg-blue-700 text-white shadow-md transition-all disabled:opacity-40">
                            Create List
                          </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-[180px_minmax(0,1fr)_auto_auto] gap-3">
                          <select value={policyManagerType} onChange={(e) => setPolicyManagerType(e.target.value)} className="px-4 py-3 bg-white dark:bg-[#141416] border border-gray-200 dark:border-white/10 rounded-2xl text-[11px] font-black uppercase tracking-wide text-white outline-none focus:ring-2 focus:ring-blue-500/20">
                            <option value="blacklist">Blacklist</option>
                            <option value="whitelist">Whitelist</option>
                          </select>
                          <select value={selectedPolicyList} onChange={(e) => setSelectedPolicyList(e.target.value)} disabled={!availablePolicyLists.length} className="px-4 py-3 bg-white dark:bg-[#141416] border border-gray-200 dark:border-white/10 rounded-2xl text-[11px] font-black uppercase tracking-wide text-white outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-40">
                            {availablePolicyLists.length > 0 ? (availablePolicyLists.map((listName) => (<option key={listName} value={listName}>{listName}</option>))) : (<option value="">No Address List</option>)}
                          </select>
                          <button onClick={() => selectedPolicyList && fetchAddressListEntries(selectedPolicyList)} disabled={!selectedPolicyList || policyManagerLoading} className="px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-blue-600 hover:bg-blue-700 text-white shadow-md transition-all disabled:opacity-40">
                            Reload
                          </button>
                          <button onClick={handleDeletePolicyList} disabled={!selectedPolicyList || policyManagerLoading} className="px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-red-600 hover:bg-red-700 text-white shadow-md transition-all disabled:opacity-40">
                            Delete List
                          </button>
                        </div>

                        <div className="rounded-2xl border border-gray-100 dark:border-white/5 bg-gray-50/80 dark:bg-white/[0.03] p-4 space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-[8px] font-black uppercase tracking-[0.18em] text-gray-400">Add New Target</p>
                            <span className="text-[8px] font-bold uppercase tracking-wide text-gray-500">List: {selectedPolicyList || '--'}</span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-3">
                            <input type="text" value={newPolicyEntry.address} onChange={(e) => setNewPolicyEntry((prev) => ({ ...prev, address: e.target.value }))} placeholder="Target host / address" disabled={!selectedPolicyList} className="px-4 py-3 bg-white dark:bg-[#141416] border border-gray-200 dark:border-white/10 rounded-2xl text-[11px] font-bold text-white placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-40"/>
                            <input type="text" value={newPolicyEntry.comment} onChange={(e) => setNewPolicyEntry((prev) => ({ ...prev, comment: e.target.value }))} placeholder="Comment (optional)" disabled={!selectedPolicyList} className="px-4 py-3 bg-white dark:bg-[#141416] border border-gray-200 dark:border-white/10 rounded-2xl text-[11px] font-bold text-white placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-40"/>
                            <button onClick={addPolicyEntry} disabled={!selectedPolicyList || policyManagerLoading} className="px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-emerald-600 hover:bg-emerald-700 text-white shadow-md transition-all disabled:opacity-40">
                              Add
                            </button>
                          </div>
                        </div>

                        {selectedPolicyList ? (<div className="space-y-3">
                            {filteredPolicyEntries.length > 0 ? (filteredPolicyEntries.map((entry) => (<div key={entry.id} className="rounded-2xl border border-gray-100 dark:border-white/5 bg-gray-50/80 dark:bg-white/[0.03] p-4 space-y-3">
                                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="text-[8px] font-black uppercase tracking-[0.18em] text-gray-400">Entry ID</p>
                                      <p className="text-[10px] font-bold text-gray-300 break-all">{entry.id}</p>
                                    </div>
                                    <div className={`px-2 py-1 rounded-md text-[8px] font-black uppercase border shrink-0 ${entry.disabled ? 'border-amber-500/20 text-amber-400 bg-amber-500/10' : 'border-emerald-500/20 text-emerald-400 bg-emerald-500/10'}`}>
                                      {entry.disabled ? 'Disabled' : 'Active'}
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <input type="text" value={policyEntryDrafts[entry.id]?.address ?? ''} onChange={(e) => setPolicyEntryDrafts((prev) => ({ ...prev, [entry.id]: { ...prev[entry.id], address: e.target.value } }))} placeholder="Target host / address" className="px-4 py-3 bg-white dark:bg-[#141416] border border-gray-200 dark:border-white/10 rounded-2xl text-[11px] font-bold text-white placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500/20"/>
                                    <input type="text" value={policyEntryDrafts[entry.id]?.comment ?? ''} onChange={(e) => setPolicyEntryDrafts((prev) => ({ ...prev, [entry.id]: { ...prev[entry.id], comment: e.target.value } }))} placeholder="Comment" className="px-4 py-3 bg-white dark:bg-[#141416] border border-gray-200 dark:border-white/10 rounded-2xl text-[11px] font-bold text-white placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500/20"/>
                                  </div>
                                  <div className="flex flex-col sm:flex-row gap-3">
                                    <button onClick={() => savePolicyEntry(entry)} disabled={policyManagerLoading} className="px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-blue-600 hover:bg-blue-700 text-white shadow-md transition-all disabled:opacity-40">
                                      Save Entry
                                    </button>
                                    <button onClick={() => togglePolicyEntry(entry)} disabled={policyManagerLoading} className={`px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-md transition-all disabled:opacity-40 ${entry.disabled
                                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                            : 'bg-amber-500 hover:bg-amber-600 text-white'}`}>
                                      {entry.disabled ? 'Enable Entry' : 'Disable Entry'}
                                    </button>
                                    <button onClick={() => deletePolicyEntry(entry)} disabled={policyManagerLoading} className="px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-red-600 hover:bg-red-700 text-white shadow-md transition-all disabled:opacity-40">
                                      Delete Entry
                                    </button>
                                  </div>
                                </div>))) : (<div className="rounded-2xl border border-dashed border-gray-200 dark:border-white/10 px-5 py-10 text-center text-gray-400">
                              <p className="text-[10px] font-black uppercase tracking-[0.2em]">{policyManagerLoading ? 'Loading Entries...' : 'No Matching Entry Found'}</p>
                            </div>)}
                          </div>) : (<div className="rounded-2xl border border-dashed border-gray-200 dark:border-white/10 px-5 py-10 text-center text-gray-400">
                          <p className="text-[10px] font-black uppercase tracking-[0.2em]">Belum ada address-list yang bisa dikelola di mode ini</p>
                        </div>)}
                      </div>)}
                  </div>

                  <div className="space-y-4">
                    <button onClick={() => togglePolicyAccordion('whitelist')} className="w-full flex items-center justify-between gap-3 px-5 py-4 bg-white dark:bg-[#1C1C1E] rounded-3xl border border-gray-100 dark:border-white/5 shadow-sm text-left">
                      <div className="min-w-0">
                        <h3 className="text-sm sm:text-base font-black uppercase tracking-[0.16em] text-white">Whitelist Rules</h3>
                        <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400 mt-1">Rule accept yang jadi pengecualian akses untuk domain atau layanan tertentu.</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="px-2 py-1 rounded-md text-[8px] font-black uppercase border border-blue-500/20 text-blue-400 bg-blue-500/10">
                          {filteredWhitelistRules.length} Rules
                        </div>
                        <span className="text-lg font-black text-gray-400">{policyAccordion.whitelist ? '−' : '+'}</span>
                      </div>
                    </button>

                    {policyAccordion.whitelist && (<SitePolicySection title="Whitelist Rules" subtitle="Rule accept yang jadi pengecualian akses untuk domain atau layanan tertentu." emptyLabel="Belum ada whitelist rule yang terdeteksi" items={filteredWhitelistRules} renderItem={(rule) => (<div key={rule.id} className="bg-white dark:bg-[#1C1C1E] rounded-3xl p-5 border border-gray-100 dark:border-white/5 shadow-sm space-y-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <h4 className="text-sm font-black uppercase tracking-tight text-white">{rule.name}</h4>
                                <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-gray-400 mt-1">{rule.source}</p>
                              </div>
                              <div className={`px-2 py-1 rounded-md text-[8px] font-black uppercase border shrink-0 ${rule.status === 'active' ? 'border-emerald-500/20 text-emerald-400 bg-emerald-500/10' : 'border-amber-500/20 text-amber-400 bg-amber-500/10'}`}>
                                {rule.status}
                              </div>
                            </div>
                            <div className="space-y-2">
                              <p className="text-[8px] font-black uppercase tracking-[0.18em] text-gray-400">Matcher</p>
                              <p className="text-[11px] font-bold text-gray-200 break-words">{rule.matcher || '--'}</p>
                            </div>
                            <div className="flex flex-wrap gap-2">{renderPolicyReferences(rule)}</div>
                          </div>)}/>)}
                  </div>

                  <div className="space-y-4">
                    <button onClick={() => togglePolicyAccordion('blacklist')} className="w-full flex items-center justify-between gap-3 px-5 py-4 bg-white dark:bg-[#1C1C1E] rounded-3xl border border-gray-100 dark:border-white/5 shadow-sm text-left">
                      <div className="min-w-0">
                        <h3 className="text-sm sm:text-base font-black uppercase tracking-[0.16em] text-white">Blacklist Sources</h3>
                        <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400 mt-1">Sumber data yang dipakai router untuk block site, termasuk address-list dan layer7.</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="px-2 py-1 rounded-md text-[8px] font-black uppercase border border-blue-500/20 text-blue-400 bg-blue-500/10">
                          {filteredBlacklistResources.length} Rules
                        </div>
                        <span className="text-lg font-black text-gray-400">{policyAccordion.blacklist ? '−' : '+'}</span>
                      </div>
                    </button>

                    {policyAccordion.blacklist && (<SitePolicySection title="Blacklist Sources" subtitle="Sumber data yang dipakai router untuk block site, termasuk address-list dan layer7." emptyLabel="Belum ada source blacklist yang terdeteksi" items={filteredBlacklistResources} renderItem={(resource) => (<div key={resource.id} className="bg-white dark:bg-[#1C1C1E] rounded-3xl p-5 border border-gray-100 dark:border-white/5 shadow-sm space-y-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <h4 className="text-sm font-black uppercase tracking-tight text-white">{resource.name}</h4>
                                <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-gray-400 mt-1">{resource.type}</p>
                              </div>
                              <div className={`px-2 py-1 rounded-md text-[8px] font-black uppercase border shrink-0 ${resource.status === 'active' ? 'border-blue-500/20 text-blue-400 bg-blue-500/10' : 'border-amber-500/20 text-amber-400 bg-amber-500/10'}`}>
                                {resource.status}
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="rounded-2xl border border-gray-100 dark:border-white/5 bg-gray-50/80 dark:bg-white/[0.03] px-4 py-3">
                                <p className="text-[8px] font-black uppercase tracking-[0.18em] text-gray-400">Entries</p>
                                <p className="text-lg font-black tracking-tight text-white mt-1">{resource.totalEntries ?? '--'}</p>
                              </div>
                              <div className="rounded-2xl border border-gray-100 dark:border-white/5 bg-gray-50/80 dark:bg-white/[0.03] px-4 py-3">
                                <p className="text-[8px] font-black uppercase tracking-[0.18em] text-gray-400">Type</p>
                                <p className="text-sm font-black tracking-tight text-white mt-1 uppercase">{resource.type || '--'}</p>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <p className="text-[8px] font-black uppercase tracking-[0.18em] text-gray-400">Sample Target</p>
                              <div className="flex flex-wrap gap-2">{renderSampleTargets(resource)}</div>
                            </div>
                          </div>)}/>)}
                  </div>
                </div>
              </motion.div>) : (<motion.div key="control" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="space-y-6 sm:space-y-8">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 sm:gap-6 px-1 sm:px-4">
                  <div className="space-y-1">
                    <h2 className="text-xl sm:text-2xl font-ex-black tracking-tighter italic uppercase dark:text-white leading-tight">Laboratory Internet Control</h2>
                    <p className="text-gray-400 dark:text-gray-500 text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.16em] sm:tracking-widest">Authorized Access Panel</p>
                  </div>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <div className="relative group w-full sm:w-64">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16}/>
                      <input type="text" placeholder="Quick Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-[#1C1C1E] border border-gray-100 dark:border-white/5 rounded-xl text-xs font-bold dark:text-white focus:ring-2 focus:ring-blue-500/20 transition-all outline-none"/>
                    </div>
                    <button onClick={() => setShowOnlyLabs(!showOnlyLabs)} className={`flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border ${showOnlyLabs
                            ? 'bg-blue-600 border-blue-600 text-white shadow-lg'
                            : 'bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-400 dark:text-gray-500'}`}>
                      {showOnlyLabs ? <CheckCircle2 size={14}/> : <XCircle size={14}/>}
                      Labs Only
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  <AnimatePresence mode="popLayout">
                    {filteredInterfaces.map((iface, idx) => (<motion.div key={iface.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ delay: idx * 0.01 }} className="bg-white dark:bg-[#1C1C1E] rounded-3xl p-5 border border-gray-100 dark:border-white/5 shadow-sm hover:border-blue-500/30 transition-all flex flex-col gap-5">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${iface.enabled ? 'bg-blue-500/10 text-blue-500' : 'bg-gray-500/10 text-gray-500'}`}>
                              <Layers size={18}/>
                            </div>
                            <div className="flex flex-col min-w-0">
                              <h3 className="text-sm font-black uppercase italic tracking-tighter dark:text-white truncate max-w-[120px]">{iface.name}</h3>
                              <div className="flex items-center gap-1.5">
                                <div className={`w-1.5 h-1.5 rounded-full ${iface.running ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}/>
                                <span className="text-[8px] font-black uppercase text-gray-400 tracking-widest">{iface.running ? 'Active' : 'Idle'}</span>
                              </div>
                            </div>
                          </div>
                          <div className={`px-2 py-1 rounded-md text-[8px] font-black uppercase border shrink-0 ${iface.enabled ? 'border-blue-500/20 text-blue-500 bg-blue-500/10' : 'border-red-500/20 text-red-500 bg-red-500/10'}`}>
                            {iface.enabled ? 'Students On' : 'Students Off'}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-gray-100 dark:border-white/5 bg-gray-50/80 dark:bg-white/[0.03] p-3 space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[8px] font-black uppercase tracking-[0.18em] text-gray-400">Queue Tree (Default 100Mbps)</p>
                              <p className="text-[11px] font-black uppercase tracking-wider text-white truncate">{iface.hasQueueTree ? (iface.queueTreeName || iface.name) : 'Queue Missing'}</p>
                            </div>
                            <div className={`px-2 py-1 rounded-md text-[8px] font-black uppercase border shrink-0 ${iface.hasQueueTree
                                    ? (iface.bandwidthEnabled
                                        ? 'border-emerald-500/20 text-emerald-400 bg-emerald-500/10'
                                        : 'border-amber-500/20 text-amber-400 bg-amber-500/10')
                                    : 'border-gray-500/20 text-gray-400 bg-gray-500/10'}`}>
                              {iface.hasQueueTree ? (iface.bandwidthEnabled ? 'Queue On' : 'Queue Off') : 'No Queue'}
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[8px] font-black uppercase tracking-[0.18em] text-gray-400">Current Limit</p>
                              <p className="text-sm font-black tracking-tight text-white">{iface.hasQueueTree ? `${formatBandwidthMbps(iface.bandwidthLimitMbps)} Mbps` : '--'}</p>
                            </div>
                            <div className="text-right min-w-0">
                              <p className="text-[8px] font-black uppercase tracking-[0.18em] text-gray-400">Teacher NAT</p>
                              <p className="text-[10px] font-bold text-gray-300 dark:text-gray-500 truncate">{iface.teacherIp || '--'}</p>
                              <div className={`mt-1 inline-flex items-center px-2 py-1 rounded-md text-[8px] font-black uppercase border ${iface.teacherInternetEnabled
                                      ? 'border-emerald-500/20 text-emerald-400 bg-emerald-500/10'
                                      : 'border-rose-500/20 text-rose-400 bg-rose-500/10'}`}>
                                {iface.teacherInternetEnabled ? 'Teacher On' : 'Teacher Off'}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <input type="number" min="1" step="1" inputMode="numeric" value={bandwidthDrafts[iface.id] ?? ''} onChange={(e) => setBandwidthDrafts(prev => ({ ...prev, [iface.id]: e.target.value }))} placeholder="Mbps" disabled={!iface.hasQueueTree} className="flex-1 min-w-0 px-3 py-2 bg-white dark:bg-[#141416] border border-gray-200 dark:border-white/10 rounded-xl text-[11px] font-bold text-white placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-40"/>
                            <button onClick={() => saveBandwidth(iface)} disabled={!iface.hasQueueTree || loading} className="px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest bg-blue-600 hover:bg-blue-700 text-white shadow-md transition-all shrink-0 disabled:opacity-40">
                              Save
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-3 pt-1">
                          <span className="text-[9px] font-bold text-gray-300 dark:text-gray-600 uppercase tracking-tighter truncate min-w-0">{iface.comment || '-- No Comm --'}</span>
                          <button onClick={() => toggleInterface(iface.id, iface.enabled)} className={`px-4 sm:px-5 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all shrink-0 ${iface.enabled
                                  ? 'bg-red-500 hover:bg-red-600 text-white shadow-md'
                                  : 'bg-green-500 hover:bg-green-600 text-white shadow-md'}`}>
                            {iface.enabled ? 'Off Inet Mhs' : 'On Inet Mhs'}
                          </button>
                        </div>
                      </motion.div>))}
                  </AnimatePresence>
                </div>
              </motion.div>)}
          </AnimatePresence>
        </div>
      </main>

      <footer className="max-w-[1600px] mx-auto px-4 sm:px-10 py-8 sm:py-10 border-t border-gray-100 dark:border-white/5 flex flex-col items-center justify-center text-center gap-5 sm:gap-6 text-gray-300 dark:text-gray-700">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 ">
          <ShieldCheck size={24} className="shrink-0"/>
          <div className="flex flex-col">
            <span className="text-[9px] font-black uppercase tracking-[0.18em] sm:tracking-[0.4em] leading-tight">Labguard FTI Protocol 1.0</span>
            <span className="text-[8px] font-bold uppercase tracking-[0.12em] sm:tracking-[0.2em] leading-relaxed">Powered by Mikrotik</span>
          </div>
        </div>
        <p className="text-[10px] sm:text-[10px] font-black uppercase tracking-[0.14em] sm:tracking-[0.3em] leading-relaxed">
          © {new Date().getFullYear()}-Developed by: NCP-Laboran FTI UKSW
        </p>
      </footer>
    </div>);
}
