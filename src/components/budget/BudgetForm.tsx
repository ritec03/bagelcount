
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createBudgetApiV1BudgetsPost as createBudget } from "../../lib/api/sdk.gen";
import type { BudgetSubmission } from "../../lib/types";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { useBudgets } from "../../hooks/useBudgets";
import { useAccounts } from "../../hooks/useAccounts";
import { useBudgetValidation } from "../../hooks/useBudgetValidation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { budgetSchema, type BudgetFormValues } from "@/lib/schemas";

// Type-safe mapper for initialData
function mapInitialDataToFormValues(
  initialData: BudgetSubmission | null | undefined
): BudgetFormValues {
  if (!initialData) {
    return {
      type: "StandardBudget" as const,
      account: "",
      amount: "",
      currency: "CAD",
      tags: "",
      start_date: new Date().toISOString().split("T")[0],
      frequency: "monthly",
    };
  }

  const base = {
    account: initialData.account,
    amount: String(initialData.amount),
    currency: initialData.currency || "CAD",
    tags: initialData.tags?.join(", ") || "",
    start_date: initialData.start_date,
  };

  if ("frequency" in initialData) {
    return {
      ...base,
      type: "StandardBudget" as const,
      frequency: initialData.frequency,
    };
  } else {
    return {
      ...base,
      type: "CustomBudget" as const,
      end_date: initialData.end_date,
    };
  }
}

interface BudgetFormProps {
  onSuccess?: () => void;
  initialData?: BudgetSubmission | null;
}

export function BudgetForm({ onSuccess, initialData }: BudgetFormProps) {
  const defaultValues = mapInitialDataToFormValues(initialData);
  const initialType = defaultValues.type || "StandardBudget";

  const [activeTab, setActiveTab] = useState<"StandardBudget" | "CustomBudget">(initialType);
  
  // Fetch accounts and filter to Expenses only
  const { accounts } = useAccounts();
  const expenseAccounts = accounts.filter(acc => acc.name.startsWith("Expenses:"));
  
  
  const form = useForm<BudgetFormValues>({
    resolver: zodResolver(budgetSchema),
    defaultValues,
  });

  const { handleSubmit, setValue, watch, formState: { isSubmitting } } = form;

  // React to tab change
  const handleTabChange = (type: "StandardBudget" | "CustomBudget") => {
    setActiveTab(type);
    setValue("type", type);
  };

  // Retrieve current budgets for validation context
  const { budgets } = useBudgets();
  
  // Watch form fields for real-time validation
  // eslint-disable-next-line react-hooks/incompatible-library -- watch() from react-hook-form cannot be memoized, this is expected behavior
  const watchedAccount = watch("account");
  const watchedAmount = watch("amount");
  const watchedType = watch("type");
  
  const watchedFrequency = watch("frequency");
  
  // Real-time validation hook
  const validation = useBudgetValidation(
    budgets,
    watchedAccount || "",
    parseFloat(watchedAmount) || 0,
    watchedType || "StandardBudget",
    watchedFrequency
  ); 

  const onSubmit = async (data: BudgetFormValues) => {
    try {
      // Submit-time validation check (blocks submission)
      // Only block if there is a parent violation (error)
      if (validation.error) {
        form.setError("amount", {
          type: "manual",
          message: validation.error
        });
        return;
      }

      // Transformation: String tags -> Array
      const tagsArray = data.tags 
        ? data.tags.split(",").map(t => t.trim()).filter(Boolean) 
        : [];
        
      // Construct Payload
      let payload: BudgetSubmission;
      
      const base = {
        account: data.account,
        amount: data.amount, 
        currency: data.currency,
        tags: tagsArray,
        start_date: data.start_date,
      };

      if (data.type === "StandardBudget") {
        payload = {
            ...base,
            frequency: data.frequency as "monthly" | "quarterly" | "yearly",
        };
      } else {
        payload = {
            ...base,
            end_date: data.end_date!,
        };
      }
      
      // API Call
      await createBudget({ body: payload });
      
      if (onSuccess) onSuccess();
      
    } catch (err) {
      console.error(err);
      alert("Failed to save budget");
    }
  };
  
  const [accountPopoverOpen, setAccountPopoverOpen] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Budget</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={(value) => handleTabChange(value as "StandardBudget" | "CustomBudget")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="StandardBudget">Recurring Rule</TabsTrigger>
            <TabsTrigger value="CustomBudget">One-off Project</TabsTrigger>
          </TabsList>
        </Tabs>

        <Form {...form}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-6">
            
            {/* Account - Combobox */}
            <FormField
              control={form.control}
              name="account"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Account</FormLabel>
                  <Popover open={accountPopoverOpen} onOpenChange={setAccountPopoverOpen}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          role="combobox"
                          className={cn(
                            "w-full justify-between",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          {field.value
                            ? expenseAccounts.find((acc) => acc.name === field.value)?.name
                            : "Select account..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-[400px] p-0">
                      <Command>
                        <CommandInput placeholder="Search accounts..." />
                        <CommandList>
                          <CommandEmpty>No account found.</CommandEmpty>
                          <CommandGroup>
                            {expenseAccounts.map((acc) => (
                              <CommandItem
                                value={acc.name}
                                key={acc.name}
                                onSelect={() => {
                                  form.setValue("account", acc.name);
                                  setAccountPopoverOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    acc.name === field.value
                                      ? "opacity-100"
                                      : "opacity-0"
                                  )}
                                />
                                {acc.name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Amount */}
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-gray-500 text-xs mt-0.5">CAD</span>
                      <Input {...field} className="pl-10" placeholder="500.00" />
                    </div>
                  </FormControl>
                  {/* Real-time helper text (non-blocking) */}
                  {validation.availableBudget !== null && (
                    <FormDescription>
                      Available budget: ${validation.availableBudget.toFixed(2)}/{watchedFrequency}
                    </FormDescription>
                  )}
                  {validation.error && (
                    <FormDescription className="text-red-500 font-medium">
                      {validation.error}
                    </FormDescription>
                  )}
                  {validation.warnings.length > 0 && (
                     <div className="mt-2 text-sm text-amber-600 bg-amber-50 p-2 rounded border border-amber-200">
                        <p className="font-medium flex items-center">
                            ⚠️ This budget is insufficient for sub-categories:
                        </p>
                        <ul className="list-disc list-inside mt-1">
                            {validation.warnings.map((w, i) => (
                                <li key={i}>{w}</li>
                            ))}
                        </ul>
                        {validation.affectedChildren.length > 0 && (
                            <div className="mt-1 text-xs">
                                <span className="font-medium">Affected: </span>
                                {validation.affectedChildren.map(c => `${c.account} (${c.frequency})`).join(", ")}
                            </div>
                        )}
                     </div>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Conditional Fields */}
            {activeTab === "StandardBudget" ? (
              <FormField
                control={form.control}
                name="frequency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Frequency</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select frequency" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="quarterly">Quarterly</SelectItem>
                        <SelectItem value="yearly">Yearly</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <FormField
                control={form.control}
                name="end_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Start Date */}
            <FormField
              control={form.control}
              name="start_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Start Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Tags */}
            <FormField
              control={form.control}
              name="tags"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tags (comma separated)</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="vacation, essentials" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Budget
            </Button>

          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
