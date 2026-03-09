"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
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

  // 외부 value가 변경되면 로컬 값도 동기화
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

  // 타이머 정리
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
    <div className={cn("relative", className)}>
      <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
      <Input
        type="text"
        value={localValue}
        onChange={handleChange}
        placeholder={placeholder}
        className="pl-8 pr-8"
      />
      {localValue && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="검색어 지우기"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
