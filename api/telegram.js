// api/telegram.js
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
if (!TELEGRAM_TOKEN) {
  console.warn("⚠️ Warning: TELEGRAM_TOKEN not set in env.");
}

const TELEGRAM_API = (method) =>
  `https://api.telegram.org/bot${TELEGRAM_TOKEN}/${method}`;

function extractFirstUrl(text) {
  if (!text) return null;
  const urlRegex = /(https?:\/\/[^\s]+)/i;
  const m = text.match(urlRegex);
  return m ? m[0] : null;
}

async function tgRequest(method, body) {
  const res = await fetch(TELEGRAM_API(method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

function buildCaption(videoData) {
  const author = videoData.author || "";
  const desc = videoData.description || "";
  let caption = `👤 *${author}*\n\n${desc}`;
  if (caption.length > 3500) caption = caption.slice(0, 3497) + "...";
  return caption;
}

function buildInlineKeyboard(downloadLinks = []) {
  const buttons = downloadLinks.map((link) => {
    return [{ text: link.text || "Download", url: link.href }];
  });
  return { inline_keyboard: buttons };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(200).send("OK");
    return;
  }

  try {
    const update = req.body;
    const message =
      update.message || update.edited_message || update.channel_post;
    const chatId = message?.chat?.id;
    if (!message || !chatId) {
      res.status(200).json({ ok: true });
      return;
    }

    const text = message.text || message.caption || "";
    const url = extractFirstUrl(text);
    if (!url) {
      await tgRequest("sendMessage", {
        chat_id: chatId,
        text: "Kirimkan link TikTok (contoh: https://www.tiktok.com/@user/video/12345)",
      });
      res.status(200).json({ ok: true });
      return;
    }

    // Call nikahin API
    const apiUrl = `https://nikahin.xyz/cok.php?link=${encodeURIComponent(
      url
    )}`;
    const apiResp = await fetch(apiUrl, {
      headers: { Accept: "application/json" },
    });
    const json = await apiResp.json();

    const videoData = json.video_data;
    if (!videoData) {
      await tgRequest("sendMessage", {
        chat_id: chatId,
        text: "❌ Maaf, data video tidak ditemukan.",
      });
      res.status(200).json({ ok: true });
      return;
    }

    const caption = buildCaption(videoData);
    const keyboard = buildInlineKeyboard(videoData.download_links || []);

    // Cari link MP4
    const mp4Link = (videoData.download_links || []).find((l) =>
      (l.text || "").toLowerCase().includes("mp4")
    )?.href;

    if (mp4Link) {
      // Kirim langsung videonya (preview playable)
      await tgRequest("sendVideo", {
        chat_id: chatId,
        video: mp4Link,
        caption,
        parse_mode: "Markdown",
        reply_markup: keyboard,
      });
    } else {
      // fallback: kirim teks + tombol
      await tgRequest("sendMessage", {
        chat_id: chatId,
        text: caption,
        parse_mode: "Markdown",
        reply_markup: keyboard,
      });
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Handler error:", err);
    res.status(200).json({ ok: false, error: String(err) });
  }
}
