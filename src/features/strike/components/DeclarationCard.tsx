import LockModal from './LockModal';

export default function DeclarationCard() {
  return (
    <div className="border rounded p-3">
      <div className="font-medium">AMEX → THE7</div>
      <div className="text-xs text-muted-foreground">Tonight 20:00–21:00 • Proposed</div>
      {/* TODO: show locked brackets, RSVP count, tooltips with home server */}
      <div className="mt-2">
        <LockModal />
      </div>
    </div>
  );
}

