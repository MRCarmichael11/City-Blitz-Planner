import { useMemo, useRef, useState, useCallback } from 'react';
import { Alliance, MapData, Territory } from './domain';

import type { Assignments } from './rules';

interface Props {
  map: MapData;
  selectedAlliance: string | null;
  assignments: Assignments;
  selectedId?: string | null;
  onSelectTerritory: (t: Territory) => void;
}

export default function MapCanvas({ map, selectedAlliance, assignments, selectedId, onSelectTerritory }: Props) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const squareSize = 56; // base stronghold tile px
  const cityScale = 0.6; // city/trading-post tiles are smaller than strongholds
  const width = map.gridSize.cols * squareSize;
  const height = map.gridSize.rows * squareSize;

  const territories = useMemo(() => map.territories, [map.territories]);

  // Offscreen culling based on current viewport (pan/zoom)
  const visibleTerritories = useMemo(() => {
    const cw = containerRef.current?.clientWidth ?? width;
    const ch = containerRef.current?.clientHeight ?? height;
    const vx0 = (-pan.x) / zoom;
    const vy0 = (-pan.y) / zoom;
    const vx1 = (cw - pan.x) / zoom;
    const vy1 = (ch - pan.y) / zoom;
    const margin = 2 * squareSize; // render margin for smoothness

    return territories.filter(t => {
      const isCityLike = t.tileType === 'city' || t.tileType === 'trading-post';
      const w = isCityLike ? squareSize * cityScale : squareSize;
      const h = isCityLike ? squareSize * cityScale : squareSize;
      const dx = isCityLike ? (squareSize - w) / 2 : 0;
      const dy = isCityLike ? (squareSize - h) / 2 : 0;
      const x = (((t.col - 1) + (t.offset?.x ?? 0)) * squareSize) + dx;
      const y = (((t.row - 1) + (t.offset?.y ?? 0)) * squareSize) + dy;
      // AABB intersect check with viewport box in world coords
      const rx0 = x, ry0 = y, rx1 = x + w, ry1 = y + h;
      return !(rx1 < vx0 - margin || rx0 > vx1 + margin || ry1 < vy0 - margin || ry0 > vy1 + margin);
    });
  }, [territories, pan.x, pan.y, zoom, squareSize, cityScale, width, height]);

  const clampPan = useCallback((nx: number, ny: number, z: number) => {
    const cw = containerRef.current?.clientWidth ?? 0;
    const ch = containerRef.current?.clientHeight ?? 0;
    const maxX = 0; // left bound
    const minX = Math.min(0, cw - width * z);
    const maxY = 0;
    const minY = Math.min(0, ch - height * z);
    return { x: Math.max(minX, Math.min(maxX, nx)), y: Math.max(minY, Math.min(maxY, ny)) };
  }, [width, height]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    // Only zoom if hovering over a tile; otherwise allow page scroll
    const target = e.target as HTMLElement;
    const overTile = !!target.closest('[data-territory]');
    if (!overTile) return; // do not preventDefault -> page can scroll

    e.preventDefault();
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dir = e.deltaY < 0 ? 1 : -1;
    const newZoom = Math.min(3, Math.max(0.5, zoom + dir * 0.1));
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    // world position under cursor before zoom
    const wx = (mx - pan.x) / zoom;
    const wy = (my - pan.y) / zoom;
    // compute new pan to keep world point under cursor
    const nx = mx - wx * newZoom;
    const ny = my - wy * newZoom;
    const clamped = clampPan(nx, ny, newZoom);
    setPan(clamped);
    setZoom(newZoom);
  }, [zoom, pan.x, pan.y, clampPan]);

  const startPan = useRef<{x:number;y:number}|null>(null);
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    startPan.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!startPan.current) return;
    const nx = e.clientX - startPan.current.x;
    const ny = e.clientY - startPan.current.y;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const clamped = clampPan(nx, ny, zoom);
      setPan(clamped);
    });
  };
  const handleMouseUp = () => { startPan.current = null; };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex items-center gap-2 mb-2">
        <button className="border rounded px-2 py-1" onClick={() => setZoom(z => Math.max(0.5, z - 0.1))}>-</button>
        <span className="text-xs font-mono">{Math.round(zoom*100)}%</span>
        <button className="border rounded px-2 py-1" onClick={() => setZoom(z => Math.min(3, z + 0.1))}>+</button>
        <button className="border rounded px-2 py-1 ml-2" onClick={() => { setZoom(1); setPan({x:0,y:0}); }}>Reset</button>
      </div>
      <div
        ref={containerRef}
        className="flex-1 min-h-0 bg-gradient-to-br from-background to-card rounded border overflow-hidden"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          className="relative ml-8 mt-8 will-change-transform"
          style={{ width, height, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}
        >
          {/* Grid lines */}
          {Array.from({ length: map.gridSize.cols }, (_, i) => (
            <div key={`v${i}`} className="absolute top-0 bottom-0 border-l border-border/40" style={{ left: i*squareSize }} />
          ))}
          {Array.from({ length: map.gridSize.rows }, (_, i) => (
            <div key={`h${i}`} className="absolute left-0 right-0 border-t border-border/40" style={{ top: i*squareSize }} />
          ))}

          {/* Territories (culled) */}
          {visibleTerritories.map(t => {
            const asg = assignments[t.id];
            const color = asg ? (map.alliances.find(a => a.name === asg.alliance)?.color || '#ffffff') : undefined;
            const bgOverlay = color ? `${color}80` : undefined; // ~50% opacity
            const borderOverlay = color ? `${color}CC` : undefined; // ~80% opacity
            const filtered = selectedAlliance ? (asg ? asg.alliance === selectedAlliance : false) : true;
            return (
              <button
                key={t.id}
                data-territory
                onMouseEnter={()=> setHoverId(t.id)}
                onMouseLeave={()=> setHoverId(null)}
                onClick={() => onSelectTerritory(t)}
                className={`absolute rounded text-[10px] leading-none flex items-center justify-center border transition ${
                  filtered ? '' : 'opacity-30'
                } ${(hoverId===t.id || (selectedId && selectedId===t.id)) ? 'ring-2 ring-primary' : ''} ${t.tileType === 'stronghold' ? 'bg-red-500/10 border-red-500/40' : t.tileType === 'city' ? 'bg-amber-500/10 border-amber-500/40' : t.tileType === 'trading-post' ? 'bg-black/60 border-black/70 text-white' : 'bg-yellow-500/10 border-yellow-500/40'}`}
                style={{ 
                  left: ((t.col-1)+(t.offset?.x??0))*squareSize, 
                  top: ((t.row-1)+(t.offset?.y??0))*squareSize,
                  width: t.tileType === 'city' || t.tileType === 'trading-post' ? squareSize*cityScale : squareSize,
                  height: t.tileType === 'city' || t.tileType === 'trading-post' ? squareSize*cityScale : squareSize,
                  zIndex: t.tileType === 'city' || t.tileType === 'trading-post' ? 3 : (t.tileType === 'capitol' ? 4 : 2), pointerEvents: 'auto', cursor: t.tileType==='trading-post' ? 'not-allowed' : 'pointer',
                  transform: t.tileType === 'city' || t.tileType === 'trading-post' ? `translate(${(squareSize - squareSize*cityScale)/2}px, ${(squareSize - squareSize*cityScale)/2}px)` : undefined,
                  backgroundColor: bgOverlay || undefined,
                  borderColor: borderOverlay || undefined,
                }}
                title={t.coordinates + ' ' + t.tileType + (t.isUnlocked===false ? ' (locked)' : '') + (asg ? ' • ' + asg.alliance : '') + (t.tileType === 'trading-post' ? ' • PvP (uncapturable by alliances)' : '')}
              >
                {t.tileType === 'stronghold' ? `S${t.buildingLevel}` : t.tileType === 'city' ? `T${t.buildingLevel}` : t.tileType === 'trading-post' ? `TP${t.buildingLevel}` : 'Cap'}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
