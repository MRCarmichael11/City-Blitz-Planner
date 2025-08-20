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
import { ChevronDown, Menu as MenuIcon, Moon, Sun } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

const seasons = { S1, S2, S3, S4 } as const;

type SeasonKey = keyof typeof seasons;

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
    let s = 1;
    for (let i = 0; i < sd.length; i++) {
      if (currentDay >= sd[i]) s = i + 1;
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

  // Persistence (v3)
  const STORAGE_KEY_V3 = 'lastwar-v3';

  // Load once on mount
  useEffect(() => {
    try {
      // Prefer v3
      const raw3 = localStorage.getItem(STORAGE_KEY_V3);
      if (raw3) {
        const parsed3 = JSON.parse(raw3);
        if (parsed3.alliances && Array.isArray(parsed3.alliances)) setAlliances(parsed3.alliances);
        if (parsed3.eventsBySeason && parsed3.eventsBySeason[season.key]) setEvents(parsed3.eventsBySeason[season.key] as ActionEvent[]);
        if (parsed3.plannedBySeason && parsed3.plannedBySeason[season.key]) setPlannedAssignments(parsed3.plannedBySeason[season.key] as Assignments);
        return;
      }
      // Fallback: v2 migration -> synthesize capture events at Day 1 AM
      const raw2 = localStorage.getItem('lastwar-v2');
      if (raw2) {
        const parsed2 = JSON.parse(raw2);
        if (parsed2.alliances && Array.isArray(parsed2.alliances)) setAlliances(parsed2.alliances);
        const steps = parsed2.stepsBySeason?.[season.key] as Record<number, Assignments> | undefined;
        if (steps) {
          const captures: ActionEvent[] = [];
          const tick1 = tickFromDayHalf(1, 'AM');
          const merged: Assignments = {};
          Object.values(steps).forEach(as => { Object.assign(merged, as); });
          Object.entries(merged).forEach(([tileId, a]) => {
            if (a.alliance) captures.push({ tick: tick1, tileId, alliance: a.alliance, action: 'capture' });
          });
          setEvents(captures);
        }
      }
      // Also support v1 legacy
      const raw1 = localStorage.getItem('lastwar-v1');
      if (raw1) {
        const parsed1 = JSON.parse(raw1);
        if (parsed1.alliances && Array.isArray(parsed1.alliances)) setAlliances(parsed1.alliances);
        const as = parsed1.assignmentsBySeason?.[season.key] as Assignments | undefined;
        if (as) {
          const captures: ActionEvent[] = [];
          const tick1 = tickFromDayHalf(1, 'AM');
          for (const [tileId, a] of (Object.entries(as) as Array<[string, import('@/v2/rules').Assignment]>)) {
            if (a.alliance) captures.push({ tick: tick1, tileId, alliance: a.alliance, action: 'capture' });
          }
          setEvents(captures);
        }
      }
    } catch {
      /* noop */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season.key]);

  // Save on changes as v3 (including planned end-state)
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
  }, [alliances, events, plannedAssignments, season.key]);

  const handleCreateAlliance = (name: string, color: string, priority?: number) => {
    const id = 'a' + Math.random().toString(36).slice(2, 8);
    setAlliances(prev => [...prev, { id, name, color, priority }]);
  };
  const handleRemoveAlliance = (id: string) => {
    setAlliances(prev => prev.filter(a => a.id !== id));
    // Note: events are not retroactively edited; tiles will display without color if their alliance no longer exists.
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/60">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="font-bold">City Blitz Planner</div>
          <div className="flex items-center gap-2">
            <select className="border rounded px-2 py-1 bg-card text-foreground" value={seasonKey} onChange={(e) => { setSeasonKey(e.target.value as SeasonKey); setCurrentDay(1); setCurrentHalf('AM'); }}>
              <option value="S1">Season 1</option>
              <option value="S2">Season 2</option>
              <option value="S3">Season 3</option>
              <option value="S4">Season 4</option>
            </select>
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-4 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          {/* Action Timeline Controls */}
          <div className="flex-1 min-w-[420px] border rounded bg-card/60 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="font-medium">Planner</div>
            </div>
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
                  // We serialize into localStorage v3 alongside plannedBySeason by piggybacking plannedAssignments meta
                  // Attach into our plannedAssignments object under a special key that UI ignores
                  setPlannedAssignments(prev => ({ ...prev, __policy__: { alliance: JSON.stringify(policyBlob), step: season.calendar.steps } as any }));
                  toast({ title: 'Learned', description: `Locked Day ${day}. Learned lane reservations from your manual placements.` });
                } catch (e) {
                  toast({ title: 'Learn failed', description: 'Could not derive policy from events.' });
                }
              }}
            />
          </div>
          {mode === 'action' ? (
            <div className="flex-1 min-w-[420px] border rounded bg-card/60 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium">Action Timeline</div>
                <div className="text-xs text-muted-foreground">Day {currentDay} {currentHalf} • Tick {currentTick} • Step {derivedStep}{Array.isArray(season.calendar.stepDays) && season.calendar.stepDays[derivedStep-1] ? ` • Day ${season.calendar.stepDays[derivedStep-1]}` : ''}{derivedStep===1 ? ' • Cities locked' : ''}</div>
              </div>
              <div className="flex items-center gap-3">
                <input type="range" min={1} max={28} value={currentDay} onChange={(e)=> setCurrentDay(parseInt(e.target.value))} className="flex-1" />
                <select className="border rounded px-2 py-1 bg-card text-foreground" value={currentHalf} onChange={(e)=> setCurrentHalf(e.target.value as Half)}>
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </div>
              {/* Manual stepper controls */}
              <div className="mt-2 flex items-center gap-2">
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
                <div className="text-xs text-muted-foreground">
                  {manualMode ? (
                    selectedAlliance ? `Click a tile to ${manualAction} for ${selectedAlliance}` : 'Select an alliance in the legend'
                  ) : 'Toggle to schedule by clicking the map'}
                </div>
                <button
                  className="ml-auto border rounded px-2 py-1 text-xs disabled:opacity-50"
                  disabled={!manualMode || !selectedAlliance}
                  title="Remove all scheduled events for the selected alliance on this day"
                  onClick={()=>{
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
                  }}
                >
                  Clear today (selected)
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 min-w-[420px] border rounded bg-card/60 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium">Planning (Final Day)</div>
                <div className="text-xs text-muted-foreground">Capitol available • Step {season.calendar.steps}</div>
              </div>
              <div className="text-xs text-muted-foreground">Set the final-day end-state per alliance. This plan is saved separately and used as the target for Action planning.</div>
            </div>
          )}
          <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">





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

            {/* Compact menus replacing inline controls */}
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

            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button className="border rounded px-2 py-1 inline-flex items-center gap-1">Actions <ChevronDown className="w-4 h-4" /></button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content className="z-50 min-w-[260px] rounded border bg-card p-1 shadow-md">
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

            {/* Hamburger (page/account) */}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button className="border rounded px-2 py-1 inline-flex items-center gap-1" aria-label="Menu">
                  <MenuIcon className="w-4 h-4" />
                </button>
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
