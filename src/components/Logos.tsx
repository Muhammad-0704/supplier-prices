/** Знаки сервисов на общей сетке 32×32. */
type P = { size?: number; className?: string; title?: string };

function Frame({ size = 32, className, title, bg, children }: P & { bg: string; children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <rect width="32" height="32" rx="8" fill={bg} />
      {children}
    </svg>
  );
}

/** База: склад — крыша и три ячейки стеллажа */
export function BazaLogo(p: P) {
  return (
    <Frame {...p} bg="var(--signal)">
      <path d="M7 14.5 16 8l9 6.5" fill="none" stroke="var(--ink-on-signal)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="9" y="16.5" width="4" height="7" rx="1" fill="var(--ink-on-signal)" />
      <rect x="14" y="16.5" width="4" height="7" rx="1" fill="var(--ink-on-signal)" opacity=".7" />
      <rect x="19" y="16.5" width="4" height="7" rx="1" fill="var(--ink-on-signal)" opacity=".45" />
    </Frame>
  );
}

/** Прайс-доска: матрица цен, лучшая ячейка выделена */
export function PriceLogo(p: P) {
  const cells = [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => ({ r, c })));
  return (
    <Frame {...p} bg="var(--surface-sunk)">
      {cells.map(({ r, c }) => (
        <rect key={`${r}${c}`} x={7.5 + c * 6} y={7.5 + r * 6} width="5" height="5" rx="1.2" fill="var(--ink)" opacity={r === 1 && c === 1 ? 1 : 0.28} />
      ))}
    </Frame>
  );
}

/** Центр Питания: тарелка с паром — горячая еда */
export function FoodLogo(p: P) {
  return (
    <Frame {...p} bg="var(--surface-sunk)">
      <path d="M12 7.5c-1.2 1.4 1.2 2.6 0 4M16 6.5c-1.2 1.6 1.2 3 0 4.6M20 7.5c-1.2 1.4 1.2 2.6 0 4" fill="none" stroke="var(--ink)" strokeWidth="1.6" strokeLinecap="round" opacity=".75" />
      <path d="M8 15h16a8 8 0 0 1-16 0Z" fill="var(--ink)" />
      <path d="M11 25.5h10" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" />
    </Frame>
  );
}
