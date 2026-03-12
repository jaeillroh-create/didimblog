"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Search, X } from "lucide-react";

interface SearchInputProps {
  /** 검색어 값 */
  value: string;
  /** 변경 핸들러 */
  onChange: (value: string) => void;
  /** 플레이스홀더 */
  placeholder?: string;
  /** 디바운스 지연 시간 (ms) — 0이면 즉시 반영 */
  debounceMs?: number;
  /** 추가 CSS 클래스 */
  className?: string;
}

/**
 * 검색 아이콘 + 지우기 버튼이 포함된 검색 입력 컴포넌트
 * UCL Input 패턴 적용
 */
export function SearchInput({
  value,
  onChange,
  placeholder = "검색...",
  debounceMs = 0,
  className,
}: SearchInputProps) {
  const [localValue, setLocalValue] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const emitChange = useCallback(
    (v: string) => {
      if (debounceMs > 0) {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => onChange(v), debounceMs);
      } else {
        onChange(v);
      }
    },
    [debounceMs, onChange]
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setLocalValue(next);
    emitChange(next);
  }

  function handleClear() {
    setLocalValue("");
    onChange("");
  }

  return (
    <div className={cn("input-wrap", className)}>
      <Search className="h-4 w-4 shrink-0 mr-2" style={{ color: "var(--g400)" }} />
      <input
        type="text"
        value={localValue}
        onChange={handleChange}
        placeholder={placeholder}
        className="input-field"
      />
      {localValue && (
        <button
          type="button"
          onClick={handleClear}
          className="icon-btn"
          style={{ width: "24px", height: "24px" }}
          aria-label="검색어 지우기"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
