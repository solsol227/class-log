[CmdletBinding()]
param(
    [switch]$SelfTest
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$script:BackupFilePattern = '^(schema|data|roles)_(\d{4}-\d{2}-\d{2}_\d{4})\.sql\.gz$'
$script:SecretValues = New-Object System.Collections.Generic.List[string]

function Get-FullPath {
    param([Parameter(Mandatory = $true)][string]$Path)

    return [System.IO.Path]::GetFullPath($Path)
}

function Test-IsPathInsideRoot {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Root
    )

    $fullPath = Get-FullPath -Path $Path
    $fullRoot = (Get-FullPath -Path $Root).TrimEnd('\', '/')
    $prefix = $fullRoot + [System.IO.Path]::DirectorySeparatorChar

    return $fullPath.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)
}

function Assert-SafeBackupRoot {
    param(
        [Parameter(Mandatory = $true)][string]$ProjectRoot,
        [Parameter(Mandatory = $true)][string]$BackupRoot
    )

    $expectedRoot = Get-FullPath -Path (Join-Path $ProjectRoot 'backups\supabase')
    $actualRoot = Get-FullPath -Path $BackupRoot
    if (-not $actualRoot.Equals($expectedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw '백업 경로가 프로젝트의 backups\supabase 폴더와 일치하지 않습니다.'
    }

    $backupsParent = Split-Path -Parent $actualRoot
    [System.IO.Directory]::CreateDirectory($backupsParent) | Out-Null
    [System.IO.Directory]::CreateDirectory($actualRoot) | Out-Null

    foreach ($directory in @($backupsParent, $actualRoot)) {
        $item = Get-Item -LiteralPath $directory -Force
        if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw "백업 경로에 reparse point가 있어 중단했습니다: $($item.Name)"
        }
    }
}

function Get-RetentionDays {
    $rawValue = $env:BACKUP_RETENTION_DAYS
    if ([string]::IsNullOrWhiteSpace($rawValue)) {
        return 14
    }

    $parsedValue = 0
    if (-not [int]::TryParse($rawValue, [ref]$parsedValue) -or $parsedValue -lt 1 -or $parsedValue -gt 3650) {
        throw 'BACKUP_RETENTION_DAYS는 1~3650 범위의 정수여야 합니다.'
    }

    return $parsedValue
}

function Protect-Secrets {
    param([AllowEmptyString()][string]$Text)

    $safeText = $Text
    foreach ($secret in $script:SecretValues) {
        if (-not [string]::IsNullOrEmpty($secret)) {
            $safeText = $safeText.Replace($secret, '[비밀값 숨김]')
            try {
                $decodedSecret = [System.Uri]::UnescapeDataString($secret)
                if (-not $decodedSecret.Equals($secret, [System.StringComparison]::Ordinal)) {
                    $safeText = $safeText.Replace($decodedSecret, '[비밀값 숨김]')
                }
            }
            catch {
                # 입력 전체가 URI 구성요소가 아니어도 원문 치환은 이미 수행했다.
            }
        }
    }

    return $safeText
}

function Get-SafeCommandFailureDetail {
    param([object[]]$Output)

    $lines = @($Output | ForEach-Object { Protect-Secrets -Text $_.ToString() } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    if ($lines.Count -eq 0) {
        return '추가 오류 메시지가 없습니다.'
    }

    return ($lines | Select-Object -Last 8) -join [Environment]::NewLine
}

function Invoke-SupabaseCommand {
    param(
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [Parameter(Mandatory = $true)][string]$Description
    )

    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $output = @(& supabase @Arguments 2>&1)
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }

    if ($exitCode -ne 0) {
        $detail = Get-SafeCommandFailureDetail -Output $output
        throw "$Description 실패 (Supabase CLI 종료 코드 $exitCode).`n$detail"
    }

    return ($output | ForEach-Object { $_.ToString() }) -join [Environment]::NewLine
}

function Get-ConnectionArguments {
    if (-not [string]::IsNullOrWhiteSpace($env:SUPABASE_DB_URL)) {
        $databaseUrl = $env:SUPABASE_DB_URL.Trim()
        if ($databaseUrl -notmatch '^postgres(ql)?://') {
            throw 'SUPABASE_DB_URL은 postgresql:// 또는 postgres://로 시작해야 합니다.'
        }

        $script:SecretValues.Add($databaseUrl)
        $databaseUri = $null
        if ([System.Uri]::TryCreate($databaseUrl, [System.UriKind]::Absolute, [ref]$databaseUri) -and -not [string]::IsNullOrWhiteSpace($databaseUri.UserInfo)) {
            $userInfoParts = $databaseUri.UserInfo.Split(@(':'), 2)
            if ($userInfoParts.Count -eq 2 -and -not [string]::IsNullOrWhiteSpace($userInfoParts[1])) {
                $script:SecretValues.Add($userInfoParts[1])
            }
        }
        return @('--db-url', $databaseUrl)
    }

    $linkedProjectFile = Join-Path $script:ProjectRoot 'supabase\.temp\project-ref'
    if (-not (Test-Path -LiteralPath $linkedProjectFile -PathType Leaf)) {
        throw 'SUPABASE_DB_URL이 없고 이 worktree는 Supabase 프로젝트에 linked 상태가 아닙니다.'
    }
    if ([string]::IsNullOrWhiteSpace($env:SUPABASE_DB_PASSWORD)) {
        throw 'linked project 백업에는 SUPABASE_DB_PASSWORD가 필요합니다.'
    }

    $databasePassword = $env:SUPABASE_DB_PASSWORD
    $script:SecretValues.Add($databasePassword)
    return @('--linked', '--password', $databasePassword)
}

function Assert-RequiredTools {
    if ($null -eq (Get-Command supabase -ErrorAction SilentlyContinue)) {
        throw '설치된 Supabase CLI를 찾을 수 없습니다. CLI를 임의 설치하지 않았습니다.'
    }

    try {
        $dumpHelp = @(& supabase db dump --help 2>&1)
    }
    catch {
        throw '설치된 Supabase CLI를 실행할 수 없습니다.'
    }
    if ($LASTEXITCODE -ne 0) {
        throw '설치된 Supabase CLI의 db dump 도움말을 확인할 수 없습니다.'
    }
    if (($dumpHelp -join [Environment]::NewLine) -notmatch '(?m)^\s*--role-only\s') {
        throw '설치된 Supabase CLI가 roles dump용 --role-only를 지원하지 않습니다. schema/data만으로는 역할을 복구할 수 없어 백업을 중단했습니다.'
    }

    if ($null -eq (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw 'Supabase DB dump에 필요한 Docker CLI를 찾을 수 없습니다. Docker를 임의 설치하지 않았습니다.'
    }

    $dockerOutput = @(& docker info --format '{{.ServerVersion}}' 2>&1)
    if ($LASTEXITCODE -ne 0) {
        throw 'Docker daemon에 연결할 수 없습니다. Docker Desktop이 실행 중인지 확인해 주세요.'
    }
}

function Get-MigrationVersionsFromOutput {
    param([Parameter(Mandatory = $true)][string]$Output)

    $remoteVersions = New-Object System.Collections.Generic.List[string]

    # Supabase CLI versions and user configuration can produce either JSON or a
    # text table. stderr progress messages may also precede JSON because command
    # output is intentionally captured as one stream for safe error reporting.
    $jsonStart = $Output.IndexOf('{')
    $jsonEnd = $Output.LastIndexOf('}')
    if ($jsonStart -ge 0 -and $jsonEnd -gt $jsonStart) {
        try {
            $json = $Output.Substring($jsonStart, $jsonEnd - $jsonStart + 1) | ConvertFrom-Json
            foreach ($migration in @($json.migrations)) {
                $remoteVersion = [string]$migration.remote
                if ($remoteVersion -match '^\d{14}$') {
                    $remoteVersions.Add($remoteVersion)
                }
            }
        }
        catch {
            # Fall through to the text-table parser below.
        }
    }

    if ($remoteVersions.Count -eq 0) {
        foreach ($line in ($Output -split "`r?`n")) {
            if ($line -match '^\s*(?:`\d{14}`|\d{14})?\s*\|\s*(?:`(\d{14})`|(\d{14}))\s*\|') {
                $remoteVersion = if ($Matches[1]) { $Matches[1] } else { $Matches[2] }
                $remoteVersions.Add($remoteVersion)
            }
        }
    }

    if ($remoteVersions.Count -eq 0) {
        throw '원격 migration history를 읽었지만 버전 목록을 안전하게 해석하지 못했습니다.'
    }

    return @(($remoteVersions | Sort-Object -Unique))
}

function Get-RemoteMigrationFingerprint {
    param([Parameter(Mandatory = $true)][string[]]$ConnectionArguments)

    $arguments = @('migration', 'list') + $ConnectionArguments
    $output = Invoke-SupabaseCommand -Arguments $arguments -Description '원격 migration history 조회'
    return ((Get-MigrationVersionsFromOutput -Output $output) -join ',')
}

function Compress-SqlFile {
    param(
        [Parameter(Mandatory = $true)][string]$SourcePath,
        [Parameter(Mandatory = $true)][string]$DestinationPath
    )

    $sourceItem = Get-Item -LiteralPath $SourcePath
    if ($sourceItem.Length -le 0) {
        throw "dump SQL 파일이 비어 있습니다: $($sourceItem.Name)"
    }

    $inputStream = $null
    $outputStream = $null
    $gzipStream = $null
    try {
        $inputStream = [System.IO.File]::OpenRead($SourcePath)
        $outputStream = New-Object System.IO.FileStream(
            $DestinationPath,
            [System.IO.FileMode]::CreateNew,
            [System.IO.FileAccess]::Write,
            [System.IO.FileShare]::None
        )
        $gzipStream = New-Object System.IO.Compression.GZipStream(
            $outputStream,
            [System.IO.Compression.CompressionMode]::Compress,
            $true
        )
        $inputStream.CopyTo($gzipStream)
    }
    finally {
        if ($null -ne $gzipStream) { $gzipStream.Dispose() }
        if ($null -ne $outputStream) { $outputStream.Dispose() }
        if ($null -ne $inputStream) { $inputStream.Dispose() }
    }

    Remove-Item -LiteralPath $SourcePath -Force
}

function Assert-SqlDumpShape {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][ValidateSet('schema', 'data')][string]$Kind
    )

    $publicSchemaPattern = '(?:(?-i:"public")|(?i:public))'
    $identifierPattern = '(?:"(?:""|[^"])+"|[A-Za-z_][A-Za-z0-9_$]*)'
    $pattern = if ($Kind -eq 'schema') {
        '^\s*CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+' + $publicSchemaPattern + '\s*\.\s*' + $identifierPattern + '\s*(?:\(|$)'
    }
    else {
        '^\s*COPY\s+' + $publicSchemaPattern + '\s*\.\s*' + $identifierPattern + '(?:\s+\(\s*' + $identifierPattern + '(?:\s*,\s*' + $identifierPattern + ')*\s*\))?\s+FROM\s+stdin;$'
    }

    if (-not (Select-String -LiteralPath $Path -Pattern $pattern -Quiet)) {
        throw "$Kind dump에서 예상한 public table SQL 구문을 찾지 못했습니다."
    }
}

function Assert-GzipIntegrity {
    param([Parameter(Mandatory = $true)][string]$Path)

    $item = Get-Item -LiteralPath $Path
    if ($item.Length -le 0) {
        throw "gzip 파일이 비어 있습니다: $($item.Name)"
    }

    $fileStream = $null
    $gzipStream = $null
    try {
        $fileStream = [System.IO.File]::OpenRead($Path)
        $gzipStream = New-Object System.IO.Compression.GZipStream(
            $fileStream,
            [System.IO.Compression.CompressionMode]::Decompress
        )
        $buffer = New-Object byte[] 8192
        $decompressedBytes = 0L
        while (($bytesRead = $gzipStream.Read($buffer, 0, $buffer.Length)) -gt 0) {
            $decompressedBytes += $bytesRead
        }
        if ($decompressedBytes -le 0) {
            throw "gzip 압축 해제 결과가 비어 있습니다: $($item.Name)"
        }
    }
    finally {
        if ($null -ne $gzipStream) { $gzipStream.Dispose() }
        if ($null -ne $fileStream) { $fileStream.Dispose() }
    }
}

function Remove-CurrentRunArtifacts {
    param(
        [Parameter(Mandatory = $true)][string[]]$Paths,
        [Parameter(Mandatory = $true)][string]$BackupRoot
    )

    foreach ($path in $Paths) {
        if ([string]::IsNullOrWhiteSpace($path) -or -not (Test-Path -LiteralPath $path -PathType Leaf)) {
            continue
        }
        if (-not (Test-IsPathInsideRoot -Path $path -Root $BackupRoot)) {
            continue
        }

        $parent = Get-FullPath -Path (Split-Path -Parent $path)
        if (-not $parent.Equals((Get-FullPath -Path $BackupRoot), [System.StringComparison]::OrdinalIgnoreCase)) {
            continue
        }

        Remove-Item -LiteralPath $path -Force
    }
}

function Get-RetentionCandidates {
    param(
        [Parameter(Mandatory = $true)][string]$BackupRoot,
        [Parameter(Mandatory = $true)][datetime]$CutoffKst,
        [Parameter(Mandatory = $true)][string[]]$CurrentFileNames
    )

    $rootPath = Get-FullPath -Path $BackupRoot
    $candidates = New-Object System.Collections.Generic.List[System.IO.FileInfo]
    foreach ($file in @(Get-ChildItem -LiteralPath $rootPath -File -Force)) {
        if (($file.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
            continue
        }
        if ($file.Name -notmatch $script:BackupFilePattern) {
            continue
        }
        if ($CurrentFileNames -contains $file.Name) {
            continue
        }

        $filePath = Get-FullPath -Path $file.FullName
        $parentPath = Get-FullPath -Path $file.DirectoryName
        if (-not $parentPath.Equals($rootPath, [System.StringComparison]::OrdinalIgnoreCase)) {
            continue
        }
        if (-not (Test-IsPathInsideRoot -Path $filePath -Root $rootPath)) {
            continue
        }

        $timestamp = [datetime]::MinValue
        $culture = [System.Globalization.CultureInfo]::InvariantCulture
        $style = [System.Globalization.DateTimeStyles]::None
        if (-not [datetime]::TryParseExact($Matches[2], 'yyyy-MM-dd_HHmm', $culture, $style, [ref]$timestamp)) {
            continue
        }
        if ($timestamp -lt $CutoffKst) {
            $candidates.Add($file)
        }
    }

    return $candidates.ToArray()
}

function Invoke-RetentionCleanup {
    param(
        [Parameter(Mandatory = $true)][string]$BackupRoot,
        [Parameter(Mandatory = $true)][int]$RetentionDays,
        [Parameter(Mandatory = $true)][datetime]$NowKst,
        [Parameter(Mandatory = $true)][string[]]$CurrentFileNames
    )

    $cutoff = $NowKst.AddDays(-$RetentionDays)
    $candidates = @(Get-RetentionCandidates -BackupRoot $BackupRoot -CutoffKst $cutoff -CurrentFileNames $CurrentFileNames)
    foreach ($candidate in $candidates) {
        Remove-Item -LiteralPath $candidate.FullName -Force
        Write-Host "보관기간 만료 백업 삭제: $($candidate.Name)"
    }

    Write-Host "보관기간 정리 완료: $($candidates.Count)개 삭제"
}

function Assert-TestCondition {
    param(
        [Parameter(Mandatory = $true)][bool]$Condition,
        [Parameter(Mandatory = $true)][string]$Message
    )

    if (-not $Condition) {
        throw "자체 테스트 실패: $Message"
    }
}

function Invoke-SelfTest {
    $fixtureRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('class-log-backup-test-' + [guid]::NewGuid().ToString('N'))
    [System.IO.Directory]::CreateDirectory($fixtureRoot) | Out-Null
    $originalRetention = $env:BACKUP_RETENTION_DAYS

    try {
        Remove-Item Env:BACKUP_RETENTION_DAYS -ErrorAction SilentlyContinue
        Assert-TestCondition -Condition ((Get-RetentionDays) -eq 14) -Message '기본 보관기간은 14일이어야 합니다.'
        $env:BACKUP_RETENTION_DAYS = '30'
        Assert-TestCondition -Condition ((Get-RetentionDays) -eq 30) -Message '유효한 보관기간 환경변수를 반영해야 합니다.'
        foreach ($invalidRetention in @('0', '-1', 'not-a-number', '3651')) {
            $env:BACKUP_RETENTION_DAYS = $invalidRetention
            $rejected = $false
            try { Get-RetentionDays | Out-Null } catch { $rejected = $true }
            Assert-TestCondition -Condition $rejected -Message "잘못된 보관기간을 거부해야 합니다: $invalidRetention"
        }

        $oldMatching = Join-Path $fixtureRoot 'schema_2026-01-01_0000.sql.gz'
        $recentMatching = Join-Path $fixtureRoot 'data_2026-09-12_1200.sql.gz'
        $currentMatching = Join-Path $fixtureRoot 'roles_2026-01-01_0000.sql.gz'
        $wrongName = Join-Path $fixtureRoot 'schema_2026-01-01_0000.sql'
        $partialName = Join-Path $fixtureRoot '.schema_2026-01-01_0000.sql.gz.partial'
        $subfolder = Join-Path $fixtureRoot 'nested'
        [System.IO.Directory]::CreateDirectory($subfolder) | Out-Null
        $nestedMatching = Join-Path $subfolder 'schema_2026-01-01_0000.sql.gz'

        foreach ($path in @($oldMatching, $recentMatching, $currentMatching, $wrongName, $partialName, $nestedMatching)) {
            [System.IO.File]::WriteAllText($path, 'fixture')
        }

        $cutoff = [datetime]::ParseExact('2026-09-01_0000', 'yyyy-MM-dd_HHmm', [System.Globalization.CultureInfo]::InvariantCulture)
        $candidates = @(Get-RetentionCandidates -BackupRoot $fixtureRoot -CutoffKst $cutoff -CurrentFileNames @('roles_2026-01-01_0000.sql.gz'))
        Assert-TestCondition -Condition ($candidates.Count -eq 1) -Message '오래된 matching 파일 하나만 선택해야 합니다.'
        Assert-TestCondition -Condition ($candidates[0].Name -eq 'schema_2026-01-01_0000.sql.gz') -Message '선택된 파일명이 예상과 다릅니다.'
        Assert-TestCondition -Condition (-not (Test-IsPathInsideRoot -Path (Join-Path (Split-Path -Parent $fixtureRoot) 'outside.sql.gz') -Root $fixtureRoot)) -Message 'root 밖 경로를 거부해야 합니다.'

        $failedRunSql = Join-Path $fixtureRoot '.failed.sql'
        $failedRunGzip = Join-Path $fixtureRoot '.failed.sql.gz.partial'
        [System.IO.File]::WriteAllText($failedRunSql, 'partial')
        [System.IO.File]::WriteAllText($failedRunGzip, 'partial')
        Remove-CurrentRunArtifacts -Paths @($failedRunSql, $failedRunGzip) -BackupRoot $fixtureRoot
        Assert-TestCondition -Condition (-not (Test-Path -LiteralPath $failedRunSql)) -Message '실패한 실행의 SQL 임시 파일을 제거해야 합니다.'
        Assert-TestCondition -Condition (-not (Test-Path -LiteralPath $failedRunGzip)) -Message '실패한 실행의 gzip partial을 제거해야 합니다.'
        Assert-TestCondition -Condition (Test-Path -LiteralPath $oldMatching) -Message '실패 정리에서 이전 정상 백업을 삭제하면 안 됩니다.'

        $retentionNow = [datetime]::ParseExact('2026-09-16_0000', 'yyyy-MM-dd_HHmm', [System.Globalization.CultureInfo]::InvariantCulture)
        Invoke-RetentionCleanup -BackupRoot $fixtureRoot -RetentionDays 14 -NowKst $retentionNow -CurrentFileNames @('roles_2026-01-01_0000.sql.gz')
        Assert-TestCondition -Condition (-not (Test-Path -LiteralPath $oldMatching)) -Message '계획된 만료 파일은 삭제되어야 합니다.'
        Assert-TestCondition -Condition (Test-Path -LiteralPath $recentMatching) -Message 'cutoff 이후 파일은 유지되어야 합니다.'
        Assert-TestCondition -Condition (Test-Path -LiteralPath $currentMatching) -Message '현재 backup set은 유지되어야 합니다.'
        Assert-TestCondition -Condition (Test-Path -LiteralPath $wrongName) -Message '패턴 불일치 파일은 유지되어야 합니다.'
        Assert-TestCondition -Condition (Test-Path -LiteralPath $nestedMatching) -Message '하위 폴더 파일은 유지되어야 합니다.'

        $gzipSource = Join-Path $fixtureRoot 'gzip-test.sql'
        $gzipDestination = Join-Path $fixtureRoot 'gzip-test.sql.gz.partial'
        [System.IO.File]::WriteAllText($gzipSource, 'select 1;')
        Compress-SqlFile -SourcePath $gzipSource -DestinationPath $gzipDestination
        Assert-GzipIntegrity -Path $gzipDestination
        Assert-TestCondition -Condition (-not (Test-Path -LiteralPath $gzipSource)) -Message '압축 후 원본 SQL을 제거해야 합니다.'
        Assert-TestCondition -Condition ((Get-Item -LiteralPath $gzipDestination).Length -gt 0) -Message 'gzip 파일은 0 byte보다 커야 합니다.'

        $schemaShape = Join-Path $fixtureRoot 'shape-schema.sql'
        $quotedSchemaShape = Join-Path $fixtureRoot 'shape-schema-quoted.sql'
        $dataShape = Join-Path $fixtureRoot 'shape-data.sql'
        $quotedDataShape = Join-Path $fixtureRoot 'shape-data-quoted.sql'
        $quotedDataSql = @(
            'COPY "public"."students" ("id", "nickname") FROM stdin;'
            '\.'
        ) -join [Environment]::NewLine
        [System.IO.File]::WriteAllText($quotedDataShape, $quotedDataSql)
        $wrongDataShape = Join-Path $fixtureRoot 'shape-data-wrong-schema.sql'
        $wrongDataSql = @(
            'COPY "private"."students" ("id") FROM stdin;'
            '\.'
        ) -join [Environment]::NewLine
        [System.IO.File]::WriteAllText($wrongDataShape, $wrongDataSql)
        $quotedSchemaSql = @(
            'CREATE TABLE IF NOT EXISTS "public"."students" ('
            '    id uuid'
            ');'
        ) -join [Environment]::NewLine
        [System.IO.File]::WriteAllText($quotedSchemaShape, $quotedSchemaSql)
        $wrongSchemaShape = Join-Path $fixtureRoot 'shape-schema-wrong-schema.sql'
        $wrongSchemaSql = @(
            'CREATE TABLE IF NOT EXISTS "private"."students" ('
            '    id uuid'
            ');'
        ) -join [Environment]::NewLine
        [System.IO.File]::WriteAllText($wrongSchemaShape, $wrongSchemaSql)
        [System.IO.File]::WriteAllText($schemaShape, "CREATE TABLE public.students (`n    id uuid`n);`n")
        [System.IO.File]::WriteAllText($dataShape, "COPY public.students (id) FROM stdin;`n\.`n")
        Assert-SqlDumpShape -Path $schemaShape -Kind schema
        Assert-SqlDumpShape -Path $quotedSchemaShape -Kind schema
        $wrongSchemaRejected = $false
        try {
            Assert-SqlDumpShape -Path $wrongSchemaShape -Kind schema
        }
        catch {
            $wrongSchemaRejected = $true
        }
        Assert-TestCondition -Condition $wrongSchemaRejected -Message 'public 이외 schema의 CREATE TABLE을 거부해야 합니다.'
        Assert-SqlDumpShape -Path $dataShape -Kind data
        Assert-SqlDumpShape -Path $quotedDataShape -Kind data
        $wrongDataRejected = $false
        try {
            Assert-SqlDumpShape -Path $wrongDataShape -Kind data
        }
        catch {
            $wrongDataRejected = $true
        }
        Assert-TestCondition -Condition $wrongDataRejected -Message 'public 이외 schema의 COPY data dump를 거부해야 합니다.'

        $tableMigrationOutput = " Local          | Remote         | Time`n----------------|----------------|----------------`n20260912000000 | 20260912000000 | 2026-09-12"
        $tableVersions = @(Get-MigrationVersionsFromOutput -Output $tableMigrationOutput)
        Assert-TestCondition -Condition ($tableVersions.Count -eq 1 -and $tableVersions[0] -eq '20260912000000') -Message '표 형식 migration 목록을 해석해야 합니다.'

        $quotedTableMigrationOutput = " Local          | Remote         | Time`n----------------|----------------|----------------`n``20260804000000`` | ``20260804000000`` | 2026-08-04"
        $quotedTableVersions = @(Get-MigrationVersionsFromOutput -Output $quotedTableMigrationOutput)
        Assert-TestCondition -Condition ($quotedTableVersions.Count -eq 1 -and $quotedTableVersions[0] -eq '20260804000000') -Message '백틱으로 감싼 표 형식 migration 목록을 해석해야 합니다.'

        $nativeCommandPath = Join-Path $fixtureRoot 'supabase.cmd'
        $nativeSecret = 'native-stderr-secret'
        $originalPath = $env:PATH
        try {
            $script:SecretValues.Add($nativeSecret)
            $env:PATH = $fixtureRoot + [System.IO.Path]::PathSeparator + $originalPath

            $successScript = @(
                '@echo off'
                'echo Connecting to remote database... 1>&2'
                'echo migration output'
                'exit /b 0'
            ) -join [Environment]::NewLine
            [System.IO.File]::WriteAllText($nativeCommandPath, $successScript)
            $nativeOutput = Invoke-SupabaseCommand -Arguments @('migration', 'list') -Description 'native stderr self-test'
            Assert-TestCondition -Condition ($nativeOutput -match 'Connecting to remote database...' -and $nativeOutput -match 'migration output') -Message '성공한 native stderr 진행 메시지를 수집해야 합니다.'
            Assert-TestCondition -Condition ($ErrorActionPreference -eq 'Stop') -Message 'native command 이후 ErrorActionPreference를 복원해야 합니다.'

            $failureScript = @(
                '@echo off'
                "echo CLI failure: $nativeSecret 1>&2"
                'exit /b 7'
            ) -join [Environment]::NewLine
            [System.IO.File]::WriteAllText($nativeCommandPath, $failureScript)
            $failureMessage = $null
            try {
                Invoke-SupabaseCommand -Arguments @('migration', 'list') -Description 'native stderr failure self-test' | Out-Null
            }
            catch {
                $failureMessage = $_.Exception.Message
            }
            Assert-TestCondition -Condition ($failureMessage -match '종료 코드 7' -and $failureMessage -match 'CLI failure' -and $failureMessage -match '\[비밀값 숨김\]' -and -not ($failureMessage -match [regex]::Escape($nativeSecret))) -Message 'native command 종료 코드와 안전한 stderr 상세 오류를 처리해야 합니다.'
            Assert-TestCondition -Condition ($ErrorActionPreference -eq 'Stop') -Message 'native command 실패 이후 ErrorActionPreference를 복원해야 합니다.'
        }
        finally {
            $env:PATH = $originalPath
            $script:SecretValues.Remove($nativeSecret) | Out-Null
        }

        $jsonMigrationOutput = "Initialising login role...`n{`"migrations`": [{`"local`": `"20260912000000`", `"remote`": `"20260912000000`", `"time`": `"2026-09-12`"}]}"
        $jsonVersions = @(Get-MigrationVersionsFromOutput -Output $jsonMigrationOutput)
        Assert-TestCondition -Condition ($jsonVersions.Count -eq 1 -and $jsonVersions[0] -eq '20260912000000') -Message '진행 메시지가 앞에 있는 JSON migration 목록을 해석해야 합니다.'

        Write-Host '백업 retention/실패 정리/migration parser 자체 테스트 통과'
    }
    finally {
        if ($null -eq $originalRetention) {
            Remove-Item Env:BACKUP_RETENTION_DAYS -ErrorAction SilentlyContinue
        }
        else {
            $env:BACKUP_RETENTION_DAYS = $originalRetention
        }
        if (Test-Path -LiteralPath $fixtureRoot) {
            $resolvedFixture = Get-FullPath -Path $fixtureRoot
            $tempRoot = (Get-FullPath -Path ([System.IO.Path]::GetTempPath())).TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
            if ($resolvedFixture.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase) -and (Split-Path -Leaf $resolvedFixture) -like 'class-log-backup-test-*') {
                Remove-Item -LiteralPath $resolvedFixture -Recurse -Force
            }
        }
    }
}

function Invoke-Backup {
    $retentionDays = Get-RetentionDays
    Assert-RequiredTools
    $connectionArguments = Get-ConnectionArguments

    $timeZone = [System.TimeZoneInfo]::FindSystemTimeZoneById('Korea Standard Time')
    $nowKst = [System.TimeZoneInfo]::ConvertTimeFromUtc([datetime]::UtcNow, $timeZone)
    $timestamp = $nowKst.ToString('yyyy-MM-dd_HHmm', [System.Globalization.CultureInfo]::InvariantCulture)
    $kinds = @('schema', 'data', 'roles')
    $finalPaths = @{}

    foreach ($kind in $kinds) {
        $finalPath = Join-Path $script:BackupRoot ("{0}_{1}.sql.gz" -f $kind, $timestamp)
        if (Test-Path -LiteralPath $finalPath) {
            throw "같은 분의 정상 백업이 이미 있어 덮어쓰지 않습니다: $([System.IO.Path]::GetFileName($finalPath))"
        }
        $finalPaths[$kind] = $finalPath
    }

    $runId = [guid]::NewGuid().ToString('N')
    $allCurrentPaths = New-Object System.Collections.Generic.List[string]
    $sqlPaths = @{}
    $gzipPartialPaths = @{}
    foreach ($path in $finalPaths.Values) { $allCurrentPaths.Add($path) }
    foreach ($kind in $kinds) {
        $sqlPath = Join-Path $script:BackupRoot (".{0}_{1}_{2}.sql" -f $kind, $timestamp, $runId)
        $gzipPartialPath = $sqlPath + '.gz.partial'
        $sqlPaths[$kind] = $sqlPath
        $gzipPartialPaths[$kind] = $gzipPartialPath
        $allCurrentPaths.Add($sqlPath)
        $allCurrentPaths.Add($gzipPartialPath)
    }

    try {
        $migrationBefore = Get-RemoteMigrationFingerprint -ConnectionArguments $connectionArguments

        foreach ($kind in $kinds) {
            switch ($kind) {
                'schema' { $dumpArguments = @('db', 'dump', '--schema', 'public', '--file', $sqlPaths[$kind]) + $connectionArguments }
                'data' { $dumpArguments = @('db', 'dump', '--data-only', '--use-copy', '--schema', 'public', '--file', $sqlPaths[$kind]) + $connectionArguments }
                'roles' { $dumpArguments = @('db', 'dump', '--role-only', '--file', $sqlPaths[$kind]) + $connectionArguments }
            }

            Invoke-SupabaseCommand -Arguments $dumpArguments -Description "$kind dump" | Out-Null
            if ($kind -ne 'roles') {
                Assert-SqlDumpShape -Path $sqlPaths[$kind] -Kind $kind
            }
        }

        $migrationAfter = Get-RemoteMigrationFingerprint -ConnectionArguments $connectionArguments
        if ($migrationBefore -ne $migrationAfter) {
            throw 'dump 실행 사이에 원격 migration history가 변경되어 이번 backup set을 폐기합니다. 안정된 시점에 다시 실행해 주세요.'
        }

        foreach ($kind in $kinds) {
            Compress-SqlFile -SourcePath $sqlPaths[$kind] -DestinationPath $gzipPartialPaths[$kind]
            Assert-GzipIntegrity -Path $gzipPartialPaths[$kind]
        }

        foreach ($kind in $kinds) {
            [System.IO.File]::Move($gzipPartialPaths[$kind], $finalPaths[$kind])
        }

        foreach ($kind in $kinds) {
            Assert-GzipIntegrity -Path $finalPaths[$kind]
        }
    }
    catch {
        Remove-CurrentRunArtifacts -Paths $allCurrentPaths.ToArray() -BackupRoot $script:BackupRoot
        $safeMessage = Protect-Secrets -Text $_.Exception.Message
        [Console]::Error.WriteLine("Supabase 백업 실패: $safeMessage")
        exit 1
    }

    $currentFileNames = @($kinds | ForEach-Object { [System.IO.Path]::GetFileName($finalPaths[$_]) })
    Write-Host "Supabase public DB backup 완료: $timestamp (KST)"
    foreach ($kind in $kinds) {
        $item = Get-Item -LiteralPath $finalPaths[$kind]
        Write-Host ("생성: {0} ({1} bytes)" -f $item.Name, $item.Length)
    }

    try {
        Invoke-RetentionCleanup -BackupRoot $script:BackupRoot -RetentionDays $retentionDays -NowKst $nowKst -CurrentFileNames $currentFileNames
    }
    catch {
        $safeMessage = Protect-Secrets -Text $_.Exception.Message
        [Console]::Error.WriteLine("새 backup set은 유지했지만 보관기간 정리에 실패했습니다: $safeMessage")
        exit 1
    }
}

$script:ProjectRoot = Get-FullPath -Path (Split-Path -Parent $PSScriptRoot)
$script:BackupRoot = Get-FullPath -Path (Join-Path $script:ProjectRoot 'backups\supabase')

if ($SelfTest) {
    Invoke-SelfTest
    exit 0
}

try {
    Assert-SafeBackupRoot -ProjectRoot $script:ProjectRoot -BackupRoot $script:BackupRoot
    Invoke-Backup
}
catch {
    $safeMessage = Protect-Secrets -Text $_.Exception.Message
    [Console]::Error.WriteLine("Supabase 백업을 시작하지 못했습니다: $safeMessage")
    exit 1
}
