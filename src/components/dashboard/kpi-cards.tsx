import { KPICard } from "@/components/common/kpi-card";
import {
  FileText,
  Eye,
  Award,
  Users,
  TrendingUp,
  Clock,
  Database,
} from "lucide-react";

/** 대시보드 상단 KPI 카드 7개 (더미 데이터) */
const kpiData = [
  {
    title: "이번 주 발행",
    value: "2/3건",
    icon: <FileText className="h-4 w-4" />,
    change: undefined,
  },
  {
    title: "월간 조회수",
    value: "12,450",
    icon: <Eye className="h-4 w-4" />,
    change: 15.2,
    changeLabel: "전월 대비",
  },
  {
    title: "평균 품질점수",
    value: "72점",
    icon: <Award className="h-4 w-4" />,
    change: 3.1,
    changeLabel: "전월 대비",
  },
  {
    title: "활성 리드",
    value: "28건",
    icon: <Users className="h-4 w-4" />,
    change: 8.0,
    changeLabel: "전월 대비",
  },
  {
    title: "전환율",
    value: "3.2%",
    icon: <TrendingUp className="h-4 w-4" />,
    change: 0.5,
    changeLabel: "전월 대비",
  },
  {
    title: "SLA 준수율",
    value: "89%",
    icon: <Clock className="h-4 w-4" />,
    change: -2.0,
    changeLabel: "전월 대비",
  },
  {
    title: "총 콘텐츠",
    value: "156건",
    icon: <Database className="h-4 w-4" />,
    change: undefined,
  },
] as const;

export function KpiCards() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {kpiData.map((kpi) => (
        <KPICard
          key={kpi.title}
          title={kpi.title}
          value={kpi.value}
          icon={kpi.icon}
          change={kpi.change}
          changeLabel={"changeLabel" in kpi ? kpi.changeLabel : undefined}
        />
      ))}
    </div>
  );
}
