# Запуск в сети: Supabase + Cloudflare Pages + Worker

## 1. Новая база без удаления старой

В Supabase открой SQL Editor проекта, которым хочешь пользоваться (можно прежним). Выполни **весь** `supabase/schema.sql`. Новые таблицы начинаются на `nw_`; существующие `lw_*` не затрагиваются. Проверь выполнение без SQL-ошибок. Скрипт не читает старые миры.

В Project Settings → API возьми **Project URL** и **publishable/anon API key**. НИКОГДА не вставляй `service_role` в приложение или переписку. В Supabase Authentication убедись, что Email/Password поддерживается, а CORS/Allowed redirect настроены для своего нового домена.

## 2. Веб-приложение для iPhone

Все файлы уже подготовлены в `public/`. Никакая локальная компиляция не требуется.

**Cloudflare Pages через GitHub:** создай независимый проект `living-world-next`, подключи новый репозиторий `korotkowdoc-arch/living-world-next`, укажи `public` как output directory, **без build command**, production branch `main`. Это автоматическая публикация на каждый новый push.

**Или direct upload из ПК:** `npx wrangler pages deploy public --project-name living-world-next` после авторизации и создания Cloudflare Pages проекта. Это альтернативный способ, не обязательно совмещать его с Git-integrated Pages.

Открой новый HTTPS-адрес на iPhone. На первом входе вводишь URL Supabase и его публичный ключ, затем email/password своего пользователя. Создай тестовый мир, открой заново, проверь сохранение, затем новую сцену и новую ветку.

## 3. OAuth для ChatGPT + отдельный MCP Worker

**Подготовлены исходники** для resource metadata, OAuth consent screen и проверки токена конкретного OAuth-клиента. Обменом authorization code + PKCE и refresh занимается сам Supabase Auth. **Работающий онлайн-коннектор ещё не подтверждён.**

1. В Supabase Authentication → OAuth Server включи OAuth 2.1 server capabilities и укажи Authorization Path `/oauth/consent.html`. В Authentication → URL Configuration Site URL должен указывать на **новый Cloudflare Pages-домен**, на котором лежит этот файл.
2. Создай (или динамически зарегистрируй через ChatGPT, если разрешено) отдельный OAuth client. Его Redirect URI берётся **из настройки твоего ChatGPT-подключения**, не угадывай его. Для client-а нужна выдача authorization code + PKCE и refresh tokens. Проверь discovery metadata Supabase на поддерживаемые scope и `offline_access` либо аналог.
3. В `worker/wrangler.toml` замени `SUPABASE_URL`, `MCP_PUBLIC_URL` (`https://имя.workers.dev/mcp`) и `SUPABASE_OAUTH_CLIENT_ID` на реальные значения OAuth-клиента. Сохранить только публичный API key в Worker secret `npx wrangler secret put SUPABASE_ANON_KEY --config worker/wrangler.toml`. Не используй service_role.
4. Опубликуй Worker `npx wrangler deploy --config worker/wrangler.toml`. Проверь его `/health` и `/.well-known/oauth-protected-resource`. Состояние `oauth_metadata_ready=true` лишь показывает заполнение конфигурации, а не успех входа.
5. Добавь кастомное MCP-подключение из доступного твоему аккаунту интерфейса ChatGPT, укажи URL `/mcp`, разреши OAuth доступ в consent-экране. Проверяй команду `list_worlds`, затем реальный `save_scene` и чтение той же сцены на iPhone. Возможность настройки custom MCP зависит от доступа/плана аккаунта; через мобильное приложение создание такого подключения может быть недоступно — первичную настройку проводи в браузере на ПК.

Если ChatGPT использует Dynamic Client Registration, ID клиента может измениться; `SUPABASE_OAUTH_CLIENT_ID` в Worker должен соответствовать **фактически выданному** клиенту. Нельзя подменять его старым ID без проверки.

## 4. Windows-терминал: заливка исходников в отдельный репозиторий

Из распакованной папки проекта, где есть `package.json`, запусти одну команду:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\publish.ps1
```

Проверяет тесты, создаёт **новый** `korotkowdoc-arch/living-world-next` через уже установленный/авторизованный GitHub CLI (`gh`). Если репозиторий уже существует, скрипт без изменений останавливается — чужое содержимое не затирает. Не выполняет SQL и не публикует облачный Worker.

## 5. Реальные проверки после развёртывания

- Создай мир на iPhone одним предложением, закрой Safari, открой снова — запись должна сохраниться.
- Добавь инструкцию о непримиримости Гарри/Малфоя; перезапусти сайт, проверь правило.
- Добавь две текстовые сцены с резервным импортом, сделай «На это» на первой, введи альтернативу; старые две сцены должны остаться доступными при переключении ветки.
- Попробуй авторизоваться другим Supabase-аккаунтом и убедись, что чужих миров/сцен нет.
- Одновременно сохрани два разных текста с одним и тем же expected_head: один должен получить CAS conflict. Повтор с тем же `request_id` не создаёт второго ID.
- Сверь на настоящих сценах, что непримиримость, психология, знания и ресурсы остались правильными. Компиляция и автотесты не доказывают литературной убедительности.
