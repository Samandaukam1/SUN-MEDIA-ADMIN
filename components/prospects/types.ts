import type { Json } from '@/types/database';

export type StudioAnalysis = { id: string; kind: string; input: Json; result: Json; model: string | null; created_at: string };
