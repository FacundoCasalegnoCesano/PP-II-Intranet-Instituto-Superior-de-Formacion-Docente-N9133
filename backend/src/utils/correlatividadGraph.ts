export type AcademicRuleEdge = {
  from: string;
  to: string;
  kind: 'LEGACY' | 'SPACE' | 'MEMBERSHIP';
  aplicaCursado?: boolean;
  aplicaRendir?: boolean;
};

export const materiaNode = (id: number): string => `M:${id}`;
export const espacioNode = (id: number): string => `S:${id}`;

export function createsMixedCorrelationCycle(edges: AcademicRuleEdge[], additions: AcademicRuleEdge[]): boolean {
  for (const mode of ['aplicaCursado', 'aplicaRendir'] as const) {
    const applies = (edge: AcademicRuleEdge) => edge[mode] ?? true;
    const graph = [...edges, ...additions].filter(applies);
    const dependencies = new Map<string, string[]>();
    for (const edge of graph) {
      const outgoing = dependencies.get(edge.from) ?? [];
      outgoing.push(edge.to);
      dependencies.set(edge.from, outgoing);
    }

    for (const edge of additions.filter(applies)) {
      const pending = [edge.to];
      const visited = new Set<string>();
      while (pending.length > 0) {
        const current = pending.pop()!;
        if (current === edge.from) return true;
        if (visited.has(current)) continue;
        visited.add(current);
        pending.push(...(dependencies.get(current) ?? []));
      }
    }
  }
  return false;
}
