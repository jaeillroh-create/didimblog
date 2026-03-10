"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveLLMConfig, testLLMConnection } from "@/actions/ai";
import { saveSearchApiConfig } from "@/actions/news-search";
import type { LLMConfig, LLMProvider, PromptTemplate, SearchApiConfig } from "@/lib/types/database";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Settings,
  Eye,
  EyeOff,
  Pencil,
  Zap,
  Newspaper,
} from "lucide-react";

interface AiSettingsProps {
  initialConfigs: LLMConfig[];
  initialTemplates: PromptTemplate[];
  initialSearchConfigs?: SearchApiConfig[];
}

const PROVIDER_INFO: Record<
  LLMProvider,
  { label: string; models: { id: string; name: string }[] }
> = {
  claude: {
    label: "Claude (Anthropic)",
    models: [
      { id: "claude-opus-4-6", name: "Claude Opus 4.6" },
      { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" },
      { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5" },
    ],
  },
  openai: {
    label: "OpenAI (GPT)",
    models: [
      { id: "gpt-4o", name: "GPT-4o" },
      { id: "gpt-4o-mini", name: "GPT-4o Mini" },
      { id: "gpt-4.1", name: "GPT-4.1" },
    ],
  },
  gemini: {
    label: "Google (Gemini)",
    models: [
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
    ],
  },
};

const PROVIDERS: LLMProvider[] = ["claude", "openai", "gemini"];

export function AiSettings({ initialConfigs, initialTemplates, initialSearchConfigs = [] }: AiSettingsProps) {
  const [configs, setConfigs] = useState<LLMConfig[]>(initialConfigs);
  const [templates] = useState<PromptTemplate[]>(initialTemplates);
  const [searchConfigs, setSearchConfigs] = useState<SearchApiConfig[]>(initialSearchConfigs);
  const [isPending, startTransition] = useTransition();

  // LLM 편집 다이얼로그
  const [editProvider, setEditProvider] = useState<LLMProvider | null>(null);
  const [editModelId, setEditModelId] = useState("");
  const [editApiKey, setEditApiKey] = useState("");
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editTokenLimit, setEditTokenLimit] = useState("");
  const [editIsDefault, setEditIsDefault] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "failed" | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // 뉴스 API 편집 다이얼로그
  const [editSearchOpen, setEditSearchOpen] = useState(false);
  const [searchClientId, setSearchClientId] = useState("");
  const [searchClientSecret, setSearchClientSecret] = useState("");
  const [showSearchSecret, setShowSearchSecret] = useState(false);
  const [searchSaveError, setSearchSaveError] = useState<string | null>(null);

  // 템플릿 편집 다이얼로그
  const [editTemplate, setEditTemplate] = useState<PromptTemplate | null>(null);

  function getConfigForProvider(provider: LLMProvider): LLMConfig | undefined {
    return configs.find((c) => c.provider === provider);
  }

  function openEditDialog(provider: LLMProvider) {
    const existing = getConfigForProvider(provider);
    setEditProvider(provider);
    setEditModelId(existing?.model_id || PROVIDER_INFO[provider].models[0].id);
    setEditDisplayName(existing?.display_name || PROVIDER_INFO[provider].models[0].name);
    setEditApiKey("");
    setEditTokenLimit(existing?.monthly_token_limit?.toString() || "");
    setEditIsDefault(existing?.is_default || false);
    setShowApiKey(false);
    setTestResult(null);
    setSaveError(null);
  }

  function handleSaveConfig() {
    if (!editProvider || !editApiKey.trim()) return;

    startTransition(async () => {
      const result = await saveLLMConfig({
        provider: editProvider,
        displayName: editDisplayName || PROVIDER_INFO[editProvider].models[0].name,
        modelId: editModelId,
        apiKey: editApiKey.trim(),
        isDefault: editIsDefault,
        monthlyTokenLimit: editTokenLimit ? parseInt(editTokenLimit) : undefined,
      });

      if (!result.success) {
        setSaveError(result.error || "저장에 실패했습니다.");
        return;
      }

      setTestResult(result.testResult || null);

      // 로컬 상태 업데이트
      if (result.configId) {
        const updatedConfig: LLMConfig = {
          id: result.configId,
          provider: editProvider,
          display_name: editDisplayName,
          model_id: editModelId,
          api_key_encrypted: "***",
          is_active: true,
          is_default: editIsDefault,
          monthly_token_limit: editTokenLimit ? parseInt(editTokenLimit) : null,
          monthly_tokens_used: getConfigForProvider(editProvider)?.monthly_tokens_used || 0,
          last_tested_at: new Date().toISOString(),
          test_result: result.testResult || null,
          created_at: getConfigForProvider(editProvider)?.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
          created_by: null,
        };

        setConfigs((prev) => {
          const existing = prev.findIndex((c) => c.provider === editProvider);
          if (existing >= 0) {
            const next = [...prev];
            next[existing] = updatedConfig;
            return next;
          }
          return [...prev, updatedConfig];
        });
      }

      if (result.testResult === "success") {
        setTimeout(() => setEditProvider(null), 1500);
      }
    });
  }

  function handleTestConnection(configId: number) {
    setTestingId(configId);
    startTransition(async () => {
      const result = await testLLMConnection(configId);
      setConfigs((prev) =>
        prev.map((c) =>
          c.id === configId
            ? {
                ...c,
                test_result: result.success ? "success" : "failed",
                last_tested_at: new Date().toISOString(),
              }
            : c
        )
      );
      setTestingId(null);
    });
  }

  // 네이버 검색 API 설정 저장
  function handleSaveSearchConfig() {
    if (!searchClientId.trim() || !searchClientSecret.trim()) return;

    startTransition(async () => {
      const result = await saveSearchApiConfig({
        provider: "naver",
        displayName: "네이버 검색 API",
        clientId: searchClientId.trim(),
        clientSecret: searchClientSecret.trim(),
      });

      if (!result.success) {
        setSearchSaveError(result.error || "저장에 실패했습니다.");
        return;
      }

      // 로컬 상태 업데이트
      if (result.configId) {
        const updated: SearchApiConfig = {
          id: result.configId,
          provider: "naver",
          display_name: "네이버 검색 API",
          client_id: searchClientId,
          client_secret_encrypted: "***",
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          created_by: null,
        };
        setSearchConfigs((prev) => {
          const idx = prev.findIndex((c) => c.provider === "naver");
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = updated;
            return next;
          }
          return [...prev, updated];
        });
      }

      setTimeout(() => setEditSearchOpen(false), 500);
    });
  }

  function openSearchEditDialog() {
    const existing = searchConfigs.find((c) => c.provider === "naver");
    setSearchClientId(existing?.client_id || "");
    setSearchClientSecret("");
    setShowSearchSecret(false);
    setSearchSaveError(null);
    setEditSearchOpen(true);
  }

  const naverConfig = searchConfigs.find((c) => c.provider === "naver");

  return (
    <div className="space-y-6">
      {/* LLM 연결 관리 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings className="h-5 w-5" />
            LLM 연결 관리
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-0">
          {PROVIDERS.map((provider, i) => {
            const config = getConfigForProvider(provider);
            const info = PROVIDER_INFO[provider];
            return (
              <div key={provider}>
                {i > 0 && <Separator />}
                <div className="flex items-center justify-between py-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{info.label}</span>
                      {config?.model_id && (
                        <span className="text-xs text-[var(--neutral-text-muted)]">
                          {config.model_id}
                        </span>
                      )}
                      {config?.is_active ? (
                        <Badge
                          variant="outline"
                          className="text-xs"
                          style={{
                            borderColor: "var(--quality-excellent)",
                            color: "var(--quality-excellent)",
                          }}
                        >
                          활성
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-[var(--neutral-text-muted)]">
                          비활성
                        </Badge>
                      )}
                      {config?.is_default && (
                        <Badge
                          className="text-xs"
                          style={{
                            backgroundColor: "var(--brand-accent)",
                            color: "#fff",
                          }}
                        >
                          기본
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-[var(--neutral-text-muted)]">
                      <span>
                        API Key:{" "}
                        {config?.api_key_encrypted ? "설정됨" : "미설정"}
                      </span>
                      {config?.test_result && (
                        <span className="flex items-center gap-1">
                          {config.test_result === "success" ? (
                            <>
                              <CheckCircle2
                                className="h-3 w-3"
                                style={{ color: "var(--quality-excellent)" }}
                              />
                              연결됨
                            </>
                          ) : (
                            <>
                              <XCircle
                                className="h-3 w-3"
                                style={{ color: "var(--quality-critical)" }}
                              />
                              연결 실패
                            </>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {config && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleTestConnection(config.id)}
                        disabled={isPending || testingId === config.id}
                      >
                        {testingId === config.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Zap className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditDialog(provider)}
                    >
                      {config ? "수정" : "설정"}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* 뉴스 검색 API */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Newspaper className="h-5 w-5" />
            뉴스 검색 API
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between py-2">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">네이버 검색 API</span>
                {naverConfig?.is_active ? (
                  <Badge
                    variant="outline"
                    className="text-xs"
                    style={{
                      borderColor: "var(--quality-excellent)",
                      color: "var(--quality-excellent)",
                    }}
                  >
                    활성
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs text-[var(--neutral-text-muted)]">
                    미설정
                  </Badge>
                )}
              </div>
              <p className="text-xs text-[var(--neutral-text-muted)]">
                {naverConfig?.client_id
                  ? `Client ID: ${naverConfig.client_id.substring(0, 8)}...`
                  : "AI 초안 생성 시 최신 뉴스를 검색하여 참고자료로 활용합니다."}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={openSearchEditDialog}
            >
              {naverConfig ? "수정" : "설정"}
            </Button>
          </div>
          <p className="mt-2 text-xs text-[var(--neutral-text-muted)]">
            네이버 개발자 센터(developers.naver.com)에서 검색 API 애플리케이션을 등록하세요.
          </p>
        </CardContent>
      </Card>

      {/* 기본 설정 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">기본 설정</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {configs.map((config) => {
            if (!config.monthly_token_limit) return null;
            const usagePercent = Math.round(
              (config.monthly_tokens_used / config.monthly_token_limit) * 100
            );
            return (
              <div key={config.id} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>
                    {PROVIDER_INFO[config.provider as LLMProvider]?.label || config.provider} 토큰 사용량
                  </span>
                  <span className="text-xs text-[var(--neutral-text-muted)]">
                    {config.monthly_tokens_used.toLocaleString()} /{" "}
                    {config.monthly_token_limit.toLocaleString()}
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-gray-200">
                  <div
                    className="h-2 rounded-full transition-all"
                    style={{
                      width: `${Math.min(usagePercent, 100)}%`,
                      backgroundColor:
                        usagePercent >= 90
                          ? "var(--quality-critical)"
                          : usagePercent >= 70
                            ? "var(--quality-average)"
                            : "var(--brand-accent)",
                    }}
                  />
                </div>
                <p className="text-xs text-[var(--neutral-text-muted)]">
                  {usagePercent}% 사용
                </p>
              </div>
            );
          })}
          {configs.filter((c) => c.monthly_token_limit).length === 0 && (
            <p className="text-sm text-[var(--neutral-text-muted)]">
              토큰 상한이 설정된 LLM이 없습니다.
            </p>
          )}
        </CardContent>
      </Card>

      {/* 프롬프트 템플릿 관리 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">프롬프트 템플릿</CardTitle>
        </CardHeader>
        <CardContent>
          {templates.length === 0 ? (
            <p className="text-sm text-[var(--neutral-text-muted)]">
              등록된 템플릿이 없습니다.
            </p>
          ) : (
            <div className="space-y-0">
              {templates.map((template, i) => (
                <div key={template.id}>
                  {i > 0 && <Separator />}
                  <div className="flex items-center justify-between py-3">
                    <div className="space-y-0.5">
                      <span className="text-sm font-medium">{template.name}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {template.template_type === "draft_generation"
                            ? "초안 생성"
                            : template.template_type === "cross_validation"
                              ? "교차검증"
                              : "SEO 최적화"}
                        </Badge>
                        <span className="text-xs text-[var(--neutral-text-muted)]">
                          v{template.version}
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditTemplate(template)}
                    >
                      <Pencil className="mr-1 h-3 w-3" />
                      편집
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* LLM 설정 편집 Dialog */}
      <Dialog open={!!editProvider} onOpenChange={() => setEditProvider(null)}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>
              {editProvider ? PROVIDER_INFO[editProvider].label : ""} 설정
            </DialogTitle>
          </DialogHeader>

          {editProvider && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>모델</Label>
                <Select
                  value={editModelId}
                  onValueChange={(v) => {
                    setEditModelId(v);
                    const model = PROVIDER_INFO[editProvider].models.find(
                      (m) => m.id === v
                    );
                    if (model) setEditDisplayName(model.name);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDER_INFO[editProvider].models.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>API 키</Label>
                <div className="relative">
                  <Input
                    type={showApiKey ? "text" : "password"}
                    placeholder="API 키를 입력하세요"
                    value={editApiKey}
                    onChange={(e) => setEditApiKey(e.target.value)}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--neutral-text-muted)]"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>월간 토큰 상한</Label>
                <Input
                  type="number"
                  placeholder="비워두면 무제한"
                  value={editTokenLimit}
                  onChange={(e) => setEditTokenLimit(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is-default"
                  checked={editIsDefault}
                  onChange={(e) => setEditIsDefault(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="is-default">초안 생성 기본 LLM으로 설정</Label>
              </div>

              {testResult && (
                <div
                  className={`flex items-center gap-2 rounded-md p-3 text-sm ${
                    testResult === "success"
                      ? "bg-green-50 text-green-700"
                      : "bg-red-50 text-red-700"
                  }`}
                >
                  {testResult === "success" ? (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      연결 테스트 성공
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4" />
                      연결 테스트 실패
                    </>
                  )}
                </div>
              )}

              {saveError && (
                <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
                  {saveError}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditProvider(null)}>
              취소
            </Button>
            <Button
              onClick={handleSaveConfig}
              disabled={isPending || !editApiKey.trim()}
              style={{ backgroundColor: "var(--brand-accent)" }}
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  저장 중...
                </>
              ) : (
                "저장 + 연결 테스트"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 네이버 검색 API 설정 Dialog */}
      <Dialog open={editSearchOpen} onOpenChange={setEditSearchOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>네이버 검색 API 설정</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-md bg-blue-50 p-3 text-xs text-blue-700">
              네이버 개발자 센터(developers.naver.com) → 애플리케이션 등록 → 검색 API를 선택하면 Client ID와 Client Secret을 받을 수 있습니다.
            </div>

            <div className="space-y-2">
              <Label>Client ID</Label>
              <Input
                placeholder="네이버 API Client ID"
                value={searchClientId}
                onChange={(e) => setSearchClientId(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Client Secret</Label>
              <div className="relative">
                <Input
                  type={showSearchSecret ? "text" : "password"}
                  placeholder="네이버 API Client Secret"
                  value={searchClientSecret}
                  onChange={(e) => setSearchClientSecret(e.target.value)}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--neutral-text-muted)]"
                  onClick={() => setShowSearchSecret(!showSearchSecret)}
                >
                  {showSearchSecret ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {searchSaveError && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
                {searchSaveError}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditSearchOpen(false)}>
              취소
            </Button>
            <Button
              onClick={handleSaveSearchConfig}
              disabled={isPending || !searchClientId.trim() || !searchClientSecret.trim()}
              style={{ backgroundColor: "var(--brand-accent)" }}
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  저장 중...
                </>
              ) : (
                "저장"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 템플릿 편집 Dialog */}
      <Dialog open={!!editTemplate} onOpenChange={() => setEditTemplate(null)}>
        <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>프롬프트 템플릿 편집: {editTemplate?.name}</DialogTitle>
          </DialogHeader>

          {editTemplate && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>시스템 프롬프트</Label>
                <textarea
                  className="flex min-h-[200px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono leading-relaxed placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={editTemplate.system_prompt}
                  readOnly
                />
              </div>

              <div className="space-y-2">
                <Label>사용자 프롬프트 템플릿</Label>
                <textarea
                  className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono leading-relaxed placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={editTemplate.user_prompt_template}
                  readOnly
                />
              </div>

              {editTemplate.variables && (
                <div className="space-y-2">
                  <Label>변수</Label>
                  <div className="flex flex-wrap gap-2">
                    {(editTemplate.variables as Array<{ name: string; description: string; required: boolean }>).map((v, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        {`{{${v.name}}}`}
                        {v.required && " *"}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTemplate(null)}>
              닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
