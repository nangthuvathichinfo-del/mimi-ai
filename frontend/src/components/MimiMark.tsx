/**
 * Logo Mimi AI chính thức (theo file mimi-logo-animated.svg của nhóm).
 * - animated: thân nhún nhẹ, ăng-ten cam lắc, mắt chớp. Tự dừng khi máy bật giảm chuyển động.
 * - Dùng chung một hình cho mọi cỡ: 132px ở màn chào, 52px ở đầu Trang chủ, 32px ở góc màn con.
 */
export function MimiMark({ size = 56, animated = false, label = "Mimi AI" }: { size?: number; animated?: boolean; label?: string | null }) {
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true as const };
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={animated ? "mm mm--live" : "mm"} {...a11y}>
      <g className="mm-bob">
        <line x1="32" y1="8" x2="32" y2="15" stroke="#2F6BFF" strokeWidth="3" strokeLinecap="round" />
        <circle className="mm-wig" cx="32" cy="7" r="4" fill="#FF8A3D" />
        <rect x="8" y="15" width="48" height="40" rx="18" fill="#2F6BFF" />
        <rect x="14" y="22" width="36" height="26" rx="13" fill="#EAF1FF" />
        <g className="mm-eyes">
          <ellipse cx="25" cy="34" rx="3.2" ry="4" fill="#1B2559" />
          <ellipse cx="39" cy="34" rx="3.2" ry="4" fill="#1B2559" />
        </g>
        <path d="M26 42 Q32 47 38 42" stroke="#1B2559" strokeWidth="2.6" fill="none" strokeLinecap="round" />
        <circle cx="19" cy="41" r="3" fill="#FFB38A" opacity=".7" />
        <circle cx="45" cy="41" r="3" fill="#FFB38A" opacity=".7" />
      </g>
    </svg>
  );
}

/** Đầu Trang chủ: logo + chữ "Mimi AI" + ngôi sao cam (theo mimi-logo-demo.html). */
export function MimiBrand({ animated = true }: { animated?: boolean }) {
  return (
    <span className="brand">
      <MimiMark size={52} animated={animated} label={null} />
      <span className="brand__name">Mimi AI</span>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="#FF8A3D" aria-hidden="true" className="brand__star">
        <path d="M12 2l2.2 6.3L21 10l-6.8 1.7L12 18l-2.2-6.3L3 10l6.8-1.7z" />
      </svg>
    </span>
  );
}
