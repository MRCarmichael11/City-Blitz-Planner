import { useEffect, useMemo, useState } from 'react';
import { buildMapData, applyCalendarUnlocks, type Half, type Tick, type ActionEvent, tickFromDayHalf, dayHalfFromTick } from '@/v2/domain';
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

  const [alliances, setAlliances] = useState([] as { id: string; name: string; color: string }[]);
  const baseMap = useMemo(() => buildMapData(season, alliances), [season, alliances]);

  // Initialize theme from localStorage on mount
  useMemo(() => {
    const saved = localStorage.getItem('theme');
    const el = document.documentElement;
    if (saved === 'dark') el.classList.add('dark');
    else if (saved === 'light') el.classList.remove('dark');
  }, []);
  const map = { ...baseMap, territories: applyCalendarUnlocks(baseMap.territories, season.calendar, derivedStep) };
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
  }, []);

  // Save on changes as v3
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_V3);
      const parsed = raw ? JSON.parse(raw) : { version: 3, alliances, eventsBySeason: {} };
      parsed.version = 3;
      parsed.alliances = alliances;
      parsed.eventsBySeason = parsed.eventsBySeason || {};
      parsed.eventsBySeason[season.key] = events;
      localStorage.setItem(STORAGE_KEY_V3, JSON.stringify(parsed));
    } catch {
      /* noop */
    }
  }, [alliances, events, season.key]);

  const handleCreateAlliance = (name: string, color: string) => {
    const id = 'a' + Math.random().toString(36).slice(2, 8);
    setAlliances(prev => [...prev, { id, name, color }]);
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
          </div>
          <div className="ml-auto flex items-center gap-2">
            {/* Theme toggle (simple) */}
            <button className="border rounded px-2 py-1" onClick={()=>{
              const el = document.documentElement; const isDark = el.classList.toggle('dark');
              localStorage.setItem('theme', isDark ? 'dark' : 'light');
            }}>Theme</button>

            {/* Export/Import (v3) */}
            <button className="border rounded px-2 py-1" onClick={()=>{
              const data = { version: 3, season: season.key, alliances, eventsBySeason: { [season.key]: events } };
              const blob = new Blob([JSON.stringify(data,null,2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob); const a = document.createElement('a');
              a.href = url; a.download = `lastwar-v3-${season.key}.json`; a.click(); URL.revokeObjectURL(url);
            }}>Export</button>
            <label className="border rounded px-2 py-1 cursor-pointer">
              Import
              <input type="file" accept="application/json" className="hidden" onChange={async (e)=>{
                const f = e.target.files?.[0]; if (!f) return; const text = await f.text();
                try {
                  const parsed = JSON.parse(text);
                  if (parsed.version === 3) {
                    if (parsed.alliances && Array.isArray(parsed.alliances)) setAlliances(parsed.alliances);
                    if (parsed.eventsBySeason && parsed.eventsBySeason[season.key]) setEvents(parsed.eventsBySeason[season.key] as ActionEvent[]);
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

            <label className="text-sm">Alliance</label>
            <select className="border rounded px-2 py-1 bg-card text-foreground" value={selectedAlliance ?? ''} onChange={(e)=> setSelectedAlliance(e.target.value || null)}>
              <option value="">Select</option>
              {alliances.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
            </select>
            <label className="text-sm">Mode</label>
            <select className="border rounded px-2 py-1 bg-card text-foreground" value={mode} onChange={(e)=>setMode(e.target.value as Mode)}>
              <option value="planning">Planning</option>
              <option value="action">Action</option>
            </select>
          </div>
        </div>
        <div className="flex-1 min-h-[60vh] flex relative">
          <MapCanvas map={map} selectedAlliance={selectedAlliance} assignments={derivedAssignments} selectedId={selectedTerritory?.id ?? null} onSelectTerritory={(t)=>{
            if (t.tileType === 'trading-post') {
              toast({ title: 'PvP Tile', description: 'Trading posts are player-held and uncapturable by alliances.' });
            }
            setSelectedTerritory(t); setDetailsOpen(true);
          }} />
          {/* Docked details panel */}
          {detailsOpen && (
            <div className="absolute right-2 top-2 z-50">
              <TerritoryDetailsPanel
                territory={selectedTerritory}
                map={map}
                assignments={derivedAssignments}
                selectedAlliance={selectedAlliance}
                onAssign={(t)=>{
                  if (!selectedAlliance) { toast({ title: 'Select an alliance', description: 'Pick an alliance to assign the tile to.' }); return; }
                  const res = canCapture(t, { mode, step: derivedStep, calendar: season.calendar, territories: map.territories, assignments: derivedAssignments, selectedAlliance, currentTick, events });
                  if (!res.ok) { toast({ title: 'Cannot capture', description: res.reason }); return; }
                  if (t.tileType === 'trading-post') { toast({ title: 'PvP Tile', description: 'Trading posts are player-held and uncapturable by alliances.' }); return; }
                  setEvents(prev => [...prev, { tick: currentTick, tileId: t.id, alliance: selectedAlliance, action: 'capture' }]);
                  toast({ title: 'Captured', description: `${t.coordinates} → ${selectedAlliance}` });
                }}
                onUnassign={(t)=>{
                  setEvents(prev => [...prev, { tick: currentTick, tileId: t.id, alliance: selectedAlliance || '', action: 'release' }]);
                  toast({ title: 'Released', description: `${t.coordinates}` });
                }}
                onClose={()=> setDetailsOpen(false)}
              />
            </div>
          )}
        </div>
        {/* Bottom legend */}
        <AllianceLegend map={map} assignments={derivedAssignments} selectedAlliance={selectedAlliance} onSelectAlliance={setSelectedAlliance} onCreateAlliance={handleCreateAlliance} onRemoveAlliance={handleRemoveAlliance} />


      </main>
    </div>
  );
}
