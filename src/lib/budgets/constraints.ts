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

type Role = "parent" | "child";

export type ConstraintMode = "blocking" | "warning" | "disabled";

type ConstraintWarning = {
  role: Role;
  message: string;
}

export type ParentChildrenSumWarning =
  | (ConstraintWarning & {
      role: "parent";
      exceedingChildIds: string[];
      overageAmount: number;
    })
  | (ConstraintWarning & {
      role: "child";
      parentId: string;
    });

export interface ConstraintRegistry {
  ParentChildrenSum: {
    Config: Record<Role, ConstraintMode>; 
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
