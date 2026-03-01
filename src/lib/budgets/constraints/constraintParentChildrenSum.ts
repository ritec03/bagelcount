import { overlap } from '@/lib/utils/dateRange';
import type { TreeNode } from '@/lib/budgets/core/budgetNode';
import { nodeFrequency, collectClosestBudgets } from '@/lib/budgets/core/budgetNode';
import type { BudgetInstance } from '@/lib/budgets/core/budgetInstance';
import { periodScaleFactor } from '@/lib/budgets/constraints/periodScale';
import type {
  ConstraintRegistry,
  ConstraintViolationMap,
  ParentChildrenSumWarning,
} from '@/lib/budgets/constraints/constraints';

type PCSConfig = ConstraintRegistry['ParentChildrenSum']['Config'];

/**
 * Compute the `ConstraintViolationMap` for the `ParentChildrenSum` constraint
 * for a single tree node.
 *
 * **Plain-tree mode** (node has no period suffix):
 *   Direct children's overlapping budgets are summed and compared to the
 *   parent budget amount — the original behaviour.
 *
 * **Unified-tree mode** (node has a period suffix, e.g. `:yearly`):
 *   Ghost layers are skipped via {@link collectClosestBudgets}.  Each found
 *   child amount is scaled to the parent's frequency before summing
 *   (e.g. a monthly child inside a yearly parent is multiplied by 12).
 *
 * The function is pure: it never mutates the tree.
 */
export function checkParentChildrenSum(
  node: TreeNode,
  config: PCSConfig,
): ConstraintViolationMap {
  if (node.budgets.length === 0) return {};

  const warnings: ParentChildrenSumWarning[] = [];

  for (const parentInst of node.budgets) {
    const violation = checkInstance(parentInst, node, config);
    warnings.push(...violation);
  }

  return warnings.length > 0 ? { ParentChildrenSum: warnings } : {};
}

// ─────────────────────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────────────────────

function checkInstance(
  parentInst: BudgetInstance,
  parentNode: TreeNode,
  config: PCSConfig,
): ParentChildrenSumWarning[] {
  if (parentNode.children.length === 0) return [];

  const parentFreq = nodeFrequency(parentNode);

  // ── Unified-tree path: parent has a period suffix ─────────────────────────
  if (parentFreq !== null) {
    const closest = collectClosestBudgets(parentNode.children);

    // Keep only children whose range overlaps the parent instance's range.
    const overlapping = closest.filter(
      ({ inst }) => overlap(parentInst.effectiveRange, inst.effectiveRange) !== null,
    );

    if (overlapping.length === 0) return [];

    // Scale every child amount to the parent's frequency, then sum.
    const scaledSum = overlapping.reduce(
      (acc, { inst, freq }) => acc + inst.amount * periodScaleFactor(freq, parentFreq),
      0,
    );

    if (scaledSum <= parentInst.amount) return [];

    return buildWarnings(parentInst, parentNode, overlapping.map(({ inst }) => inst), scaledSum, config);
  }

  // ── Plain-tree path: no period suffix — original direct-child check ───────
  const overlappingChildInsts: BudgetInstance[] = [];
  for (const childNode of parentNode.children) {
    for (const childInst of childNode.budgets) {
      if (overlap(parentInst.effectiveRange, childInst.effectiveRange) !== null) {
        overlappingChildInsts.push(childInst);
      }
    }
  }

  if (overlappingChildInsts.length === 0) return [];

  const childrenSum = overlappingChildInsts.reduce((acc, ci) => acc + ci.amount, 0);
  if (childrenSum <= parentInst.amount) return [];

  return buildWarnings(parentInst, parentNode, overlappingChildInsts, childrenSum, config);
}

function buildWarnings(
  parentInst: BudgetInstance,
  parentNode: TreeNode,
  childInsts: BudgetInstance[],
  childrenSum: number,
  config: PCSConfig,
): ParentChildrenSumWarning[] {
  const overage = childrenSum - parentInst.amount;
  const warnings: ParentChildrenSumWarning[] = [];
  const parentLabel = parentNode.accountLabel[parentNode.accountLabel.length - 1] ?? '';

  if (config.parent !== 'disabled') {
    warnings.push({
      budgetId: parentInst.id,
      role: 'parent',
      message: `Children sum (${childrenSum}) exceeds parent budget (${parentInst.amount}) by ${overage}.`,
      exceedingChildIds: childInsts.map(ci => ci.id),
      overageAmount: overage,
    });
  }

  if (config.child !== 'disabled') {
    for (const childInst of childInsts) {
      warnings.push({
        budgetId: childInst.id,
        role: 'child',
        message: `This budget contributes to exceeding the parent budget "${parentLabel}".`,
        parentId: parentInst.id,
      });
    }
  }

  return warnings;
}