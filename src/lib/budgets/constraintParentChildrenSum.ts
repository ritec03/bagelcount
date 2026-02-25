import { overlap } from '@/lib/utils/dateRange';
import type { BudgetTreeNode } from '@/lib/budgets/budgetNode';
import type { BudgetInstance } from '@/lib/budgets/budgetInstance';
import type {
  ConstraintRegistry,
  ConstraintViolationMap,
  ParentChildrenSumWarning,
} from '@/lib/budgets/constraints';

type PCSConfig = ConstraintRegistry['ParentChildrenSum']['Config'];

/**
 * Compute the `ConstraintViolationMap` for the `ParentChildrenSum` constraint
 * for a single `BudgetTreeNode`.
 *
 * For every `BudgetInstance` on `node`, it finds child instances (across all
 * direct children) whose `effectiveRange` overlaps the parent instance range.
 * If those overlapping children's amounts sum to more than the parent instance
 * amount, a violation is recorded — subject to the `config` mode for each
 * role.
 *
 * The function is pure: it never mutates the tree.
 */
export function checkParentChildrenSum(
  node: BudgetTreeNode,
  config: PCSConfig,
): ConstraintViolationMap {
  if (node.budgets.length === 0 || node.children.length === 0) {
    return {};
  }

  const warnings: ParentChildrenSumWarning[] = [];

  for (const parentInst of node.budgets) {
    const violation = checkInstance(parentInst, node, node.children, config);
    warnings.push(...violation);
  }

  return warnings.length > 0 ? { ParentChildrenSum: warnings } : {};
}

// ─────────────────────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check one parent `BudgetInstance` against all overlapping child instances
 * from `childNodes`. Returns the warnings that should be emitted for this
 * instance-pair comparison.
 */
function checkInstance(
  parentInst: BudgetInstance,
  parentNode: BudgetTreeNode,
  childNodes: readonly BudgetTreeNode[],
  config: PCSConfig,
): ParentChildrenSumWarning[] {
  // Collect every child BudgetInstance that overlaps the parent's range.
  const overlappingChildInsts: BudgetInstance[] = [];
  for (const childNode of childNodes) {
    for (const childInst of childNode.budgets) {
      if (overlap(parentInst.effectiveRange, childInst.effectiveRange) !== null) {
        overlappingChildInsts.push(childInst);
      }
    }
  }

  if (overlappingChildInsts.length === 0) return [];

  const childrenSum = overlappingChildInsts.reduce((acc, ci) => acc + ci.amount, 0);
  if (childrenSum <= parentInst.amount) return [];

  const overage = childrenSum - parentInst.amount;
  const warnings: ParentChildrenSumWarning[] = [];

  // Parent-role warning
  if (config.parent !== 'disabled') {
    warnings.push({
      budgetId: parentInst.id,
      role: 'parent',
      message: `Children sum (${childrenSum}) exceeds parent budget (${parentInst.amount}) by ${overage}.`,
      exceedingChildIds: overlappingChildInsts.map(ci => ci.id),
      overageAmount: overage,
    });
  }

  // Child-role warning — one per overlapping child instance
  if (config.child !== 'disabled') {
    for (const childInst of overlappingChildInsts) {
      warnings.push({
        budgetId: childInst.id,
        role: 'child',
        message: `This budget contributes to exceeding the parent budget "${parentNode.accountLabel[parentNode.accountLabel.length - 1]}".`,
        parentId: parentInst.id,
      });
    }
  }

  return warnings;
}