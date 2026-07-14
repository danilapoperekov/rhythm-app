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
