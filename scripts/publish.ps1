# Run from the unpacked project directory: powershell -ExecutionPolicy Bypass -File .\scripts\publish.ps1
$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$repo = 'korotkowdoc-arch/living-world-next'
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Git не найден. Нужен git в Windows PATH.' }
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw 'GitHub CLI (gh) не найден. Используй настроенный на ПК gh.' }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw 'Node/npm не найдены: нужны для локальных проверок.' }
& gh auth status
if ($LASTEXITCODE -ne 0) { throw 'gh не авторизован. Проверь GitHub CLI.' }
& gh repo view $repo --json name 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) { throw "Репозиторий $repo уже существует. Ничего не изменено во избежание перезаписи." }
& npm test
if ($LASTEXITCODE -ne 0) { throw 'Тесты не прошли, публикация остановлена.' }
& npm run check
if ($LASTEXITCODE -ne 0) { throw 'Проверка синтаксиса не прошла, публикация остановлена.' }
if (Test-Path '.git') { throw 'В папке уже есть .git — перед публикацией проверь, что это независимый репозиторий.' }
& git init -b main
if ($LASTEXITCODE -ne 0) { throw 'Не удалось выполнить git init.' }
& git add .
if ($LASTEXITCODE -ne 0) { throw 'Не удалось добавить файлы.' }
& git commit -m 'feat: initial LIVING WORLD NEXT mobile-first causal foundation'
if ($LASTEXITCODE -ne 0) { throw 'Не удалось создать начальный коммит (проверь git user.name и user.email).' }
& gh repo create $repo --public --description 'Mobile-first causal interactive worlds' --source . --remote origin --push
if ($LASTEXITCODE -ne 0) { throw 'Создание или публикация репозитория завершилась с ошибкой. Проверь gh repo view прежде чем повторять.' }
Write-Host "Готово: https://github.com/$repo"
