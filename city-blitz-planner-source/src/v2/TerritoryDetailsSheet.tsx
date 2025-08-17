import { useMemo } from 'react';
import { MapData, Territory } from './domain';
import type { Assignments } from './rules';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Card } from '@/components/ui/card';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  map: MapData;
  territory: Territory | null;
  assignments: Assignments;
  selectedAlliance: string | null;
  onAssign: (t: Territory) => void;
  onUnassign: (t: Territory) => void;
}

export default function TerritoryDetailsSheet({ open, onOpenChange, map, territory, assignments, selectedAlliance, onAssign, onUnassign }: Props) {
  const asg = territory ? assignments[territory.id] : undefined;
  const ownerColor = useMemo(() => {
    if (!asg) return undefined;
    return map.alliances.find(a => a.name === asg.alliance)?.color;
  }, [asg, map.alliances]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[65vh] overflow-y-auto">
        {territory && (
          <div>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <span>{territory.coordinates}</span>
                <span className="text-xs text-muted-foreground">{labelFor(territory)}</span>
                {ownerColor && <span className="ml-2 w-3 h-3 rounded-full" style={{ backgroundColor: ownerColor }} />}
              </SheetTitle>
              <SheetDescription>
                {territory.tileType === 'trading-post' ? 'PvP (uncapturable by alliances).' : territory.tileType === 'capitol' ? 'Capitol (unique, does not count toward caps).' : `${territory.buildingType}`}
                {asg ? ` • Owned by ${asg.alliance} (step ${asg.step})` : ' • Unassigned'}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <Card className="p-2 text-sm"><div>Resource</div><div className="text-xs text-muted-foreground">{territory.resourceType} +{territory.resourceValue}/hr</div></Card>
              <Card className="p-2 text-sm"><div>Type</div><div className="text-xs text-muted-foreground">{territory.buildingType}</div></Card>
            </div>

            <div className="mt-4 flex items-center gap-2">
              {territory.tileType !== 'trading-post' && (
                <button className="border rounded px-3 py-1" onClick={()=> onAssign(territory)} disabled={!selectedAlliance}>
                  Assign{selectedAlliance ? ` to ${selectedAlliance}` : ''}
                </button>
              )}
              {asg && (
                <button className="border rounded px-3 py-1" onClick={()=> onUnassign(territory)}>Unassign</button>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function labelFor(t: Territory) {
  if (t.tileType === 'stronghold') return `S${t.buildingLevel}`;
  if (t.tileType === 'trading-post') return `TP${t.buildingLevel}`;
  if (t.tileType === 'city') return `T${t.buildingLevel}`;
  return 'Cap';
}
