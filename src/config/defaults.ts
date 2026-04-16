export const DEFAULT_KNOWLEDGE_THRESHOLDS = {
  reusableScore: 0.7,
  stabilityScore: 0.75,
  confidence: 0.8,
} as const;

export const DEFAULT_KNOWLEDGE_BUDGET = {
  maxWikiWritesPerHour: 10,
  maxKnowledgeTasksInQueue: 20,
  topKPerWindow: 5,
  priorityQueue: true,
} as const;

