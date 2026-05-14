"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import WorkspaceShell from "@/components/workspace-shell";

async function parseJsonSafe(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: text || `Request failed (${response.status}).` };
  }
}

export default function MojosKitchenPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [sendingVideoId, setSendingVideoId] = useState(null);
  const [lastSentVideoId, setLastSentVideoId] = useState(null);
  const [error, setError] = useState(null);
  const [copiedToken, setCopiedToken] = useState(null);
  const [form, setForm] = useState({
    title: "",
    recipientEmail: "",
    video: null,
  });

  const loadData = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const meRes = await fetch("/api/me", { cache: "no-store" });
      if (!meRes.ok) {
        router.push("/login");
        return;
      }
      const meData = await meRes.json();
      setUser(meData.user);

      const videosRes = await fetch("/api/mojos-kitchen/videos", { cache: "no-store" });
      const videosData = await parseJsonSafe(videosRes);
      if (!videosRes.ok) {
        setError(videosData.error ?? "Unable to load videos.");
        return;
      }
      setVideos(videosData.videos ?? []);
    } catch {
      setError("Unable to load Mojo's Kitchen.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (!form.video) {
      setError("Please choose a video to upload.");
      return;
    }

    setUploading(true);
    setError(null);
    setCopiedToken(null);

    try {
      const fileName = `mojos-kitchen/${form.video.name || "video-upload.mp4"}`;
      const blobResult = await upload(fileName, form.video, {
        access: "public",
        handleUploadUrl: "/api/mojos-kitchen/client-upload",
      });

      const response = await fetch("/api/mojos-kitchen/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          recipientEmail: form.recipientEmail,
          originalFileName: form.video.name,
          fileUrl: blobResult.url,
        }),
      });
      const data = await parseJsonSafe(response);
      if (!response.ok) {
        setError(data.error ?? "Unable to upload video.");
        return;
      }

      setVideos((current) => [data.video, ...current]);
      setForm({
        title: "",
        recipientEmail: "",
        video: null,
      });
      const fileInput = document.getElementById("mk-video-input");
      if (fileInput instanceof HTMLInputElement) {
        fileInput.value = "";
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Upload failed. Please sign in again and retry.");
    } finally {
      setUploading(false);
    }
  }

  async function copyShareLink(path) {
    const absolute = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(absolute);
      setCopiedToken(path);
      setTimeout(() => {
        setCopiedToken((current) => (current === path ? null : current));
      }, 1800);
    } catch {
      setError("Unable to copy link. Copy it manually from the field.");
    }
  }

  async function sendReviewEmail(videoId) {
    setError(null);
    setSendingVideoId(videoId);
    setLastSentVideoId(null);
    try {
      const response = await fetch(`/api/mojos-kitchen/videos/${videoId}/send`, {
        method: "POST",
      });
      const data = await parseJsonSafe(response);
      if (!response.ok) {
        setError(data.error ?? "Unable to send review email.");
        return;
      }
      setLastSentVideoId(videoId);
      setTimeout(() => {
        setLastSentVideoId((current) => (current === videoId ? null : current));
      }, 2400);
    } catch {
      setError("Unable to send review email.");
    } finally {
      setSendingVideoId(null);
    }
  }

  const stats = useMemo(() => {
    const commentCount = videos.reduce((sum, video) => sum + (video.commentCount || 0), 0);
    return {
      videoCount: videos.length,
      commentCount,
    };
  }, [videos]);

  return (
    <WorkspaceShell user={user} onLogout={logout}>
      <section className="mk-shell">
        <header className="mk-header">
          <div>
            <h1>Mojo&apos;s Kitchen</h1>
            <p>Upload videos and manage client feedback from a dedicated comments view.</p>
          </div>
          <div className="mk-header-meta">
            <span>{stats.videoCount} videos</span>
            <span>{stats.commentCount} comments</span>
          </div>
        </header>

        <section className="mk-upload-card">
          <h2>Upload New Review Video</h2>
          <form className="mk-upload-form" onSubmit={onSubmit}>
            <input
              type="text"
              placeholder="Video title (optional)"
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
            />
            <input
              required
              type="email"
              placeholder="Client email"
              value={form.recipientEmail}
              onChange={(event) => setForm((current) => ({ ...current, recipientEmail: event.target.value }))}
            />
            <input
              id="mk-video-input"
              required
              type="file"
              accept="video/*"
              onChange={(event) => setForm((current) => ({ ...current, video: event.target.files?.[0] ?? null }))}
            />
            <button type="submit" disabled={uploading}>
              {uploading ? "Uploading..." : "Upload and Generate Link"}
            </button>
          </form>
        </section>

        {loading ? <p className="mk-empty">Loading videos...</p> : null}
        {!loading && videos.length === 0 ? (
          <p className="mk-empty">No review videos yet. Upload one to create your first client link.</p>
        ) : null}

        <section className="mk-video-grid">
          {videos.map((video) => {
            const shareUrl = video.shareUrl;
            return (
              <article
                key={video.id}
                className="mk-video-tile"
                onClick={() => router.push(`/mojos-kitchen/videos/${video.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    router.push(`/mojos-kitchen/videos/${video.id}`);
                  }
                }}
              >
                <div className="mk-video-thumb-wrap">
                  <video className="mk-video-thumb" src={video.fileUrl} preload="metadata" muted playsInline />
                </div>

                <div className="mk-video-top">
                  <div>
                    <h3>{video.title || video.originalFileName}</h3>
                    <p>{video.recipientEmail}</p>
                  </div>
                  <span>{new Date(video.createdAt).toLocaleDateString()}</span>
                </div>

                <div className="mk-video-meta-row">
                  <span>{video.commentCount || 0} comments</span>
                  <span>Open comments view</span>
                </div>

                <div className="mk-video-actions" onClick={(event) => event.stopPropagation()}>
                  <button type="button" onClick={() => copyShareLink(shareUrl)}>
                    {copiedToken === shareUrl ? "Copied" : "Copy Link"}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => sendReviewEmail(video.id)}
                    disabled={sendingVideoId === video.id}
                  >
                    {sendingVideoId === video.id ? "Sending..." : "Send Email"}
                  </button>
                </div>

                {lastSentVideoId === video.id ? <p className="mk-email-sent">Email sent to {video.recipientEmail}</p> : null}
              </article>
            );
          })}
        </section>

        {error ? <p className="error">{error}</p> : null}
      </section>
    </WorkspaceShell>
  );
}
