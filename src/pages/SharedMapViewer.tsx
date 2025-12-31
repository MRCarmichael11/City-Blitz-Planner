import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { buildMapData, applyCalendarUnlocks, type Half, type Tick, type ActionEvent, type Alliance, tickFromDayHalf, dayHalfFromTick } from '@/v2/domain';
import { S1, S2, S3, S4 } from '@/v2/seasons';
import AllianceLegend from '@/v2/AllianceLegend';
import { useToast } from '@/components/ui/use-toast';
import MapCanvas from '@/v2/MapCanvas';
import { Mode, Assignments } from '@/v2/rules';
import TerritoryDetailsPanel from '@/v2/TerritoryDetailsPanel';
import { getSharedMap, type SharedMapWithData } from '@/services/sharedMaps';
import { ChevronLeft } from 'lucide-react';

const seasons = { S1, S2, S3, S4 } as const;

type SeasonKey = keyof typeof seasons;

export default function SharedMapViewer() {
  const { shareId } = useParams<{ shareId: string }>();
  const { toast } = useToast();
  
  // Shared map data
  const [sharedMapData, setSharedMapData] = useState<SharedMapWithData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Timeline state (read-only)
  const [currentDay, setCurrentDay] = useState<number>(1);
  const [currentHalf, setCurrentHalf] = useState<Half>('AM');
  const [selectedAlliance, setSelectedAlliance] = useState<string|null>(null);
  const [mode, setMode] = useState<Mode>('action');
  
  // Details panel
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [selectedTerritory, setSelectedTerritory] = useState<import('@/v2/domain').Territory | null>(null);
  
  // Autoplay state
  const [autoPlay, setAutoPlay] = useState(false);
  const [autoMs, setAutoMs] = useState(600);

  // Load shared map data
  useEffect(() => {
    if (!shareId) {
      setError('Invalid share link');
      setLoading(false);
      return;
    }

    getSharedMap(shareId)
      .then(data => {
        if (!data) {
          setError('Shared map not found or has been deactivated');
        } else {
          setSharedMapData(data);
        }
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load shared map');
        setLoading(false);
      });
  }, [shareId]);

  // Derived values from shared map data
  const seasonKey = sharedMapData?.season as SeasonKey || 'S3';
  const season = seasons[seasonKey];
  const alliances: Alliance[] = sharedMapData?.data.alliances || [];
  const events: ActionEvent[] = sharedMapData?.data.eventsBySeason?.[seasonKey] || [];
  const plannedAssignments: Assignments = sharedMapData?.data.plannedBySeason?.[seasonKey] || {};

  const currentTick: Tick = useMemo(() => tickFromDayHalf(currentDay, currentHalf), [currentDay, currentHalf]);

  // Derive calendar step from current day for unlocks
  const derivedStep = useMemo(() => {
    const sd = season.calendar.stepDays || [];
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

  const baseMap = useMemo(() => buildMapData(season, alliances), [season, alliances]);
  const displayStep = mode === 'planning' ? season.calendar.steps : derivedStep;
  const map = { ...baseMap, territories: applyCalendarUnlocks(baseMap.territories, season.calendar, displayStep) };

  // Timeline controls
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

  // Autoplay effect
  useEffect(() => {
    if (!autoPlay || mode !== 'action') return;
    const lastDayLocal = (season.calendar.stepDays && season.calendar.stepDays.length > 0) ? season.calendar.stepDays[season.calendar.stepDays.length - 1] : 28;
    const maxTickLocal = (lastDayLocal * 2) as Tick;
    const id = setInterval(() => {
      setCurrentHalf(h => {
        const nextHalf = h === 'AM' ? 'PM' : 'AM';
        if (h === 'AM') return nextHalf;
        setCurrentDay(d => {
          const nextDay = d + 1;
          const nextTick = tickFromDayHalf(nextDay, 'AM');
          if (nextTick > maxTickLocal) {
            setAutoPlay(false);
            return d;
          }
          return nextDay;
        });
        return nextHalf;
      });
    }, Math.max(200, autoMs));
    return () => clearInterval(id);
  }, [autoPlay, autoMs, mode, season.calendar]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg">Loading shared map...</div>
          <div className="text-sm text-muted-foreground mt-2">Share ID: {shareId}</div>
        </div>
      </div>
    );
  }

  if (error || !sharedMapData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg text-destructive mb-4">{error || 'Map not found'}</div>
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="w-4 h-4" /> Back to City Blitz Planner
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/60">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
              <ChevronLeft className="w-4 h-4" /> Back
            </Link>
            <div>
              <div className="font-bold">{sharedMapData.title}</div>
              <div className="text-sm text-muted-foreground">
                Shared by {sharedMapData.owner_display_name} • Read-only
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xs text-muted-foreground">
              Season {seasonKey.replace('S', '')} • Share ID: {shareId}
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-4 flex flex-col gap-3">
        {/* Read-only toolbar */}
        <div className="w-full border rounded bg-card/60 p-2 flex flex-wrap items-center gap-2">
          {/* Mode toggle (read-only) */}
          <div className="inline-flex rounded-full border overflow-hidden">
            <button
              className={`px-3 py-1 text-xs ${mode==='planning' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
              onClick={()=> setMode('planning')}
              title="View final-day end-state"
            >
              Planning
            </button>
            <button
              className={`px-3 py-1 text-xs ${mode==='action' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
              onClick={()=> setMode('action')}
              title="View day-by-day timeline"
            >
              Action
            </button>
          </div>

          {/* Timeline controls */}
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

          {/* Alliance filter */}
          <div className="flex items-center gap-2">
            <select 
              className="border rounded px-2 py-1 bg-card text-foreground text-xs"
              value={selectedAlliance || ''}
              onChange={(e) => setSelectedAlliance(e.target.value || null)}
            >
              <option value="">All Alliances</option>
              {alliances.map(a => (
                <option key={a.id} value={a.name}>{a.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Map + Details */}
        <div className="flex-1 min-h-[60vh] flex relative">
          <MapCanvas 
            map={map} 
            selectedAlliance={selectedAlliance} 
            assignments={mode === 'planning' ? plannedAssignments : derivedAssignments} 
            selectedId={selectedTerritory?.id ?? null} 
            onSelectTerritory={(t)=>{
              setSelectedTerritory(t); 
              setDetailsOpen(true);
              // No editing in read-only mode
            }} 
          />
          {/* Docked details panel (read-only) */}
          {detailsOpen && selectedTerritory && (
            <div className="absolute right-2 top-2 z-50">
              <TerritoryDetailsPanel
                territory={selectedTerritory}
                map={map}
                assignments={mode === 'planning' ? plannedAssignments : derivedAssignments}
                selectedAlliance={selectedAlliance}
                onAssign={() => {
                  toast({ title: 'Read-only mode', description: 'This is a shared view. You cannot make changes.' });
                }}
                onUnassign={() => {
                  toast({ title: 'Read-only mode', description: 'This is a shared view. You cannot make changes.' });
                }}
                onClose={()=> setDetailsOpen(false)}
              />
            </div>
          )}
        </div>

        {/* Bottom legend (read-only) */}
        <AllianceLegend 
          map={map} 
          assignments={mode === 'planning' ? plannedAssignments : derivedAssignments} 
          selectedAlliance={selectedAlliance} 
          onSelectAlliance={setSelectedAlliance} 
          onCreateAlliance={() => {
            toast({ title: 'Read-only mode', description: 'This is a shared view. You cannot create alliances.' });
          }} 
          onRemoveAlliance={() => {
            toast({ title: 'Read-only mode', description: 'This is a shared view. You cannot remove alliances.' });
          }} 
          onUpdateAlliance={() => {
            toast({ title: 'Read-only mode', description: 'This is a shared view. You cannot edit alliances.' });
          }} 
          events={events} 
          currentTick={currentTick} 
        />
      </main>
    </div>
  );
}