import { create } from "zustand";

// TODO: 콘텐츠 목록 필터 스토어
interface ContentFilterState {
  categoryId: string | null;
  status: string | null;
  authorId: string | null;
  dateRange: { from: Date | null; to: Date | null };
  setCategoryId: (id: string | null) => void;
  setStatus: (status: string | null) => void;
  setAuthorId: (id: string | null) => void;
  setDateRange: (range: { from: Date | null; to: Date | null }) => void;
  reset: () => void;
}

export const useContentFilterStore = create<ContentFilterState>((set) => ({
  categoryId: null,
  status: null,
  authorId: null,
  dateRange: { from: null, to: null },
  setCategoryId: (categoryId) => set({ categoryId }),
  setStatus: (status) => set({ status }),
  setAuthorId: (authorId) => set({ authorId }),
  setDateRange: (dateRange) => set({ dateRange }),
  reset: () =>
    set({
      categoryId: null,
      status: null,
      authorId: null,
      dateRange: { from: null, to: null },
    }),
}));
