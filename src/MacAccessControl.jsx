import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ban, CheckCircle2, Loader2, Pencil, Plus, RefreshCcw, Save, Search, ShieldOff, Trash2, Wifi, X } from 'lucide-react';

const MAC_PATTERN = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/;
const normalizeMac = (value) => value.trim().replace(/[-\s]+/g, ':').toUpperCase();

export default function MacAccessControl({ authorizedFetch, interfaces = [], t, onError, standalone = false }) {
    const [entries, setEntries] = useState([]);
    const [unmanaged, setUnmanaged] = useState([]);
    const [loading, setLoading] = useState(true);
    const [adding, setAdding] = useState(false);
    const [busyId, setBusyId] = useState('');
    const [search, setSearch] = useState('');
    const [showUnmanaged, setShowUnmanaged] = useState(false);
    const [draft, setDraft] = useState({ mac: '', label: '', scope: '', action: 'drop' });
    const [notice, setNotice] = useState(null);
    const [editingId, setEditingId] = useState('');
    const [editDraft, setEditDraft] = useState({ mac: '', label: '', scope: '', action: 'drop' });
    const [savingEdit, setSavingEdit] = useState(false);
    const tr = useCallback((key) => (t ? t(key) : key), [t]);

    // onError dari parent biasanya arrow function baru tiap render; simpan di ref supaya
    // identitas `load` tidak ikut berubah tiap render (pemicu fetch berulang).
    const onErrorRef = useRef(onError);
    useEffect(() => {
        onErrorRef.current = onError;
    }, [onError]);

    const load = useCallback(async ({ silent = false, refresh = false } = {}) => {
        if (!silent)
            setLoading(true);
        try {
            // Muat data utama via backend (backend punya cache pendek + dedupe in-flight).
            // refresh=1 memaksa backend membaca ulang dari router (dipakai tombol RELOAD).
            const response = await authorizedFetch(`/api/mac-access${refresh ? '?refresh=1' : ''}`);
            const data = await response.json().catch(() => ({}));
            if (!response.ok)
                throw new Error(data?.error || 'Gagal memuat daftar MAC access.');
            setEntries(Array.isArray(data.entries) ? data.entries : []);
            setUnmanaged(Array.isArray(data.unmanaged) ? data.unmanaged : []);
        }
        catch (error) {
            if (onErrorRef.current)
                onErrorRef.current(error.message || 'Gagal memuat daftar MAC access.');
        }
        finally {
            setLoading(false);
        }
    }, [authorizedFetch]);

    // Muat sekali saat komponen pertama tampil. Guard ref mencegah fetch berulang walaupun
    // identitas `load` berubah (mis. parent re-render) — dulu ini bikin spinner tak berhenti.
    const initialLoadRef = useRef(false);
    useEffect(() => {
        if (initialLoadRef.current)
            return;
        initialLoadRef.current = true;
        load({ refresh: true });
    }, [load]);

    const scopeOptions = useMemo(() => {
        const names = interfaces
            .map((iface) => iface?.name)
            .filter((name) => typeof name === 'string' && name.length > 0);
        return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
    }, [interfaces]);

    const filteredEntries = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query)
            return entries;
        return entries.filter((entry) => [entry.mac, entry.label, entry.scope]
            .some((field) => String(field || '').toLowerCase().includes(query)));
    }, [entries, search]);

    const handleAdd = async (event) => {
        event.preventDefault();
        const rawMac = draft.mac.trim();
        if (!MAC_PATTERN.test(rawMac)) {
            setNotice({ type: 'error', message: tr('macInvalidFormat') });
            return;
        }
        const mac = normalizeMac(rawMac);
        setAdding(true);
        setNotice(null);
        try {
            const response = await authorizedFetch('/api/mac-access', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mac,
                    label: draft.label.trim(),
                    scope: draft.scope,
                    action: draft.action,
                    internetEnabled: true,
                }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok)
                throw new Error(data?.error || tr('macAddFailed'));
            setDraft({ mac: '', label: '', scope: '' });
            setNotice({ type: 'success', message: `${tr('macAddedOk')}: ${mac}` });
            await load({ silent: true });
        }
        catch (error) {
            setNotice({ type: 'error', message: error.message || tr('macAddFailed') });
        }
        finally {
            setAdding(false);
        }
    };

    const handleToggle = async (entry) => {
        setBusyId(entry.id);
        setNotice(null);
        try {
            const nextEnabled = !entry.internetEnabled;
            const response = await authorizedFetch(`/api/mac-access/${encodeURIComponent(entry.id)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ internetEnabled: nextEnabled }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok)
                throw new Error(data?.error || tr('macUpdateFailed'));
            setNotice({
                type: nextEnabled ? 'success' : 'warning',
                message: `${entry.mac} — ${nextEnabled ? tr('macInternetOn') : tr('macInternetOff')}`,
            });
            await load({ silent: true });
        }
        catch (error) {
            setNotice({ type: 'error', message: error.message || tr('macUpdateFailed') });
        }
        finally {
            setBusyId('');
        }
    };

    const startEdit = (entry) => {
        setEditingId(entry.id);
        setEditDraft({ mac: entry.mac || '', label: entry.label || '', scope: entry.scope || '', action: entry.action || 'drop' });
        setNotice(null);
    };
    const cancelEdit = () => {
        setEditingId('');
        setEditDraft({ mac: '', label: '', scope: '', action: 'drop' });
    };
    const handleSaveEdit = async (entry) => {
        const rawMac = editDraft.mac.trim();
        if (!MAC_PATTERN.test(rawMac)) {
            setNotice({ type: 'error', message: tr('macInvalidFormat') });
            return;
        }
        setSavingEdit(true);
        setNotice(null);
        try {
            const response = await authorizedFetch(`/api/mac-access/${encodeURIComponent(entry.id)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mac: normalizeMac(rawMac), label: editDraft.label.trim(), scope: editDraft.scope, action: editDraft.action }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok)
                throw new Error(data?.error || tr('macUpdateFailed'));
            setNotice({ type: 'success', message: `${tr('macUpdatedOk')}: ${normalizeMac(rawMac)}` });
            cancelEdit();
            await load({ silent: true });
        }
        catch (error) {
            setNotice({ type: 'error', message: error.message || tr('macUpdateFailed') });
        }
        finally {
            setSavingEdit(false);
        }
    };

    const handleDelete = async (entry) => {
        const detail = `${entry.mac}${entry.label ? ` — ${entry.label}` : ''}`;
        if (!window.confirm(`${tr('macConfirmDelete')}\n\n${detail}`))
            return;
        setBusyId(entry.id);
        setNotice(null);
        try {
            const response = await authorizedFetch(`/api/mac-access/${encodeURIComponent(entry.id)}`, { method: 'DELETE' });
            const data = await response.json().catch(() => ({}));
            if (!response.ok)
                throw new Error(data?.error || tr('macDeleteFailed'));
            setNotice({ type: 'success', message: `${tr('macDeletedOk')}: ${detail}` });
            await load({ silent: true });
        }
        catch (error) {
            setNotice({ type: 'error', message: error.message || tr('macDeleteFailed') });
        }
        finally {
            setBusyId('');
        }
    };

    return (<section className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 px-1 sm:px-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            {standalone && (<div className="w-1.5 h-8 bg-amber-500 rounded-full shrink-0"/>)}
            <div className={`${standalone ? 'w-10 h-10' : 'w-9 h-9'} rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0`}>
              <ShieldOff size={standalone ? 20 : 18}/>
            </div>
            <div className="min-w-0">
              <h2 className={`${standalone ? 'text-xl sm:text-2xl' : 'text-lg sm:text-xl'} font-bold tracking-tight uppercase dark:text-white leading-tight`}>{tr('macAccessTitle')}</h2>
              <p className="text-gray-400 dark:text-gray-500 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider">{tr('macAccessSubtitle')}</p>
            </div>
            <span className="px-2 py-0.5 rounded text-[8px] font-bold uppercase border border-amber-500/20 text-amber-400 bg-amber-500/10 shrink-0">
              {entries.length} {tr('macCount')}
            </span>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative group w-full sm:w-64">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16}/>
            <input type="text" placeholder={tr('macSearchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-[#1C1C1E] border border-gray-100 dark:border-white/5 rounded-xl text-xs font-bold dark:text-white focus:ring-2 focus:ring-amber-500/20 transition-all outline-none"/>
          </div>
          <button type="button" onClick={() => load({ refresh: true })} className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-[9px] font-bold uppercase tracking-wider bg-white dark:bg-white/5 border border-zinc-800 text-gray-300 transition-all">
            <RefreshCcw size={14}/> {tr('reload')}
          </button>
        </div>
      </div>

      <form onSubmit={handleAdd} className="bg-white dark:bg-[#1C1C1E] rounded-xl p-5 border border-gray-100 dark:border-white/5 shadow-sm space-y-4 mx-1 sm:mx-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider dark:text-white">{tr('macAddTitle')}</p>
            <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-400 leading-relaxed">{tr('macAddDesc')}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[8px] font-bold uppercase tracking-wider text-gray-400">{tr('macAddress')}</span>
            <input type="text" value={draft.mac} onChange={(e) => setDraft((prev) => ({ ...prev, mac: e.target.value }))} placeholder="AA:BB:CC:DD:EE:FF" spellCheck={false} className="w-full px-3 py-2 bg-white dark:bg-[#141416] border border-gray-200 dark:border-white/10 rounded-xl text-[11px] font-bold font-mono dark:text-white placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-amber-500/20"/>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[8px] font-bold uppercase tracking-wider text-gray-400">{tr('macLabel')}</span>
            <input type="text" value={draft.label} onChange={(e) => setDraft((prev) => ({ ...prev, label: e.target.value }))} placeholder={tr('macLabelPlaceholder')} className="w-full px-3 py-2 bg-white dark:bg-[#141416] border border-gray-200 dark:border-white/10 rounded-xl text-[11px] font-bold dark:text-white placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-amber-500/20"/>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[8px] font-bold uppercase tracking-wider text-gray-400">{tr('macScope')}</span>
            <select value={draft.scope} onChange={(e) => setDraft((prev) => ({ ...prev, scope: e.target.value }))} className="w-full px-3 py-2 bg-white dark:bg-[#141416] border border-gray-200 dark:border-white/10 rounded-xl text-[11px] font-bold dark:text-white outline-none focus:ring-2 focus:ring-amber-500/20">
              <option value="">{tr('macScopeAll')}</option>
              {scopeOptions.map((name) => (<option key={name} value={name}>{name}</option>))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[8px] font-bold uppercase tracking-wider text-gray-400">{tr('macAction')}</span>
            <select value={draft.action} onChange={(e) => setDraft((prev) => ({ ...prev, action: e.target.value }))} className="w-full px-3 py-2 bg-white dark:bg-[#141416] border border-gray-200 dark:border-white/10 rounded-xl text-[11px] font-bold dark:text-white outline-none focus:ring-2 focus:ring-amber-500/20">
              <option value="drop">{tr('macActionDrop')}</option>
              <option value="accept">{tr('macActionAccept')}</option>
            </select>
          </label>
          <div className="flex items-end">
            <button type="submit" disabled={adding} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[9px] font-bold uppercase tracking-wider bg-amber-600 hover:bg-amber-700 text-white shadow-md transition-all disabled:opacity-40">
              {adding ? <Loader2 size={14} className="animate-spin"/> : <Plus size={14}/>} {tr('add')}
            </button>
          </div>
        </div>
        <p className="text-[8px] font-semibold uppercase tracking-wider text-gray-500 leading-relaxed">{tr('macAddNote')}</p>
        <p className="text-[8px] font-semibold uppercase tracking-wider text-amber-500/80 leading-relaxed">{tr('macActionHint')}</p>
        {notice && (<div className={`flex items-start gap-2 px-3 py-2 rounded-xl border text-[9px] font-bold uppercase tracking-wider ${notice.type === 'error'
                ? 'border-rose-500/20 text-rose-400 bg-rose-500/10'
                : notice.type === 'warning'
                    ? 'border-amber-500/20 text-amber-400 bg-amber-500/10'
                    : 'border-emerald-500/20 text-emerald-400 bg-emerald-500/10'}`}>
            <span className="leading-relaxed break-all">{notice.message}</span>
          </div>)}
      </form>

      <div className="bg-white dark:bg-[#1C1C1E] rounded-xl border border-gray-100 dark:border-white/5 shadow-sm mx-1 sm:mx-4 overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-100 dark:border-white/5">
          <p className="text-[10px] font-bold uppercase tracking-wider dark:text-white">{tr('macListTitle')}</p>
          <span className="text-[8px] font-bold uppercase tracking-wider text-gray-400">{filteredEntries.length} / {entries.length}</span>
        </div>
        {loading ? (<div className="flex items-center justify-center gap-3 px-5 py-10 text-gray-400">
            <Loader2 size={16} className="animate-spin"/>
            <span className="text-[9px] font-bold uppercase tracking-wider">{tr('macLoadingEntries')}</span>
          </div>) : filteredEntries.length === 0 ? (<div className="px-5 py-10 text-center">
            <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400">{tr('macNoEntries')}</p>
          </div>) : (<div className="divide-y divide-gray-100 dark:divide-white/5">
            {filteredEntries.map((entry) => {
            const busy = busyId === entry.id;
            const entryAction = (entry.action || 'drop').toLowerCase();
            const ruleActive = !entry.internetEnabled;
            if (editingId === entry.id)
                return (<div key={entry.id} className="px-5 py-4 space-y-3 bg-blue-500/[0.04]">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pencil size={13} className="text-blue-400 shrink-0"/>
                      <p className="text-[10px] font-bold uppercase tracking-wider dark:text-white">{tr('macEditTitle')}</p>
                      <span className="px-2 py-0.5 rounded text-[8px] font-bold uppercase border border-gray-500/20 text-gray-400 bg-gray-500/10 font-mono">{entry.id}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <label className="flex flex-col gap-1.5">
                        <span className="text-[8px] font-bold uppercase tracking-wider text-gray-400">{tr('macAddress')}</span>
                        <input type="text" value={editDraft.mac} onChange={(e) => setEditDraft((prev) => ({ ...prev, mac: e.target.value }))} placeholder="AA:BB:CC:DD:EE:FF" spellCheck={false} className="w-full px-3 py-2 bg-white dark:bg-[#141416] border border-gray-200 dark:border-white/10 rounded-xl text-[11px] font-bold font-mono dark:text-white placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500/20"/>
                      </label>
                      <label className="flex flex-col gap-1.5">
                        <span className="text-[8px] font-bold uppercase tracking-wider text-gray-400">{tr('macLabel')}</span>
                        <input type="text" value={editDraft.label} onChange={(e) => setEditDraft((prev) => ({ ...prev, label: e.target.value }))} placeholder={tr('macLabelPlaceholder')} className="w-full px-3 py-2 bg-white dark:bg-[#141416] border border-gray-200 dark:border-white/10 rounded-xl text-[11px] font-bold dark:text-white placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500/20"/>
                      </label>
                      <label className="flex flex-col gap-1.5">
                        <span className="text-[8px] font-bold uppercase tracking-wider text-gray-400">{tr('macScope')}</span>
                        <select value={editDraft.scope} onChange={(e) => setEditDraft((prev) => ({ ...prev, scope: e.target.value }))} className="w-full px-3 py-2 bg-white dark:bg-[#141416] border border-gray-200 dark:border-white/10 rounded-xl text-[11px] font-bold dark:text-white outline-none focus:ring-2 focus:ring-blue-500/20">
                          <option value="">{tr('macScopeAll')}</option>
                          {scopeOptions.map((name) => (<option key={name} value={name}>{name}</option>))}
                          {editDraft.scope && !scopeOptions.includes(editDraft.scope) && (<option value={editDraft.scope}>{editDraft.scope}</option>)}
                        </select>
                      </label>
                      <label className="flex flex-col gap-1.5">
                        <span className="text-[8px] font-bold uppercase tracking-wider text-gray-400">{tr('macAction')}</span>
                        <select value={editDraft.action} onChange={(e) => setEditDraft((prev) => ({ ...prev, action: e.target.value }))} className="w-full px-3 py-2 bg-white dark:bg-[#141416] border border-gray-200 dark:border-white/10 rounded-xl text-[11px] font-bold dark:text-white outline-none focus:ring-2 focus:ring-blue-500/20">
                          <option value="drop">{tr('macActionDrop')}</option>
                          <option value="accept">{tr('macActionAccept')}</option>
                        </select>
                      </label>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" onClick={() => handleSaveEdit(entry)} disabled={savingEdit} className="flex items-center gap-2 px-4 py-2 rounded-lg text-[9px] font-bold uppercase tracking-wider bg-blue-600 hover:bg-blue-700 text-white shadow-md transition-all disabled:opacity-40">
                        {savingEdit ? <Loader2 size={13} className="animate-spin"/> : <Save size={13}/>} {tr('macSave')}
                      </button>
                      <button type="button" onClick={cancelEdit} disabled={savingEdit} className="flex items-center gap-2 px-4 py-2 rounded-lg text-[9px] font-bold uppercase tracking-wider border border-zinc-700 text-gray-300 hover:bg-white/5 transition-all disabled:opacity-40">
                        <X size={13}/> {tr('macCancel')}
                      </button>
                    </div>
                  </div>);
            return (<div key={entry.id} className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 px-5 py-4">
                <div className="flex items-start gap-3 min-w-0">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${ruleActive ? (entryAction === 'accept' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400') : 'bg-gray-500/10 text-gray-400'}`}>
                    {ruleActive ? (entryAction === 'accept' ? <CheckCircle2 size={16}/> : <Ban size={16}/>) : <Wifi size={16}/>}
                  </div>
                  <div className="min-w-0 space-y-1">
                    <p className="text-[12px] font-bold font-mono tracking-tight dark:text-white break-all">{entry.mac}</p>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400 truncate">{entry.label || tr('noComment')}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[8px] font-bold uppercase border border-blue-500/20 text-blue-400 bg-blue-500/10">
                        {entry.scope || tr('macScopeAll')}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase border ${entryAction === 'accept' ? 'border-emerald-500/20 text-emerald-400 bg-emerald-500/10' : 'border-violet-500/20 text-violet-400 bg-violet-500/10'}`}>
                        {tr('macAction')}: {entryAction.toUpperCase()} · {entry.ruleTarget || `forward / ${entryAction}`}
                      </span>
                      {entry.outInterface && (<span className="px-2 py-0.5 rounded text-[8px] font-bold uppercase border border-gray-500/20 text-gray-400 bg-gray-500/10">
                          WAN: {entry.outInterface}
                        </span>)}
                      <span className="px-2 py-0.5 rounded text-[8px] font-bold uppercase border border-gray-500/20 text-gray-400 bg-gray-500/10 font-mono">
                        {entry.id}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <span className={`px-2.5 py-1 rounded text-[8px] font-bold uppercase border ${ruleActive
                    ? (entryAction === 'accept' ? 'border-emerald-500/20 text-emerald-400 bg-emerald-500/10' : 'border-rose-500/20 text-rose-400 bg-rose-500/10')
                    : 'border-gray-500/20 text-gray-400 bg-gray-500/10'}`}>
                    {ruleActive
                    ? (entryAction === 'accept' ? tr('macStatusAllowed') : tr('macInternetOff'))
                    : (entryAction === 'accept' ? tr('macStatusIdle') : tr('macInternetOn'))}
                  </span>
                  <button type="button" onClick={() => startEdit(entry)} disabled={busy} title={tr('macEdit')} className="flex items-center gap-2 px-3 py-2 rounded-lg text-[9px] font-bold uppercase tracking-wider border border-blue-500/30 text-blue-400 bg-blue-500/5 hover:bg-blue-500/15 transition-all disabled:opacity-40">
                    <Pencil size={13}/> {tr('macEdit')}
                  </button>
                  <button type="button" onClick={() => handleToggle(entry)} disabled={busy} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all shadow-md disabled:opacity-40 ${ruleActive
                    ? (entryAction === 'accept' ? 'bg-zinc-700 hover:bg-zinc-600 text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white')
                    : 'bg-rose-600 hover:bg-rose-700 text-white'}`}>
                    {busy ? <Loader2 size={13} className="animate-spin"/> : ruleActive ? <Ban size={13}/> : <CheckCircle2 size={13}/>}
                    {entryAction === 'accept'
                    ? (ruleActive ? tr('macDisableRule') : tr('macEnableRule'))
                    : (ruleActive ? tr('macUnblockInternet') : tr('macBlockInternet'))}
                  </button>
                  <button type="button" onClick={() => handleDelete(entry)} disabled={busy} title={tr('deleteEntry')} className="flex items-center gap-2 px-3 py-2 rounded-lg text-[9px] font-bold uppercase tracking-wider border border-rose-500/30 text-rose-400 bg-rose-500/5 hover:bg-rose-500/15 transition-all disabled:opacity-40">
                    <Trash2 size={13}/> {tr('macDelete')}
                  </button>
                </div>
              </div>);
        })}
          </div>)}
      </div>

      {unmanaged.length > 0 && (<div className="bg-white dark:bg-[#1C1C1E] rounded-xl border border-gray-100 dark:border-white/5 shadow-sm mx-1 sm:mx-4 overflow-hidden">
          <button type="button" onClick={() => setShowUnmanaged((prev) => !prev)} className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider dark:text-white">{tr('macUnmanagedTitle')} ({unmanaged.length})</p>
              <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-400 leading-relaxed">{tr('macUnmanagedDesc')}</p>
            </div>
            <span className="text-[8px] font-bold uppercase tracking-wider text-gray-400 shrink-0">{showUnmanaged ? tr('macHideUnmanaged') : tr('macShowUnmanaged')}</span>
          </button>
          {showUnmanaged && (<div className="divide-y divide-gray-100 dark:divide-white/5 border-t border-gray-100 dark:border-white/5">
              {unmanaged.map((rule) => (<div key={rule.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold font-mono dark:text-white break-all">{rule.mac}</p>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400 truncate">{rule.comment || tr('noComment')}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <span className="px-2 py-0.5 rounded text-[8px] font-bold uppercase border border-gray-500/20 text-gray-400 bg-gray-500/10">{rule.table ? `${rule.table} / ` : ''}{rule.chain} / {rule.action}</span>
                    <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase border ${rule.active
                        ? 'border-amber-500/20 text-amber-400 bg-amber-500/10'
                        : 'border-gray-500/20 text-gray-400 bg-gray-500/10'}`}>
                      {rule.active ? tr('macRuleActive') : tr('macRuleIdle')}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[8px] font-bold uppercase border border-gray-500/20 text-gray-500 bg-gray-500/10">{tr('macReadOnly')}</span>
                  </div>
                </div>))}
            </div>)}
        </div>)}
    </section>);
}
