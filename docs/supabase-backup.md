# Supabase DB 수동 백업

이 도구는 Windows PowerShell 5.1 이상에서 Class Log의 Supabase PostgreSQL 데이터를 필요할 때 수동 백업한다. DB에는 읽기 전용 dump와 migration history 조회만 수행한다.

## 준비

- 전역 `supabase` CLI가 PATH에 있어야 한다. 프로젝트가 이미 사용하는 전역 또는 로컬 CLI만 사용하며 스크립트가 설치하지 않는다.
- Supabase CLI의 DB dump 실행에 필요한 Docker CLI와 Docker daemon이 준비되어 있어야 한다.
- 다음 둘 중 하나로 DB 접속 정보를 현재 프로세스 환경변수에 설정한다. 값을 파일이나 Git에 저장하지 않는다.

```powershell
$env:SUPABASE_DB_URL = '<percent-encoded direct 또는 pooler PostgreSQL connection string>'
```

또는 현재 worktree를 먼저 Supabase 프로젝트에 link한 환경에서:

```powershell
$env:SUPABASE_DB_PASSWORD = '<database password>'
```

linked 방식은 `supabase/.temp/project-ref`가 현재 worktree에 이미 있어야 한다. 이 저장소는 기본 상태에서 linked 정보가 없으므로 일반적으로 `SUPABASE_DB_URL`을 사용한다.

## 실행

```powershell
npm run db:backup
```

백업은 프로젝트 루트의 `backups/supabase/`에 저장한다. 한 실행의 동일한 KST 분 timestamp를 사용한다.

```text
schema_2026-09-13_0045.sql.gz
data_2026-09-13_0045.sql.gz
roles_2026-09-13_0045.sql.gz
```

같은 분의 파일이 하나라도 이미 있으면 기존 파일을 덮어쓰지 않고 실패한다.

## 포함 범위와 한계

- `schema`: `supabase db dump --schema public`로 만든 public 앱 schema
- `data`: `supabase db dump --data-only --use-copy --schema public`로 만든 실제 public table data
- `roles`: 설치된 CLI 2.117.0이 지원하는 `--role-only` dump

이 백업은 의도적으로 public 앱 schema/data만 대상으로 한다. `auth`, `storage`, `realtime`, `supabase_migrations`, `vault` 등 Supabase 관리 schema와 그 데이터는 포함하지 않으며 전체 Supabase 프로젝트 백업으로 간주하면 안 된다. 특히 Storage bucket의 실제 파일 object는 백업하지 않는다. public table에 개인정보가 있으면 압축 파일에도 포함되므로 접근 권한과 별도 저장소 보안을 적용한다.

## 성공·실패와 보관기간

각 SQL dump 명령의 성공 코드를 확인하고, SQL이 비어 있지 않으며 schema/data에 예상한 public table 구문이 있는지 내용 출력 없이 검사한 뒤 .NET GZip으로 압축한다. 모든 gzip을 실제로 끝까지 열어 무결성을 확인하고 원격 migration history가 실행 전후 동일할 때만 최종 파일명으로 확정한다.

schema/data/roles 중 하나라도 실패하거나 migration history가 중간에 바뀌면 이번 실행의 임시·partial·final 파일만 제거하고 non-zero로 종료한다. 이전 정상 백업은 건드리지 않고 retention cleanup도 실행하지 않는다. 오류 출력의 알려진 connection string과 password는 가린다.

새 backup set 확정 뒤 retention 삭제만 실패한 경우에는 복구 가능한 새 세 파일을 유지한 채 non-zero로 종료하고 정리 실패를 별도로 알린다.

모든 새 파일이 확정된 뒤에만 기본 14일보다 오래된 스크립트 생성 백업을 정리한다. 변경하려면 실행 전에 다음 환경변수를 설정한다.

```powershell
$env:BACKUP_RETENTION_DAYS = '30'
```

허용 범위는 1~3650일이다. 정리는 정확한 `schema|data|roles_YYYY-MM-DD_HHmm.sql.gz` 일반 파일만 비재귀적으로 대상으로 삼고, reparse point·하위 폴더·현재 실행 파일·패턴 불일치 파일을 제외한다.

안전 로직만 독립 fixture로 검사하려면 다음을 실행한다.

```powershell
npm run db:backup:test
```

## 성공 확인

명령이 종료 코드 0으로 끝나고 세 파일의 이름과 0보다 큰 압축 크기, `보관기간 정리 완료`가 표시되는지 확인한다. 스크립트가 각 gzip을 다시 열어 검사하므로 이 메시지가 나온 backup set은 기본 gzip 무결성 검사를 통과한 상태다. SQL 본문은 로그로 출력하지 않는다.

## 복구 개요

이번 도구는 복구를 자동 실행하지 않는다. 복구는 별도 승인된 작업으로 진행한다.

1. 새 빈 DB 또는 격리된 복구 대상 DB를 준비한다. 운영 DB에 바로 덮어쓰지 않는다.
2. gzip을 별도 작업 폴더에 해제한다.
3. 대상 환경과 SQL을 검토한 뒤 기본적으로 roles → schema → data 순서를 사용한다.
4. 해당 Supabase CLI/PostgreSQL 버전이 지원하는 `psql` 기반 복구 방식을 사용한다.
5. migration history, RLS, FK, 주요 table row count와 역할별 접근을 검증한다.
6. 이 backup set에 없는 Auth/Storage 관리 schema와 Storage 파일 object는 별도 플랫폼 백업·복구 수단이 필요하다.
7. 운영 DB 복구는 사전 승인과 별도 변경 작업으로만 수행한다.
