import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MapData, Territory } from './domain';
import type { Assignments } from './rules';

interface Props {
  territory: Territory | null;
  map: MapData;
  assignments: Assignments;
  selectedAlliance: string | null;
  onAssign: (t: Territory) => void;
  onUnassign: (t: Territory) => void;
  onClose: () => void;
}

export default function TerritoryDetailsPanel({ territory, map, assignments, selectedAlliance, onAssign, onUnassign, onClose }: Props) {
  const asg = territory ? assignments[territory.id] : undefined;
  const ownerColor = asg ? map.alliances.find(a => a.name === asg.alliance)?.color : undefined;
  if (!territory) return null;

  return (
    <Card className="w-72 shadow-lg border bg-card/95 backdrop-blur-sm">
      <div className="p-3 border-b flex items-center gap-2">
        <div className="font-semibold text-sm">{territory.coordinates}</div>
        <div className="text-xs text-muted-foreground">{labelFor(territory)}</div>
        {ownerColor && <span className="ml-auto w-3 h-3 rounded-full" style={{ backgroundColor: ownerColor }} />}
        <button className="ml-2 text-xs underline" onClick={onClose}>Close</button>
      </div>
      <div className="p-3 space-y-2 text-sm">
        <div className="text-xs text-muted-foreground">
          {territory.tileType === 'trading-post' ? 'PvP (uncapturable by alliances).' : territory.tileType === 'capitol' ? 'Capitol (unique, excluded from caps).' : territory.buildingType}
          {asg ? ` • Owned by ${asg.alliance} (step ${asg.step})` : ' • Unassigned'}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="font-medium">Resource</div>
            <div className="text-xs text-muted-foreground">{territory.resourceType} +{territory.resourceValue}/hr</div>
          </div>
          <div>
            <div className="font-medium">Type</div>
            <div className="text-xs text-muted-foreground">{territory.buildingType}{territory.subLabel ? ` • ${territory.subLabel}` : ''}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 pt-1">
          {territory.tileType !== 'trading-post' && (
            <Button variant="outline" size="sm" onClick={()=> onAssign(territory)} disabled={!selectedAlliance}>Assign{selectedAlliance ? ` to ${selectedAlliance}` : ''}</Button>
          )}
          {asg && (
            <Button variant="outline" size="sm" onClick={()=> onUnassign(territory)}>Unassign</Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function labelFor(t: Territory) {
  if (t.tileType === 'stronghold') return `S${t.buildingLevel}`;
  if (t.tileType === 'trading-post') return `TP${t.buildingLevel}`;
  if (t.tileType === 'city') return `T${t.buildingLevel}`;
  return 'Cap';
}
