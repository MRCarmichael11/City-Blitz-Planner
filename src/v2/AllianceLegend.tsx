import { useMemo, useState } from 'react';
import { Assignments, dailyCapsUsedFor } from './rules';
import { Alliance, MapData, Territory, type Tick, type ActionEvent, dayHalfFromTick } from './domain';
import { Card } from '@/components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/i18n';

const COLOR_PALETTE = [
  // Classic Reds
  '#ef4444', '#dc2626', '#b91c1c', '#991b1b', '#7f1d1d', '#ff0000', '#cc0000', '#990000',
  '#ff4444', '#ff6666', '#cc3333', '#aa2222', '#ff1a1a', '#e60000', '#ff3333', '#d32f2f',
  
  // Oranges & Corals
  '#f97316', '#ea580c', '#c2410c', '#9a3412', '#ff8c00', '#ff7f00', '#ff6b35', '#ff5722',
  '#ff9800', '#f57c00', '#e65100', '#bf360c', '#ff8a65', '#ff7043', '#ff5722', '#d84315',
  
  // Yellows & Golds
  '#eab308', '#ca8a04', '#a16207', '#854d0e', '#ffd700', '#ffcc00', '#ffb300', '#ff9900',
  '#ffc107', '#ffb300', '#ffa000', '#ff8f00', '#fff176', '#ffee58', '#ffeb3b', '#fdd835',
  
  // Greens
  '#22c55e', '#16a34a', '#15803d', '#166534', '#00ff00', '#00cc00', '#00aa00', '#008800',
  '#4caf50', '#388e3c', '#2e7d32', '#1b5e20', '#8bc34a', '#689f38', '#558b2f', '#33691e',
  '#10b981', '#059669', '#047857', '#065f46', '#00e676', '#00c853', '#00b248', '#009624',
  
  // Blues
  '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af', '#0000ff', '#0066cc', '#0080ff', '#4da6ff',
  '#2196f3', '#1976d2', '#1565c0', '#0d47a1', '#03a9f4', '#0288d1', '#0277bd', '#01579b',
  '#06b6d4', '#0891b2', '#0e7490', '#155e75', '#00bcd4', '#0097a7', '#00838f', '#006064',
  
  // Purples & Violets
  '#a855f7', '#9333ea', '#7c3aed', '#6d28d9', '#8000ff', '#9900ff', '#aa00ff', '#bb00ff',
  '#9c27b0', '#7b1fa2', '#6a1b9a', '#4a148c', '#ba68c8', '#ab47bc', '#9c27b0', '#8e24aa',
  '#8b5cf6', '#7c3aed', '#6d28d9', '#5b21b6', '#d500f9', '#aa00ff', '#9c27b0', '#7b1fa2',
  
  // Pinks & Magentas
  '#f43f5e', '#e11d48', '#be185d', '#9d174d', '#ff1493', '#ff69b4', '#ff91a4', '#ffb3ba',
  '#e91e63', '#c2185b', '#ad1457', '#880e4f', '#f06292', '#ec407a', '#e91e63', '#c2185b',
  
  // Cyans & Teals
  '#14b8a6', '#0d9488', '#0f766e', '#134e4a', '#00ffff', '#00e6e6', '#00cccc', '#00b3b3',
  '#26c6da', '#00acc1', '#0097a7', '#00838f', '#4dd0e1', '#26c6da', '#00bcd4', '#00acc1',
  
  // Browns & Earth Tones
  '#92400e', '#78350f', '#451a03', '#292524', '#8d6e63', '#6d4c41', '#5d4037', '#4e342e',
  '#a0522d', '#cd853f', '#daa520', '#b8860b', '#d2691e', '#cd853f', '#bc8f8f', '#f4a460',
  
  // Grays & Metallics  
  '#6b7280', '#4b5563', '#374151', '#1f2937', '#c0c0c0', '#a8a8a8', '#909090', '#787878',
  '#9e9e9e', '#757575', '#616161', '#424242', '#bdbdbd', '#9e9e9e', '#757575', '#616161',
  
  // Special Game Colors
  '#ff00ff', '#00ff80', '#80ff00', '#ff8000', '#8000c0', '#c08000', '#00c080', '#c00080',
  '#4000ff', '#ff4000', '#40ff00', '#00ff40', '#ff0040', '#4080ff', '#ff8040', '#80ff40',
  '#20ff20', '#ff2020', '#2020ff', '#ffff20', '#20ffff', '#ff20ff', '#80ff80', '#ff8080',
];

interface Props {
  map: MapData;
  assignments: Assignments;
  selectedAlliance: string | null;
  onSelectAlliance: (name: string | null) => void;
  onCreateAlliance: (name: string, color: string, priority?: number) => void;
  onRemoveAlliance: (id: string) => void;
  onUpdateAlliance: (id: string, patch: Partial<Alliance>) => void;
  events: ActionEvent[];
  currentTick: Tick;
}

export default function AllianceLegend({ map, assignments, selectedAlliance, onSelectAlliance, onCreateAlliance, onRemoveAlliance, onUpdateAlliance, events, currentTick }: Props) {
  const { t } = useI18n();
  const [openFor, setOpenFor] = useState<string | null>(null);

  const stats = useMemo(() => {
    const { day } = dayHalfFromTick(currentTick);
    const byName = new Map<string, { alliance: Alliance; terr: Territory[]; mithril: number; spice: number; todayS: number; todayC: number; lastTick: number | null; lastLabel: string | null }>();
    for (const a of map.alliances) byName.set(a.name, { alliance: a, terr: [], mithril: 0, spice: 0, todayS: 0, todayC: 0, lastTick: null, lastLabel: null });
    for (const t of map.territories) {
      const asg = assignments[t.id];
      if (!asg) continue;
      const rec = byName.get(asg.alliance);
      if (!rec) continue;
      rec.terr.push(t);
      if (t.resourceType === 'Mithril') rec.mithril += t.resourceValue;
      if (t.resourceType === 'Spice') rec.spice += t.resourceValue;
    }
    // daily caps used and last event label per alliance
    for (const e of events) {
      const rec = byName.get(e.alliance);
      if (!rec) continue;
      if (rec.lastTick === null || e.tick > rec.lastTick) {
        const dhalf = dayHalfFromTick(e.tick);
        rec.lastTick = e.tick;
        rec.lastLabel = `Day ${dhalf.day} ${dhalf.half}`;
      }
    }
    // Compute today's daily-cap usage using the same logic as canCapture (including same-day refunds).
    for (const rec of byName.values()) {
      const used = dailyCapsUsedFor(rec.alliance.name, day, events, map.territories);
      rec.todayS = used.S;
      rec.todayC = used.C;
    }

    const arr = Array.from(byName.values());
    arr.sort((a, b) => b.terr.length - a.terr.length);
    return arr;
  }, [map.alliances, map.territories, assignments, events, currentTick]);

  const selected = openFor ? stats.find(s => s.alliance.name === openFor) : null;

  return (
    <div className="mt-3 border rounded bg-card/60">
      <div className="p-2 flex items-center gap-2">
        <div className="text-xs text-muted-foreground">{t('legend.alliances')}</div>
        <CreateAllianceInline onCreate={onCreateAlliance} />
      </div>
      <div className="px-2 pb-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
        {stats.map(({ alliance, terr, mithril, spice, todayS, todayC /* lastTick, lastLabel */ }) => (
          <Card key={alliance.id} className={`p-2 border ${selectedAlliance===alliance.name? 'ring-2 ring-primary': ''}`}>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: alliance.color }} />
              <button className="text-sm font-medium truncate" title={t('legend.filterByAlliance')} onClick={()=> onSelectAlliance(selectedAlliance===alliance.name? null : alliance.name)}>
                {alliance.name}
              </button>
              <div className="ml-auto text-[10px] text-muted-foreground" title={t('legend.holdings')}>{terr.length}</div>
            </div>
            {/* Condensed core stats */}
            <div className="mt-1 text-[11px] text-muted-foreground">
              M/hr {mithril} • S/hr {spice}
            </div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">
              {t('legend.today')}: S {todayS}/2 • C {todayC}/2
            </div>
            <div className="mt-2">
              <button className="text-xs underline" onClick={()=> setOpenFor(alliance.name)}>{t('legend.details')}</button>
            </div>
          </Card>
        ))}
      </div>

      <Sheet open={!!openFor} onOpenChange={(v)=>{ if (!v) setOpenFor(null); }}>
        <SheetContent side="bottom" className="h-[70vh] overflow-y-auto">
          {selected && (
            <AllianceDetails
              alliance={selected.alliance}
              map={map}
              assignments={assignments}
              lastLabel={selected.lastLabel}
              lastTick={selected.lastTick}
              onUpdateAlliance={onUpdateAlliance}
              onRemoveAlliance={onRemoveAlliance}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function AllianceDetails({ alliance, map, assignments, lastLabel, lastTick, onUpdateAlliance, onRemoveAlliance }: { alliance: Alliance; map: MapData; assignments: Assignments; lastLabel: string | null; lastTick: number | null; onUpdateAlliance: (id: string, patch: Partial<Alliance>) => void; onRemoveAlliance: (id: string) => void; }) {
  const { t } = useI18n();
  const name = alliance.name;
  const items = useMemo(()=> map.territories.filter(t => assignments[t.id]?.alliance === name), [map.territories, assignments, name]);
  const totals = useMemo(()=> {
    let m=0,s=0; items.forEach(t=>{ if (t.resourceType==='Mithril') m+=t.resourceValue; if (t.resourceType==='Spice') s+=t.resourceValue; });
    return { m, s };
  }, [items]);
  return (
    <div>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: alliance.color }} />
          {name}
        </SheetTitle>
        <SheetDescription>
          {t('legend.holdings')}: {items.length} • M/hr {totals.m} • S/hr {totals.s}{lastLabel ? ` • ${t('legend.last')}: ${lastLabel} (Tick ${lastTick})` : ''}
        </SheetDescription>
      </SheetHeader>

      {/* Editable fields moved here to reduce card clutter */}
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{t('legend.color')}</span>
          <Select value={alliance.color} onValueChange={(v)=> onUpdateAlliance(alliance.id, { color: v })}>
            <SelectTrigger className="h-8 w-40">
              <SelectValue placeholder={alliance.color} />
            </SelectTrigger>
            <SelectContent>
              {COLOR_PALETTE.map(c => (
                <SelectItem key={c} value={c}>
                  <span className="inline-flex items-center gap-2"><span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: c }} />{c}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{t('legend.priority')}</span>
          <Input type="number" className="h-8 w-24" value={alliance.priority ?? ''} onChange={(e)=> onUpdateAlliance(alliance.id, { priority: e.target.value === '' ? undefined : Number(e.target.value) })} />
        </div>
        <div className="flex justify-end">
          <Button variant="destructive" onClick={()=> onRemoveAlliance(alliance.id)}>{t('legend.remove')}</Button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {items.map(t => (
          <Card key={t.id} className="p-2">
            <div className="text-xs font-medium">{t.coordinates} • {labelFor(t)}</div>
            <div className="text-[10px] text-muted-foreground">{t.resourceType} +{t.resourceValue}/hr</div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function labelFor(t: Territory) {
  if (t.tileType === 'stronghold') return `S${t.buildingLevel}`;
  if (t.tileType === 'trading-post') return `TP${t.buildingLevel}`;
  if (t.tileType === 'city') return `T${t.buildingLevel}`;
  return 'Cap';
}

function CreateAllianceInline({ onCreate }: { onCreate: (name: string, color: string, priority?: number) => void }) {
  const { t } = useI18n();
  const palette = COLOR_PALETTE;
  let name = '';
  let color = palette[0];
  let priority: number | undefined = undefined;
  return (
    <div className="ml-auto flex items-center gap-2">
      <Input placeholder={t('legend.allianceName')} onChange={(e)=> name = e.target.value} className="h-8 w-36" />
      <Select onValueChange={(v)=> { color = v; }}>
        <SelectTrigger className="h-8 w-36"><SelectValue placeholder={t('legend.pickColor')} /></SelectTrigger>
        <SelectContent>
          {palette.map(c => (
            <SelectItem key={c} value={c}>
              <span className="inline-flex items-center gap-2"><span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: c }} />{c}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex items-center gap-1">
        <span className="text-xs">{t('legend.priority')}</span>
        <Input type="number" className="h-8 w-20" onChange={(e)=> { const v = e.target.value; priority = v === '' ? undefined : Number(v); }} />
      </div>
      <Button className="h-8" onClick={()=>{ if (!name.trim()) return; onCreate(name.trim(), color, priority); }}>{t('legend.add')}</Button>
    </div>
  );
}
