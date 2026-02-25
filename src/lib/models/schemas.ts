import * as z from "zod";

const baseSchema = z.object({
  account: z.string().min(1, "Account is required"),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid amount"),
  currency: z.string().default("CAD").optional(),
//   currency: z.string(),
  tags: z.string().optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date (YYYY-MM-DD)"),
});

const standardBudgetSchema = baseSchema.extend({
  type: z.literal("StandardBudget"),
  frequency: z.enum(["monthly", "quarterly", "yearly"]),
});

const customBudgetSchema = baseSchema.extend({
  type: z.literal("CustomBudget"),
  end_date: z.string().min(1, "End date is required"),
});

export const budgetSchema = z.discriminatedUnion("type", [
  standardBudgetSchema,
  customBudgetSchema,
]);

export type BudgetFormValues = z.infer<typeof budgetSchema>;