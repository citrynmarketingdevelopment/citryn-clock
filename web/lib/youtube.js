const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

function cleanId(value) {
  const candidate = String(value || "").trim();
  return YOUTUBE_ID_PATTERN.test(candidate) ? candidate : null;
}

function parseFromUrl(raw) {
  const input = String(raw || "").trim();
  if (!input) return null;

  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    try {
      parsed = new URL(`https://${input}`);
    } catch {
      return null;
    }
  }

  const host = parsed.hostname.toLowerCase();
  const parts = parsed.pathname.split("/").filter(Boolean);

  if (host === "youtu.be" || host.endsWith(".youtu.be")) {
    return cleanId(parts[0]);
  }

  if (!(host === "youtube.com" || host.endsWith(".youtube.com"))) {
    return null;
  }

  const queryId = cleanId(parsed.searchParams.get("v")) || cleanId(parsed.searchParams.get("vi"));
  if (queryId) return queryId;

  if (parts.length >= 2 && ["embed", "shorts", "live", "v", "vi"].includes(parts[0])) {
    return cleanId(parts[1]);
  }

  return null;
}

export function getYouTubeVideoId(value) {
  const direct = cleanId(value);
  if (direct) return direct;
  return parseFromUrl(value);
}

export function getYouTubeWatchUrl(videoId) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function getYouTubeEmbedUrl(videoId, startSeconds = 0) {
  const start = Math.max(0, Number(startSeconds) || 0);
  const startQuery = start > 0 ? `?start=${Math.floor(start)}` : "";
  return `https://www.youtube.com/embed/${videoId}${startQuery}`;
}

export function getYouTubeThumbnailUrl(videoId) {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}
