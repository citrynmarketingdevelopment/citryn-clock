// Shared Prisma include + serializer for a Task, so every route that returns a
// task (PATCH, move, assign, attachments, field-value) emits the same shape —
// including custom field values (Wave 2).

export const taskInclude = {
  project: { select: { id: true, name: true } },
  column: { select: { id: true, name: true, order: true } },
  assignments: {
    include: { user: { select: { id: true, name: true, email: true } } },
  },
  attachments: { orderBy: [{ createdAt: "asc" }] },
  fieldValues: { select: { fieldId: true, value: true } },
};

export function toTaskPayload(task) {
  return {
    id: task.id,
    projectId: task.projectId,
    columnId: task.columnId,
    title: task.title,
    description: task.description,
    laborMinutes: task.laborMinutes,
    priority: task.priority,
    dueDate: task.dueDate,
    completedAt: task.completedAt,
    recurrenceFrequency: task.recurrenceFrequency ?? "NONE",
    recurrenceInterval: task.recurrenceInterval ?? 1,
    recurrenceDayOfWeek: task.recurrenceDayOfWeek ?? null,
    recurrenceDayOfMonth: task.recurrenceDayOfMonth ?? null,
    recurrenceLastCompletedAt: task.recurrenceLastCompletedAt ?? null,
    createdById: task.createdById,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    project: task.project ? { id: task.project.id, name: task.project.name } : null,
    column: task.column
      ? { id: task.column.id, name: task.column.name, order: task.column.order }
      : null,
    assignees: (task.assignments ?? []).map((assignment) => ({
      id: assignment.user.id,
      name: assignment.user.name,
      email: assignment.user.email,
    })),
    attachments: (task.attachments ?? []).map((attachment) => ({
      id: attachment.id,
      type: attachment.type,
      url: attachment.url,
      label: attachment.label,
      createdById: attachment.createdById,
      createdAt: attachment.createdAt,
    })),
    fieldValues: (task.fieldValues ?? []).map((value) => ({
      fieldId: value.fieldId,
      value: value.value,
    })),
  };
}
