-- 011: CTA 템플릿 시드 데이터
-- cta_templates 테이블에 기본 4개 CTA 삽입 (없으면)

INSERT INTO cta_templates (key, category_name, text, note, conversion_method, email_subject_tag)
VALUES
  (
    '현장수첩_절세',
    '현장 수첩 · 절세 시뮬레이션',
    '━━━━━━━━━━━━━━━━━━
"우리 회사도 가능할까?" 궁금하시다면 재무제표를 보내주세요.
48시간 안에 절세 시뮬레이션을 만들어 드립니다. (무료)

📞 02-571-6613
📧 admin@didimip.com (메일 제목에 ''절세 시뮬레이션''이라고 적어주세요)

특허그룹 디딤 | 기업을 아는 변리사',
    NULL,
    '이메일',
    '절세 시뮬레이션'
  ),
  (
    '현장수첩_인증',
    '현장 수첩 · 인증 가이드',
    '━━━━━━━━━━━━━━━━━━
우리 회사가 인증 요건에 해당하는지 5분이면 확인할 수 있습니다.

📞 02-571-6613
📧 admin@didimip.com (메일 제목에 ''인증 진단''이라고 적어주세요)

특허그룹 디딤 | 기업을 아는 변리사',
    NULL,
    '이메일',
    '인증 진단'
  ),
  (
    '현장수첩_연구소',
    '현장 수첩 · 연구소 운영',
    '━━━━━━━━━━━━━━━━━━
연구소 운영 상태 점검, 무료 진단 가능합니다.

📞 02-571-6613
📧 admin@didimip.com (메일 제목에 ''연구소 진단''이라고 적어주세요)

특허그룹 디딤 | 기업을 아는 변리사',
    NULL,
    '이메일',
    '연구소 진단'
  ),
  (
    'IP라운지',
    'IP 라운지',
    '━━━━━━━━━━━━━━━━━━
AI·IP 전략이 궁금하신 대표님, 편하게 연락 주세요.

📞 02-571-6613
📧 admin@didimip.com

특허그룹 디딤 | 기업을 아는 변리사',
    NULL,
    '이메일',
    '상담 문의'
  )
ON CONFLICT (key) DO UPDATE
SET
  category_name = EXCLUDED.category_name,
  text = EXCLUDED.text,
  conversion_method = EXCLUDED.conversion_method,
  email_subject_tag = EXCLUDED.email_subject_tag;
