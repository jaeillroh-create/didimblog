"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
  Image as ImageIcon,
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
      { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6 (권장)" },
      { id: "claude-opus-4-6", name: "Claude Opus 4.6" },
    ],
  },
  openai: {
    label: "OpenAI (GPT)",
    models: [
      { id: "gpt-5.4", name: "GPT-5.4" },
      { id: "gpt-5.4-pro", name: "GPT-5.4 Pro" },
      { id: "gpt-5.3-instant", name: "GPT-5.3 Instant" },
      { id: "gpt-5-mini", name: "GPT-5 mini" },
    ],
  },
  gemini: {
    label: "Google (Gemini)",
    models: [
      { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro" },
      { id: "gemini-3-flash-preview", name: "Gemini 3 Flash" },
      { id: "gemini-3.1-flash-lite-preview", name: "Gemini 3.1 Flash Lite" },
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
  const [editSearchProvider, setEditSearchProvider] = useState<"naver" | "google" | null>(null);
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

  // 검색 API 설정 저장
  function handleSaveSearchConfig() {
    if (!editSearchProvider || !searchClientId.trim() || !searchClientSecret.trim()) return;

    startTransition(async () => {
      const displayName = editSearchProvider === "naver" ? "네이버 검색 API" : "구글 검색 API";
      const result = await saveSearchApiConfig({
        provider: editSearchProvider,
        displayName,
        clientId: searchClientId.trim(),
        clientSecret: searchClientSecret.trim(),
      });

      if (!result.success) {
        setSearchSaveError(result.error || "저장에 실패했습니다.");
        return;
      }

      if (result.configId) {
        const updated: SearchApiConfig = {
          id: result.configId,
          provider: editSearchProvider,
          display_name: displayName,
          client_id: searchClientId,
          client_secret_encrypted: "***",
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          created_by: null,
        };
        setSearchConfigs((prev) => {
          const idx = prev.findIndex((c) => c.provider === editSearchProvider);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = updated;
            return next;
          }
          return [...prev, updated];
        });
      }

      setTimeout(() => setEditSearchProvider(null), 500);
    });
  }

  function openSearchEditDialog(provider: "naver" | "google") {
    const existing = searchConfigs.find((c) => c.provider === provider);
    setSearchClientId(existing?.client_id || "");
    setSearchClientSecret("");
    setShowSearchSecret(false);
    setSearchSaveError(null);
    setEditSearchProvider(provider);
  }

  const naverConfig = searchConfigs.find((c) => c.provider === "naver");
  const googleConfig = searchConfigs.find((c) => c.provider === "google");

  return (
    <div className="space-y-6">
      {/* LLM 연결 관리 */}
      <div className="scard">
        <div className="scard-head">
          <div className="scard-head-left">
            <Settings className="h-5 w-5" style={{ color: "var(--g500)" }} />
            <span className="scard-head-title">LLM 연결 관리</span>
          </div>
        </div>
        <div className="scard-body space-y-0">
          {PROVIDERS.map((provider, i) => {
            const config = getConfigForProvider(provider);
            const info = PROVIDER_INFO[provider];
            return (
              <div key={provider}>
                {i > 0 && <div className="divider" />}
                <div className="flex items-center justify-between py-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="t-sm" style={{ fontWeight: 600, color: "var(--g900)" }}>{info.label}</span>
                      {config?.model_id && (
                        <span className="t-xs" style={{ color: "var(--g400)" }}>
                          {config.model_id}
                        </span>
                      )}
                      {config?.is_active ? (
                        <span className="ucl-badge ucl-badge-sm badge-success">
                          활성
                        </span>
                      ) : (
                        <span className="ucl-badge ucl-badge-sm badge-neutral">
                          비활성
                        </span>
                      )}
                      {config?.is_default && (
                        <span className="ucl-badge ucl-badge-sm badge-brand">
                          기본
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 t-xs" style={{ color: "var(--g400)" }}>
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
                                style={{ color: "var(--success)" }}
                              />
                              연결됨
                            </>
                          ) : (
                            <>
                              <XCircle
                                className="h-3 w-3"
                                style={{ color: "var(--danger)" }}
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
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleTestConnection(config.id)}
                        disabled={isPending || testingId === config.id}
                      >
                        {testingId === config.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Zap className="h-4 w-4" />
                        )}
                      </button>
                    )}
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => openEditDialog(provider)}
                    >
                      {config ? "수정" : "설정"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 이미지 생성 설정 */}
      <div className="scard">
        <div className="scard-head">
          <div className="scard-head-left">
            <ImageIcon className="h-5 w-5" style={{ color: "var(--g500)" }} />
            <span className="scard-head-title">이미지 생성 설정</span>
          </div>
        </div>
        <div className="scard-body">
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2">
              <div className="space-y-1">
                <span className="t-sm" style={{ fontWeight: 600, color: "var(--g900)" }}>
                  OpenAI DALL-E 3
                </span>
                <p className="t-xs" style={{ color: "var(--g400)" }}>
                  AI 에디터에서 본문 인포그래픽 이미지를 자동 생성합니다
                </p>
              </div>
              {getConfigForProvider("openai")?.is_active ? (
                <span className="ucl-badge ucl-badge-sm badge-success">사용 가능</span>
              ) : (
                <span className="ucl-badge ucl-badge-sm badge-neutral">비활성</span>
              )}
            </div>
            <div className="ucl-alert alert-info">
              <span className="t-xs">
                이미지 생성은 위 LLM 설정의 OpenAI API 키를 공유합니다.
                OpenAI가 등록되어 있지 않으면 이미지 생성이 비활성화됩니다.
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 뉴스 검색 API */}
      <div className="scard">
        <div className="scard-head">
          <div className="scard-head-left">
            <Newspaper className="h-5 w-5" style={{ color: "var(--g500)" }} />
            <span className="scard-head-title">뉴스 검색 API</span>
          </div>
        </div>
        <div className="scard-body space-y-0">
          {/* 네이버 */}
          <div className="flex items-center justify-between py-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="t-sm" style={{ fontWeight: 600, color: "var(--g900)" }}>네이버 검색 API</span>
                {naverConfig?.is_active ? (
                  <span className="ucl-badge ucl-badge-sm badge-success">활성</span>
                ) : (
                  <span className="ucl-badge ucl-badge-sm badge-neutral">미설정</span>
                )}
              </div>
              <p className="t-xs" style={{ color: "var(--g400)" }}>
                {naverConfig?.client_id
                  ? `Client ID: ${naverConfig.client_id.substring(0, 8)}...`
                  : "developers.naver.com에서 검색 API 등록"}
              </p>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => openSearchEditDialog("naver")}>
              {naverConfig ? "수정" : "설정"}
            </button>
          </div>

          <div className="divider" />

          {/* 구글 */}
          <div className="flex items-center justify-between py-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="t-sm" style={{ fontWeight: 600, color: "var(--g900)" }}>구글 Custom Search API</span>
                {googleConfig?.is_active ? (
                  <span className="ucl-badge ucl-badge-sm badge-success">활성</span>
                ) : (
                  <span className="ucl-badge ucl-badge-sm badge-neutral">미설정</span>
                )}
              </div>
              <p className="t-xs" style={{ color: "var(--g400)" }}>
                {googleConfig?.client_id
                  ? `Search Engine ID: ${googleConfig.client_id.substring(0, 8)}...`
                  : "console.cloud.google.com에서 Custom Search API 등록"}
              </p>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => openSearchEditDialog("google")}>
              {googleConfig ? "수정" : "설정"}
            </button>
          </div>

          <p className="pt-2 t-xs" style={{ color: "var(--g400)" }}>
            네이버 또는 구글 중 하나만 설정해도 뉴스 검색을 사용할 수 있습니다. 둘 다 설정하면 병행 검색됩니다.
          </p>
        </div>
      </div>

      {/* 기본 설정 */}
      <div className="scard">
        <div className="scard-head">
          <div className="scard-head-left">
            <span className="scard-head-title">기본 설정</span>
          </div>
        </div>
        <div className="scard-body space-y-4">
          {configs.map((config) => {
            if (!config.monthly_token_limit) return null;
            const usagePercent = Math.round(
              (config.monthly_tokens_used / config.monthly_token_limit) * 100
            );
            return (
              <div key={config.id} className="space-y-2">
                <div className="progress-label">
                  <span className="progress-label-text">
                    {PROVIDER_INFO[config.provider as LLMProvider]?.label || config.provider} 토큰 사용량
                  </span>
                  <span className="progress-label-value">
                    {config.monthly_tokens_used.toLocaleString()} /{" "}
                    {config.monthly_token_limit.toLocaleString()}
                  </span>
                </div>
                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${Math.min(usagePercent, 100)}%`,
                      backgroundColor:
                        usagePercent >= 90
                          ? "var(--danger)"
                          : usagePercent >= 70
                            ? "var(--warning)"
                            : "var(--brand)",
                    }}
                  />
                </div>
                <p className="t-xs" style={{ color: "var(--g400)" }}>
                  {usagePercent}% 사용
                </p>
              </div>
            );
          })}
          {configs.filter((c) => c.monthly_token_limit).length === 0 && (
            <p className="t-sm" style={{ color: "var(--g400)" }}>
              토큰 상한이 설정된 LLM이 없습니다.
            </p>
          )}
        </div>
      </div>

      {/* 프롬프트 템플릿 관리 */}
      <div className="scard">
        <div className="scard-head">
          <div className="scard-head-left">
            <span className="scard-head-title">프롬프트 템플릿</span>
          </div>
        </div>
        <div className="scard-body">
          {templates.length === 0 ? (
            <p className="t-sm" style={{ color: "var(--g400)" }}>
              등록된 템플릿이 없습니다.
            </p>
          ) : (
            <div className="space-y-0">
              {templates.map((template, i) => (
                <div key={template.id}>
                  {i > 0 && <div className="divider" />}
                  <div className="flex items-center justify-between py-3">
                    <div className="space-y-0.5">
                      <span className="t-sm" style={{ fontWeight: 600, color: "var(--g900)" }}>{template.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="ucl-badge ucl-badge-sm badge-neutral">
                          {template.template_type === "draft_generation"
                            ? "초안 생성"
                            : template.template_type === "cross_validation"
                              ? "교차검증"
                              : "SEO 최적화"}
                        </span>
                        <span className="t-xs" style={{ color: "var(--g400)" }}>
                          v{template.version}
                        </span>
                      </div>
                    </div>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setEditTemplate(template)}
                    >
                      <Pencil className="h-3 w-3" />
                      편집
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* LLM 설정 편집 Dialog */}
      <Dialog open={!!editProvider} onOpenChange={() => setEditProvider(null)}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>
              {editProvider ? PROVIDER_INFO[editProvider].label : ""} 설정
            </DialogTitle>
            <DialogDescription>
              모델을 선택하고 API 키를 입력하세요. 저장 시 연결 테스트를 자동으로 수행합니다.
            </DialogDescription>
          </DialogHeader>

          {editProvider && (
            <form
              id="llm-config-form"
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                handleSaveConfig();
              }}
              autoComplete="off"
            >
              {/* Chrome 접근성 경고 방지를 위한 숨김 username 필드 */}
              <input
                type="text"
                name="username"
                autoComplete="username"
                value={editProvider}
                readOnly
                aria-hidden="true"
                tabIndex={-1}
                style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
              />
              <div>
                <label className="input-label">모델</label>
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

              <div>
                <label className="input-label">API 키</label>
                <div className="input-wrap">
                  <input
                    type={showApiKey ? "text" : "password"}
                    className="input-field"
                    placeholder="API 키를 입력하세요"
                    value={editApiKey}
                    onChange={(e) => setEditApiKey(e.target.value)}
                    autoComplete="new-password"
                    name="llm-api-key"
                  />
                  <button
                    type="button"
                    className="shrink-0 ml-2"
                    style={{ color: "var(--g400)" }}
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

              <div>
                <label className="input-label">월간 토큰 상한</label>
                <div className="input-wrap">
                  <input
                    type="number"
                    className="input-field"
                    placeholder="비워두면 무제한"
                    value={editTokenLimit}
                    onChange={(e) => setEditTokenLimit(e.target.value)}
                  />
                </div>
              </div>

              <label className="ucl-switch" onClick={() => setEditIsDefault(!editIsDefault)}>
                <span className={`switch-track ${editIsDefault ? "" : ""}`}>
                  <span className="switch-dot" />
                </span>
                <span className="switch-label">초안 생성 기본 LLM으로 설정</span>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={editIsDefault}
                  onChange={(e) => setEditIsDefault(e.target.checked)}
                />
              </label>

              {testResult && (
                <div
                  className="ucl-alert"
                  style={{
                    background: testResult === "success" ? "var(--success-light)" : "var(--danger-light)",
                    color: testResult === "success" ? "var(--success)" : "var(--danger)",
                  }}
                >
                  {testResult === "success" ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      <span>연결 테스트 성공</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 shrink-0" />
                      <span>연결 테스트 실패</span>
                    </>
                  )}
                </div>
              )}

              {saveError && (
                <div className="ucl-alert alert-danger">
                  {saveError}
                </div>
              )}
            </form>
          )}

          <DialogFooter>
            <button type="button" className="btn btn-secondary btn-md" onClick={() => setEditProvider(null)}>
              취소
            </button>
            <button
              type="submit"
              form="llm-config-form"
              className="btn btn-primary btn-md"
              disabled={isPending || !editApiKey.trim()}
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  저장 중...
                </>
              ) : (
                "저장 + 연결 테스트"
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 검색 API 설정 Dialog (네이버/구글 공통) */}
      <Dialog open={!!editSearchProvider} onOpenChange={() => setEditSearchProvider(null)}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>
              {editSearchProvider === "naver" ? "네이버 검색 API 설정" : "구글 Custom Search API 설정"}
            </DialogTitle>
            <DialogDescription>
              {editSearchProvider === "naver"
                ? "네이버 개발자 센터에서 발급받은 Client ID와 Client Secret을 입력하세요."
                : "Google Cloud Console에서 발급받은 Search Engine ID와 API Key를 입력하세요."}
            </DialogDescription>
          </DialogHeader>

          <form
            id="search-api-form"
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              handleSaveSearchConfig();
            }}
            autoComplete="off"
          >
            {/* Chrome 접근성 경고 방지를 위한 숨김 username 필드 */}
            <input
              type="text"
              name="username"
              autoComplete="username"
              value={editSearchProvider ?? ""}
              readOnly
              aria-hidden="true"
              tabIndex={-1}
              style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
            />
            <div className="ucl-alert alert-info">
              <span className="t-xs">
              {editSearchProvider === "naver"
                ? "네이버 개발자 센터(developers.naver.com) → 애플리케이션 등록 → 검색 API를 선택하면 Client ID와 Client Secret을 받을 수 있습니다."
                : "Google Cloud Console → Custom Search API 활성화 → API 키 생성. Programmable Search Engine(programmablesearchengine.google.com)에서 검색 엔진 ID를 생성하세요."}
              </span>
            </div>

            <div>
              <label className="input-label">{editSearchProvider === "naver" ? "Client ID" : "Search Engine ID (cx)"}</label>
              <div className="input-wrap">
                <input
                  className="input-field"
                  placeholder={editSearchProvider === "naver" ? "네이버 API Client ID" : "Google Search Engine ID"}
                  value={searchClientId}
                  onChange={(e) => setSearchClientId(e.target.value)}
                  autoComplete="off"
                  name="search-client-id"
                />
              </div>
            </div>

            <div>
              <label className="input-label">{editSearchProvider === "naver" ? "Client Secret" : "API Key"}</label>
              <div className="input-wrap">
                <input
                  type={showSearchSecret ? "text" : "password"}
                  className="input-field"
                  placeholder={editSearchProvider === "naver" ? "네이버 API Client Secret" : "Google API Key"}
                  value={searchClientSecret}
                  onChange={(e) => setSearchClientSecret(e.target.value)}
                  autoComplete="new-password"
                  name="search-client-secret"
                />
                <button
                  type="button"
                  className="shrink-0 ml-2"
                  style={{ color: "var(--g400)" }}
                  onClick={() => setShowSearchSecret(!showSearchSecret)}
                >
                  {showSearchSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {searchSaveError && (
              <div className="ucl-alert alert-danger">
                {searchSaveError}
              </div>
            )}
          </form>

          <DialogFooter>
            <button type="button" className="btn btn-secondary btn-md" onClick={() => setEditSearchProvider(null)}>
              취소
            </button>
            <button
              type="submit"
              form="search-api-form"
              className="btn btn-primary btn-md"
              disabled={isPending || !searchClientId.trim() || !searchClientSecret.trim()}
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  저장 중...
                </>
              ) : (
                "저장"
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 템플릿 편집 Dialog */}
      <Dialog open={!!editTemplate} onOpenChange={() => setEditTemplate(null)}>
        <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>프롬프트 템플릿 편집: {editTemplate?.name}</DialogTitle>
            <DialogDescription>
              시스템 프롬프트와 사용자 프롬프트 템플릿을 확인합니다 (읽기 전용).
            </DialogDescription>
          </DialogHeader>

          {editTemplate && (
            <div className="space-y-4">
              <div>
                <label className="input-label">시스템 프롬프트</label>
                <textarea
                  className="textarea font-mono"
                  style={{ minHeight: 200 }}
                  value={editTemplate.system_prompt}
                  readOnly
                />
              </div>

              <div>
                <label className="input-label">사용자 프롬프트 템플릿</label>
                <textarea
                  className="textarea font-mono"
                  style={{ minHeight: 120 }}
                  value={editTemplate.user_prompt_template}
                  readOnly
                />
              </div>

              {editTemplate.variables && (
                <div>
                  <label className="input-label">변수</label>
                  <div className="flex flex-wrap gap-2">
                    {(editTemplate.variables as Array<{ name: string; description: string; required: boolean }>).map((v, i) => (
                      <span key={i} className="ucl-badge ucl-badge-sm badge-neutral">
                        {`{{${v.name}}}`}
                        {v.required && " *"}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <button className="btn btn-secondary btn-md" onClick={() => setEditTemplate(null)}>
              닫기
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
