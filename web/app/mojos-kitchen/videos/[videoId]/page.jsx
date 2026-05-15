"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import WorkspaceShell from "@/components/workspace-shell";
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

export default function MojosKitchenVideoPage() {
  const params = useParams();
  const router = useRouter();
  const videoId = params?.videoId;

  const [user, setUser] = useState(null);
  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);
  const [activeTimestamp, setActiveTimestamp] = useState(0);

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
      const data = await parseJsonSafe(response);
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
      const data = await parseJsonSafe(response);
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

  async function deleteVideo() {
    if (!video?.id) return;
    const confirmed = window.confirm("Delete this Mojo's Kitchen item?");
    if (!confirmed) return;

    setDeleting(true);
    setError(null);
    try {
      const response = await fetch(`/api/mojos-kitchen/videos/${video.id}`, {
        method: "DELETE",
      });
      const data = await parseJsonSafe(response);
      if (!response.ok) {
        setError(data.error ?? "Unable to delete item.");
        return;
      }
      router.push("/mojos-kitchen");
      router.refresh();
    } catch {
      setError("Unable to delete item.");
    } finally {
      setDeleting(false);
    }
  }

  const commentCount = useMemo(() => video?.comments?.length ?? 0, [video]);
  const embedUrl = useMemo(() => {
    if (!video?.youtubeVideoId) return null;
    return getYouTubeEmbedUrl(video.youtubeVideoId, activeTimestamp);
  }, [video, activeTimestamp]);

  return (
    <WorkspaceShell user={user} onLogout={logout}>
      <section className="mk-shell mk-detail-shell">
        <header className="mk-header">
          <div>
            <h1>{video?.title || "YouTube comments"}</h1>
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
          <button type="button" className="secondary" onClick={deleteVideo} disabled={deleting || !video?.id}>
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>

        {loading ? <p className="mk-empty">Loading video...</p> : null}
        {!loading && !video ? <p className="mk-empty">Video not found.</p> : null}

        {video ? (
          <section className="mk-detail-layout">
            <article className="mk-detail-player-card">
              {embedUrl ? (
                <iframe
                  className="mk-video-player"
                  src={embedUrl}
                  title={video.title || "YouTube review"}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              ) : (
                <p className="mk-empty">
                  This item does not have a valid YouTube link.{" "}
                  <a href={video.fileUrl} target="_blank" rel="noreferrer">
                    Open raw URL
                  </a>
                </p>
              )}
              <p className="mk-detail-created">Added {new Date(video.createdAt).toLocaleString()}</p>
            </article>

            <article className="mk-detail-comments-card">
              <h2>Customer comments</h2>
              {video.comments?.length ? (
                video.comments.map((comment) => (
                  <div key={comment.id} className="mk-comment-item">
                    <button
                      type="button"
                      className="mk-timestamp-btn"
                      onClick={() => setActiveTimestamp(Math.max(0, Number(comment.timestampSeconds) || 0))}
                    >
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
