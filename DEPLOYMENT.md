# Защищенный ИИ-сервер для «Ритма»

Render в нашем случае не используем: если он просит карту, просто закрываем этот сценарий. Для PWA оставляем GitHub Pages, а ИИ-API выносим в Cloudflare Worker. Это нужно, чтобы ключ OpenAI не попадал в iPhone-клиент, веб-клиент или GitHub.

## Что будет бесплатно, а что нет

Cloudflare Worker можно развернуть на бесплатном плане. По официальной документации Cloudflare Workers Free включает лимит запросов в день, этого достаточно для личного приложения.

Важно: OpenAI API оплачивается отдельно от ChatGPT. Если у аккаунта OpenAI нет API-кредитов или биллинга, хостинг все равно запустится, но функции расшифровки, анализа, генерации медитаций и озвучки будут возвращать ошибку настройки ИИ. Локальные записи, дневник, задачи, привычки и PWA продолжают работать без этого.

## Переменные и секреты

В репозиторий нельзя добавлять секреты. В Cloudflare нужно задать:

- `OPENAI_API_KEY` — ключ OpenAI, только как secret в Cloudflare.
- `RHYTHM_ACCESS_TOKEN` — личный длинный токен доступа к твоему ИИ-серверу. Это не OpenAI-ключ, а пароль между PWA и Worker.
- `RHYTHM_ALLOWED_ORIGINS` уже задан в `wrangler.toml` как `https://danilapoperekov.github.io`.
- `RHYTHM_AI_MODEL` задан как `gpt-5.6-terra`; перед сменой модели сверяемся с официальной документацией OpenAI.
- `RHYTHM_LLM_PROVIDER` — текстовый провайдер: `openai` по умолчанию или `openai-compatible` для локальных/внешних chat-completions серверов.
- `RHYTHM_LLM_MODEL` — модель для текстовых сценариев, если она отличается от `RHYTHM_AI_MODEL`.
- `RHYTHM_LLM_BASE_URL` — базовый URL OpenAI-compatible сервера, например `http://127.0.0.1:8080/v1` для локального Bonsai.
- `RHYTHM_LLM_API_KEY` — токен для внешнего OpenAI-compatible сервера. Для локального сервера обычно не нужен.

## Локальный Bonsai или другой OpenAI-compatible LLM

Текстовые функции «Ритма» можно переключить с OpenAI Responses API на локальную модель, если она запущена как OpenAI-compatible chat-completions сервер. Это подходит для разборов дневника, импорта, генерации сценариев медитаций и текстового ассистента.

Для Bonsai 27B сейчас лучше использовать локальный GGUF/vLLM/llama.cpp запуск. На странице модели Hugging Face указано, что GGUF-вариант запускается через OpenAI-compatible сервер, но сам Bonsai 27B сейчас не развёрнут ни у одного Hugging Face Inference Provider. Поэтому `https://router.huggingface.co/v1` с этой конкретной моделью не является надёжным прямым вариантом, пока provider не появится.

Пример локального запуска сервера приложения с Bonsai:

```powershell
$env:RHYTHM_LLM_PROVIDER = "openai-compatible"
$env:RHYTHM_LLM_BASE_URL = "http://127.0.0.1:8080/v1"
$env:RHYTHM_LLM_MODEL = "prism-ml/Bonsai-27B-gguf"
$env:RHYTHM_ACCESS_TOKEN = "длинный_личный_токен_для_PWA"
node server.mjs
```

Если нужен голосовой ввод или ИИ-озвучка медитаций, дополнительно нужен `OPENAI_API_KEY`: Bonsai закрывает текстовый разбор, но не speech-to-text и не TTS.

## Вариант 1: развертывание через GitHub без установки npm на Windows

Этот вариант лучше для текущего компьютера: GitHub сам запустит Cloudflare deploy.

В GitHub открой репозиторий → **Settings** → **Secrets and variables** → **Actions** → **New repository secret** и добавь:

- `CLOUDFLARE_API_TOKEN` — токен Cloudflare с правом деплоя Workers.
- `CLOUDFLARE_ACCOUNT_ID` — Account ID из Cloudflare dashboard. Нужен именно ID аккаунта, обычно это длинная строка из букв `a-f` и цифр, без пробелов и без названия аккаунта.
- `OPENAI_API_KEY` — ключ OpenAI API.
- `RHYTHM_ACCESS_TOKEN` — длинный личный токен для входа PWA в твой Worker.

После этого открой **Actions** → **Deploy Rhythm AI Worker** → **Run workflow**.

Если workflow падает с `object identifier is invalid`, проверь `CLOUDFLARE_ACCOUNT_ID`: чаще всего туда случайно вставляют название аккаунта, email, zone id или значение с пробелом. Правильный Account ID находится в Cloudflare dashboard на странице аккаунта/Workers.

Когда workflow завершится, в логах Cloudflare deploy появится адрес вида:

```text
https://rhythm-ai.<твой-аккаунт>.workers.dev
```

Открой PWA → «Настройки» → «ИИ-сервер» и введи:

- HTTPS-адрес Worker;
- тот же `RHYTHM_ACCESS_TOKEN`, который был добавлен в GitHub Secrets.

## Вариант 2: развертывание через Windows с установленным npm

В терминале из папки проекта:

```powershell
npx wrangler login
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put RHYTHM_ACCESS_TOKEN
npx wrangler deploy
```

Команды `secret put` попросят вставить значения прямо в терминал. Не присылай эти значения в чат.

После деплоя Cloudflare покажет адрес вида:

```text
https://rhythm-ai.<твой-аккаунт>.workers.dev
```

Открой PWA → «Настройки» → «ИИ-сервер» и введи:

- HTTPS-адрес Worker;
- тот же `RHYTHM_ACCESS_TOKEN`, который был задан в Cloudflare.

## Что защищено

- `OPENAI_API_KEY` хранится только в Cloudflare secrets.
- PWA отправляет запросы только на указанный HTTPS API.
- Worker принимает запросы только с разрешенного origin.
- Для API нужен Bearer-токен.
- Аудио и дневниковый текст не пишутся Worker-ом на диск и не сохраняются в логах проекта.
- При ошибке сети или ИИ локальные черновики в приложении не теряются.

## Проверка

После подключения в PWA проверь:

- голосовой ассистент создает карточки, но не сохраняет их без подтверждения;
- импорт истории показывает предварительный результат перед сохранением;
- генерация медитации работает только после явного согласия;
- без интернета локальные записи остаются на устройстве.
