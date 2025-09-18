import DeclarationForm from './components/DeclarationForm';
import DeclarationCard from './components/DeclarationCard';
import ToolSwitcher from '@/components/ToolSwitcher';

export default function FactionStrikePage() {
  return (
    <div className="container mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Faction Strike Planner</h1>
        <ToolSwitcher />
      </div>
      {/* TODO: Filters (Faction, Bracket, Server, Status tabs) */}
      <DeclarationForm />
      <div className="grid gap-3">
        <DeclarationCard />
      </div>
    </div>
  );
}

