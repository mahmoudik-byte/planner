# Ежедневник

Веб-приложение: задачи (Сейчас/Сегодня/Завтра/Неделя), мысли, цели на жизнь. Общий доступ для семьи через Supabase. Работает на любом устройстве через браузер, ставится на телефон как PWA.

## Стек
- Чистый HTML + JS (без сборки)
- Supabase (БД + Auth)
- PWA (иконка на телефон, оффлайн-кэш оболочки)

## Запуск — пошагово

### 1. Создать проект Supabase
1. Зайти на https://supabase.com и зарегистрироваться (бесплатно).
2. **New Project** → имя `planner`, пароль БД любой надёжный → создать (займёт ~2 минуты).
3. Когда проект готов, открыть **SQL Editor** в боковой панели → **New Query**.
4. Скопировать содержимое `schema.sql` из этой папки → вставить → **Run**.
5. Открыть **Settings → API**. Скопировать:
   - **Project URL** (вида `https://xxxxxx.supabase.co`)
   - **anon public** ключ (длинная строка)

### 2. Вставить ключи
Открыть `config.js`, заменить заглушки:
```js
window.SUPABASE_CONFIG = {
  url: 'https://xxxxxx.supabase.co',
  anonKey: 'eyJ....'
};
```

### 3. Запустить локально (для проверки)
В папке проекта в PowerShell:
```powershell
python -m http.server 8000
```
Открыть http://localhost:8000 — увидеть форму входа.

> Если нет Python: `winget install Python.Python.3.12` или открыть `index.html` через расширение **Live Server** в VS Code.

### 4. Создать аккаунт
1. На форме входа ввести email и пароль → **Регистрация**.
2. По умолчанию Supabase требует подтверждения email. Чтобы отключить (для семейного использования):
   - Supabase → **Authentication → Providers → Email** → выключить **Confirm email** → Save.
3. Войти своим email/паролем.

### 5. Добавить семью
1. Каждый член семьи регистрируется через ту же страницу.
2. Чтобы они видели общие задачи — нужно добавить их в ваш workspace. Пока в UI этого нет (можно добавить позже), временно через SQL Editor:
```sql
-- 1. Узнать ID человека (он должен сначала зарегистрироваться)
select id, email from auth.users;

-- 2. Узнать ID своего workspace
select * from workspaces;

-- 3. Добавить человека
insert into workspace_members (workspace_id, user_id, role)
values ('ID_WORKSPACE', 'ID_USER', 'member');
```

### 6. Опубликовать в интернет (GitHub Pages)
1. Создать новый репозиторий на GitHub `planner` (приватный).
2. В папке `planner`:
   ```powershell
   git init
   git add .
   git commit -m "init"
   git branch -M main
   git remote add origin https://github.com/mahmoudik-byte/planner.git
   git push -u origin main
   ```
3. На GitHub: **Settings → Pages → Source: Deploy from a branch → main / root → Save**.
4. Через минуту откроется https://mahmoudik-byte.github.io/planner/
5. (Опционально) привязать поддомен `planner.vintikshop.ru` через DNS + Pages custom domain.

### 7. Установить на телефон
1. Открыть сайт в Chrome/Safari на телефоне.
2. Меню браузера → **Установить приложение** / **На экран «Домой»**.
3. Появится иконка — открывается как обычное приложение.

## Структура файлов
```
planner/
  index.html       # разметка
  styles.css       # стили (тёмная тема, адаптив)
  app.js           # логика, Supabase
  config.js        # ключи (НЕ коммитить с реальными ключами в публичный репо)
  schema.sql       # таблицы и RLS
  manifest.json    # PWA
  sw.js            # service worker (оффлайн)
  icons/           # иконки 192/512
  README.md
```

## Дальнейшие идеи
- Раздел «Управление командой» в UI (приглашать по email)
- Напоминания через Telegram-бота (для пушей на телефон без приложения)
- Повторяющиеся задачи: автогенерация следующего вхождения после выполнения
- Поиск по мыслям
- Фильтр по автору («что добавил Petya»)
- Экспорт мыслей в markdown
