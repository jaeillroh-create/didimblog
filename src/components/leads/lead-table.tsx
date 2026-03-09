"use client";

import { useMemo, useState, useTransition } from "react";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/common/empty-state";
import { SearchInput } from "@/components/common/search-input";
import { colors } from "@/lib/constants/design-tokens";
import { updateLeadStatus } from "@/actions/leads";
import { toast } from "sonner";
import { format } from "date-fns";
import { ArrowUpDown } from "lucide-react";
import type { Lead, Profile, Content } from "@/lib/types/database";

// ── 라벨 매핑 ──

const LEAD_STATUS_CONFIG = {
  S3: { label: "리드", color: colors.status.s3 },
  S4: { label: "상담", color: colors.status.s4 },
  S5: { label: "계약", color: colors.status.s5 },
} as const;

const SOURCE_LABELS: Record<string, string> = {
  blog: "블로그",
  referral: "소개",
  other: "기타",
};

const SERVICE_LABELS: Record<string, string> = {
  tax_consulting: "절세 컨설팅",
  lab_management: "연구소 관리",
  venture_cert: "벤처인증",
  invention_cert: "발명인증",
  patent: "특허",
  other: "기타",
};

const CONSULTATION_LABELS: Record<string, string> = {
  consulted: "상담완료",
  proposal_sent: "제안서발송",
  pending: "대기중",
  lost: "실패",
};

function formatAmount(amount: number | null): string {
  if (amount === null || amount === undefined) return "-";
  return new Intl.NumberFormat("ko-KR").format(amount) + "원";
}

interface LeadTableProps {
  leads: Lead[];
  profiles: Profile[];
  contents: Pick<Content, "id" | "title" | "status">[];
}

export function LeadTable({ leads, profiles, contents }: LeadTableProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sorting, setSorting] = useState<SortingState>([
    { id: "contact_date", desc: true },
  ]);
  const [isPending, startTransition] = useTransition();

  const filteredLeads = useMemo(() => {
    let result = leads;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (lead) =>
          lead.company_name.toLowerCase().includes(q) ||
          (lead.contact_name?.toLowerCase().includes(q) ?? false) ||
          (lead.contact_info?.toLowerCase().includes(q) ?? false) ||
          (lead.notes?.toLowerCase().includes(q) ?? false)
      );
    }

    if (statusFilter !== "all") {
      result = result.filter((lead) => lead.visitor_status === statusFilter);
    }

    return result;
  }, [leads, search, statusFilter]);

  function handleStatusChange(leadId: number, newStatus: "S3" | "S4" | "S5") {
    startTransition(async () => {
      const { error } = await updateLeadStatus(leadId, newStatus);
      if (error) {
        toast.error(error);
      } else {
        toast.success("리드 상태가 변경되었습니다.");
      }
    });
  }

  const profileMap = useMemo(() => {
    const map = new Map<string, string>();
    profiles.forEach((p) => map.set(p.id, p.name));
    return map;
  }, [profiles]);

  const contentMap = useMemo(() => {
    const map = new Map<string, string>();
    contents.forEach((c) => map.set(c.id, c.title ?? c.id));
    return map;
  }, [contents]);

  const columns: ColumnDef<Lead>[] = useMemo(
    () => [
      {
        accessorKey: "contact_date",
        header: ({ column }) => (
          <button
            className="flex items-center gap-1 font-medium"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            문의일
            <ArrowUpDown className="h-3.5 w-3.5" />
          </button>
        ),
        cell: ({ row }) => {
          const date = row.original.contact_date;
          try {
            return format(new Date(date), "yyyy-MM-dd");
          } catch {
            return date;
          }
        },
      },
      {
        accessorKey: "company_name",
        header: ({ column }) => (
          <button
            className="flex items-center gap-1 font-medium"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            회사명
            <ArrowUpDown className="h-3.5 w-3.5" />
          </button>
        ),
        cell: ({ row }) => (
          <span className="font-medium">{row.original.company_name}</span>
        ),
      },
      {
        accessorKey: "contact_name",
        header: "담당자",
        cell: ({ row }) => row.original.contact_name ?? "-",
      },
      {
        accessorKey: "source",
        header: "유입경로",
        cell: ({ row }) => {
          const source = row.original.source;
          const sourceContent = row.original.source_content_id;
          return (
            <div className="space-y-1">
              <Badge variant="secondary" className="text-xs">
                {SOURCE_LABELS[source] ?? source}
              </Badge>
              {source === "blog" && sourceContent && (
                <p className="text-xs text-muted-foreground truncate max-w-[120px]">
                  {contentMap.get(sourceContent) ?? sourceContent}
                </p>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "interested_service",
        header: "관심서비스",
        cell: ({ row }) => {
          const service = row.original.interested_service;
          if (!service) return "-";
          return (
            <span className="text-sm">
              {SERVICE_LABELS[service] ?? service}
            </span>
          );
        },
      },
      {
        accessorKey: "visitor_status",
        header: "상태",
        cell: ({ row }) => {
          const status = row.original.visitor_status;
          const config = LEAD_STATUS_CONFIG[status];
          return (
            <Select
              value={status}
              onValueChange={(val) =>
                handleStatusChange(row.original.id, val as "S3" | "S4" | "S5")
              }
            >
              <SelectTrigger className="h-7 w-[90px] text-xs border-transparent px-2">
                <Badge
                  variant="outline"
                  className="border-transparent font-medium text-xs px-1.5 py-0"
                  style={{
                    backgroundColor: `${config.color}20`,
                    color: config.color,
                  }}
                >
                  {config.label}
                </Badge>
              </SelectTrigger>
              <SelectContent>
                {(["S3", "S4", "S5"] as const).map((s) => (
                  <SelectItem key={s} value={s}>
                    <Badge
                      variant="outline"
                      className="border-transparent font-medium text-xs px-1.5 py-0"
                      style={{
                        backgroundColor: `${LEAD_STATUS_CONFIG[s].color}20`,
                        color: LEAD_STATUS_CONFIG[s].color,
                      }}
                    >
                      {LEAD_STATUS_CONFIG[s].label}
                    </Badge>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        },
      },
      {
        accessorKey: "consultation_result",
        header: "상담결과",
        cell: ({ row }) => {
          const result = row.original.consultation_result;
          if (!result) return "-";
          return (
            <span className="text-sm">
              {CONSULTATION_LABELS[result] ?? result}
            </span>
          );
        },
      },
      {
        accessorKey: "contract_yn",
        header: "계약여부",
        cell: ({ row }) => (
          <span
            className={
              row.original.contract_yn
                ? "font-semibold text-semantic-success"
                : "text-muted-foreground"
            }
          >
            {row.original.contract_yn ? "계약" : "-"}
          </span>
        ),
      },
      {
        accessorKey: "contract_amount",
        header: ({ column }) => (
          <button
            className="flex items-center gap-1 font-medium"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            계약금액
            <ArrowUpDown className="h-3.5 w-3.5" />
          </button>
        ),
        cell: ({ row }) => (
          <span className="text-sm tabular-nums">
            {formatAmount(row.original.contract_amount)}
          </span>
        ),
      },
      {
        accessorKey: "assigned_to",
        header: "담당자",
        cell: ({ row }) => {
          const assignedTo = row.original.assigned_to;
          if (!assignedTo) return <span className="text-muted-foreground">-</span>;
          return (
            <span className="text-sm">
              {profileMap.get(assignedTo) ?? assignedTo}
            </span>
          );
        },
      },
    ],
    [profileMap, contentMap]
  );

  const table = useReactTable({
    data: filteredLeads,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="space-y-4">
      {/* 검색 + 필터 바 */}
      <div className="flex items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="회사명, 담당자, 메모 검색..."
          debounceMs={300}
          className="w-full max-w-sm"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="상태 필터" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 상태</SelectItem>
            <SelectItem value="S3">리드 (S3)</SelectItem>
            <SelectItem value="S4">상담 (S4)</SelectItem>
            <SelectItem value="S5">계약 (S5)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 테이블 */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className={isPending ? "opacity-60" : ""}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-48">
                  <EmptyState title="리드가 없습니다." description="새 리드를 추가해 주세요." />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
