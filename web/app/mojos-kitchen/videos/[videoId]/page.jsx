"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import WorkspaceShell from "@/components/workspace-shell";

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

export default function MojosKitchenVideoPage() {
  const params = useParams();
  const router = useRouter();
  const playerRef = useRef(null);
  const videoId = params?.videoId;

  const [user, setUser] = useState(null);
  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

  const loadData = useCallback(async () => {
    if (!videoId) return;
    setLoading(true);
    setError(null);
    try {
      const meRes = await fetch("/api/me", { cache: "no-store" });
      if (!meRes.ok) {
        router.push("/login");
        return;
      }
      const meData = await meRes.json();
      setUser(meData.user);

      const response = await fetch(`/api/mojos-kitchen/videos/${videoId}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Unable to load video.");
        return;
      }
      setVideo(data.video ?? null);
    } catch {
      setError("Unable to load video.");
    } finally {
      setLoading(false);
    }
  }, [router, videoId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  async function copyShareLink() {
    if (!video?.shareUrl) return;
    const absolute = `${window.location.origin}${video.shareUrl}`;
    try {
      await navigator.clipboard.writeText(absolute);
      setCopied(true);
      setTimeout(() => setCopied(false), 1700);
    } catch {
      setError("Unable to copy share link.");
    }
  }

  async function sendReviewEmail() {
    if (!video?.id) return;
    setSending(true);
    setError(null);
    try {
      const response = await fetch(`/api/mojos-kitchen/videos/${video.id}/send`, {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Unable to send review email.");
        return;
      }
    } catch {
      setError("Unable to send review email.");
    } finally {
      setSending(false);
    }
  }

  function jumpTo(seconds) {
    const player = playerRef.current;
    if (!player) return;
    player.currentTime = Math.max(0, Number(seconds) || 0);
    player.pause();
  }

  const commentCount = useMemo(() => video?.comments?.length ?? 0, [video]);

  return (
    <WorkspaceShell user={user} onLogout={logout}>
      <section className="mk-shell mk-detail-shell">
        <header className="mk-header">
          <div>
            <h1>{video?.title || video?.originalFileName || "Video comments"}</h1>
            <p>Employee comments view with full customer feedback timeline.</p>
          </div>
          <div className="mk-header-meta">
            <span>{commentCount} comments</span>
            <span>{video?.recipientEmail || "No recipient"}</span>
          </div>
        </header>

        <div className="mk-detail-actions">
          <button type="button" className="secondary" onClick={() => router.push("/mojos-kitchen")}>
            Back to grid
          </button>
          <button type="button" onClick={copyShareLink} disabled={!video?.shareUrl}>
            {copied ? "Copied" : "Copy Link"}
          </button>
          <button type="button" className="secondary" onClick={sendReviewEmail} disabled={sending || !video?.id}>
            {sending ? "Sending..." : "Send Email"}
          </button>
        </div>

        {loading ? <p className="mk-empty">Loading video...</p> : null}
        {!loading && !video ? <p className="mk-empty">Video not found.</p> : null}

        {video ? (
          <section className="mk-detail-layout">
            <article className="mk-detail-player-card">
              <video ref={playerRef} className="mk-video-player" controls src={video.fileUrl} preload="metadata" />
              <p className="mk-detail-created">Uploaded {new Date(video.createdAt).toLocaleString()}</p>
            </article>

            <article className="mk-detail-comments-card">
              <h2>Customer comments</h2>
              {video.comments?.length ? (
                video.comments.map((comment) => (
                  <div key={comment.id} className="mk-comment-item">
                    <button type="button" className="mk-timestamp-btn" onClick={() => jumpTo(comment.timestampSeconds)}>
                      {formatCommentTime(comment.timestampSeconds)}
                    </button>
                    <div>
                      <p>{comment.body}</p>
                      <small>
                        {comment.authorEmail} - {new Date(comment.createdAt).toLocaleString()}
                      </small>
                    </div>
                  </div>
                ))
              ) : (
                <p className="mk-empty">No customer comments yet.</p>
              )}
            </article>
          </section>
        ) : null}

        {error ? <p className="error">{error}</p> : null}
      </section>
    </WorkspaceShell>
  );
}
