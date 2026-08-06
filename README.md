# HOPE Company Monorepo

기존 단일 HTML 디자인을 유지하면서 회사 홈페이지, 소원 저장 API, Supabase 데이터 계층을 분리한 운영용 모노레포입니다.

## 구성

```text
apps/web                       Astro 홈페이지 + Vercel API
packages/wishes-domain         도메인 모델·포트·유스케이스
packages/wishes-infrastructure Supabase·Turnstile·HMAC 구현
supabase/migrations            운영 DB 마이그레이션
supabase/rollbacks             마이그레이션 롤백 SQL
docs                           아키텍처·보안 PR·배포 문서
```

Project 001 소스까지 같은 조직에서 관리한다면 `apps/project-001`을 추가하고 **Vercel Project는 앱별로 분리**하는 구성을 권장합니다. 한 저장소에서 변경 이력과 공통 패키지는 공유하되, 회사 홈페이지와 서비스의 배포·도메인·장애 범위는 분리할 수 있습니다.

## 시작하기

필수 환경: Node.js 22+, pnpm 11.10.0

```bash
pnpm install
cp apps/web/.env.example apps/web/.env
pnpm dev
```

개발 주소는 기본적으로 `http://localhost:4321`입니다. 로컬에서 Turnstile을 의도적으로 끄려면 `APP_ENV=development`와 `ALLOW_INSECURE_TURNSTILE=true`를 모두 명시해야 합니다. 설정이 없으면 개발 환경에서도 API가 자동으로 검증을 생략하지 않습니다.

## Supabase 설정

1. Supabase 프로젝트를 생성합니다.
2. `supabase/migrations`의 SQL을 파일명 순서대로 실행합니다.
3. 선택적으로 `supabase/seed.sql`을 실행합니다.
4. `apps/web/.env`와 Vercel 환경 변수에 서버 값을 등록합니다.

```dotenv
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SECRET_KEY=sb_secret_xxx
WISH_HASH_SECRET=32자 이상의 강한 임의 문자열
```

`SUPABASE_SECRET_KEY`는 브라우저에 포함되지 않는 서버 전용 값입니다. `PUBLIC_` 접두사를 붙이지 마세요.

### 원자적 속도 제한

공개 제출은 반드시 PostgreSQL 함수 `public.submit_wish_atomic`을 통과합니다. 함수는 동일한 `submitter_hash`에 대해 transaction-scoped advisory lock을 획득한 뒤, 60초 구간의 제출 수를 확인하고 같은 트랜잭션 안에서 저장합니다.

```text
동일 hash 잠금 → rolling-window count → 제한 확인 → INSERT → COMMIT
```

`service_role`의 테이블 직접 `INSERT` 권한은 제거되어 애플리케이션이 과거의 “조회 후 삽입” 경로로 되돌아갈 수 없습니다. 기본 제한은 60초에 2건입니다. 프록시 IP가 없거나 RPC에 비어 있는 `submitter_hash`가 전달되면 저장하지 않고 fail-closed 처리합니다.

### 마이그레이션 및 롤백

> **재배포 전 게시 정책 확인:** 마지막 마이그레이션
> `202607190001_auto_publish_public_wishes.sql`은 기존 대기 중인 공개 소원을
> 승인 상태로 바꾸고, 이후 공개 소원을 즉시 게시합니다. 현재 운영 사이트의
> 관리자 승인 방식을 그대로 유지해야 한다면 이 마이그레이션을 적용하기 전에
> 운영 DB의 적용 이력과 배포 중인 커밋을 먼저 대조하세요.

게시 정책이 현재 운영과 일치하는 것을 확인한 뒤 마이그레이션을 순서대로 적용합니다.

```bash
for migration in supabase/migrations/*.sql; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$migration"
done
```

이번 UI 변경은 이름·별명 저장을 제거하므로 `202607170003_remove_wish_nickname.sql`에서 기존 `nickname` 컬럼과 RPC 인자를 삭제합니다. 해당 컬럼에 이미 데이터가 있다면 마이그레이션 전에 별도 백업이 필요합니다.

이번 변경만 롤백:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/rollbacks/202607170003_remove_wish_nickname.sql
```

원자적 제출 기능까지 되돌릴 때만 애플리케이션을 이전 버전으로 전환한 뒤 `202607170002_atomic_wish_submission.sql` 롤백을 추가로 실행합니다.

### 소원 게시 정책

현재 저장소의 마지막 마이그레이션까지 적용하면 공개 소원은 제출 즉시 `approved`로 저장되고 홈페이지 비눗방울에 반영됩니다. 마지막 마이그레이션을 적용하지 않은 기존 운영 DB는 공개 소원을 `pending`으로 저장하며, Supabase Table Editor에서 `status`를 `approved`로 변경해야 게시됩니다.

두 정책은 사용자 안내 문구와 실제 동작이 달라지므로, 코드 작업공간 이전 시 운영 DB의 마이그레이션 이력과 배포 커밋을 반드시 한 쌍으로 유지해야 합니다.

## Turnstile 연결

운영·스테이징에서는 아래 세 값이 모두 필수입니다.

```dotenv
PUBLIC_TURNSTILE_SITE_KEY=사이트 키
TURNSTILE_SECRET_KEY=서버 검증 키
TURNSTILE_ALLOWED_HOSTNAMES=www.hiddenpage.co.kr,staging.hiddenpage.co.kr
```

클라이언트 위젯은 `action: "wish_submit"`으로 토큰을 발급합니다. 서버는 `success`뿐 아니라 `action === "wish_submit"`과 응답 `hostname`의 정확한 허용 목록 일치까지 검증합니다.

다음 조건이면 Vercel production/preview 빌드가 즉시 실패합니다.

- Turnstile site key 또는 secret key 누락
- hostname 허용 목록 누락
- 운영·스테이징에서 `ALLOW_INSECURE_TURNSTILE=true`

동일 검사는 서버리스 함수 cold start에서도 다시 수행됩니다.

## API 입력 제한

- 요청 본문은 `request.text()`로 읽은 뒤 `TextEncoder`로 실제 UTF-8 바이트를 계산합니다.
- 실제 본문이 8,192바이트를 초과하면 `413 PAYLOAD_TOO_LARGE`입니다.
- 잘못된 JSON은 `400 INVALID_JSON`입니다.
- `GET /api/wishes?limit=`은 정수 1~50만 허용하며 기본값은 24입니다.

`Content-Length`는 보안 판단에 사용하지 않으므로 헤더 생략·축소 조작으로 크기 제한을 우회할 수 없습니다.

## Project 001 링크

```dotenv
PUBLIC_PROJECT_001_URL=https://project001.hiddenpage.co.kr
```

자세한 연결 방식은 [`docs/project-001-linking.md`](docs/project-001-linking.md)를 참고하세요.

## Vercel 배포

GitHub 저장소를 Vercel에 Import한 뒤:

```text
Root Directory: apps/web
Framework Preset: Astro
Build Command: pnpm build
```

로컬 설정은 `apps/web/.env.example`, 운영 설정은 `apps/web/.env.production.example`을 기준으로 등록합니다. Vercel의 `VERCEL_ENV=production|preview` 판정을 우선하며, `APP_ENV`는 로컬 또는 비-Vercel 실행 환경에서만 보조적으로 사용합니다.

작업공간 이전 전 점검 결과와 운영 동일성 차단 항목은 [`docs/migration-audit-2026-07-28.md`](docs/migration-audit-2026-07-28.md)를 확인하세요.

## 품질 명령

```bash
pnpm lint
pnpm check
pnpm test
pnpm build
pnpm validate
pnpm audit
pnpm lighthouse
```

PostgreSQL 통합 테스트:

```bash
TEST_DATABASE_URL=postgres://... \
  pnpm --filter @hope/wishes-infrastructure test:integration
```

CI는 PostgreSQL 16 서비스에 실제 마이그레이션을 적용한 뒤 24개 병렬 요청, RLS 활성화, 브라우저 역할 차단, `service_role` 직접 INSERT 차단을 확인합니다.

Lighthouse CI는 Performance·접근성·Best Practices·SEO 모두 100점을 목표로 실패 기준을 설정합니다. 점수는 실행 환경과 네트워크에 따라 달라질 수 있으므로 배포 URL에서도 다시 측정해야 합니다.

## 운영 보안

- 승인된 공개 소원만 GET API가 반환됩니다.
- 비공개 소원은 브라우저로 전송하지 않습니다.
- Raw IP는 저장하지 않고 HMAC 해시만 속도 제한에 사용합니다.
- 동일 hash 병렬 제출은 PostgreSQL advisory lock으로 직렬화됩니다.
- Supabase RLS를 활성화하고 `anon`, `authenticated` 테이블 권한을 제거합니다.
- 제출은 security-definer RPC만 실행할 수 있고 `service_role` 직접 INSERT는 차단됩니다.
- 해시가 붙은 Astro 빌드 자산은 immutable cache, 공개 소원은 CDN SWR, 제출 API는 `no-store`입니다.
- GitHub Actions는 태그가 아닌 검증된 commit SHA로 고정합니다.
- `pnpm` override로 감사에서 발견된 `tmp`, `uuid` 취약 버전을 패치 버전으로 강제합니다.

## Git 커밋 전 저장소 안전 점검

`.gitignore`는 아직 추적되지 않은 파일만 차단합니다. 이미 Git에 추가된 비밀 값이나, 예상하지 못한 파일명으로 저장된 자격 증명까지 완전히 막지는 못합니다. 커밋과 푸시 전에 다음 검사를 실행하세요.

```bash
pnpm security:repo
git status --short
git diff --cached --name-status
git diff --cached
```

실수로 환경 파일을 스테이징했다면 커밋 전에 다음처럼 제거합니다.

```bash
git restore --staged path/to/file
```

이미 커밋된 파일은 `.gitignore`만 추가해도 기록에서 사라지지 않습니다. 그 경우 키를 먼저 폐기·재발급한 뒤 Git 기록 정리 절차를 수행해야 합니다.

## pnpm supply-chain baseline

This repository requires the exact package-manager version declared in `package.json` (`pnpm@11.10.0`). Do not install with an older pnpm version.

Before pushing or deploying:

```bash
pnpm security:repo
pnpm security:dependencies
pnpm install --frozen-lockfile
pnpm audit --audit-level high
pnpm ci
```

The dependency policy delays newly published package versions for 48 hours, blocks transitive git/tarball sources, and permits install-time build scripts only for explicitly approved packages. See `docs/dependency-security-review.md`.
