import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useEffect, useRef, useState } from 'react';
import { WifiOff, ShieldCheck, RefreshCcw, Activity, Settings as SettingsIcon, AlertCircle, Layers, Search, CheckCircle2, XCircle, Unlock, Lock, LogIn, KeyRound, Eye, EyeOff, ShieldAlert, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import mikrotikLogo from './assets/mikrotik-logo.svg';
import translations from './i18n.js';
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
function UplinkTrafficCard({ uplinkTraffic, t }) {
    return (<div className="bg-white dark:bg-[#1C1C1E] rounded-3xl p-4 sm:p-5 border border-gray-100 dark:border-white/5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
              <Activity size={18}/>
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400">{t('backboneUplink')}</p>
              <h3 className="text-sm sm:text-base font-bold uppercase tracking-tight text-white truncate">{uplinkTraffic?.name || 'ether2-backboneUKSW'}</h3>
            </div>
          </div>
        </div>
        <div className="px-2 py-1 rounded-md text-[8px] font-bold uppercase border border-blue-500/20 text-blue-400 bg-blue-500/10 shrink-0">
          {t('live')}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-2xl border border-gray-100 dark:border-white/5 bg-gray-50/80 dark:bg-white/[0.03] px-4 py-3">
          <p className="text-[8px] font-bold uppercase tracking-wider text-gray-400">{t('download')}</p>
          <p className="text-lg font-bold tracking-tight text-white mt-1">{formatRateMbps(uplinkTraffic?.rxRate)}</p>
        </div>
        <div className="rounded-2xl border border-gray-100 dark:border-white/5 bg-gray-50/80 dark:bg-white/[0.03] px-4 py-3">
          <p className="text-[8px] font-bold uppercase tracking-wider text-gray-400">{t('upload')}</p>
          <p className="text-lg font-bold tracking-tight text-white mt-1">{formatRateMbps(uplinkTraffic?.txRate)}</p>
        </div>
      </div>
    </div>);
}
function SitePolicySection({ title, subtitle, emptyLabel, items, renderItem, hideHeader = false, t }) {
    return (<div className="space-y-4">
      {!hideHeader && (<div className="flex items-center justify-between gap-3 px-1 sm:px-2">
          <div className="min-w-0">
            <h3 className="text-sm sm:text-base font-bold uppercase tracking-wider text-white">{title}</h3>
            <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400 mt-1">{subtitle}</p>
          </div>
          <div className="px-2 py-1 rounded-md text-[8px] font-bold uppercase border border-blue-500/20 text-blue-400 bg-blue-500/10 shrink-0">
            {items.length} {t ? t('rules') : 'Rules'}
          </div>
        </div>)}
      {items.length > 0 ? (<div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {items.map(renderItem)}
        </div>) : (<div className="bg-white dark:bg-[#1C1C1E] rounded-3xl border border-dashed border-gray-200 dark:border-white/10 px-5 py-10 text-center text-gray-400">
          <p className="text-[10px] font-bold uppercase tracking-wider">{emptyLabel}</p>
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
    const [lang, setLang] = useState(() => localStorage.getItem('labguard_lang') || 'en');
    const t = (key) => (translations[lang] && translations[lang][key]) || key;
    const toggleLang = () => { const next = lang === 'en' ? 'id' : 'en'; setLang(next); localStorage.setItem('labguard_lang', next); };
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
    const [newPolicyEntry, setNewPolicyEntry] = useState({ address: '', comment: '', strictBlacklist: true });
    const [newPolicyList, setNewPolicyList] = useState({ name: '', type: 'blacklist', entriesText: '', strictBlacklist: true });
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
    if (!isAuthenticated) {
        return (
            <div className="dark bg-[#0A0A0B] min-h-screen flex items-center justify-center p-6 transition-colors duration-500 relative">
                <div className="absolute top-4 right-4">
                    <button 
                        type="button" 
                        onClick={toggleLang} 
                        className="flex items-center gap-1 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-bold transition-all active:scale-95 shadow-sm hover:border-blue-600/30"
                    >
                        <span className={lang === 'en' ? 'text-blue-400' : 'text-gray-500'}>EN</span>
                        <span className="text-zinc-700">/</span>
                        <span className={lang === 'id' ? 'text-blue-400' : 'text-gray-500'}>ID</span>
                    </button>
                </div>
                <motion.div 
                    initial={{ opacity: 0, y: 15 }} 
                    animate={{ opacity: 1, y: 0 }} 
                    className="max-w-md w-full bg-white dark:bg-[#1C1C1E] rounded-2xl p-8 sm:p-10 shadow-xl border border-gray-100 dark:border-white/5 space-y-8"
                >
                    <div className="flex flex-col items-center text-center space-y-4">
                        <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-600/10 mb-1">
                            <img src={mikrotikLogo} alt="MikroTik" className="w-8 h-8 brightness-0 invert" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight uppercase dark:text-white">{t('loginTitle')}</h1>
                            <p className="text-gray-400 dark:text-gray-500 text-xs font-semibold tracking-wider uppercase mt-1">{t('loginSubtitle')}</p>
                        </div>
                    </div>

                    <form onSubmit={handleLogin} className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 pl-1">{t('pinLabel')}</label>
                            <div className="relative group">
                                <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors" size={18} />
                                <input 
                                    type={showPassword ? "text" : "password"} 
                                    value={password} 
                                    onChange={(e) => setPassword(e.target.value.replace(/\D/g, '').slice(0, 6))} 
                                    placeholder={t('pinPlaceholder')} 
                                    inputMode="numeric" 
                                    maxLength={6} 
                                    pattern="[0-9]{1,6}" 
                                    autoComplete="one-time-code" 
                                    className="w-full pl-12 pr-12 py-4 bg-gray-50 dark:bg-[#2C2C2E] border border-gray-200 dark:border-white/5 rounded-xl text-sm font-semibold dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-600 focus:ring-2 focus:ring-blue-500/20 transition-all outline-none" 
                                    required 
                                />
                                <button 
                                    type="button" 
                                    onClick={() => setShowPassword(!showPassword)} 
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-500"
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                            {loginError && (
                                <motion.p 
                                    initial={{ opacity: 0, x: -10 }} 
                                    animate={{ opacity: 1, x: 0 }} 
                                    className="text-red-500 text-[10px] font-semibold tracking-wide pl-1 mt-2 uppercase"
                                >
                                    {loginError}
                                </motion.p>
                            )}
                        </div>

                        <div className="flex items-center gap-3 px-1 py-1">
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <div className="relative">
                                    <input 
                                        type="checkbox" 
                                        checked={rememberMe} 
                                        onChange={(e) => setRememberMe(e.target.checked)} 
                                        className="sr-only" 
                                    />
                                    <div className={`w-9 h-5 rounded-full transition-colors ${rememberMe ? 'bg-blue-600' : 'bg-gray-200 dark:bg-white/10'}`} />
                                    <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${rememberMe ? 'translate-x-4' : ''}`} />
                                </div>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 group-hover:text-gray-300 transition-colors">{t('rememberSession')}</span>
                            </label>
                        </div>

                        <button 
                            type="submit" 
                            disabled={loading} 
                            className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold uppercase tracking-widest shadow-lg shadow-blue-600/10 transition-all flex items-center justify-center gap-2.5 active:scale-[0.98] disabled:opacity-50"
                        >
                            <LogIn size={16} />
                            {loading ? t('loadingText') : t('loginButton')}
                        </button>
                    </form>

                    <div className="pt-6 border-t border-gray-50 dark:border-white/5 flex flex-col items-center justify-center text-center gap-4">
                        <p className="text-[9px] text-gray-400 dark:text-gray-500 font-semibold uppercase tracking-wider">{t('developedBy')}</p>
                    </div>
                </motion.div>
            </div>
        );
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
                    strictBlacklist: Boolean(newPolicyEntry.strictBlacklist),
                }),
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data?.error || 'Gagal menambah target baru.');
            }
            const entries = Array.isArray(data.entries) ? data.entries : [];
            setPolicyEntries(entries);
            syncPolicyEntryDrafts(entries);
            setNewPolicyEntry((prev) => ({ address: '', comment: '', strictBlacklist: prev.strictBlacklist }));
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
                body: JSON.stringify({ listName, type, initialEntries, strictBlacklist: Boolean(newPolicyList.strictBlacklist) }),
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data?.error || 'Gagal membuat list baru.');
            }
            setNewPolicyList((prev) => ({ name: '', type: 'blacklist', entriesText: '', strictBlacklist: prev.strictBlacklist }));
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
            setError(lang === 'en' ? 'Select an address-list to delete first.' : 'Pilih address-list yang ingin dihapus.');
            return;
        }
        const confirmed = window.confirm(
            lang === 'en'
                ? `Delete list "${selectedPolicyList}" along with all its entries and firewall rules?`
                : `Hapus list "${selectedPolicyList}" beserta semua entry dan firewall rule-nya?`
        );
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
    const renderPolicyReferences = (rule) => ((rule.references || []).length > 0 ? (rule.references.map((reference) => (<span key={`${rule.id}-${reference}`} className="px-2 py-1 rounded-md bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 text-[8px] font-bold uppercase tracking-wide text-gray-300">
          {reference}
        </span>))) : (<span className="text-[9px] font-bold uppercase tracking-wide text-gray-500">{t('noLinkedList')}</span>));
    const renderSampleTargets = (resource) => ((resource.sampleTargets || []).length > 0 ? (resource.sampleTargets.map((target) => (<span key={`${resource.id}-${target}`} className="px-2 py-1 rounded-md bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 text-[8px] font-bold uppercase tracking-wide text-gray-300">
          {target}
        </span>))) : (<span className="text-[9px] font-bold uppercase tracking-wide text-gray-500">{t('noSampleTarget')}</span>));
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
    const activeConnectionAlertStyle = connectionAlert ? connectionAlertStyles[connectionAlert.type] : null;
    return (<div className="dark bg-[#09090b] min-h-screen text-[#F2F2F7] font-sans selection:bg-blue-600 selection:text-white pb-16 sm:pb-20 transition-colors duration-500">
      <header className="sticky top-0 z-50 bg-[#09090b]/90 backdrop-blur-md border-b border-zinc-800">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 min-h-16 py-3 sm:py-0 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shrink-0">
              <img src={mikrotikLogo} alt="MikroTik" className="w-5 h-5 sm:w-[22px] sm:h-[22px] brightness-0 invert"/>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="font-bold text-base sm:text-lg tracking-wider uppercase truncate">Labguard FTI UKSW</h1>
                <span className="bg-blue-600/20 text-blue-400 border border-blue-500/20 text-[8px] font-bold px-1.5 py-0.5 rounded leading-none">PRO</span>
              </div>
              <span className="text-[9px] font-semibold tracking-wider text-gray-400 uppercase leading-none">{t('managedBy')}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-6 shrink-0">
            <div className="hidden md:flex items-center gap-6">
              <div className="flex flex-col items-end">
                <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider leading-none mb-1">{t('role')}</span>
                <span className="text-[10px] font-bold uppercase text-blue-400">{t('systemAdmin')}</span>
              </div>
              <div className="w-px h-6 bg-zinc-800"/>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <button onClick={toggleLang} className="flex items-center gap-1 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-bold transition-all active:scale-95 shadow-sm hover:border-blue-600/30">
                <span className={lang === 'en' ? 'text-blue-400' : 'text-gray-500'}>EN</span>
                <span className="text-zinc-700">/</span>
                <span className={lang === 'id' ? 'text-blue-400' : 'text-gray-500'}>ID</span>
              </button>
              <button onClick={handleRefresh} className="p-2 sm:p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-gray-400 hover:text-white hover:border-blue-600 transition-all active:scale-95 shadow-sm">
                <RefreshCcw size={16} className={loading ? 'animate-spin' : ''}/>
              </button>
              <button onClick={clearSession} className="p-2 sm:p-2.5 rounded-xl bg-red-950/40 border border-red-900/20 hover:border-red-500 text-red-400 transition-all active:scale-95 shadow-sm">
                <LogIn size={16} className="rotate-180"/>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-4 sm:py-6">
        {connectionAlert && activeConnectionAlertStyle && (<motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className={`mb-6 border p-4 sm:p-5 rounded-xl flex items-center gap-3 sm:gap-4 shadow-sm ${activeConnectionAlertStyle.container}`}>
            <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 ${activeConnectionAlertStyle.icon}`}>
              {activeConnectionAlertStyle.iconNode}
            </div>
            <div className="flex-grow min-w-0">
              <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider leading-none mb-2">
                {connectionAlert.type === 'success' 
                  ? (lang === 'en' ? 'Router CCR Connected' : 'Router CCR Terhubung')
                  : connectionAlert.type === 'warning'
                    ? (lang === 'en' ? 'Simulation Mode Active' : 'Mode Simulasi Aktif')
                    : (lang === 'en' ? 'Router CCR Connection Failed' : 'Koneksi Router CCR Gagal')}
              </p>
              <p className="text-xs font-semibold opacity-95 leading-relaxed">
                {connectionAlert.type === 'success'
                  ? (lang === 'en' 
                      ? `Connection to ${routerStatus.resource?.['board-name'] || 'MikroTik CCR'} Successful! Proceed to manage student internet access.`
                      : `Koneksi ke ${routerStatus.resource?.['board-name'] || 'MikroTik CCR'} Sukses!, gass bro akses kontrol internet mahasiswa.`)
                  : connectionAlert.type === 'warning'
                    ? (lang === 'en'
                        ? 'Router credentials are not active yet, dashboard is currently running on simulated data.'
                        : 'Kredensial router belum aktif, dashboard masih memakai data simulasi.')
                    : (connectionAlert.message || (lang === 'en' ? 'Failed to read CCR router status.' : 'Gagal membaca status router CCR.'))}
              </p>
            </div>
            <button onClick={fetchData} className="hidden sm:flex px-4 py-2 bg-zinc-900 border border-zinc-800 text-gray-300 rounded-xl text-[9px] font-bold uppercase tracking-wider shadow-sm active:scale-95 transition-all">
              {t('recheckButton')}
            </button>
          </motion.div>)}

        {error && (<div className="mb-6 sm:mb-10 bg-red-950/20 border border-red-900/30 p-4 sm:p-6 rounded-xl flex items-center gap-3 sm:gap-4 text-red-400">
            <AlertCircle size={20} className="shrink-0"/>
            <div className="flex-grow">
              <p className="text-xs font-bold uppercase tracking-wider leading-none mb-1">{t('systemError')}</p>
              <p className="text-xs font-semibold opacity-95">
                {error === 'Gagal memuat daftar interface. Silakan cek koneksi router.'
                  ? (lang === 'en' ? 'Failed to load interface list. Please check the router connection.' : 'Gagal memuat daftar interface. Silakan cek koneksi router.')
                  : error === 'System connection error. Please try again.'
                    ? (lang === 'en' ? 'System connection error. Please try again.' : 'Koneksi sistem bermasalah. Silakan coba lagi.')
                    : error}
              </p>
            </div>
            <button onClick={handleRefresh} className="hidden sm:block px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-[10px] font-bold uppercase tracking-wider shadow-lg">
              {t('retryButton')}
            </button>
          </div>)}

        <div className="space-y-6 sm:space-y-8">
          <div className="flex p-1 bg-zinc-900 rounded-xl w-full max-w-xl mx-auto mb-6 sm:mb-8 border border-zinc-800">
            <button onClick={() => setActiveTab('control')} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all ${activeTab === 'control'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-gray-400 hover:text-blue-500'}`}>
              <SettingsIcon size={13}/>
              {t('accessControl')}
            </button>
            <button onClick={() => setActiveTab('monitoring')} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all ${activeTab === 'monitoring'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-gray-400 hover:text-blue-500'}`}>
              <Activity size={13}/>
              {t('trafficMonitor')}
            </button>
            <button onClick={() => setActiveTab('site-policy')} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all ${activeTab === 'site-policy'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-gray-400 hover:text-blue-500'}`}>
              <ShieldAlert size={13}/>
              {t('sitePolicy')}
            </button>
          </div>

          <AnimatePresence mode="wait">
            {activeTab === 'monitoring' ? (<motion.div key="monitoring" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="space-y-6 sm:space-y-10">
                <div className="space-y-5 sm:space-y-6">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 sm:gap-6 px-1 sm:px-4">
                    <div className="space-y-1">
                      <h2 className="text-xl sm:text-2xl font-bold tracking-tight uppercase dark:text-white leading-tight">{t('realtimeTraffic')}</h2>
                      <p className="text-gray-400 dark:text-gray-500 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider">{t('networkThroughput')}</p>
                    </div>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                      <div className="relative group w-full sm:w-64">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16}/>
                        <input type="text" placeholder={t('searchInterface')} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-[#1C1C1E] border border-gray-100 dark:border-white/5 rounded-xl text-xs font-bold dark:text-white focus:ring-2 focus:ring-blue-500/20 transition-all outline-none"/>
                      </div>
                      <button onClick={() => setShowOnlyLabs(!showOnlyLabs)} className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-[9px] font-bold tracking-wider transition-all border ${showOnlyLabs
                              ? 'bg-blue-600 border-blue-600 text-white shadow-lg'
                              : 'bg-white dark:bg-white/5 border-zinc-800 text-gray-400'}`}>
                        {showOnlyLabs ? <CheckCircle2 size={14}/> : <XCircle size={14}/>}
                        {t('labsOnly')}
                      </button>
                    </div>
                  </div>
                  <UplinkTrafficCard uplinkTraffic={uplinkTraffic} t={t}/>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-4">
                    <AnimatePresence mode="popLayout">
                      {filteredInterfaces.length > 0 ? (filteredInterfaces.map((iface, idx) => (<motion.div key={iface.id} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ delay: idx * 0.01 }} className="bg-white dark:bg-[#1C1C1E] rounded-xl p-4 border border-gray-100 dark:border-white/5 shadow-sm hover:border-blue-500/30 transition-all group flex flex-col h-full">
                            <div className="flex items-center justify-between mb-4">
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors shadow-inner ${iface.enabled ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' : 'bg-gray-100 dark:bg-white/5 text-gray-400 dark:text-gray-600'}`}>
                                {iface.enabled ? <Unlock size={18}/> : <Lock size={18}/>}
                              </div>
                              <div className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider border transition-colors ${iface.enabled
                                        ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border-green-100 dark:border-green-900/30'
                                        : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-100 dark:border-red-900/30'}`}>
                                {iface.enabled ? t('active') : t('inactive')}
                              </div>
                            </div>
                            <div className="space-y-0.5 mb-4 flex-grow">
                              <h4 className="text-sm font-bold tracking-tight uppercase line-clamp-1 dark:text-white">{iface.name}</h4>
                              <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider truncate">{iface.comment || t('vlanInterface')}</p>
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
                          </motion.div>))) : (<div className="col-span-full py-12 sm:py-16 flex flex-col items-center justify-center text-gray-400 bg-white dark:bg-[#1C1C1E] rounded-xl border border-dashed border-gray-200 dark:border-white/10">
                          <Search size={28} className="mb-3 opacity-20"/>
                          <p className="text-[9px] font-bold uppercase tracking-wider">{t('interfaceNotFound')}</p>
                        </div>)}
                    </AnimatePresence>
                  </div>
                </div>
              </motion.div>) : activeTab === 'site-policy' ? (<motion.div key="site-policy" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="space-y-6 sm:space-y-8">
                <div className="space-y-6 sm:space-y-8">
                  <div className="flex items-center gap-3 px-1 sm:px-4">
                    <div className="w-1.5 h-6 bg-blue-600 rounded-full shrink-0"/>
                    <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-gray-400">{t('siteAccessPolicy')}</h2>
                  </div>
                  <div className="px-1 sm:px-2">
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16}/>
                      <input type="text" value={sitePolicySearchQuery} onChange={(e) => setSitePolicySearchQuery(e.target.value)} placeholder={t('searchRulesPlaceholder')} className="w-full pl-10 pr-4 py-3 bg-white dark:bg-[#1C1C1E] border border-gray-100 dark:border-white/5 rounded-xl text-xs font-bold dark:text-white focus:ring-2 focus:ring-blue-500/20 transition-all outline-none"/>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <button onClick={() => togglePolicyAccordion('manager')} className="w-full flex items-center justify-between gap-3 px-5 py-4 bg-white dark:bg-[#1C1C1E] rounded-xl border border-gray-100 dark:border-white/5 shadow-sm text-left">
                      <div className="min-w-0">
                        <h3 className="text-sm sm:text-base font-bold uppercase tracking-wider text-white">{t('policyListManager')}</h3>
                        <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-gray-400 mt-1">{t('policyListManagerDesc')}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="px-2 py-0.5 rounded text-[8px] font-bold uppercase border border-blue-500/20 text-blue-400 bg-blue-500/10">
                          {filteredPolicyEntries.length} {t('entries')}
                        </div>
                        <ChevronDown size={18} className={`text-gray-400 transition-transform ${policyAccordion.manager ? 'rotate-180' : ''}`}/>
                      </div>
                    </button>

                    {policyAccordion.manager && (<div className="bg-white dark:bg-[#1C1C1E] rounded-xl p-5 border border-gray-100 dark:border-white/5 shadow-sm space-y-5">
                        <div className="rounded-xl border border-dashed border-blue-500/30 bg-blue-500/[0.03] p-4 space-y-3">
                          <p className="text-[8px] font-bold uppercase tracking-wider text-blue-400">{t('createNewList')}</p>
                          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_160px] gap-3">
                            <input type="text" value={newPolicyList.name} onChange={(e) => setNewPolicyList((prev) => ({ ...prev, name: e.target.value }))} placeholder={t('newListPlaceholder')} className="px-4 py-3 bg-white dark:bg-[#141416] border border-gray-200 dark:border-white/10 rounded-2xl text-[11px] font-bold text-white placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500/20"/>
                            <select value={newPolicyList.type} onChange={(e) => setNewPolicyList((prev) => ({ ...prev, type: e.target.value }))} className="px-4 py-3 bg-white dark:bg-[#141416] border border-gray-200 dark:border-white/10 rounded-2xl text-[11px] font-bold uppercase tracking-wide text-white outline-none focus:ring-2 focus:ring-blue-500/20">
                              <option value="blacklist">{t('blacklistLabel')}</option>
                              <option value="whitelist">{t('whitelistLabel')}</option>
                            </select>
                          </div>
                          <textarea value={newPolicyList.entriesText} onChange={(e) => setNewPolicyList((prev) => ({ ...prev, entriesText: e.target.value }))} placeholder={t('initialEntriesPlaceholder')} rows={3} className="w-full px-4 py-3 bg-white dark:bg-[#141416] border border-gray-200 dark:border-white/10 rounded-2xl text-[11px] font-bold text-white placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"/>
                          {newPolicyList.type === 'blacklist' && (<label className="flex items-center gap-3 px-1 cursor-pointer group">
                              <input type="checkbox" checked={newPolicyList.strictBlacklist} onChange={(e) => setNewPolicyList((prev) => ({ ...prev, strictBlacklist: e.target.checked }))} className="w-4 h-4 rounded border-white/10 bg-[#141416] text-blue-600 focus:ring-blue-500/20"/>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-300">{t('strictWebBlock')}</span>
                            </label>)}
                          <button onClick={handleCreatePolicyList} disabled={policyManagerLoading || !newPolicyList.name.trim()} className="px-5 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest bg-blue-600 hover:bg-blue-700 text-white shadow-md transition-all disabled:opacity-40">
                            {t('createList')}
                          </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-[180px_minmax(0,1fr)_auto_auto] gap-3">
                          <select value={policyManagerType} onChange={(e) => setPolicyManagerType(e.target.value)} className="px-4 py-3 bg-white dark:bg-[#141416] border border-gray-200 dark:border-white/10 rounded-xl text-[11px] font-bold uppercase tracking-wide text-white outline-none focus:ring-2 focus:ring-blue-500/20">
                            <option value="blacklist">{t('blacklistLabel')}</option>
                            <option value="whitelist">{t('whitelistLabel')}</option>
                          </select>
                          <select value={selectedPolicyList} onChange={(e) => setSelectedPolicyList(e.target.value)} disabled={!availablePolicyLists.length} className="px-4 py-3 bg-white dark:bg-[#141416] border border-gray-200 dark:border-white/10 rounded-xl text-[11px] font-bold uppercase tracking-wide text-white outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-40">
                            {availablePolicyLists.length > 0 ? (availablePolicyLists.map((listName) => (<option key={listName} value={listName}>{listName}</option>))) : (<option value="">{t('noAddressList')}</option>)}
                          </select>
                          <button onClick={() => selectedPolicyList && fetchAddressListEntries(selectedPolicyList)} disabled={!selectedPolicyList || policyManagerLoading} className="px-4 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest bg-blue-600 hover:bg-blue-700 text-white shadow-md transition-all disabled:opacity-40">
                            {t('reload')}
                          </button>
                          <button onClick={handleDeletePolicyList} disabled={!selectedPolicyList || policyManagerLoading} className="px-4 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest bg-red-600 hover:bg-red-700 text-white shadow-md transition-all disabled:opacity-40">
                            {t('deleteList')}
                          </button>
                        </div>

                        <div className="rounded-2xl border border-gray-100 dark:border-white/5 bg-gray-50/80 dark:bg-white/[0.03] p-4 space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-[8px] font-bold uppercase tracking-wider text-gray-400">{t('addNewTarget')}</p>
                            <span className="text-[8px] font-bold uppercase tracking-wide text-gray-500">{t('listLabel')}: {selectedPolicyList || '--'}</span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-3">
                            <input type="text" value={newPolicyEntry.address} onChange={(e) => setNewPolicyEntry((prev) => ({ ...prev, address: e.target.value }))} placeholder={t('hostAddress')} disabled={!selectedPolicyList} className="px-4 py-3 bg-white dark:bg-[#141416] border border-gray-200 dark:border-white/10 rounded-xl text-[11px] font-bold text-white placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-40"/>
                            <input type="text" value={newPolicyEntry.comment} onChange={(e) => setNewPolicyEntry((prev) => ({ ...prev, comment: e.target.value }))} placeholder={t('commentOptional')} disabled={!selectedPolicyList} className="px-4 py-3 bg-white dark:bg-[#141416] border border-gray-200 dark:border-white/10 rounded-xl text-[11px] font-bold text-white placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-40"/>
                            <button onClick={addPolicyEntry} disabled={!selectedPolicyList || policyManagerLoading} className="px-4 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest bg-emerald-600 hover:bg-emerald-700 text-white shadow-md transition-all disabled:opacity-40">
                              {t('add')}
                            </button>
                          </div>
                          {policyManagerType === 'blacklist' && (<label className="flex items-center gap-3 px-1 cursor-pointer group">
                              <input type="checkbox" checked={newPolicyEntry.strictBlacklist} onChange={(e) => setNewPolicyEntry((prev) => ({ ...prev, strictBlacklist: e.target.checked }))} disabled={!selectedPolicyList} className="w-4 h-4 rounded border-white/10 bg-[#141416] text-blue-600 focus:ring-blue-500/20 disabled:opacity-40"/>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-300">{t('strictWebBlock')}</span>
                            </label>)}
                          <p className="text-[9px] font-bold text-gray-500">
                            {t('domainNote')}
                          </p>
                        </div>

                        {selectedPolicyList ? (<div className="space-y-3">
                            {filteredPolicyEntries.length > 0 ? (filteredPolicyEntries.map((entry) => (<div key={entry.id} className="rounded-2xl border border-gray-100 dark:border-white/5 bg-gray-50/80 dark:bg-white/[0.03] p-4 space-y-3">
                                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="text-[8px] font-bold uppercase tracking-wider text-gray-400">{t('entryId')}</p>
                                      <p className="text-[10px] font-bold text-gray-300 break-all">{entry.id}</p>
                                    </div>
                                    <div className={`px-2 py-1 rounded-md text-[8px] font-bold uppercase border shrink-0 ${entry.disabled ? 'border-amber-500/20 text-amber-400 bg-amber-500/10' : 'border-emerald-500/20 text-emerald-400 bg-emerald-500/10'}`}>
                                      {entry.disabled ? t('disabled') : t('active')}
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <input type="text" value={policyEntryDrafts[entry.id]?.address ?? ''} onChange={(e) => setPolicyEntryDrafts((prev) => ({ ...prev, [entry.id]: { ...prev[entry.id], address: e.target.value } }))} placeholder={t('hostAddress')} className="px-4 py-3 bg-white dark:bg-[#141416] border border-gray-200 dark:border-white/10 rounded-xl text-[11px] font-bold text-white placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500/20"/>
                                    <input type="text" value={policyEntryDrafts[entry.id]?.comment ?? ''} onChange={(e) => setPolicyEntryDrafts((prev) => ({ ...prev, [entry.id]: { ...prev[entry.id], comment: e.target.value } }))} placeholder={t('commentLabel')} className="px-4 py-3 bg-white dark:bg-[#141416] border border-gray-200 dark:border-white/10 rounded-xl text-[11px] font-bold text-white placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500/20"/>
                                  </div>
                                  <div className="flex flex-col sm:flex-row gap-3">
                                    <button onClick={() => savePolicyEntry(entry)} disabled={policyManagerLoading} className="px-4 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest bg-blue-600 hover:bg-blue-700 text-white shadow-md transition-all disabled:opacity-40">
                                      {t('saveEntry')}
                                    </button>
                                    <button onClick={() => togglePolicyEntry(entry)} disabled={policyManagerLoading} className={`px-4 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest shadow-md transition-all disabled:opacity-40 ${entry.disabled
                                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                            : 'bg-amber-500 hover:bg-amber-600 text-white'}`}>
                                      {entry.disabled ? t('enableEntry') : t('disableEntry')}
                                    </button>
                                    <button onClick={() => deletePolicyEntry(entry)} disabled={policyManagerLoading} className="px-4 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest bg-red-600 hover:bg-red-700 text-white shadow-md transition-all disabled:opacity-40">
                                      {t('deleteEntry')}
                                    </button>
                                  </div>
                                </div>))) : (<div className="rounded-2xl border border-dashed border-gray-200 dark:border-white/10 px-5 py-10 text-center text-gray-400">
                              <p className="text-[10px] font-bold uppercase tracking-wider">{policyManagerLoading ? t('loadingEntries') : t('noMatchingEntry')}</p>
                            </div>)}
                          </div>) : (<div className="rounded-2xl border border-dashed border-gray-200 dark:border-white/10 px-5 py-10 text-center text-gray-400">
                          <p className="text-[10px] font-bold uppercase tracking-wider">{t('noAddressListAvailable')}</p>
                        </div>)}
                      </div>)}
                  </div>

                  <div className="space-y-4">
                    <button onClick={() => togglePolicyAccordion('whitelist')} className="w-full flex items-center justify-between gap-3 px-5 py-4 bg-white dark:bg-[#1C1C1E] rounded-3xl border border-gray-100 dark:border-white/5 shadow-sm text-left">
                      <div className="min-w-0">
                        <h3 className="text-sm sm:text-base font-bold uppercase tracking-wider text-white">{t('whitelistRules')}</h3>
                        <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-gray-400 mt-1">{t('whitelistRulesDesc')}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="px-2 py-1 rounded-md text-[8px] font-bold uppercase border border-blue-500/20 text-blue-400 bg-blue-500/10">
                          {filteredWhitelistRules.length} {t('rules')}
                        </div>
                        <ChevronDown size={18} className={`text-gray-400 transition-transform ${policyAccordion.whitelist ? 'rotate-180' : ''}`}/>
                      </div>
                    </button>

                    {policyAccordion.whitelist && (<SitePolicySection title={t('whitelistRules')} subtitle={t('whitelistRulesDesc')} emptyLabel={t('noWhitelistRules')} items={filteredWhitelistRules} hideHeader={true} t={t} renderItem={(rule) => (<div key={rule.id} className="bg-white dark:bg-[#1C1C1E] rounded-xl p-5 border border-gray-100 dark:border-white/5 shadow-sm space-y-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <h4 className="text-sm font-bold uppercase tracking-tight text-white">{rule.name}</h4>
                                <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mt-1">{rule.source}</p>
                              </div>
                              <div className={`px-2 py-1 rounded-md text-[8px] font-bold uppercase border shrink-0 ${rule.status === 'active' ? 'border-emerald-500/20 text-emerald-400 bg-emerald-500/10' : 'border-amber-500/20 text-amber-400 bg-amber-500/10'}`}>
                                {rule.status === 'active' ? t('active') : t('inactive')}
                              </div>
                            </div>
                            <div className="space-y-2">
                              <p className="text-[8px] font-bold uppercase tracking-wider text-gray-400">{t('matcher')}</p>
                              <p className="text-[11px] font-bold text-gray-200 break-words">{rule.matcher || '--'}</p>
                            </div>
                            <div className="flex flex-wrap gap-2">{renderPolicyReferences(rule)}</div>
                          </div>)}/>)}
                  </div>

                  <div className="space-y-4">
                    <button onClick={() => togglePolicyAccordion('blacklist')} className="w-full flex items-center justify-between gap-3 px-5 py-4 bg-white dark:bg-[#1C1C1E] rounded-3xl border border-gray-100 dark:border-white/5 shadow-sm text-left">
                      <div className="min-w-0">
                        <h3 className="text-sm sm:text-base font-bold uppercase tracking-wider text-white">{t('blacklistSources')}</h3>
                        <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-gray-400 mt-1">{t('blacklistSourcesDesc')}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="px-2 py-1 rounded-md text-[8px] font-bold uppercase border border-blue-500/20 text-blue-400 bg-blue-500/10">
                          {filteredBlacklistResources.length} {t('rules')}
                        </div>
                        <ChevronDown size={18} className={`text-gray-400 transition-transform ${policyAccordion.blacklist ? 'rotate-180' : ''}`}/>
                      </div>
                    </button>

                    {policyAccordion.blacklist && (<SitePolicySection title={t('blacklistSources')} subtitle={t('blacklistSourcesDesc')} emptyLabel={t('noBlacklistSources')} items={filteredBlacklistResources} hideHeader={true} t={t} renderItem={(resource) => (<div key={resource.id} className="bg-white dark:bg-[#1C1C1E] rounded-xl p-5 border border-gray-100 dark:border-white/5 shadow-sm space-y-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <h4 className="text-sm font-bold uppercase tracking-tight text-white">{resource.name}</h4>
                                <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mt-1">{resource.type}</p>
                              </div>
                              <div className={`px-2 py-1 rounded-md text-[8px] font-bold uppercase border shrink-0 ${resource.status === 'active' ? 'border-blue-500/20 text-blue-400 bg-blue-500/10' : 'border-amber-500/20 text-amber-400 bg-amber-500/10'}`}>
                                {resource.status === 'active' ? t('active') : t('inactive')}
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="rounded-2xl border border-gray-100 dark:border-white/5 bg-gray-50/80 dark:bg-white/[0.03] px-4 py-3">
                                <p className="text-[8px] font-bold uppercase tracking-wider text-gray-400">{t('totalEntries')}</p>
                                <p className="text-lg font-bold tracking-tight text-white mt-1">{resource.totalEntries ?? '--'}</p>
                              </div>
                              <div className="rounded-2xl border border-gray-100 dark:border-white/5 bg-gray-50/80 dark:bg-white/[0.03] px-4 py-3">
                                <p className="text-[8px] font-bold uppercase tracking-wider text-gray-400">{t('type')}</p>
                                <p className="text-sm font-bold tracking-tight text-white mt-1 uppercase">{resource.type || '--'}</p>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <p className="text-[8px] font-bold uppercase tracking-wider text-gray-400">{t('sampleTarget')}</p>
                              <div className="flex flex-wrap gap-2">{renderSampleTargets(resource)}</div>
                            </div>
                          </div>)}/>)}
                  </div>
                </div>
              </motion.div>) : (<motion.div key="control" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="space-y-6 sm:space-y-8">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 sm:gap-6 px-1 sm:px-4">
                  <div className="space-y-1">
                    <h2 className="text-xl sm:text-2xl font-bold tracking-tight uppercase dark:text-white leading-tight">{t('labAccessControl')}</h2>
                    <p className="text-gray-400 dark:text-gray-500 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider">{t('mainControlPanel')}</p>
                  </div>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <div className="relative group w-full sm:w-64">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16}/>
                      <input type="text" placeholder={t('searchLabVlan')} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-[#1C1C1E] border border-gray-100 dark:border-white/5 rounded-xl text-xs font-bold dark:text-white focus:ring-2 focus:ring-blue-500/20 transition-all outline-none"/>
                    </div>
                    <button onClick={() => setShowOnlyLabs(!showOnlyLabs)} className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-[9px] font-bold uppercase tracking-wider transition-all border ${showOnlyLabs
                            ? 'bg-blue-600 border-blue-600 text-white shadow-lg'
                            : 'bg-white dark:bg-white/5 border-zinc-800 text-gray-400'}`}>
                      {showOnlyLabs ? <CheckCircle2 size={14}/> : <XCircle size={14}/>}
                      {t('labsOnly')}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  <AnimatePresence mode="popLayout">
                    {filteredInterfaces.map((iface, idx) => (<motion.div key={iface.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ delay: idx * 0.01 }} className="bg-white dark:bg-[#1C1C1E] rounded-xl p-5 border border-gray-100 dark:border-white/5 shadow-sm hover:border-blue-500/30 transition-all flex flex-col gap-5">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${iface.enabled ? 'bg-blue-500/10 text-blue-500' : 'bg-gray-500/10 text-gray-500'}`}>
                              <Layers size={18}/>
                            </div>
                            <div className="flex flex-col min-w-0">
                              <h3 className="text-sm font-bold uppercase tracking-tight dark:text-white truncate max-w-[120px]">{iface.name}</h3>
                              <div className="flex items-center gap-1.5">
                                <div className={`w-1.5 h-1.5 rounded-full ${iface.running ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}/>
                                <span className="text-[8px] font-bold uppercase text-gray-400 tracking-wider">{iface.running ? t('active') : t('idle')}</span>
                              </div>
                            </div>
                          </div>
                          <div className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase border shrink-0 ${iface.enabled ? 'border-blue-500/20 text-blue-500 bg-blue-500/10' : 'border-red-500/20 text-red-500 bg-red-500/10'}`}>
                            {iface.enabled ? t('accessActive') : t('access Inactive')}
                          </div>
                        </div>

                        <div className="rounded-xl border border-gray-100 dark:border-white/5 bg-gray-50/80 dark:bg-white/[0.03] p-3 space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[8px] font-bold uppercase tracking-wider text-gray-400">{t('queueTree')}</p>
                              <p className="text-[11px] font-bold uppercase tracking-wider text-white truncate">{iface.hasQueueTree ? (iface.queueTreeName || iface.name) : t('limitNotFound')}</p>
                            </div>
                            <div className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase border shrink-0 ${iface.hasQueueTree
                                    ? (iface.bandwidthEnabled
                                        ? 'border-emerald-500/20 text-emerald-400 bg-emerald-500/10'
                                        : 'border-amber-500/20 text-amber-400 bg-amber-500/10')
                                    : 'border-gray-500/20 text-gray-400 bg-gray-500/10'}`}>
                              {iface.hasQueueTree ? (iface.bandwidthEnabled ? t('active') : t('inactive')) : t('noQueue')}
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[8px] font-bold uppercase tracking-wider text-gray-400">{t('currentLimit')}</p>
                              <p className="text-sm font-bold tracking-tight text-white">{iface.hasQueueTree ? `${formatBandwidthMbps(iface.bandwidthLimitMbps)} Mbps` : '--'}</p>
                            </div>
                            <div className="text-right min-w-0">
                              <p className="text-[8px] font-bold uppercase tracking-wider text-gray-400">{t('lecturerNat')}</p>
                              <p className="text-[10px] font-bold text-gray-300 dark:text-gray-500 truncate">{iface.teacherIp || '--'}</p>
                              <div className={`mt-1 inline-flex items-center px-2 py-0.5 rounded text-[8px] font-bold uppercase border ${iface.teacherInternetEnabled
                                      ? 'border-emerald-500/20 text-emerald-400 bg-emerald-500/10'
                                      : 'border-rose-500/20 text-rose-400 bg-rose-500/10'}`}>
                                {iface.teacherInternetEnabled ? t('lecturerActive') : t('lecturerInactive')}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <input type="number" min="1" step="1" inputMode="numeric" value={bandwidthDrafts[iface.id] ?? ''} onChange={(e) => setBandwidthDrafts(prev => ({ ...prev, [iface.id]: e.target.value }))} placeholder="Mbps" disabled={!iface.hasQueueTree} className="flex-1 min-w-0 px-3 py-2 bg-white dark:bg-[#141416] border border-gray-200 dark:border-white/10 rounded-xl text-[11px] font-bold text-white placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-40"/>
                            <button onClick={() => saveBandwidth(iface)} disabled={!iface.hasQueueTree || loading} className="px-3 py-2 rounded-xl text-[9px] font-bold uppercase tracking-wider bg-blue-600 hover:bg-blue-700 text-white shadow-md transition-all shrink-0 disabled:opacity-40">
                              {t('save')}
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-3 pt-1">
                          <span className="text-[9px] font-bold text-gray-300 dark:text-gray-600 uppercase tracking-tight truncate min-w-0">{iface.comment || t('noComment')}</span>
                          <button onClick={() => toggleInterface(iface.id, iface.enabled)} className={`px-4 sm:px-5 py-2 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all shrink-0 ${iface.enabled
                                  ? 'bg-red-600 hover:bg-red-700 text-white shadow-md'
                                  : 'bg-green-600 hover:bg-green-700 text-white shadow-md'}`}>
                            {iface.enabled ? t('Disable') : t('Enable')}
                          </button>
                        </div>
                      </motion.div>))}
                  </AnimatePresence>
                </div>
              </motion.div>)}
          </AnimatePresence>
        </div>
      </main>

      <footer className="max-w-[1600px] mx-auto px-4 sm:px-10 py-8 sm:py-10 border-t border-zinc-800 flex flex-col items-center justify-center text-center gap-5 sm:gap-6 text-gray-300 dark:text-gray-600">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 ">
          <ShieldCheck size={20} className="shrink-0 text-blue-500"/>
          <div className="flex flex-col">
            <span className="text-[9px] font-bold uppercase tracking-wider leading-tight">{t('footerTitle')}</span>
            <span className="text-[8px] font-semibold uppercase tracking-wider leading-relaxed text-gray-500">{t('footerSubtitle')}</span>
          </div>
        </div>
        <p className="text-[9px] font-semibold uppercase tracking-wider leading-relaxed text-gray-500">
          © {new Date().getFullYear()} - {t('footerCopyright')}
        </p>
      </footer>
    </div>);
}
