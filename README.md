# Electron WebRTC Screen Call

Простой Electron-проект для P2P-звонка по hash-id с live-трансляцией экрана через WebRTC.

## Что умеет

- Автогенерирует hash-id и сохраняет его в профиле приложения.
- Подключается к собеседнику по ID.
- Использует только screen share, без камеры и микрофона.
- Запрашивает 60 FPS и максимально доступное разрешение экрана.
- Работает через обычный WebRTC P2P, signaling вынесен в маленький WebSocket-сервер.

## Установка

```bash
npm install
```

## Запуск signaling server

```bash
npm run signal
```

По умолчанию сервер слушает `ws://localhost:3030`.

Для удалённого сервера:

```bash
PORT=3030 npm run signal
```

## Запуск Electron app

```bash
npm start
```

Если signaling server находится не локально:

```bash
SIGNAL_SERVER_URL=ws://YOUR_HOST:3030 npm start
```

## Как протестировать

1. Подними signaling server.
2. Запусти приложение на двух клиентах.
3. Скопируй hash-id с первого клиента.
4. На втором вставь этот ID и нажми `Позвонить`.
5. На принимающей стороне подтверди входящий звонок и выбери экран.

## Структура

- `src/main.js` — Electron main process, окно и display media handler.
- `src/preload.js` — безопасный bridge для профиля и конфига.
- `src/renderer.html` — интерфейс.
- `src/renderer.js` — WebRTC + signaling клиент.
- `signal/server.js` — минимальный signaling server на `ws`.

## Важно

- Для реального интернета почти всегда нужен публичный signaling server.
- Для сложных NAT-сетей может понадобиться свой TURN-сервер.
- На macOS отдельно нужен системный Screen Recording permission.

## Сборка готового .exe (Windows)

### 1. Установи зависимости
```cmd
npm install
```

### 2. Собери установщик
```cmd
npm run build
```

Готовый `.exe` установщик появится в папке `dist/`.  
После установки приложение запускается как обычная программа — никаких терминалов.

### Другие платформы
```cmd
npm run build:mac    # → .dmg
npm run build:linux  # → .AppImage
```

### Иконка (опционально)
Положи в папку `assets/`:
- `icon.ico` — для Windows (256×256)
- `icon.icns` — для macOS
- `icon.png` — для Linux (512×512)

Без иконки соберётся с дефолтной иконкой Electron.

## Как поменять иконку приложения

### Windows

1. Создай или скачай иконку в формате `.ico` размером **256×256** пикселей.
   Онлайн-конвертер: https://convertio.co/png-ico/

2. Переименуй файл в `icon.ico` и положи в папку `assets/`:
   ```
   electron-webrtc-screen-call/
   └── assets/
       └── icon.ico   ← сюда
   ```

3. Пересобери:
   ```cmd
   npm run build
   ```

Иконка появится у `.exe` файла и в панели задач.

### macOS / Linux

- macOS: `assets/icon.icns` (512×512)
- Linux: `assets/icon.png` (512×512)
