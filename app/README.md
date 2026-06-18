# Ближний круг / Inner Circle

## Рабочая схема

`app/src` теперь является настоящим исходником сайта. `app/dst_0` больше не участвует в сборке и остается только архивной маской прошлого состояния.

`app/public` хранит статические файлы: изображения, видео, шрифты, PDF, SVG и старый runtime анимаций.

`app/dist` создается сборкой и не редактируется вручную.

## Команды

```bash
npm run build
npm run dev
npm run serve
```

- `npm run build` собирает `app/dist` из `app/src` и `app/public`.
- `npm run dev` запускает локальный сервер, следит за `src` и `public`, пересобирает сайт и обновляет открытую страницу.
- `npm run serve` запускает локальный просмотр без слежения за файлами.

## Где что менять

- `src/pages` - страницы сайта по тем же маршрутам, что и в `dist`.
- `src/layouts/default.html` - общий HTML-каркас страницы.
- `src/partials/headers` - шапка RU/EN.
- `src/partials/footers` - варианты футера.
- `src/partials/page-nav` - нижние переходы между страницами.
- `src/partials/loaders` - загрузчик.
- `src/partials/global` - мелкие глобальные блоки.
- `src/styles/legacy` - базовые стили старого макета, разложенные по компонентам.
- `src/styles/components`, `src/styles/features`, `src/styles/pages` - новые и точечные стили.
- `src/scripts` - новый JS поверх старого runtime.
- `public/legacy-runtime.js` - большой старый JS с анимациями и переходами. Его пока не режем.

## Как устроена страница

Страница в `src/pages` содержит короткий блок настроек сверху и обычный HTML ниже. Общие блоки подключаются так:

```html
{{> footers/footer.inner-circle.ru.html }}
{{> page-nav/page-nav.inner-circle.ru.html }}
{{> headers/header.ru.html }}
```

Так один футер или шапка меняются в одном файле и применяются ко всем страницам, которые этот файл подключают.

## Правило

Не править `dist` руками. Не использовать `dst_0` как рабочую папку. Все дальнейшие правки делаются в `src` и `public`.
