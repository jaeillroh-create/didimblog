interface EmojiProps {
  children: React.ReactNode;
  size?: 12 | 14 | 16 | 20 | 24 | 32 | 48;
  className?: string;
}

/**
 * Tossface 이모지 렌더링 컴포넌트
 * 시스템 이모지 대신 Tossface 웹폰트로 통일 렌더링
 */
export function Emoji({ children, size = 20, className = "" }: EmojiProps) {
  return (
    <span
      className={`tf tf-${size} ${className}`}
      role="img"
    >
      {children}
    </span>
  );
}
