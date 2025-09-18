export default function LockModal() {
  return (
    <div className="flex gap-2">
      <button className="px-2 py-1 border rounded text-xs">Lock</button>
      {/* TODO: show conflict/parity errors, suggest next free slot */}
    </div>
  );
}

