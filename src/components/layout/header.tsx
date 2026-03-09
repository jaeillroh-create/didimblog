import { Bell } from "lucide-react";

/** 상단 헤더 컴포넌트 (서버 컴포넌트) */
export function Header() {
  return (
    <header className="h-14 border-b border-[var(--neutral-border)] bg-white flex items-center justify-between px-6">
      {/* 왼쪽: 페이지 제목 영역 (개별 페이지에서 채움) */}
      <div />

      {/* 오른쪽: 알림 + 사용자 아바타 */}
      <div className="flex items-center gap-4">
        {/* 알림 벨 아이콘 */}
        <button
          className="relative rounded-md p-2 text-[var(--neutral-text-secondary)] hover:bg-[var(--neutral-bg)] transition-colors"
          aria-label="알림"
        >
          <Bell className="h-5 w-5" />
        </button>

        {/* 사용자 아바타 */}
        <div className="h-8 w-8 rounded-full bg-[var(--brand-primary)] flex items-center justify-center">
          <span className="text-xs font-medium text-[var(--neutral-text-on-dark)]">
            관
          </span>
        </div>
      </div>
    </header>
  );
}
