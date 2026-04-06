# Кастомные 3D-иконки (GLB)

Файлы кладите сюда: `public/assets/3d-icons/<type>.glb` — в приложении они доступны как **`/assets/3d-icons/<type>.glb`**.

## Автоподстановка в 3D

По умолчанию 3D-слой подставляет модель по шаблону **`/assets/3d-icons/${type}.glb`** (см. `DEFAULT_ICON_3D_ASSET_BASE_URL` в `src/components/Rink3D/icon3dAssets.js`). Дополнительные пропы на `HockeyBoard` не обязательны.

Если файла нет (404), показывается прежний примитив.

## Отключить автопуть

На `HockeyBoard`: **`icon3dAssetBaseUrl=""`** — тогда используются только явные `icon3dGlbUrls` и таблица `ICON_3D_GLB_URLS` в коде.

## Имена `type`

`player`, `playerTriangle`, `forward`, `defender`, `coach`, `goalkeeper`, `puck`, `puckCluster`, `cone`, `barrier`, `goal`, `numberMark`.

## Подгонка

Общий масштаб: **`ICON_3D_GLB_BASE_SCALE`** в `src/components/Rink3D/icon3dAssets.js` (сейчас ~2.85 — увеличьте, если модели всё ещё мелкие).

По типам: `ICON_3D_GLB_SCALE`, поворот / смещение: `ICON_3D_GLB_ROTATION`, `ICON_3D_GLB_POSITION`.

Цвета берутся из GLB; покраска цветом линии доски на GLB **не** накладывается (иначе при чёрном цвете линии модели становились чёрными). Исключение: **ворота** в 3D по-прежнему красные.

## Скорость загрузки (продакшен)

- **Главное** — размер файла: ~20+ МБ на одну модель даёт долгую первую загрузку по сети. Экспортируйте из Blender/DCC с **Draco/meshopt**, упрощённой геометрией, без лишних 4K-текстур; цель — **сотни КБ–несколько МБ** на иконку, если возможно (`gltf-transform` и аналоги).
- В коде на тактической доске и видео включён **фоновый прогрев** (`useGLTF.preload` в idle) для путей из `ICON_3D_PRELOAD_TYPES` в `icon3dAssets.js`, чтобы к моменту переключения в 3D файлы чаще уже были в кэше браузера.
- На nginx для `/assets/3d-icons/*.glb` имеет смысл долгий кэш: `Cache-Control: public, max-age=31536000, immutable` (после деплоя меняется хэш только если меняете файлы).
