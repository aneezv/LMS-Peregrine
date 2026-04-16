export const queryKeys = {
  coursesCatalog: (params: { q: string; dept: string; page: number }) =>
    ['courses', 'catalog', params] as const,
  assignmentSubmission: (params: { assignmentId: string }) =>
    ['assignments', 'submission', params] as const,
  moduleProgress: (params: { moduleId: string }) =>
    ['modules', 'progress', params] as const,
  quizResult: (params: { moduleId: string }) => ['quiz', 'result', params] as const,
  feedbackStatus: (params: { moduleId: string }) =>
    ['feedback', 'status', params] as const,
}
