import { useMemo, useState } from 'react';
import { Assignments } from './rules';
import { Alliance, MapData, Territory } from './domain';
import { Card } from '@/components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';

interface Props {
  map: MapData;
  assignments: Assignments;
  selectedAlliance: string | null;
  onSelectAlliance: (name: string | null) => void;
  onCreateAlliance: (name: string, color: string) => void;
  onRemoveAlliance: (id: string) => void;
}

export default function AllianceLegend({ map, assignments, selectedAlliance, onSelectAlliance, onCreateAlliance, onRemoveAlliance }: Props) {
  const [openFor, setOpenFor] = useState<string | null>(null);

  const stats = useMemo(() => {
    const byName = new Map<string, { alliance: Alliance; terr: Territory[]; mithril: number; spice: number }>();
    for (const a of map.alliances) byName.set(a.name, { alliance: a, terr: [], mithril: 0, spice: 0 });
    for (const t of map.territories) {
      const asg = assignments[t.id];
      if (!asg) continue;
      const rec = byName.get(asg.alliance);
      if (!rec) continue;
      rec.terr.push(t);
      if (t.resourceType === 'Mithril') rec.mithril += t.resourceValue;
      if (t.resourceType === 'Spice') rec.spice += t.resourceValue;
    }
    const arr = Array.from(byName.values());
    arr.sort((a, b) => b.terr.length - a.terr.length);
    return arr;
  }, [map.alliances, map.territories, assignments]);

  return (
    <div className="mt-3 border rounded bg-card/60">
      <div className="p-2 flex items-center gap-2">
        <div className="text-xs text-muted-foreground">Alliances</div>
        <CreateAllianceInline onCreate={onCreateAlliance} />
      </div>
      <div className="px-2 pb-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
        {stats.map(({ alliance, terr, mithril, spice }) => (
          <Card key={alliance.id} className={`p-2 border ${selectedAlliance===alliance.name? 'ring-2 ring-primary': ''}`}>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: alliance.color }} />
              <button className="text-sm font-medium truncate" title="Filter by alliance" onClick={()=> onSelectAlliance(selectedAlliance===alliance.name? null : alliance.name)}>
                {alliance.name}
              </button>
              <div className="ml-auto text-[10px] text-muted-foreground">{terr.length}</div>
              <button className="text-[10px] underline ml-2" onClick={()=> onRemoveAlliance(alliance.id)}>Remove</button>
            </div>
            <div className="mt-1 grid grid-cols-2 gap-1 text-[10px] text-muted-foreground">
              <div>M/hr {mithril}</div>
              <div>S/hr {spice}</div>
              <div className="col-span-2">S {terr.filter(t=>t.tileType==='stronghold').length}/8 • C {terr.filter(t=>t.tileType==='city').length}/8</div>
            </div>
            <div className="mt-2">
              <button className="text-xs underline" onClick={()=> setOpenFor(alliance.name)}>Details</button>
            </div>
          </Card>
        ))}
      </div>


      <Sheet open={!!openFor} onOpenChange={(v)=>{ if (!v) setOpenFor(null); }}>
        <SheetContent side="bottom" className="h-[70vh] overflow-y-auto">
          {openFor && (
            <AllianceDetails name={openFor} map={map} assignments={assignments} />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function AllianceDetails({ name, map, assignments }: { name: string; map: MapData; assignments: Assignments }) {
  const items = useMemo(()=> map.territories.filter(t => assignments[t.id]?.alliance === name), [map.territories, assignments, name]);
  const totals = useMemo(()=> {
    let m=0,s=0; items.forEach(t=>{ if (t.resourceType==='Mithril') m+=t.resourceValue; if (t.resourceType==='Spice') s+=t.resourceValue; });
    return { m, s };
  }, [items]);
  return (
    <div>
      <SheetHeader>
        <SheetTitle>{name}</SheetTitle>
        <SheetDescription>
          Holdings: {items.length} • M/hr {totals.m} • S/hr {totals.s}
        </SheetDescription>
      </SheetHeader>
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

function CreateAllianceInline({ onCreate }: { onCreate: (name: string, color: string) => void }) {
  const palette = [
    '#ef4444','#22c55e','#3b82f6','#eab308','#a855f7','#06b6d4','#f97316','#14b8a6','#84cc16','#f43f5e',
    '#8b5cf6','#0ea5e9','#10b981','#fb7185','#6366f1','#059669','#7c3aed','#f59e0b','#dc2626','#65a30d',
    '#1d4ed8','#9d174d','#0f766e','#fda4af','#60a5fa','#fbbf24'
  ];
  let name = '';
  let color = palette[0];
  return (
    <div className="ml-auto flex items-center gap-2">
      <Input placeholder="Alliance name" onChange={(e)=> name = e.target.value} className="h-8 w-36" />
      <Select onValueChange={(v)=> { color = v; }}>
        <SelectTrigger className="h-8 w-36"><SelectValue placeholder="Pick color" /></SelectTrigger>
        <SelectContent>
          {palette.map(c => (
            <SelectItem key={c} value={c}>
              <span className="inline-flex items-center gap-2"><span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: c }} />{c}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button className="h-8" onClick={()=>{ if (!name.trim()) return; onCreate(name.trim(), color); }}>Add</Button>
    </div>
  );
}