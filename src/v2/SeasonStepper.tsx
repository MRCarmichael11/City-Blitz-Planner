import { useMemo } from 'react';
import { MapData, SeasonDefinition, applyCalendarUnlocks } from './domain';

interface Props {
  season: SeasonDefinition;
  map: MapData;
  step: number;
  onStepChange: (d: number) => void;
}

export default function SeasonStepper({ season, map, step, onStepChange }: Props) {
  const total = season.calendar.steps;
  const clamped = Math.min(Math.max(step, 1), total);

  const unlocked = useMemo(() => applyCalendarUnlocks(map.territories, season.calendar, clamped), [map.territories, season.calendar, clamped]);
  // NOTE: unlocked is available to parent if we choose to lift state later

  return (
    <div className="w-full bg-card/60 border rounded p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="font-medium">Season Calendar</div>
        <div className="text-xs text-muted-foreground">Step {clamped} / {total}{Array.isArray(season.calendar.stepDays) && season.calendar.stepDays[clamped-1] ? ` • Day ${season.calendar.stepDays[clamped-1]}` : ''} {clamped===1 ? '• Cities locked' : ''}</div>
      </div>
      <input type="range" min={1} max={total} value={clamped} onChange={(e) => onStepChange(parseInt(e.target.value))} className="w-full" />
      <div className="mt-2 text-xs text-muted-foreground">
        Cities unlock by step; Capitol unlocks at step 7. Locked cities are dimmed. Strongholds are always available.
      </div>
    </div>
  );
}
