// Shared client-side helpers for task + column mutations, so the board,
// My Tasks, and Due Dates pages don't each re-implement fetch/parse logic.

export async function parseJsonSafe(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: `Unexpected response (${response.status}).` };
  }
}

// Throws an Error (with the server message) on failure; returns the updated task on success.
async function requestTask(url, options) {
  const response = await fetch(url, options);
  const data = await parseJsonSafe(response);
  if (!response.ok || !data.task) {
    throw new Error(data.error ?? "Request failed.");
  }
  return data.task;
}

// Partial update: { completed, title, description, priority, dueDate, laborMinutes, columnId }.
export function updateTask(taskId, patch) {
  return requestTask(`/api/tasks/${taskId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

// Replaces the task's assignees with the given user ids (empty array clears them).
// Returns { taskId, assignees } from the assign route.
export async function setAssignees(taskId, userIds) {
  const response = await fetch(`/api/tasks/${taskId}/assign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userIds, replace: true }),
  });
  const data = await parseJsonSafe(response);
  if (!response.ok || !data.assignees) {
    throw new Error(data.error ?? "Unable to update assignees.");
  }
  return data.assignees;
}

export function addLinkAttachment(taskId, { url, label }) {
  const body = new FormData();
  body.append("type", "LINK");
  body.append("url", url);
  if (label) body.append("label", label);
  return requestTask(`/api/tasks/${taskId}/attachments`, { method: "POST", body });
}

export function addImageAttachment(taskId, { file, label }) {
  const body = new FormData();
  body.append("type", "IMAGE");
  body.append("file", file);
  if (label) body.append("label", label);
  return requestTask(`/api/tasks/${taskId}/attachments`, { method: "POST", body });
}

// --- Column management (board editing) ---

export async function addColumn(projectId, name) {
  const response = await fetch(`/api/projects/${projectId}/columns`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const data = await parseJsonSafe(response);
  if (!response.ok || !data.column) {
    throw new Error(data.error ?? "Unable to add column.");
  }
  return data.column;
}

export async function reorderColumns(projectId, orderedIds) {
  const response = await fetch(`/api/projects/${projectId}/columns`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderedIds }),
  });
  const data = await parseJsonSafe(response);
  if (!response.ok || !data.columns) {
    throw new Error(data.error ?? "Unable to reorder columns.");
  }
  return data.columns;
}

export async function renameColumn(projectId, columnId, name) {
  const response = await fetch(`/api/projects/${projectId}/columns/${columnId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const data = await parseJsonSafe(response);
  if (!response.ok || !data.column) {
    throw new Error(data.error ?? "Unable to rename column.");
  }
  return data.column;
}

export async function deleteColumn(projectId, columnId) {
  const response = await fetch(`/api/projects/${projectId}/columns/${columnId}`, {
    method: "DELETE",
  });
  const data = await parseJsonSafe(response);
  if (!response.ok) {
    throw new Error(data.error ?? "Unable to delete column.");
  }
  return true;
}

export function renameProject(projectId, patch) {
  return fetch(`/api/projects/${projectId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  }).then(async (response) => {
    const data = await parseJsonSafe(response);
    if (!response.ok || !data.project) {
      throw new Error(data.error ?? "Unable to update project.");
    }
    return data.project;
  });
}
