export class DeepSeekPrompts {
  static TELEGRAM_RU =
    "Подготовь эстетичный Telegram-текст для автопостинга в спокойном люксовом и деловом тоне.\n\
Подача: люди знают своё дело и рассказывают интересно, тезисно, без демонстративной роскоши и без давления на деньги.\n\
Исходный текст уже написан другой нейросетью: не переписывай агрессивно, а аккуратно выровняй ритм, структуру и Telegram-верстку.\n\
Сохрани факты, имена, цены, даты, адреса, ссылки, контакты и смысл без выдумок.\n\
Можно использовать 1-2 уместных emoji максимум, только если они усиливают атмосферу и не удешевляют подачу.\n\
Используй Telegram HTML для легкой верстки: <b>для главного акцента</b>, <i>для мягкого оттенка</i>, при необходимости <a href=\"...\">ссылка</a>.\n\
Не используй Markdown, неподдерживаемые HTML-теги, таблицы, крикливые CTA, чрезмерные emoji и длинные списки.\n\
Если у поста есть медиа, текст станет caption первого медиа в альбоме и должен красиво смотреться под сеткой Telegram.\n\
Сделай текст плотным, читаемым, визуально аккуратным и не длиннее {{telegram_limit}} символов.";

  static TELEGRAM_EN =
    "Prepare an elegant Telegram text for autoposting in a calm luxury-business tone.\n\
The voice should feel like people who know their craft and explain it with taste: interesting, concise, confident, never flashy about money.\n\
The source text was already generated elsewhere, so do not rewrite it aggressively; refine rhythm, structure, emphasis, and Telegram formatting.\n\
Keep facts, names, prices, dates, addresses, links, contacts, and meaning unchanged. Do not invent details.\n\
Use 1-2 tasteful emoji maximum, only when they support the atmosphere and do not cheapen the tone.\n\
Use Telegram HTML for light layout: <b>for the key accent</b>, <i>for a softer nuance</i>, and <a href=\"...\">links</a> when needed.\n\
Do not use Markdown, unsupported HTML tags, tables, loud calls to action, excessive emoji, or long lists.\n\
If the post has media, this text will be the caption of the first media item in a Telegram album and must look good under the media grid.\n\
Make the result compact, readable, visually neat, and no longer than {{telegram_limit}} characters.";

  static VK_RU =
    "Подготовь текст для VK-поста в спокойном люксовом и деловом тоне.\n\
Подача должна быть живой, уверенной и понятной для аудитории ВКонтакте: меньше Telegram-верстки, больше естественного plain text.\n\
Исходный текст уже написан другой нейросетью: не переписывай агрессивно, а аккуратно выровняй ритм, структуру и подачу.\n\
Сохрани факты, имена, цены, даты, адреса, ссылки, контакты и смысл без выдумок.\n\
Можно использовать 1-2 уместных emoji максимум, если они выглядят дорого и не удешевляют текст.\n\
Не используй HTML, Markdown, таблицы, крикливые CTA и длинные списки.\n\
Сделай текст плотным, эстетичным, читаемым и подходящим для wall.post.message.";

  static VK_EN =
    "Prepare a VK wall post text in a calm luxury-business tone.\n\
The voice should feel natural, confident, and clear for VK audience: less Telegram-style layout, more polished plain text.\n\
The source text was already generated elsewhere, so do not rewrite it aggressively; refine rhythm, structure, and delivery.\n\
Keep facts, names, prices, dates, addresses, links, contacts, and meaning unchanged. Do not invent details.\n\
Use 1-2 tasteful emoji maximum, only when they look premium and do not cheapen the post.\n\
Do not use HTML, Markdown, tables, loud calls to action, or long lists.\n\
Make the result compact, elegant, readable, and suitable for wall.post.message.";
}
