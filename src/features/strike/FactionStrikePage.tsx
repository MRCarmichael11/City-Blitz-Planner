import DeclarationForm from './components/DeclarationForm';
import DeclarationCard from './components/DeclarationCard';

export default function FactionStrikePage() {
  return (
    <div className="container mx-auto p-4 space-y-4">
      <h1 className="text-xl font-semibold">Faction Strike Planner</h1>
      {/* TODO: Filters (Faction, Bracket, Server, Status tabs) */}
      <DeclarationForm />
      <div className="grid gap-3">
        <DeclarationCard />
      </div>
    </div>
  );
}

