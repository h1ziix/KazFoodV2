interface Props {
  value: string;
  onChange: (next: string) => void;
}

export function JsonInput({ value, onChange }: Props) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      spellCheck={false}
      placeholder="Вставьте JSON по структуре LightingProtocol..."
      className="h-[480px] w-full resize-y rounded border border-slate-300 bg-white p-3 font-mono text-xs leading-relaxed text-slate-900 shadow-inner outline-none focus:border-slate-500"
    />
  );
}
