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

export type SumTopDownWarning =
  | {
      role: "parent";
      message: string;
      exceedingChildIds: string[];
      overageAmount: number;
    }
  | {
      role: "child";
      message: string;
      parentId: string;
    };

export type SumBottomUpWarning =
  | {
      role: "parent";
      message: string;
      mismatchedChildIds: string[];
    }
  | {
      role: "child";
      message: string;
      parentId: string;
    };

export interface ConstraintWarningRegistry {
  sumTopDown: SumTopDownWarning;
  sumBottomUp: SumBottomUpWarning;
  // can be extended later
}

export type ConstraintMode = "blocking" | "warning" | "disabled";
export type Constraint = keyof ConstraintWarningRegistry;

export type ConstraintConfig = {
  [K in Constraint]: {
    mode: ConstraintMode;
  };
};


// Maps each constraint to an array of its specific payload type
export type ConstraintViolationMap = {
  [K in Constraint]?: ConstraintWarningRegistry[K][];
};
