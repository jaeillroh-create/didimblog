-- 카테고리 시드 데이터
insert into public.categories (id, name, tier, parent_id, role_type, funnel_stage, prologue_position, monthly_target, cta_type, status, connected_services, sort_order) values
('CAT-INTRO', '디딤 소개', 'primary', null, 'fixed', 'MULTI', null, 0, 'none', 'MATURE', '{}', 1),
('CAT-A', '변리사의 현장 수첩', 'primary', null, 'conversion', 'ATTRACT', 'area1', 2, 'direct', 'NEW', '{"절세컨설팅","사후관리","벤처인증","우수기업인증"}', 2),
('CAT-A-01', '절세 시뮬레이션', 'secondary', 'CAT-A', 'conversion', 'CONVERT', null, 0, 'direct', 'NEW', '{"절세컨설팅"}', 1),
('CAT-A-02', '인증 가이드', 'secondary', 'CAT-A', 'conversion', 'CONVERT', null, 0, 'direct', 'NEW', '{"벤처인증","우수기업인증"}', 2),
('CAT-A-03', '연구소 운영 실무', 'secondary', 'CAT-A', 'conversion', 'CONVERT', null, 0, 'direct', 'NEW', '{"사후관리"}', 3),
('CAT-B', 'IP 라운지', 'primary', null, 'traffic_branding', 'ATTRACT', 'area2', 1, 'neighbor', 'NEW', '{"특허출원","AI특허","기술보호"}', 3),
('CAT-B-01', 'AI와 IP', 'secondary', 'CAT-B', 'traffic_branding', 'ATTRACT', null, 0, 'neighbor', 'NEW', '{"AI특허"}', 1),
('CAT-B-02', '특허 전략 노트', 'secondary', 'CAT-B', 'traffic_branding', 'TRUST', null, 0, 'neighbor', 'NEW', '{"특허출원","기술보호"}', 2),
('CAT-B-03', 'IP 뉴스 한 입', 'secondary', 'CAT-B', 'traffic_branding', 'ATTRACT', null, 0, 'neighbor', 'NEW', '{}', 3),
('CAT-C', '디딤 다이어리', 'primary', null, 'trust', 'TRUST', 'area3', 1, 'none', 'NEW', '{}', 4),
('CAT-C-01', '컨설팅 후기', 'secondary', 'CAT-C', 'trust', 'TRUST', null, 0, 'none', 'NEW', '{}', 1),
('CAT-C-02', '디딤 일상', 'secondary', 'CAT-C', 'trust', 'TRUST', null, 0, 'none', 'NEW', '{}', 2),
('CAT-C-03', '대표의 생각', 'secondary', 'CAT-C', 'trust', 'TRUST', null, 0, 'none', 'NEW', '{}', 3),
('CAT-CONSULT', '상담 안내', 'primary', null, 'fixed', 'CONVERT', null, 0, 'direct', 'MATURE', '{}', 5);

-- 콘텐츠 상태 전이 규칙
insert into public.state_transitions (entity_type, from_status, to_status, conditions, auto_checks, description, is_reversible) values
('content', 'S0', 'S1', '{"briefing_done": true}', '{"briefing_exists"}', '기획→초안: 브리핑 완료 필요', false),
('content', 'S1', 'S2', '{"review_done": true, "seo_required_pass": true}', '{"seo_required_check", "fact_check_done"}', '초안→검토: 팩트체크+SEO필수 통과', true),
('content', 'S2', 'S3', '{"image_done": true, "final_edit_done": true}', '{"image_uploaded", "publish_date_set"}', '검토→발행예정: 이미지+최종편집 완료', false),
('content', 'S3', 'S4', '{"scheduled_time_reached": true}', '{}', '발행예정→발행완료: 예약 시간 도래 (자동)', false),
('content', 'S4', 'S5', '{"quality_measured": true}', '{"quality_score_calculated"}', '발행→성과측정: 품질점수 입력 완료', false),
('content', 'S1', 'S0', '{"major_revision": true}', '{}', '초안→기획: 전면 변경 시 역행', true),
('content', 'S2', 'S1', '{"minor_revision": true, "revision_count_lt_3": true}', '{}', '검토→초안: 수정 필요 시 역행 (최대2회)', true);
