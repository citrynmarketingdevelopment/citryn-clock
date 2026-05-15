"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { getYouTubeEmbedUrl } from "@/lib/youtube";

function formatCommentTime(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

async function parseJsonSafe(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: "Unexpected response." };
  }
}

let youtubeApiPromise = null;

function loadYouTubeApi() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("YouTube API can only run in the browser."));
  }
  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }
  if (youtubeApiPromise) {
    return youtubeApiPromise;
  }

  youtubeApiPromise = new Promise((resolve) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof previousReady === "function") {
        previousReady();
      }
      resolve(window.YT);
    };

    const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
    if (!existing) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      document.body.appendChild(script);
    }
  });

  return youtubeApiPromise;
}

export default function KitchenReviewPage() {
  const params = useParams();
  const token = params?.token;
  const playerMountRef = useRef(null);
  const playerRef = useRef(null);
  const timestampRef = useRef(0);

  const [video, setVideo] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [currentTimestamp, setCurrentTimestamp] = useState(0);
  const [form, setForm] = useState({
    authorEmail: "",
    body: "",
  });

  useEffect(() => {
    timestampRef.current = Math.max(0, Math.floor(currentTimestamp));
  }, [currentTimestamp]);

  const loadVideo = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/mojos-kitchen/review/${token}`, { cache: "no-store" });
      const data = await parseJsonSafe(response);
      if (!response.ok) {
        setError(data.error ?? "Unable to load review link.");
        return;
      }
      setVideo(data.video);
    } catch {
      setError("Unable to load review link.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadVideo();
  }, [loadVideo]);

  useEffect(() => {
    if (!video?.youtubeVideoId || !playerMountRef.current) {
      return undefined;
    }

    let cancelled = false;

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !playerMountRef.current) return;

        if (playerRef.current?.destroy) {
          playerRef.current.destroy();
        }

        playerRef.current = new YT.Player(playerMountRef.current, {
          width: "100%",
          height: "100%",
          videoId: video.youtubeVideoId,
          playerVars: {
            start: timestampRef.current,
          },
          events: {
            onReady: (event) => {
              if (timestampRef.current > 0) {
                event.target.seekTo(timestampRef.current, true);
              }
            },
            onStateChange: (event) => {
              if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
                const seconds = Math.max(0, Math.floor(event.target.getCurrentTime() || 0));
                setCurrentTimestamp(seconds);
              }
            },
          },
        });
      })
      .catch(() => {
        setError("Unable to initialize YouTube player.");
      });

    return () => {
      cancelled = true;
      if (playerRef.current?.destroy) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, [video?.youtubeVideoId]);

  async function onSubmit(event) {
    event.preventDefault();
    if (!token) return;

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/mojos-kitchen/review/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorEmail: form.authorEmail,
          body: form.body,
          timestampSeconds: currentTimestamp,
        }),
      });
      const data = await parseJsonSafe(response);
      if (!response.ok) {
        setError(data.error ?? "Unable to submit comment.");
        return;
      }

      setVideo((current) => {
        if (!current) return current;
        return {
          ...current,
          comments: [...(current.comments ?? []), data.comment].sort((a, b) => {
            if (a.timestampSeconds !== b.timestampSeconds) {
              return a.timestampSeconds - b.timestampSeconds;
            }
            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          }),
        };
      });
      setForm((current) => ({ ...current, body: "" }));
    } catch {
      setError("Unable to submit comment.");
    } finally {
      setSubmitting(false);
    }
  }

  function jumpTo(seconds) {
    const safe = Math.max(0, Math.floor(Number(seconds) || 0));
    setCurrentTimestamp(safe);
    if (playerRef.current?.seekTo) {
      playerRef.current.seekTo(safe, true);
      if (playerRef.current.pauseVideo) {
        playerRef.current.pauseVideo();
      }
    }
  }

  const commentCount = useMemo(() => video?.comments?.length ?? 0, [video]);
  const embedUrl = useMemo(() => {
    if (!video?.youtubeVideoId) return null;
    return getYouTubeEmbedUrl(video.youtubeVideoId, currentTimestamp);
  }, [video, currentTimestamp]);

  if (loading) {
    return <main className="mk-review-shell">Loading review video...</main>;
  }

  if (!video) {
    return <main className="mk-review-shell">{error || "Review link not found."}</main>;
  }

  return (
    <main className="mk-review-shell">
      <section className="mk-review-card">
        <header className="mk-review-header">
          <h1>{video.title || "YouTube review"}</h1>
          <p>Watch the YouTube video and leave revision notes with a timestamp in seconds.</p>
        </header>

        {embedUrl ? (
          <div className="mk-review-player-wrap">
            <div ref={playerMountRef} className="mk-review-player" />
          </div>
        ) : (
          <p className="mk-empty">
            Invalid YouTube link.{" "}
            <a href={video.fileUrl} target="_blank" rel="noreferrer">
              Open raw URL
            </a>
          </p>
        )}

        <section className="mk-review-compose">
          <h2>Leave a Comment</h2>
          <p>Timestamp: {formatCommentTime(currentTimestamp)}</p>
          <form onSubmit={onSubmit}>
            <input
              required
              type="email"
              placeholder="Your email"
              value={form.authorEmail}
              onChange={(event) => setForm((current) => ({ ...current, authorEmail: event.target.value }))}
            />
            <input
              type="number"
              min={0}
              step={1}
              value={currentTimestamp}
              onChange={(event) => setCurrentTimestamp(Math.max(0, Number(event.target.value) || 0))}
              placeholder="Timestamp in seconds"
            />
            <textarea
              required
              placeholder="Describe what should be revised..."
              value={form.body}
              onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))}
            />
            <button type="submit" disabled={submitting}>
              {submitting ? "Submitting..." : "Submit Comment"}
            </button>
          </form>
        </section>

        <section className="mk-review-comments">
          <h2>Comments ({commentCount})</h2>
          {commentCount === 0 ? <p>No comments yet.</p> : null}
          {(video.comments ?? []).map((comment) => (
            <article key={comment.id} className="mk-review-comment">
              <button type="button" onClick={() => jumpTo(comment.timestampSeconds)}>
                {formatCommentTime(comment.timestampSeconds)}
              </button>
              <div>
                <p>{comment.body}</p>
                <small>
                  {comment.authorEmail} - {new Date(comment.createdAt).toLocaleString()}
                </small>
              </div>
            </article>
          ))}
        </section>

        {error ? <p className="error">{error}</p> : null}
      </section>
    </main>
  );
}
