import { useMemo, useState } from 'react';
import type { ActionEvent, Alliance, MapData, SeasonDefinition, Tick } from './domain';
import type { Assignments } from './rules';
import { planSeason } from './planner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Props {
  map: MapData;
  season: SeasonDefinition;
  alliances: Alliance[];
  currentTick: Tick;
  existingEvents: ActionEvent[];
  plannedTarget?: Assignments;
  replaceFutureDefault?: boolean;
  onUpdateAlliance: (id: string, patch: Partial<Alliance>) => void;
  onApplyPlan: (planned: ActionEvent[], replaceFuture: boolean) => void;
}

export default function PlannerControls({ map, season, alliances, currentTick, existingEvents, plannedTarget, replaceFutureDefault = true, onUpdateAlliance, onApplyPlan }: Props) {
  const [replaceFuture, setReplaceFuture] = useState<boolean>(replaceFutureDefault);
  const [report, setReport] = useState<string[]>([]);
  const [planned, setPlanned] = useState<ActionEvent[]>([]);

  const prioritized = useMemo(() => {
    return [...alliances].sort((a, b) => (a.priority ?? Number.POSITIVE_INFINITY) - (b.priority ?? Number.POSITIVE_INFINITY));
  }, [alliances]);

  const handlePreview = () => {
    const { planned, report } = planSeason(map, season, alliances, currentTick, existingEvents, { replaceFuture, plannedTarget, strictToTarget: true });
    setPlanned(planned);
    setReport(report);
  };

  const handleApply = () => {
    if (planned.length === 0) handlePreview();
    onApplyPlan(planned, replaceFuture);
  };

  return (
    <Card className="flex-1 border rounded bg-card/60 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="font-medium">Auto-planner (MVP)</div>
        <label className="text-xs flex items-center gap-1">
          <input type="checkbox" checked={replaceFuture} onChange={(e)=> setReplaceFuture(e.target.checked)} />
          Replace future events from current tick
        </label>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
        {prioritized.map((a) => (
          <div key={a.id} className="text-xs">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: a.color }} />
              <div className="truncate" title={a.name}>{a.name}</div>
            </div>
            <div className="mt-1 flex items-center gap-1">
              <span>Priority</span>
              <Input type="number" className="h-7 w-16" value={a.priority ?? ''} onChange={(e)=> onUpdateAlliance(a.id, { priority: e.target.value === '' ? undefined : Number(e.target.value) })} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Button size="sm" onClick={handlePreview}>Preview plan</Button>
        <Button size="sm" variant="secondary" onClick={handleApply}>Apply plan</Button>
        <div className="text-xs text-muted-foreground">Planned events: {planned.length}</div>
      </div>
      {report.length > 0 && (
        <div className="mt-2 max-h-40 overflow-auto border rounded p-2 bg-muted/30 text-[11px] leading-tight">
          {report.map((line, idx) => (<div key={idx}>{line}</div>))}
        </div>
      )}
    </Card>
  );
}
