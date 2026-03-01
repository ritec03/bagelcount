//
/**
 * Constraint: for a given period, the sum of budgeted amount of the children
 * cannot exceed the budgeted amount of the parent.
 *
 * The actual encoded constraints are:
 *
 * Top-down version: for a given period, when a parent budget is established,
 * it cannot be less than the sum of all the child budgets.
 *
 * Bottom-up version: for a given period, when a child budget is established,
 * the sum of all its siblings and itself cannot exceed that of the parent.
 *
 * The constraints can be blocking or warning-only. Blocking constraint blocks
 * modification of a node that leads to constraint violation, warning-only
 * allows that, but it appends warnings to the budget and the affected budgets.
 */

import type { TreeNode } from "../core/budgetNode";

export type ConstraintMode = "blocking" | "warning" | "disabled";

type ConstraintWarning<R extends string> = {
  budgetId: string;
  role: R;
  message: string;
}

// TODO potentially rename as there are warnings and errors and this name
// may confuse.
export type PCSRole = "parent" | "child_same_freq" | "child_lower_freq" | "child_higher_freq";

export type ParentChildrenSumWarning =
  | (ConstraintWarning<PCSRole> & {
      role: "parent";
      exceedingChildIds: string[];
      overageAmount: number;
    })
  | (ConstraintWarning<PCSRole> & {
      role: "child_same_freq" | "child_lower_freq" | "child_higher_freq";
      parentId: string;
    });

export interface ConstraintRegistry {
  ParentChildrenSum: {
    Config: Record<PCSRole, ConstraintMode>;
    Warning: ParentChildrenSumWarning;
  };
  // can be extended later
}

export type Constraint = keyof ConstraintRegistry;

// Extracts the specific 'Config' shape from the registry
export type ConstraintConfig = {
  [K in Constraint]: ConstraintRegistry[K]["Config"];
};

// Extracts the specific 'Warning' shape from the registry
export type ConstraintViolationMap = {
  [K in Constraint]?: ConstraintRegistry[K]["Warning"][];
};
// export type ConstraintViolationMap = Map<Constraint, ConstraintRegistry[Constraint]["Warning"][]>;

/**
 * Type signature of generic verification function that operates on a budget
 * instance.
 */
export type ConstraintChecker<K extends Constraint> = (
  budgetNode: TreeNode,
  config: ConstraintRegistry[K]["Config"],
) => ConstraintViolationMap;

export type ConstraintCheckerMap = {
  [K in Constraint]: ConstraintChecker<K>;
};

/**
 * Helper functions
 */

// iterate over constraint registry
export function* iterateViolationEntries(
  map: ConstraintViolationMap
): Generator<[Constraint, ConstraintRegistry[Constraint]["Warning"][]]> {
  for (const key in map) {
    const k = key as Constraint;
    const warnings = map[k];
    if (warnings) yield [k, warnings] as const;
  }
}

export function* iterateViolations(
  map: ConstraintViolationMap
): Generator<[Constraint, ConstraintRegistry[Constraint]["Warning"]]> {
  for (const [constraint, warnings] of iterateViolationEntries(map)) {
    for (const warning of warnings) {
      yield [constraint, warning] as const;
    }
  }
}
/**
 * Merge two {@link ConstraintViolationMap} objects, concatenating warning
 * arrays for each constraint key that appears in both.
 */
export function mergeViolations(a: ConstraintViolationMap, b: ConstraintViolationMap): ConstraintViolationMap {
  if (Object.keys(b).length === 0) return a;
  if (Object.keys(a).length === 0) return b;

  const result: ConstraintViolationMap = { ...a };
  for (const key of Object.keys(b) as Constraint[]) {
    const bWarnings = b[key];
    if (bWarnings === undefined || bWarnings.length === 0) continue;
    const existing = result[key];
    // TypeScript requires a cast here because the mapped type is indexed.
    (result as Record<Constraint, unknown>)[key] =
      existing !== undefined ? [...existing, ...bWarnings] : [...bWarnings];
  }
  return result;
}
