import DeclarationForm from './components/DeclarationForm';
import DeclarationCard from './components/DeclarationCard';
import ToolSwitcher from '@/components/ToolSwitcher';
import { useEffect, useState } from 'react';

export default function FactionStrikePage() {
  const [tab, setTab] = useState<'active'|'proposed'|'history'>('active');
  useEffect(()=>{ const t = localStorage.getItem('strike_tab') as any; if (t==='active'||t==='proposed'||t==='history') setTab(t); },[]);
  useEffect(()=>{ localStorage.setItem('strike_tab', tab); }, [tab]);
  return (
    <div className="container mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Faction Strike Planner</h1>
        <ToolSwitcher />
      </div>
      <div className="flex gap-2 text-xs">
        <button className={`px-2 py-1 border rounded ${tab==='active'?'bg-primary text-primary-foreground':''}`} onClick={()=> setTab('active')}>Active</button>
        <button className={`px-2 py-1 border rounded ${tab==='proposed'?'bg-primary text-primary-foreground':''}`} onClick={()=> setTab('proposed')}>Proposed</button>
        <button className={`px-2 py-1 border rounded ${tab==='history'?'bg-primary text-primary-foreground':''}`} onClick={()=> setTab('history')}>History</button>
      </div>
      <DeclarationForm />
      <div className="grid gap-3">
        <DeclarationCard />
      </div>
    </div>
  );
}

