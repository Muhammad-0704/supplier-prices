/**
 * Знаки экосистемы. Одна сетка 32×32, скругление 8, белые линии одной толщины —
 * сервисы выглядят семьёй, а цвет говорит, где ты: База — графит, Прайс-доска — жёлтый, Центр Питания — зелёный.
 */
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
    <Frame {...p} bg="#1b1e21">
      <path d="M7 14.5 16 8l9 6.5" fill="none" stroke="#f5c518" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="9" y="16.5" width="4" height="7" rx="1" fill="#fff" />
      <rect x="14" y="16.5" width="4" height="7" rx="1" fill="#fff" opacity=".7" />
      <rect x="19" y="16.5" width="4" height="7" rx="1" fill="#fff" opacity=".45" />
    </Frame>
  );
}

/** Прайс-доска: матрица цен, лучшая ячейка выделена */
export function PriceLogo(p: P) {
  const cells = [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => ({ r, c })));
  return (
    <Frame {...p} bg="#f5c518">
      {cells.map(({ r, c }) => (
        <rect key={`${r}${c}`} x={7.5 + c * 6} y={7.5 + r * 6} width="5" height="5" rx="1.2" fill="#1b1e21" opacity={r === 1 && c === 1 ? 1 : 0.28} />
      ))}
    </Frame>
  );
}

/** Центр Питания: тарелка с паром — горячая еда */
export function FoodLogo(p: P) {
  return (
    <Frame {...p} bg="#17703f">
      <path d="M12 7.5c-1.2 1.4 1.2 2.6 0 4M16 6.5c-1.2 1.6 1.2 3 0 4.6M20 7.5c-1.2 1.4 1.2 2.6 0 4" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" opacity=".75" />
      <path d="M8 15h16a8 8 0 0 1-16 0Z" fill="#fff" />
      <path d="M11 25.5h10" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </Frame>
  );
}
