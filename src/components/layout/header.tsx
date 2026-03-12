import { Bell } from "lucide-react";

/** 상단 헤더 컴포넌트 — UCL 디자인 토큰 적용 */
export function Header() {
  return (
    <header
      className="h-14 flex items-center justify-between px-6"
      style={{
        borderBottom: "1px solid var(--g150)",
        background: "var(--white)",
      }}
    >
      {/* 왼쪽: 페이지 제목 영역 (개별 페이지에서 채움) */}
      <div />

      {/* 오른쪽: 알림 + 사용자 아바타 */}
      <div className="flex items-center gap-4">
        <button
          className="icon-btn"
          aria-label="알림"
        >
          <Bell className="h-5 w-5" />
        </button>

        <div
          className="ucl-avatar"
          style={{ width: "32px", height: "32px", fontSize: "12px" }}
        >
          관
        </div>
      </div>
    </header>
  );
}
