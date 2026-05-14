"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";

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

export default function KitchenReviewPage() {
  const params = useParams();
  const token = params?.token;
  const videoRef = useRef(null);

  const [video, setVideo] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [currentTimestamp, setCurrentTimestamp] = useState(0);
  const [form, setForm] = useState({
    authorEmail: "",
    body: "",
  });

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

  function captureTimestampFromVideo() {
    const player = videoRef.current;
    if (!player) return;
    setCurrentTimestamp(Math.floor(player.currentTime || 0));
  }

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
    const player = videoRef.current;
    if (!player) return;
    player.currentTime = Math.max(0, Number(seconds) || 0);
    player.pause();
    setCurrentTimestamp(Math.max(0, Math.floor(Number(seconds) || 0)));
  }

  const commentCount = useMemo(() => video?.comments?.length ?? 0, [video]);

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
          <h1>{video.title || video.originalFileName}</h1>
          <p>Pause the video at any frame and leave revision notes.</p>
        </header>

        <video
          ref={videoRef}
          className="mk-review-player"
          controls
          src={video.fileUrl}
          preload="metadata"
          onPause={captureTimestampFromVideo}
          onSeeked={captureTimestampFromVideo}
        />

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
