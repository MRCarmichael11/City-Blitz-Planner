import { useMemo } from 'react';
import { Assignments, countsForStep, countsTotal, availableDaysForStep, totalCapsForSeason } from './rules';
import { MapData, SeasonDefinition } from './domain';

interface Props {
  season: SeasonDefinition;
  map: MapData;
  assignments: Assignments;
  selectedAlliance: string;
  step: number;
}

export default function MoveBudget({ season, map, assignments, selectedAlliance, step }: Props) {
  const perStep = useMemo(() => countsForStep(assignments, selectedAlliance, step, map.territories), [assignments, selectedAlliance, step, map.territories]);
  const totals = useMemo(() => countsTotal(assignments, selectedAlliance, map.territories), [assignments, selectedAlliance, map.territories]);

  const days = availableDaysForStep(step, season.calendar);
  const stepCapS = 2 * days; const stepCapC = 2 * days;
  const caps = totalCapsForSeason(map.season);
  const totalCapS = caps.strongholds; const totalCapC = caps.cities;

  const stepRemS = Math.max(0, stepCapS - perStep.strongholds);
  const stepRemC = Math.max(0, stepCapC - perStep.cities);

  const totalRemS = Math.max(0, totalCapS - totals.strongholds);
  const totalRemC = Math.max(0, totalCapC - totals.cities);

  // Can add this step = limited by both per-step and global cap
  const canAddS = Math.min(stepRemS, totalRemS);
  const canAddC = Math.min(stepRemC, totalRemC);

  // Strand risk: at global cap but cannot add this step (e.g., if you abandon to make room, you still can't recapture this step)
  const strandRiskS = totals.strongholds >= totalCapS && stepRemS <= 0;
  const strandRiskC = totals.cities >= totalCapC && stepRemC <= 0;

  const day = Array.isArray(season.calendar.stepDays) ? season.calendar.stepDays[Math.max(0, step-1)] : undefined;

  return (
    <div className="w-full border rounded bg-card/60 p-2 text-xs">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="font-medium">Move budget{day ? ` • Day ${day}` : ''}</div>
        <div className="ml-auto flex items-center gap-3">
          <Badge label="This step" values={[`S ${stepRemS}/${stepCapS}`, `C ${stepRemC}/${stepCapC}`]} />
          <Badge label="Global cap" values={[`S ${totals.strongholds}/${totalCapS}`, `C ${totals.cities}/${totalCapC}`]} />
          <Badge label="Can add now" values={[`S ${canAddS}`, `C ${canAddC}`]} />
        </div>
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">
        Per-day limit: 2S / 2C • Global caps: {totalCapS}S / {totalCapC}C
      </div>
      {(strandRiskS || strandRiskC) && (
        <div className="mt-2 text-[10px] text-red-500">
          {strandRiskS && <div>Warning: At {totalCapS} strongholds and no stronghold moves left this step. If you abandon, you could be stranded at {totalCapS - 1} until next step.</div>}
          {strandRiskC && <div>Warning: At {totalCapC} cities and no city moves left this step. If you abandon, you could be stranded at {totalCapC - 1} until next step.</div>}
        </div>
      )}
    </div>
  );
}

function Badge({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="inline-flex items-center gap-2 px-2 py-1 rounded border bg-background/60">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{values.join(' • ')}</span>
    </div>
  );
}
