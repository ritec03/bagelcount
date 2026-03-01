import { overlap } from '@/lib/utils/dateRange';
import type { TreeNode } from '@/lib/budgets/core/budgetNode';
import { nodeFrequency, collectClosestBudgets } from '@/lib/budgets/core/budgetNode';
import type { BudgetInstance } from '@/lib/budgets/core/budgetInstance';
import { periodScaleFactor } from '@/lib/budgets/constraints/periodScale';
import type {
  ConstraintRegistry,
  ConstraintViolationMap,
  ParentChildrenSumWarning,
  PCSRole,
} from '@/lib/budgets/constraints/constraints';
import { accountNameFromLabelExcludingFrequency } from '../core/accountLabel';
import type { PeriodType } from '@/lib/models/types';

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

    return buildWarnings(parentInst, parentNode, overlapping, scaledSum, config);
  }

  // ── Plain-tree path: no period suffix — original direct-child check ───────
  const overlappingChildInsts: { inst: BudgetInstance; freq: null }[] = [];
  for (const childNode of parentNode.children) {
    for (const childInst of childNode.budgets) {
      if (overlap(parentInst.effectiveRange, childInst.effectiveRange) !== null) {
        overlappingChildInsts.push({ inst: childInst, freq: null });
      }
    }
  }

  if (overlappingChildInsts.length === 0) return [];

  const childrenSum = overlappingChildInsts.reduce((acc, ci) => acc + ci.inst.amount, 0);
  if (childrenSum <= parentInst.amount) return [];

  return buildWarnings(parentInst, parentNode, overlappingChildInsts, childrenSum, config);
}

function buildWarnings(
  parentInst: BudgetInstance,
  parentNode: TreeNode,
  childInsts: { inst: BudgetInstance; freq: PeriodType | null }[],
  childrenSum: number,
  config: PCSConfig,
): ParentChildrenSumWarning[] {
  const warnings: ParentChildrenSumWarning[] = [];

  // Extract the real account name (skip period-type segments in unified-tree labels).
  const parentAccName = accountNameFromLabelExcludingFrequency(parentNode.accountLabel);
  const parentFreq    = nodeFrequency(parentNode);
  const parentLabel   = parentFreq !== null
    ? `${parentAccName} (${parentFreq})`
    : parentAccName;

  if (config.parent !== 'disabled') {
    const overage = childrenSum - parentInst.amount;
    if (overage > 0) {
      warnings.push({
        budgetId: parentInst.id,
        role: 'parent',
        message: `Children sum (${childrenSum}) exceeds parent budget (${parentInst.amount}) by ${overage}.`,
        exceedingChildIds: childInsts.map(ci => ci.inst.id),
        overageAmount: overage,
      });
    }
  }

  // We know config.parent !== 'disabled' or one of the child modes is enabled,
  // but we can check the child modes more granularly now.
  let hasEnabledChildMode = false;
  if (config.child_higher_freq !== 'disabled' || config.child_lower_freq !== 'disabled' || config.child_same_freq !== 'disabled') {
    hasEnabledChildMode = true;
  }

  const overage = childrenSum - parentInst.amount;

  if (hasEnabledChildMode && overage > 0) {
    for (const { inst: childInst, freq: childFreq } of childInsts) {
      let role: PCSRole = 'child_same_freq';

      if (childFreq !== null && parentFreq !== null) {
        const scale = periodScaleFactor(childFreq, parentFreq);
        if (scale < 1) {
          role = 'child_lower_freq';
        } else if (scale > 1) {
          role = 'child_higher_freq';
        }
      }

      if (config[role] !== 'disabled') {
        warnings.push({
          budgetId: childInst.id,
          role: role,
          message: `This budget contributes to exceeding the parent budget "${parentLabel}".`,
          parentId: parentInst.id,
        });
      }
    }
  }

  return warnings;
}