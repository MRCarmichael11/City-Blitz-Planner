import { useEffect, useMemo, useState } from 'react';
import { buildMapData, applyCalendarUnlocks, type Half, type Tick, type ActionEvent, type Alliance, tickFromDayHalf, dayHalfFromTick } from '@/v2/domain';
import { S1, S2, S3, S4 } from '@/v2/seasons';
// Action timeline-driven planner (Season stepper removed)
import AllianceLegend from '@/v2/AllianceLegend';
import { useToast } from '@/components/ui/use-toast';
// import { countsForStep, countsTotal, availableDaysForStep } from '@/v2/rules';
// import MoveBudget from '@/v2/MoveBudget';
import MapCanvas from '@/v2/MapCanvas';
import { Mode, Assignments, canCapture } from '@/v2/rules';
import TerritoryDetailsPanel from '@/v2/TerritoryDetailsPanel';
// applyCalendarUnlocks imported above
import PlannerControls from '@/v2/PlannerControls';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronDown, Moon, Sun, LogIn, LogOut } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/services/supabaseClient';

const seasons = { S1, S2, S3, S4 } as const;

type SeasonKey = keyof typeof seasons;

function AuthWidget() {
  const { user, loading, signInWithEmail, signOut } = useAuth();
  const [email, setEmail] = useState('');
  if (loading) return <div className="text-xs text-muted-foreground">…</div>;
  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <input className="border rounded px-2 py-1 h-8 w-48 bg-card text-foreground text-xs" placeholder="Email to sign in" value={email} onChange={(e)=> setEmail(e.target.value)} />
        <button className="border rounded px-2 py-1 text-xs inline-flex items-center gap-1" onClick={async ()=>{ try { await signInWithEmail(email); alert('Check your email for a login link.'); } catch (e: any) { alert(e.message || 'Sign-in error'); } }}>
          <LogIn className="w-4 h-4" /> Sign in
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted-foreground">{user.email || 'Logged in'}</span>
      <button className="border rounded px-2 py-1 inline-flex items-center gap-1" onClick={()=> signOut()}>
        <LogOut className="w-4 h-4" /> Sign out
      </button>
    </div>
  );
}

export default function V2() {
  const [seasonKey, setSeasonKey] = useState<SeasonKey>('S3');
  const season = seasons[seasonKey];
  // 12-hour Action timeline state
  const [currentDay, setCurrentDay] = useState<number>(1);
  const [currentHalf, setCurrentHalf] = useState<Half>('AM');
  const currentTick: Tick = useMemo(() => tickFromDayHalf(currentDay, currentHalf), [currentDay, currentHalf]);
  const [selectedAlliance, setSelectedAlliance] = useState<string|null>(null);
  const [mode, setMode] = useState<Mode>('planning');
  // v3 Action events timeline (persisted)
  const [events, setEvents] = useState<ActionEvent[]>([]);
  const [lastCleared, setLastCleared] = useState<ActionEvent[] | null>(null);
  // Listen for planner-clear-future and clear future events (auto-plans)
  useEffect(() => {
    const handler = () => {
      const past = events.filter(e => e.tick < currentTick);
      const future = events.filter(e => e.tick >= currentTick);
      setLastCleared(future);
      setEvents(past);
      toast({ title: 'Cleared planned future', description: `${future.length} event(s) removed from Tick ${currentTick} onward.` });
    };
    window.addEventListener('planner-clear-future', handler);
    return () => window.removeEventListener('planner-clear-future', handler);
  }, [events, currentTick]);
  // Planning mode: final-day target assignments (persisted)
  const [plannedAssignments, setPlannedAssignments] = useState<Assignments>({});
  const [lastClearedPlan, setLastClearedPlan] = useState<Assignments | null>(null);

  // Derive calendar step from current day for unlocks and legacy per-step budget
  const derivedStep = useMemo(() => {
    const sd = season.calendar.stepDays || [];
    // Step = 1 + number of stepDays <= currentDay
    let s = 1;
    for (let i = 0; i < sd.length; i++) {
      if (currentDay >= sd[i]) s++;
    }
    return Math.max(1, Math.min(s, season.calendar.steps));
  }, [currentDay, season.calendar]);

  // Derive current ownership assignments from events up to currentTick
  const derivedAssignments: Assignments = useMemo(() => {
    const out: Assignments = {};
    const sorted = [...events].sort((a, b) => a.tick - b.tick);
    const sd = season.calendar.stepDays || [];
    const steps = season.calendar.steps;
    const stepFromDay = (day: number): number => {
      let s = 1;
      for (let i = 0; i < sd.length; i++) { if (day >= sd[i]) s = i + 1; }
      return Math.max(1, Math.min(s, steps));
    };
    for (const e of sorted) {
      if (e.tick > currentTick) break;
      if (e.action === 'capture') {
        const { day } = dayHalfFromTick(e.tick);
        const stepAtCapture = stepFromDay(day);
        out[e.tileId] = { alliance: e.alliance, step: stepAtCapture };
      } else if (e.action === 'release') {
        delete out[e.tileId];
      }
    }
    return out;
  }, [events, currentTick, season.calendar]);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [selectedTerritory, setSelectedTerritory] = useState<import('@/v2/domain').Territory | null>(null);
  // Manual stepper state
  const [manualMode, setManualMode] = useState<boolean>(false);
  const [manualAction, setManualAction] = useState<'capture' | 'release'>('capture');

  const [alliances, setAlliances] = useState<Alliance[]>([]);
  const baseMap = useMemo(() => buildMapData(season, alliances), [season, alliances]);

  // Initialize theme from localStorage on mount
  useMemo(() => {
    const saved = localStorage.getItem('theme');
    const el = document.documentElement;
    if (saved === 'dark') el.classList.add('dark');
    else if (saved === 'light') el.classList.remove('dark');
  }, []);
  // Final-day view in planning mode
  const displayStep = mode === 'planning' ? season.calendar.steps : derivedStep;
  const map = { ...baseMap, territories: applyCalendarUnlocks(baseMap.territories, season.calendar, displayStep) };
  const { toast } = useToast();
  // Auth state for Account menu controls
  const { user: authUser } = useAuth();

  // Persistence (v3)
  const STORAGE_KEY_V3 = 'lastwar-v3';

  // Load once on mount (localStorage first), then optionally override with Supabase if signed in
  useEffect(() => {
    // Load v3 from localStorage
    try {
      const raw3 = localStorage.getItem(STORAGE_KEY_V3);
      if (raw3) {
        const parsed3 = JSON.parse(raw3);
        if (parsed3.alliances && Array.isArray(parsed3.alliances)) setAlliances(parsed3.alliances);
        let evts: ActionEvent[] | undefined = parsed3.eventsBySeason && parsed3.eventsBySeason[season.key] as ActionEvent[] | undefined;
        // One-time migration: Day 8 Amex on C-H12 fix
        const MIG_KEY = 'v3_migration_amex_h12_day8';
        const shouldMigrate = !localStorage.getItem(MIG_KEY);
        if (shouldMigrate && evts && Array.isArray(evts)) {
          try {
            const targetId = 'C-H12';
            const allianceName = (Array.isArray(parsed3.alliances) ? parsed3.alliances.find((a: any) => typeof a?.name === 'string' && a.name.toLowerCase() === 'amex')?.name : undefined) || 'Amex';
            const dayFix = 8;
            const amTick = tickFromDayHalf(dayFix, 'AM');
            const pmTick = tickFromDayHalf(dayFix, 'PM');
            let next = evts.filter(e => !(e.tileId === targetId && dayHalfFromTick(e.tick).day === dayFix));
            const cutoffTick = (amTick - 1) as Tick;
            const sorted = [...next].sort((a,b)=> a.tick - b.tick);
            let owner: string | null = null;
            for (const e of sorted) {
              if (e.tick > cutoffTick) break;
              if (e.tileId !== targetId) continue;
              if (e.action === 'capture') owner = e.alliance;
              else if (e.action === 'release' && e.alliance === owner) owner = null;
            }
            if (owner !== allianceName) {
              next.push({ tick: amTick, tileId: targetId, alliance: allianceName, action: 'capture' });
            }
            next.push({ tick: pmTick, tileId: targetId, alliance: allianceName, action: 'capture' });
            const seen = new Set<string>();
            next = next.filter(e => {
              const key = `${e.tick}|${e.alliance}|${e.tileId}|${e.action}`;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
            evts = next.sort((a,b)=> a.tick - b.tick);
            localStorage.setItem(MIG_KEY, '1');
          } catch { /* ignore fix errors */ }
        }
        if (evts) setEvents(evts);
        if (parsed3.plannedBySeason && parsed3.plannedBySeason[season.key]) setPlannedAssignments(parsed3.plannedBySeason[season.key] as Assignments);
      }
    } catch { /* noop */ }

    // Fallback v2 -> synthesize capture events at Day 1 AM
    try {
      const raw2 = localStorage.getItem('lastwar-v2');
      if (raw2) {
        const parsed2 = JSON.parse(raw2);
        if (parsed2.alliances && Array.isArray(parsed2.alliances)) 
          setAlliances((prev)=> prev.length? prev : parsed2.alliances);
        const steps = parsed2.stepsBySeason?.[season.key] as Record<number, Assignments> | undefined;
        if (steps) {
          const captures: ActionEvent[] = [];
          const tick1 = tickFromDayHalf(1, 'AM');
          const merged: Assignments = {};
          Object.values(steps).forEach((as: Assignments) => { Object.assign(merged, as); });
          for (const [tileId, a] of (Object.entries(merged) as Array<[string, import('@/v2/rules').Assignment]>)) {
            if (a.alliance) captures.push({ tick: tick1, tileId, alliance: a.alliance, action: 'capture' });
          }
          if (captures.length && events.length === 0) setEvents(captures);
        }
      }
    } catch { /* noop */ }

    // Fallback v1 legacy
    try {
      const raw1 = localStorage.getItem('lastwar-v1');
      if (raw1) {
        const parsed1 = JSON.parse(raw1);
        if (parsed1.alliances && Array.isArray(parsed1.alliances)) 
          setAlliances((prev)=> prev.length? prev : parsed1.alliances);
        const as = parsed1.assignmentsBySeason?.[season.key] as Assignments | undefined;
        if (as && events.length === 0) {
          const captures: ActionEvent[] = [];
          const tick1 = tickFromDayHalf(1, 'AM');
          for (const [tileId, a] of (Object.entries(as) as Array<[string, import('@/v2/rules').Assignment]>)) {
            if (a.alliance) captures.push({ tick: tick1, tileId, alliance: a.alliance, action: 'capture' });
          }
          setEvents(captures);
        }
      }
    } catch { /* noop */ }

    // After local load/migrations, try Supabase override if signed in
    if (supabase) {
      supabase.auth.getSession().then(({ data }) => {
        const uid = data.session?.user?.id;
        if (!uid) return;
        import('@/services/userData').then(({ getUserSeasonData }) => {
          getUserSeasonData(uid, season.key).then(remote => {
            if (!remote) return;
            if (Array.isArray(remote.alliances)) setAlliances(remote.alliances);
            if (remote.eventsBySeason && remote.eventsBySeason[season.key]) setEvents(remote.eventsBySeason[season.key]);
            if (remote.plannedBySeason && remote.plannedBySeason[season.key]) setPlannedAssignments(remote.plannedBySeason[season.key]);
          }).catch(()=>{});
        });
      }).catch(()=>{});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season.key]);

  // Save on changes as v3 (including planned end-state) locally and, if signed in, to Supabase
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_V3);
      const parsed = raw ? JSON.parse(raw) : { version: 3, alliances, eventsBySeason: {}, plannedBySeason: {} };
      parsed.version = 3;
      parsed.alliances = alliances;
      parsed.eventsBySeason = parsed.eventsBySeason || {};
      parsed.eventsBySeason[season.key] = events;
      parsed.plannedBySeason = parsed.plannedBySeason || {};
      parsed.plannedBySeason[season.key] = plannedAssignments;
      localStorage.setItem(STORAGE_KEY_V3, JSON.stringify(parsed));
    } catch {
      /* noop */
    }

    // Also sync to Supabase if logged in
    if (supabase) {
      supabase.auth.getSession().then(({ data }) => {
        const uid = data.session?.user?.id;
        if (!uid) return;
        import('@/services/userData').then(({ saveUserSeasonData }) => {
          const payload = { version: 3, alliances, eventsBySeason: { [season.key]: events }, plannedBySeason: { [season.key]: plannedAssignments } };
          saveUserSeasonData(uid, season.key, payload).catch(() => {});
        });
      }).catch(()=>{});
    }
  }, [alliances, events, plannedAssignments, season.key]);

  const handleCreateAlliance = (name: string, color: string, priority?: number) => {
    const id = 'a' + Math.random().toString(36).slice(2, 8);
    setAlliances(prev => [...prev, { id, name, color, priority }]);
  };
  const handleRemoveAlliance = (id: string) => {
    setAlliances(prev => prev.filter(a => a.id !== id));
    // Note: events are not retroactively edited; tiles will display without color if their alliance no longer exists.
  };

  // Toolbar helpers
  const lastDay = (season.calendar.stepDays && season.calendar.stepDays.length > 0) ? season.calendar.stepDays[season.calendar.stepDays.length - 1] : 28;
  const minTick = 1 as Tick;
  const maxTick = (lastDay * 2) as Tick;
  const prevTick = () => {
    const t = currentTick - 1 as Tick;
    if (t < minTick) return;
    const { day, half } = dayHalfFromTick(t);
    setCurrentDay(day); setCurrentHalf(half);
  };
  const nextTick = () => {
    const t = currentTick + 1 as Tick;
    if (t > maxTick) return;
    const { day, half } = dayHalfFromTick(t);
    setCurrentDay(day); setCurrentHalf(half);
  };

  // Planner Sheet state
  const [plannerOpen, setPlannerOpen] = useState(false);
  // Autoplay state
  const [autoPlay, setAutoPlay] = useState(false);
  const [autoMs, setAutoMs] = useState(600);
  useEffect(() => {
    if (!autoPlay || mode !== 'action') return;
    const lastDayLocal = (season.calendar.stepDays && season.calendar.stepDays.length > 0) ? season.calendar.stepDays[season.calendar.stepDays.length - 1] : 28;
    const maxTickLocal = (lastDayLocal * 2) as Tick;
    const id = setInterval(() => {
      setCurrentHalf(h => {
        const nextHalf = h === 'AM' ? 'PM' : 'AM';
        if (h === 'AM') return nextHalf;
        // PM -> advance day
        setCurrentDay(d => {
          const nextDay = d + 1;
          const nextTick = tickFromDayHalf(nextDay, 'AM');
          if (nextTick > maxTickLocal) {
            setAutoPlay(false);
            return d; // stop at end
          }
          return nextDay;
        });
        return nextHalf;
      });
    }, Math.max(200, autoMs));
    return () => clearInterval(id);
  }, [autoPlay, autoMs, mode, season.calendar]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/60">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <div className="font-bold">City Blitz Planner</div>
          <div className="flex items-center gap-3">
            <select className="border rounded px-2 py-1 bg-card text-foreground" value={seasonKey} onChange={(e) => { setSeasonKey(e.target.value as SeasonKey); setCurrentDay(1); setCurrentHalf('AM'); }}>
              <option value="S1">Season 1</option>
              <option value="S2">Season 2</option>
              <option value="S3">Season 3</option>
              <option value="S4">Season 4</option>
            </select>
            {/* Account menu */}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button className="border rounded px-2 py-1 inline-flex items-center gap-1 disabled:opacity-50" disabled={!authUser || !supabase}>Account <ChevronDown className="w-4 h-4" /></button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content className="z-50 min-w-[260px] rounded border bg-card p-1 shadow-md">
                {!authUser || !supabase ? (
                  <div className="px-2 py-1 text-xs text-muted-foreground">Sign in to use account features.</div>
                ) : (
                  <>
                    <button className="w-full text-left px-2 py-1 text-sm hover:bg-accent rounded" onClick={async ()=>{
                      if (!authUser) return;
                      const payload = { version: 3, alliances, eventsBySeason: { [season.key]: events }, plannedBySeason: { [season.key]: plannedAssignments } };
                      try {
                        const { saveUserSeasonData } = await import('@/services/userData');
                        const ok = await saveUserSeasonData(authUser.id, season.key, payload);
                        toast({ title: ok ? 'Saved to account' : 'Save failed', description: ok ? `Season ${season.key} data saved to server.` : 'Could not save to server.' });
                      } catch {
                        toast({ title: 'Save failed', description: 'Unexpected error while saving.' });
                      }
                    }}>Save now</button>
                    <button className="w-full text-left px-2 py-1 text-sm hover:bg-accent rounded" onClick={async ()=>{
                      if (!authUser) return;
                      const proceed = window.confirm(`Overwrite local ${season.key} data with server copy? This cannot be undone.`);
                      if (!proceed) return;
                      try {
                        const { getUserSeasonData } = await import('@/services/userData');
                        const remote = await getUserSeasonData(authUser.id, season.key);
                        if (!remote) { toast({ title: 'No server data', description: `No saved data found for ${season.key}.` }); return; }
                        if (Array.isArray(remote.alliances)) setAlliances(remote.alliances);
                        if (remote.eventsBySeason && remote.eventsBySeason[season.key]) setEvents(remote.eventsBySeason[season.key]); else setEvents([]);
                        if (remote.plannedBySeason && remote.plannedBySeason[season.key]) setPlannedAssignments(remote.plannedBySeason[season.key]); else setPlannedAssignments({});
                        toast({ title: 'Reloaded from server', description: `Applied ${season.key} data from your account.` });
                      } catch {
                        toast({ title: 'Reload failed', description: 'Could not fetch from server.' });
                      }
                    }}>Reload from server</button>
                    <button className="w-full text-left px-2 py-1 text-sm hover:bg-accent rounded" onClick={async ()=>{
                      try {
                        let payload: any = null;
                        if (authUser) {
                          const { getUserSeasonData } = await import('@/services/userData');
                          payload = await getUserSeasonData(authUser.id, season.key);
                        }
                        if (!payload) {
                          payload = { version: 3, alliances, eventsBySeason: { [season.key]: events }, plannedBySeason: { [season.key]: plannedAssignments } };
                        }
                        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob); const a = document.createElement('a');
                        a.href = url; a.download = `lastwar-v3-account-${season.key}.json`; a.click(); URL.revokeObjectURL(url);
                        toast({ title: 'Exported', description: `Downloaded ${season.key} account data.` });
                      } catch {
                        toast({ title: 'Export failed', description: 'Could not export account data.' });
                      }
                    }}>Export account data</button>
                  </>
                )}
              </DropdownMenu.Content>
            </DropdownMenu.Root>
            <AuthWidget />
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-4 flex flex-col gap-3">
        {/* Compact toolbar */}
        <div className="w-full border rounded bg-card/60 p-2 flex flex-wrap items-center gap-2">
          {/* Mode toggle pill */}
          <div className="inline-flex rounded-full border overflow-hidden">
            <button
              className={`px-3 py-1 text-xs ${mode==='planning' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
              onClick={()=> setMode('planning')}
              title="Plan your final-day end-state"
            >
              Planning
            </button>
            <button
              className={`px-3 py-1 text-xs ${mode==='action' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
              onClick={()=> setMode('action')}
              title="Schedule day-by-day actions"
            >
              Action
            </button>
          </div>

          {/* Tick controls + Autoplay */}
          <div className="flex items-center gap-2 min-w-[280px] flex-1">
            <button
              className="border rounded px-2 py-1 text-xs disabled:opacity-50"
              onClick={prevTick}
              disabled={currentTick <= minTick}
              title="Step back one tick"
            >
              «
            </button>
            <input type="range" min={1} max={lastDay} value={currentDay} onChange={(e)=> setCurrentDay(parseInt(e.target.value))} className="flex-1" />
            <select className="border rounded px-2 py-1 bg-card text-foreground" value={currentHalf} onChange={(e)=> setCurrentHalf(e.target.value as Half)}>
              <option value="AM">AM</option>
              <option value="PM">PM</option>
            </select>
            <button
              className="border rounded px-2 py-1 text-xs disabled:opacity-50"
              onClick={nextTick}
              disabled={currentTick >= maxTick}
              title="Step forward one tick"
            >
              »
            </button>
            <div className="text-xs text-muted-foreground whitespace-nowrap">
              {mode === 'action' ? (
                <>Day {currentDay} {currentHalf} • Tick {currentTick} • Step {derivedStep}{Array.isArray(season.calendar.stepDays) && season.calendar.stepDays[derivedStep-1] ? ` • Day ${season.calendar.stepDays[derivedStep-1]}` : ''}{derivedStep===1 ? ' • Cities locked' : ''}</>
              ) : (
                <>Planning • Step {season.calendar.steps} • Capitol available</>
              )}
            </div>
            {mode === 'action' && (
              <div className="flex items-center gap-2 ml-2">
                <button className="border rounded px-2 py-1 text-xs" title="Play/Pause autoplay" onClick={()=> setAutoPlay(v=> !v)}>{autoPlay? 'Pause' : 'Play'}</button>
                <select className="border rounded px-2 py-1 bg-card text-foreground text-xs" value={autoMs} onChange={(e)=> setAutoMs(parseInt(e.target.value))}>
                  <option value={400}>0.4s/tick</option>
                  <option value={600}>0.6s/tick</option>
                  <option value={800}>0.8s/tick</option>
                  <option value={1000}>1.0s/tick</option>
                </select>
              </div>
            )}
          </div>

          {/* Manual stepper quick controls */}
          <div className="flex items-center gap-2 ml-auto">
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={manualMode} onChange={() => setManualMode(v => !v)} />
              Manual stepper
            </label>
            <select
              className="border rounded px-2 py-1 bg-card text-foreground text-xs disabled:opacity-50"
              disabled={!manualMode}
              value={manualAction}
              onChange={(e)=> setManualAction(e.target.value as 'capture' | 'release')}
            >
              <option value="capture">Capture</option>
              <option value="release">Release</option>
            </select>

            {/* Data menu */}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button className="border rounded px-2 py-1 inline-flex items-center gap-1">Data <ChevronDown className="w-4 h-4" /></button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content className="z-50 min-w-[260px] rounded border bg-card p-1 shadow-md">
                <button className="w-full text-left px-2 py-1 text-sm hover:bg-accent rounded" onClick={()=>{
                  const data = { version: 3, season: season.key, alliances, eventsBySeason: { [season.key]: events }, plannedBySeason: { [season.key]: plannedAssignments } };
                  const blob = new Blob([JSON.stringify(data,null,2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob); const a = document.createElement('a');
                  a.href = url; a.download = `lastwar-v3-${season.key}.json`; a.click(); URL.revokeObjectURL(url);
                }}>Export</button>
                <label className="w-full text-left px-2 py-1 text-sm hover:bg-accent rounded cursor-pointer inline-block">
                  Import
                  <input type="file" accept="application/json" className="hidden" onChange={async (e)=>{
                    const f = e.target.files?.[0]; if (!f) return; const text = await f.text();
                    try {
                      const parsed = JSON.parse(text);
                      if (parsed.version === 3) {
                        if (parsed.alliances && Array.isArray(parsed.alliances)) setAlliances(parsed.alliances);
                        if (parsed.eventsBySeason && parsed.eventsBySeason[season.key]) setEvents(parsed.eventsBySeason[season.key] as ActionEvent[]);
                        if (parsed.plannedBySeason && parsed.plannedBySeason[season.key]) setPlannedAssignments(parsed.plannedBySeason[season.key] as Assignments);
                        toast({ title: 'Imported', description: 'v3 data imported.' });
                      } else if (parsed.version === 2) {
                        if (parsed.alliances && Array.isArray(parsed.alliances)) setAlliances(parsed.alliances);
                        if (parsed.stepsBySeason && parsed.stepsBySeason[season.key]) {
                          const steps = parsed.stepsBySeason[season.key] as Record<number, Assignments>;
                          const captures: ActionEvent[] = [];
                          const tick1 = tickFromDayHalf(1, 'AM');
                          const merged: Assignments = {};
                          Object.values(steps).forEach((as: Assignments) => { Object.assign(merged, as); });
                          for (const [tileId, a] of (Object.entries(merged) as Array<[string, import('@/v2/rules').Assignment]>)) {
                            if (a.alliance) captures.push({ tick: tick1, tileId, alliance: a.alliance, action: 'capture' });
                          }
                          setEvents(captures);
                        }
                        toast({ title: 'Imported', description: 'v2 data imported (converted to events).' });
                      } else if (parsed.version === 1) {
                        if (parsed.alliances && Array.isArray(parsed.alliances)) setAlliances(parsed.alliances);
                        if (parsed.assignmentsBySeason && parsed.assignmentsBySeason[season.key]) {
                          const as = parsed.assignmentsBySeason[season.key] as Assignments;
                          const captures: ActionEvent[] = [];
                          const tick1 = tickFromDayHalf(1, 'AM');
                          for (const [tileId, a] of (Object.entries(as) as Array<[string, import('@/v2/rules').Assignment]>)) {
                            if (a.alliance) captures.push({ tick: tick1, tileId, alliance: a.alliance, action: 'capture' });
                          }
                          setEvents(captures);
                        }
                        toast({ title: 'Imported', description: 'v1 data imported (converted to events).' });
                      } else {
                        toast({ title: 'Invalid file', description: 'Unsupported version', });
                      }
                    } catch {
                      toast({ title: 'Invalid file', description: 'Parse error', });
                    }
                  }} />
                </label>
              </DropdownMenu.Content>
            </DropdownMenu.Root>

            {/* Actions menu */}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button className="border rounded px-2 py-1 inline-flex items-center gap-1">Actions <ChevronDown className="w-4 h-4" /></button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content className="z-50 min-w-[260px] rounded border bg-card p-1 shadow-md">
                {/* Open Planner sheet */}
                <Sheet open={plannerOpen} onOpenChange={setPlannerOpen}>
                  <SheetTrigger asChild>
                    <button className="w-full text-left px-2 py-1 text-sm hover:bg-accent rounded">Planner… <span className="ml-1 text-[10px] text-yellow-600 dark:text-yellow-400">Experimental</span></button>
                  </SheetTrigger>
                  <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto">
                    <SheetHeader>
                      <SheetTitle>Planner <span className="ml-2 text-xs text-yellow-600 dark:text-yellow-400">Experimental</span></SheetTitle>
                    </SheetHeader>
                    <div className="mt-2">
                      <PlannerControls
                        map={map}
                        season={season}
                        alliances={alliances}
                        currentTick={currentTick}
                        existingEvents={events}
                        plannedTarget={plannedAssignments}
                        replaceFutureDefault={true}
                        onUpdateAlliance={(id, patch) => {
                          setAlliances(prev => prev.map(a => a.id === id ? { ...a, ...patch } : a));
                        }}
                        onApplyPlan={(planned, replaceFuture) => {
                          const past = events.filter(e => e.tick < currentTick);
                          const future = events.filter(e => e.tick >= currentTick);
                          const merged = replaceFuture ? [...past, ...planned] : [...events, ...planned];
                          setEvents(merged.sort((a,b)=> a.tick - b.tick));
                        }}
                        onLockDay={(day)=>{
                          try {
                            // Build learned policy from events up to end of the selected day
                            const endTick = tickFromDayHalf(day, 'PM');
                            const cut = events.filter(e => e.tick <= endTick);
                            // For each alliance, collect reserved lane tiles as those they captured up to this day
                            const reservedByAlliance: Record<string, string[]> = {};
                            for (const a of alliances) {
                              reservedByAlliance[a.name] = cut.filter(e => e.action==='capture' && e.alliance===a.name).map(e=> e.tileId);
                            }
                            // Persist learned policy in plannedBySeason (non-breaking): store under a synthetic alliance key "__policy__"
                            const policyBlob = { version: 1, reservedByAlliance };
                            // Attach into our plannedAssignments object under a special key that UI ignores
                            setPlannedAssignments(prev => ({ ...prev, __policy__: { alliance: JSON.stringify(policyBlob), step: season.calendar.steps } as any }));
                            toast({ title: 'Learned', description: `Locked Day ${day}. Learned lane reservations from your manual placements.` });
                          } catch (e) {
                            toast({ title: 'Learn failed', description: 'Could not derive policy from events.' });
                          }
                        }}
                      />
                    </div>
                  </SheetContent>
                </Sheet>

                {mode === 'action' ? (
                  <div className="p-1">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button className="w-full text-left px-2 py-1 text-sm hover:bg-accent rounded" title="Remove all events from the current tick onward">Clear Future</button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Clear future events?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will delete all scheduled captures/releases at or after the current tick (Tick {currentTick}). Past history remains.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => {
                            const past = events.filter(e => e.tick < currentTick);
                            const future = events.filter(e => e.tick >= currentTick);
                            setLastCleared(future);
                            setEvents(past);
                            toast({ title: 'Cleared future', description: `${future.length} event(s) removed from Tick ${currentTick} onward.` });
                          }}>Confirm</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button className="w-full text-left px-2 py-1 text-sm hover:bg-accent rounded" title="Remove all events in this season">Clear All</button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Clear all events?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will delete all scheduled events for the current season. This cannot be undone after you leave the page.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => {
                            setLastCleared(events);
                            setEvents([]);
                            toast({ title: 'Cleared all', description: `Removed ${events.length} event(s).` });
                          }}>Confirm</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>

                    {/* Manual stepper safety tools moved here */}
                    <button className="w-full text-left px-2 py-1 text-sm hover:bg-accent rounded disabled:opacity-50" disabled={!manualMode || !selectedAlliance} title="Undo last action for the selected alliance today" onClick={()=>{
                      if (!selectedAlliance) return;
                      const { day } = dayHalfFromTick(currentTick);
                      const todays = events
                        .filter(e => e.alliance === selectedAlliance && dayHalfFromTick(e.tick).day === day && e.tick <= currentTick)
                        .sort((a,b)=> a.tick - b.tick);
                      const last = todays[todays.length - 1];
                      if (!last) {
                        toast({ title: 'Nothing to undo', description: `No action found for ${selectedAlliance} on Day ${day}.` });
                        return;
                      }
                      setEvents(prev => prev.filter(e => !(e.alliance === last.alliance && e.action === last.action && e.tileId === last.tileId && e.tick === last.tick)).sort((a,b)=> a.tick - b.tick));
                      toast({ title: 'Undone', description: `Removed last ${last.action} on ${last.tileId} for ${selectedAlliance} (Day ${day}).` });
                    }}>Undo last action (today)</button>

                    <button className="w-full text-left px-2 py-1 text-sm hover:bg-accent rounded disabled:opacity-50" disabled={!manualMode || !selectedAlliance} title="Refund today's last capture for the selected alliance" onClick={()=>{
                      if (!selectedAlliance) return;
                      const { day } = dayHalfFromTick(currentTick);
                      const todays = events
                        .filter(e => e.alliance === selectedAlliance && dayHalfFromTick(e.tick).day === day)
                        .sort((a,b)=> a.tick - b.tick);
                      const lastCap = [...todays].reverse().find(e => e.action === 'capture' && e.tick <= currentTick);
                      if (!lastCap) {
                        toast({ title: 'Nothing to undo', description: `No capture found for ${selectedAlliance} on Day ${day}.` });
                        return;
                      }
                      setEvents(prev => {
                        let next = prev.filter(e => !(e.alliance === lastCap.alliance && e.action === 'capture' && e.tileId === lastCap.tileId && e.tick === lastCap.tick));
                        const idx = next.findIndex(e => e.alliance === lastCap.alliance && e.action === 'release' && e.tileId === lastCap.tileId && e.tick >= lastCap.tick);
                        if (idx !== -1) next = next.slice(0, idx).concat(next.slice(idx+1));
                        return next.sort((a,b)=> a.tick - b.tick);
                      });
                      toast({ title: 'Undone', description: `Refunded one city/SH attack for ${selectedAlliance} on Day ${day}.` });
                    }}>Undo last capture (refund)</button>

                    <button className="w-full text-left px-2 py-1 text-sm hover:bg-accent rounded disabled:opacity-50" disabled={!manualMode || !selectedAlliance} title="Remove all scheduled events for the selected alliance on this day" onClick={()=>{
                      if (!selectedAlliance) return;
                      const { day } = dayHalfFromTick(currentTick);
                      const keep = events.filter(e => {
                        const d = dayHalfFromTick(e.tick).day;
                        return !(e.alliance === selectedAlliance && d === day);
                      });
                      const removed = events.filter(e => {
                        const d = dayHalfFromTick(e.tick).day;
                        return (e.alliance === selectedAlliance && d === day);
                      });
                      setLastCleared(removed);
                      setEvents(keep);
                      toast({ title: 'Cleared today', description: `${removed.length} event(s) removed for ${selectedAlliance} on Day ${day}.` });
                    }}>Clear today (selected)</button>

                    <button className="w-full text-left px-2 py-1 text-sm hover:bg-accent rounded disabled:opacity-50" disabled={!lastCleared || lastCleared.length===0} onClick={() => {
                      if (!lastCleared || lastCleared.length===0) return;
                      setEvents(prev => [...prev, ...lastCleared].sort((a,b)=> a.tick - b.tick));
                      toast({ title: 'Undo', description: `Restored ${lastCleared.length} event(s).` });
                      setLastCleared(null);
                    }}>Undo Clear</button>
                  </div>
                ) : (
                  <div className="p-1">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button className="w-full text-left px-2 py-1 text-sm hover:bg-accent rounded" title="Remove all planned assignments for this season">Clear Plan</button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Clear planned final map?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will remove all planned assignments for {season.key}. Action timeline events are unaffected.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => {
                            setLastClearedPlan(plannedAssignments);
                            setPlannedAssignments({});
                            toast({ title: 'Cleared plan', description: 'Removed all planned assignments for this season.' });
                          }}>Confirm</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    <button className="w-full text-left px-2 py-1 text-sm hover:bg-accent rounded disabled:opacity-50" disabled={!lastClearedPlan} onClick={() => { if (!lastClearedPlan) return; setPlannedAssignments(lastClearedPlan); setLastClearedPlan(null); toast({ title: 'Undo', description: 'Restored planned assignments.' }); }}>Undo Clear Plan</button>
                  </div>
                )}
              </DropdownMenu.Content>
            </DropdownMenu.Root>

            {/* Filters */}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button className="border rounded px-2 py-1 inline-flex items-center gap-1">Filters <ChevronDown className="w-4 h-4" /></button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content className="z-50 min-w-[220px] rounded border bg-card p-1 shadow-md">
                <div className="px-2 py-1 text-xs text-muted-foreground">Alliance filter</div>
                <button className="w-full text-left px-2 py-1 text-sm hover:bg-accent rounded" onClick={()=> setSelectedAlliance(null)}>All</button>
                {alliances.map(a => (
                  <button key={a.id} className={`w-full text-left px-2 py-1 text-sm hover:bg-accent rounded ${selectedAlliance===a.name ? 'font-medium' : ''}`} onClick={()=> setSelectedAlliance(selectedAlliance===a.name ? null : a.name)}>
                    {a.name}
                  </button>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Root>

            {/* Theme menu */}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button className="border rounded px-2 py-1 inline-flex items-center gap-1">Theme <ChevronDown className="w-4 h-4" /></button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content className="z-50 min-w-[220px] rounded border bg-card p-1 shadow-md">
                <div className="px-2 py-1 text-xs text-muted-foreground">Appearance</div>
                <button className="w-full text-left px-2 py-1 text-sm hover:bg-accent rounded inline-flex items-center gap-2" onClick={()=>{
                  const el = document.documentElement; el.classList.remove('dark'); localStorage.setItem('theme','light');
                }}>
                  <Sun className="w-4 h-4" /> Light
                </button>
                <button className="w-full text-left px-2 py-1 text-sm hover:bg-accent rounded inline-flex items-center gap-2" onClick={()=>{
                  const el = document.documentElement; el.classList.add('dark'); localStorage.setItem('theme','dark');
                }}>
                  <Moon className="w-4 h-4" /> Dark
                </button>
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          </div>
        </div>

        {/* Map + Details */}
        <div className="flex-1 min-h-[60vh] flex relative">
          <MapCanvas map={map} selectedAlliance={selectedAlliance} assignments={mode === 'planning' ? plannedAssignments : derivedAssignments} selectedId={selectedTerritory?.id ?? null} onSelectTerritory={(t)=>{
            if (t.tileType === 'trading-post') {
              toast({ title: 'PvP Tile', description: 'Trading posts are player-held and uncapturable by alliances.' });
              setSelectedTerritory(t); setDetailsOpen(true);
              return;
            }
            // Open details
            setSelectedTerritory(t); setDetailsOpen(true);
            // Manual stepper in Action mode: schedule event on click
            if (mode === 'action' && manualMode) {
              if (!selectedAlliance && manualAction === 'capture') {
                toast({ title: 'Select an alliance', description: 'Pick an alliance in the legend to capture.' });
              } else {
                if (manualAction === 'capture') {
                  // Manual stepper ignores planner reservations: only rules apply
                  const res = canCapture(t, { mode: 'action', step: derivedStep, calendar: season.calendar, territories: map.territories, assignments: derivedAssignments, selectedAlliance, currentTick, events: events.filter(e=> e.tick <= currentTick) });
                  if (res.ok && selectedAlliance) {
                    setEvents(prev => {
                      const next = [...prev, { tick: currentTick, tileId: t.id, alliance: selectedAlliance, action: 'capture' }];
                      // De-duplicate same-tick same-alliance captures on same tile (paranoia)
                      const seen = new Set<string>();
                      const filtered = next.filter(e => {
                        if (e.action !== 'capture') return true;
                        const key = `${e.tick}|${e.alliance}|${e.tileId}`;
                        if (seen.has(key)) return false;
                        seen.add(key);
                        return true;
                      });
                      return filtered.sort((a,b)=> a.tick - b.tick);
                    });
                    toast({ title: 'Scheduled capture', description: `${t.coordinates} → ${selectedAlliance} at Tick ${currentTick}` });
                  } else {
                    toast({ title: 'Cannot capture', description: res.reason });
                  }
                } else {
                  setEvents(prev => [...prev, { tick: currentTick, tileId: t.id, alliance: selectedAlliance || '', action: 'release' }].sort((a,b)=> a.tick - b.tick));
                  toast({ title: 'Scheduled release', description: `${t.coordinates} at Tick ${currentTick}` });
                }
              }
              return;
            }
            // Fast-assign in Planning mode when an alliance is selected and capture is allowed
            if (mode === 'planning' && selectedAlliance) {
              const already = plannedAssignments[t.id]?.alliance === selectedAlliance;
              if (!already) {
                const res = canCapture(t, { mode: 'planning', step: season.calendar.steps, calendar: season.calendar, territories: map.territories, assignments: plannedAssignments, selectedAlliance });
                if (res.ok) {
                  setPlannedAssignments(prev => ({ ...prev, [t.id]: { alliance: selectedAlliance, step: season.calendar.steps } }));
                  toast({ title: 'Planned', description: `${t.coordinates} → ${selectedAlliance}` });
                } else {
                  toast({ title: 'Cannot assign', description: res.reason });
                }
              }
            }
          }} />
          {/* Docked details panel */}
          {detailsOpen && (
            <div className="absolute right-2 top-2 z-50">
              <TerritoryDetailsPanel
                territory={selectedTerritory}
                map={map}
                assignments={mode === 'planning' ? plannedAssignments : derivedAssignments}
                selectedAlliance={selectedAlliance}
                onAssign={(t)=>{
                  if (!selectedAlliance) { toast({ title: 'Select an alliance', description: 'Pick an alliance to assign the tile to.' }); return; }
                  if (t.tileType === 'trading-post') { toast({ title: 'PvP Tile', description: 'Trading posts are player-held and uncapturable by alliances.' }); return; }
                  if (mode === 'planning') {
                    const res = canCapture(t, { mode: 'planning', step: season.calendar.steps, calendar: season.calendar, territories: map.territories, assignments: plannedAssignments, selectedAlliance });
                    if (!res.ok) { toast({ title: 'Cannot assign', description: res.reason }); return; }
                    setPlannedAssignments(prev => ({ ...prev, [t.id]: { alliance: selectedAlliance, step: season.calendar.steps } }));
                    toast({ title: 'Planned', description: `${t.coordinates} → ${selectedAlliance}` });
                  } else {
                    // Manual stepper ignores planner reservations: only rules apply
                    const res = canCapture(t, { mode: 'action', step: derivedStep, calendar: season.calendar, territories: map.territories, assignments: derivedAssignments, selectedAlliance, currentTick, events: events.filter(e=> e.tick <= currentTick) });
                    if (!res.ok) { toast({ title: 'Cannot capture', description: res.reason }); return; }
                    setEvents(prev => {
                      const next = [...prev, { tick: currentTick, tileId: t.id, alliance: selectedAlliance, action: 'capture' }];
                      // De-duplicate same-tick same-alliance captures on same tile (paranoia)
                      const seen = new Set<string>();
                      const filtered = next.filter(e => {
                        if (e.action !== 'capture') return true;
                        const key = `${e.tick}|${e.alliance}|${e.tileId}`;
                        if (seen.has(key)) return false;
                        seen.add(key);
                        return true;
                      });
                      return filtered.sort((a,b)=> a.tick - b.tick);
                    });
                    toast({ title: 'Captured', description: `${t.coordinates} → ${selectedAlliance}` });
                  }
                }}
                onUnassign={(t)=>{
                  if (mode === 'planning') {
                    setPlannedAssignments(prev => { const n = { ...prev }; delete n[t.id]; return n; });
                    toast({ title: 'Unplanned', description: `${t.coordinates}` });
                  } else {
                    setEvents(prev => [...prev, { tick: currentTick, tileId: t.id, alliance: selectedAlliance || '', action: 'release' }].sort((a,b)=> a.tick - b.tick));
                    toast({ title: 'Released', description: `${t.coordinates}` });
                  }
                }}
                onClose={()=> setDetailsOpen(false)}
              />
            </div>
          )}
        </div>
        {/* Bottom legend */}
        <AllianceLegend map={map} assignments={mode === 'planning' ? plannedAssignments : derivedAssignments} selectedAlliance={selectedAlliance} onSelectAlliance={setSelectedAlliance} onCreateAlliance={handleCreateAlliance} onRemoveAlliance={handleRemoveAlliance} onUpdateAlliance={(id, patch)=> setAlliances(prev => prev.map(a => a.id === id ? { ...a, ...patch } : a))} events={events} currentTick={currentTick} />
      </main>
    </div>
  );
}
