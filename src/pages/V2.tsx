import { useEffect, useMemo, useState } from 'react';
import { buildMapData, applyCalendarUnlocks, type Half, type Tick, type ActionEvent, type Alliance, type LearnedPolicy, tickFromDayHalf, dayHalfFromTick } from '@/v2/domain';
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
import { Link } from 'react-router-dom';
import ToolSwitcher from '@/components/ToolSwitcher';
import { useI18n } from '@/i18n';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/services/supabaseClient';

const seasons = { S1, S2, S3, S4 } as const;

type SeasonKey = keyof typeof seasons;

// Simple SVG icons for OAuth providers
const GoogleIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

const DiscordIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.196.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" fill="#5865F2"/>
  </svg>
);

function AuthWidget() {
  const { user, loading, signInWithEmail, signInWithOAuth, signOut, updateDisplayName } = useAuth();
  const [email, setEmail] = useState('');
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [displayName, setDisplayName] = useState('');
  
  if (loading) return <div className="text-xs text-muted-foreground">…</div>;
  
  if (!user) {
    return (
      <div className="flex items-center gap-2">
        {/* OAuth provider buttons */}
        <button 
          className="border rounded px-3 py-1 text-xs inline-flex items-center gap-2 hover:bg-accent" 
          onClick={async ()=>{ 
            try { 
              await signInWithOAuth('google'); 
            } catch (e: unknown) { 
              const msg = e instanceof Error ? e.message : 'Google sign-in error'; 
              alert(msg); 
            } 
          }}
          title="Sign in with Google"
        >
          <GoogleIcon /> Google
        </button>

        <button 
          className="border rounded px-3 py-1 text-xs inline-flex items-center gap-2 hover:bg-accent" 
          onClick={async ()=>{ 
            try { 
              await signInWithOAuth('discord'); 
            } catch (e: unknown) { 
              const msg = e instanceof Error ? e.message : 'Discord sign-in error'; 
              alert(msg); 
            } 
          }}
          title="Sign in with Discord"
        >
          <DiscordIcon /> Discord
        </button>
        
        {/* Email magic link toggle */}
        <button 
          className="border rounded px-2 py-1 text-xs inline-flex items-center gap-1 hover:bg-accent" 
          onClick={() => setShowEmailForm(!showEmailForm)}
          title="Sign in with email magic link"
        >
          <LogIn className="w-4 h-4" /> Email
        </button>
        
        {/* Email form (when toggled) */}
        {showEmailForm && (
          <div className="flex items-center gap-2">
            <input 
              className="border rounded px-2 py-1 h-8 w-48 bg-card text-foreground text-xs" 
              placeholder="Email for magic link" 
              value={email} 
              onChange={(e)=> setEmail(e.target.value)} 
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  (async () => {
                    try { 
                      await signInWithEmail(email); 
                      alert('Check your email for a login link.'); 
                      setShowEmailForm(false);
                      setEmail('');
                    } catch (e: unknown) { 
                      const msg = e instanceof Error ? e.message : 'Sign-in error'; 
                      alert(msg); 
                    }
                  })();
                }
              }}
            />
            <button 
              className="border rounded px-2 py-1 text-xs" 
              onClick={async ()=>{ 
                try { 
                  await signInWithEmail(email); 
                  alert('Check your email for a login link.'); 
                  setShowEmailForm(false);
                  setEmail('');
                } catch (e: unknown) { 
                  const msg = e instanceof Error ? e.message : 'Sign-in error'; 
                  alert(msg); 
                } 
              }}
            >
              Send
            </button>
          </div>
        )}
      </div>
    );
  }
  
  const currentDisplayName = user.displayName || user.email || 'Logged in';
  
  return (
    <div className="flex items-center gap-2 text-xs">
      {editingName ? (
        <div className="flex items-center gap-2">
          <input 
            className="border rounded px-2 py-1 h-6 w-32 bg-card text-foreground text-xs" 
            placeholder="Display name" 
            value={displayName} 
            onChange={(e)=> setDisplayName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                (async () => {
                  try {
                    await updateDisplayName(displayName);
                    setEditingName(false);
                  } catch (e: unknown) {
                    const msg = e instanceof Error ? e.message : 'Error updating name';
                    alert(msg);
                  }
                })();
              } else if (e.key === 'Escape') {
                setEditingName(false);
                setDisplayName('');
              }
            }}
            autoFocus
          />
          <button 
            className="text-xs px-1 py-0.5 border rounded hover:bg-accent"
            onClick={async () => {
              try {
                await updateDisplayName(displayName);
                setEditingName(false);
              } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : 'Error updating name';  
                alert(msg);
              }
            }}
          >
            ✓
          </button>
          <button 
            className="text-xs px-1 py-0.5 border rounded hover:bg-accent"
            onClick={() => {
              setEditingName(false);
              setDisplayName('');
            }}
          >
            ✕
          </button>
        </div>
      ) : (
        <>
          <button 
            className="text-muted-foreground hover:text-foreground cursor-pointer"
            onClick={() => {
              setDisplayName(user.displayName || '');
              setEditingName(true);
            }}
            title="Click to edit display name"
          >
            {currentDisplayName}
          </button>
          <button className="border rounded px-2 py-1 inline-flex items-center gap-1 hover:bg-accent" onClick={()=> signOut()}>
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </>
      )}
    </div>
  );
}

export default function V2() {
  const { t } = useI18n();
  // Default landing season is S4 (S3 is historical).
  const [seasonKey, setSeasonKey] = useState<SeasonKey>('S4');
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

  // Shared Maps state
  const [sharedMaps, setSharedMaps] = useState<import('@/services/sharedMaps').SharedMap[]>([]);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [shareTitle, setShareTitle] = useState('');
  const [generatedShareLink, setGeneratedShareLink] = useState<string | null>(null);

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
            const allianceName = (Array.isArray(parsed3.alliances)
              ? (parsed3.alliances as Array<{ name?: string }>).find((a) => typeof a?.name === 'string' && a.name.toLowerCase() === 'amex')?.name
              : undefined) || 'Amex';
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
        
        // Load user data
        import('@/services/userData').then(({ getUserSeasonData }) => {
          getUserSeasonData(uid, season.key).then(remote => {
            if (!remote) return;
            if (Array.isArray(remote.alliances)) setAlliances(remote.alliances);
            if (remote.eventsBySeason && remote.eventsBySeason[season.key]) setEvents(remote.eventsBySeason[season.key]);
            if (remote.plannedBySeason && remote.plannedBySeason[season.key]) setPlannedAssignments(remote.plannedBySeason[season.key]);
          }).catch(()=>{});
        });
        
        // Load shared maps
        import('@/services/sharedMaps').then(({ getUserSharedMaps }) => {
          getUserSharedMaps(uid).then(maps => {
            setSharedMaps(maps);
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
  }, [autoPlay, autoMs, mode, season.calendar, toast]);

  // Extract learned policy from plannedAssignments
  const learnedPolicy: LearnedPolicy | undefined = useMemo(() => {
    const policyEntry = plannedAssignments['__policy__'];
    if (!policyEntry?.alliance) return undefined;
    
    try {
      const parsed = JSON.parse(policyEntry.alliance);
      if (parsed.version === 1 && parsed.reservedByAlliance) {

        return parsed as LearnedPolicy;
      }
    } catch {
      // Invalid policy data, ignore
    }
    return undefined;
  }, [plannedAssignments]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/60">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <div className="font-bold flex items-center gap-3">
            <span>{t('blitz.title')}</span>
            <ToolSwitcher />
          </div>
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
                        let payload: import('@/services/userData').V3Payload | null = null;
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
                    
                    {/* Share Map section */}
                    <div className="border-t my-1 pt-1">
                      <button className="w-full text-left px-2 py-1 text-sm hover:bg-accent rounded" onClick={() => {
                        setShareTitle(`${season.key} Server Coordination`);
                        setGeneratedShareLink(null);
                        setShowShareDialog(true);
                      }}>Share Map...</button>
                      
                      {sharedMaps.length > 0 && (
                        <div className="mt-1">
                          <div className="px-2 py-1 text-xs text-muted-foreground">Active Shared Maps:</div>
                          {sharedMaps.map(map => (
                            <div key={map.share_id} className="px-2 py-1 text-xs bg-accent/50 rounded m-1 flex justify-between items-center">
                              <div>
                                <div className="font-medium">{map.title}</div>
                                <div className="text-muted-foreground">/{map.share_id}</div>
                              </div>
                              <div className="flex gap-1">
                                <button 
                                  className="px-1 py-0.5 bg-primary text-primary-foreground rounded text-xs"
                                  onClick={() => {
                                    const url = `${window.location.origin}/shared/${map.share_id}`;
                                    navigator.clipboard.writeText(url);
                                    toast({ title: 'Copied!', description: 'Share link copied to clipboard.' });
                                  }}
                                  title="Copy share link"
                                >
                                  Copy
                                </button>
                                <button 
                                  className="px-1 py-0.5 bg-destructive text-destructive-foreground rounded text-xs"
                                  onClick={async () => {
                                    if (!window.confirm('Deactivate this shared map? Alliance leaders will lose access.')) return;
                                    try {
                                      const { deactivateSharedMap } = await import('@/services/sharedMaps');
                                      const ok = await deactivateSharedMap(map.share_id, authUser.id);
                                      if (ok) {
                                        setSharedMaps(prev => prev.filter(m => m.share_id !== map.share_id));
                                        toast({ title: 'Deactivated', description: 'Shared map removed.' });
                                      } else {
                                        toast({ title: 'Failed', description: 'Could not deactivate map.' });
                                      }
                                    } catch {
                                      toast({ title: 'Error', description: 'Failed to deactivate map.' });
                                    }
                                  }}
                                  title="Deactivate share"
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
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
              {t('blitz.modes.planning')}
            </button>
            <button
              className={`px-3 py-1 text-xs ${mode==='action' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
              onClick={()=> setMode('action')}
              title="Schedule day-by-day actions"
            >
              {t('blitz.modes.action')}
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
                <button className="border rounded px-2 py-1 inline-flex items-center gap-1">{t('toolbar.data')} <ChevronDown className="w-4 h-4" /></button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content className="z-50 min-w-[260px] rounded border bg-card p-1 shadow-md">
                <button className="w-full text-left px-2 py-1 text-sm hover:bg-accent rounded" onClick={()=>{
                  const data = { version: 3, season: season.key, alliances, eventsBySeason: { [season.key]: events }, plannedBySeason: { [season.key]: plannedAssignments } };
                  const blob = new Blob([JSON.stringify(data,null,2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob); const a = document.createElement('a');
                  a.href = url; a.download = `lastwar-v3-${season.key}.json`; a.click(); URL.revokeObjectURL(url);
                }}>{t('btn.export')}</button>
                <label className="w-full text-left px-2 py-1 text-sm hover:bg-accent rounded cursor-pointer inline-block">
                  {t('btn.import')}
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
                <button className="border rounded px-2 py-1 inline-flex items-center gap-1">{t('toolbar.actions')} <ChevronDown className="w-4 h-4" /></button>
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
                        learnedPolicy={learnedPolicy}
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
                            setPlannedAssignments(prev => ({ ...prev, __policy__: { alliance: JSON.stringify(policyBlob), step: season.calendar.steps } as unknown as Assignments[typeof season['calendar']['steps']] }));
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
                    <button className="w-full text-left px-2 py-1 text-sm hover:bg-accent rounded" title="Remove all events from the current tick onward">{t('actions.clearFuture')}</button>
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
                        <button className="w-full text-left px-2 py-1 text-sm hover:bg-accent rounded" title="Remove all events in this season">{t('actions.clearAll')}</button>
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
                    }}>{t('actions.undoClear')}</button>

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
                    }}>{t('actions.undoClear')}</button>

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
                    }}>{t('actions.clearAll')}</button>

                    <button className="w-full text-left px-2 py-1 text-sm hover:bg-accent rounded disabled:opacity-50" disabled={!lastCleared || lastCleared.length===0} onClick={() => {
                      if (!lastCleared || lastCleared.length===0) return;
                      setEvents(prev => [...prev, ...lastCleared].sort((a,b)=> a.tick - b.tick));
                      toast({ title: 'Undo', description: `Restored ${lastCleared.length} event(s).` });
                      setLastCleared(null);
                    }}>{t('actions.undoClear')}</button>
                  </div>
                ) : (
                  <div className="p-1">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                    <button className="w-full text-left px-2 py-1 text-sm hover:bg-accent rounded" title="Remove all planned assignments for this season">{t('planning.clearPlan')}</button>
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
                    <button className="w-full text-left px-2 py-1 text-sm hover:bg-accent rounded disabled:opacity-50" disabled={!lastClearedPlan} onClick={() => { if (!lastClearedPlan) return; setPlannedAssignments(lastClearedPlan); setLastClearedPlan(null); toast({ title: 'Undo', description: 'Restored planned assignments.' }); }}>{t('planning.undoClearPlan')}</button>
                  </div>
                )}
              </DropdownMenu.Content>
            </DropdownMenu.Root>

            {/* Filters */}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button className="border rounded px-2 py-1 inline-flex items-center gap-1">{t('toolbar.filters')} <ChevronDown className="w-4 h-4" /></button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content className="z-50 min-w-[220px] rounded border bg-card p-1 shadow-md">
                <div className="px-2 py-1 text-xs text-muted-foreground">{t('filters.allianceFilter')}</div>
                <button className="w-full text-left px-2 py-1 text-sm hover:bg-accent rounded" onClick={()=> setSelectedAlliance(null)}>{t('filters.all')}</button>
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
                <button className="border rounded px-2 py-1 inline-flex items-center gap-1">{t('toolbar.theme')} <ChevronDown className="w-4 h-4" /></button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content className="z-50 min-w-[220px] rounded border bg-card p-1 shadow-md">
                <div className="px-2 py-1 text-xs text-muted-foreground">Appearance</div>
                <button className="w-full text-left px-2 py-1 text-sm hover:bg-accent rounded inline-flex items-center gap-2" onClick={()=>{
                  const el = document.documentElement; el.classList.remove('dark'); localStorage.setItem('theme','light');
                }}>
                  <Sun className="w-4 h-4" /> {t('theme.light')}
                </button>
                <button className="w-full text-left px-2 py-1 text-sm hover:bg-accent rounded inline-flex items-center gap-2" onClick={()=>{
                  const el = document.documentElement; el.classList.add('dark'); localStorage.setItem('theme','dark');
                }}>
                  <Moon className="w-4 h-4" /> {t('theme.dark')}
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
                  const res = canCapture(t, { mode: 'action', seasonKey: season.key, step: derivedStep, calendar: season.calendar, territories: map.territories, assignments: derivedAssignments, selectedAlliance, currentTick, events: events.filter(e=> e.tick <= currentTick) });
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
                  // For releases, record the owning alliance so daily-cap refunds work even if no alliance is selected.
                  const owner = selectedAlliance || derivedAssignments[t.id]?.alliance || '';
                  setEvents(prev => [...prev, { tick: currentTick, tileId: t.id, alliance: owner, action: 'release' }].sort((a,b)=> a.tick - b.tick));
                  toast({ title: 'Scheduled release', description: `${t.coordinates} at Tick ${currentTick}` });
                }
              }
              return;
            }
            // Fast-assign in Planning mode when an alliance is selected and capture is allowed
            if (mode === 'planning' && selectedAlliance) {
              const already = plannedAssignments[t.id]?.alliance === selectedAlliance;
              if (!already) {
                const res = canCapture(t, { mode: 'planning', seasonKey: season.key, step: season.calendar.steps, calendar: season.calendar, territories: map.territories, assignments: plannedAssignments, selectedAlliance });
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
                    const res = canCapture(t, { mode: 'planning', seasonKey: season.key, step: season.calendar.steps, calendar: season.calendar, territories: map.territories, assignments: plannedAssignments, selectedAlliance });
                    if (!res.ok) { toast({ title: 'Cannot assign', description: res.reason }); return; }
                    setPlannedAssignments(prev => ({ ...prev, [t.id]: { alliance: selectedAlliance, step: season.calendar.steps } }));
                    toast({ title: 'Planned', description: `${t.coordinates} → ${selectedAlliance}` });
                  } else {
                    // Manual stepper ignores planner reservations: only rules apply
                    const res = canCapture(t, { mode: 'action', seasonKey: season.key, step: derivedStep, calendar: season.calendar, territories: map.territories, assignments: derivedAssignments, selectedAlliance, currentTick, events: events.filter(e=> e.tick <= currentTick) });
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
                    // For releases, record the owning alliance so daily-cap refunds work even if no alliance is selected.
                    const owner = selectedAlliance || derivedAssignments[t.id]?.alliance || '';
                    setEvents(prev => [...prev, { tick: currentTick, tileId: t.id, alliance: owner, action: 'release' }].sort((a,b)=> a.tick - b.tick));
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

      {/* Share Map Dialog */}
      {showShareDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border rounded-lg p-6 w-96 max-w-[90vw]">
            <h2 className="text-lg font-semibold mb-4">Share Map for Server Coordination</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Create a read-only link that alliance leaders can use to view your coordinated battle plan. They won't be able to edit anything.
            </p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Share Title</label>
                <input
                  className="w-full border rounded px-3 py-2 bg-background text-foreground"
                  placeholder="e.g., S4 Server Coordination Plan"
                  value={shareTitle}
                  onChange={(e) => setShareTitle(e.target.value)}
                />
              </div>
              
              {generatedShareLink && (
                <div className="bg-accent/50 border rounded p-3">
                  <label className="block text-sm font-medium mb-2">Share Link (copied to clipboard):</label>
                  <div className="flex items-center gap-2">
                    <input
                      className="flex-1 bg-background border rounded px-2 py-1 text-xs font-mono"
                      value={generatedShareLink}
                      readOnly
                      onClick={(e) => e.currentTarget.select()}
                    />
                    <button
                      className="px-2 py-1 bg-primary text-primary-foreground rounded text-xs"
                      onClick={() => {
                        navigator.clipboard.writeText(generatedShareLink);
                        toast({ title: 'Copied!', description: 'Share link copied to clipboard again.' });
                      }}
                    >
                      Copy
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Send this link to alliance leaders. They can view your plan without signing in.
                  </p>
                </div>
              )}
              
              <div className="flex gap-2 pt-4">
                <button
                  className="flex-1 bg-primary text-primary-foreground px-4 py-2 rounded hover:bg-primary/90"
                  onClick={async () => {
                    if (!authUser || !shareTitle.trim()) return;
                    
                    try {
                      const payload = { version: 3, alliances, eventsBySeason: { [season.key]: events }, plannedBySeason: { [season.key]: plannedAssignments } };
                      const { createSharedMap } = await import('@/services/sharedMaps');
                      const result = await createSharedMap(authUser.id, season.key, shareTitle.trim(), payload);
                      
                      if (result.success) {
                        // Reload shared maps
                        const { getUserSharedMaps } = await import('@/services/sharedMaps');
                        const maps = await getUserSharedMaps(authUser.id);
                        setSharedMaps(maps);
                        
                        // Copy link to clipboard and show in dialog
                        const url = `${window.location.origin}/shared/${result.shareId}`;
                        navigator.clipboard.writeText(url);
                        setGeneratedShareLink(url);
                        
                        toast({ 
                          title: 'Map Shared!', 
                          description: `Share link copied to clipboard and displayed below.` 
                        });
                      } else {
                        toast({ title: 'Failed to share', description: 'Could not create shared map.' });
                      }
                    } catch {
                      toast({ title: 'Error', description: 'Failed to create share link.' });
                    }
                  }}
                  disabled={!shareTitle.trim()}
                >
                  Create Share Link
                </button>
                <button
                  className="px-4 py-2 border rounded hover:bg-accent"
                  onClick={() => {
                    setShowShareDialog(false);
                    setGeneratedShareLink(null);
                  }}
                >
                  {generatedShareLink ? 'Done' : 'Cancel'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
