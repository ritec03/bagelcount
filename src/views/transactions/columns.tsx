"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { ArrowUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Transaction } from "@/lib/api/types.gen"

// This type is used to define the shape of our data.
// We might need to extend Transaction or use a view model if we need pre-calculated fields like "amount for this account"
export type TransactionRow = Transaction & {
  displayAmount: number
  displayCurrency: string
}

export const columns: ColumnDef<TransactionRow>[] = [
  {
    accessorKey: "date",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Date
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      return <div className="pl-4">{row.getValue("date")}</div>
    },
  },
  {
    accessorKey: "payee",
    header: "Payee / Description",
    cell: ({ row }) => {
      const payee = row.original.payee
      const narration = row.original.narration
      return (
        <div className="flex flex-col">
          <span className="font-medium">{payee || narration}</span>
          {payee && narration && (
            <span className="text-xs text-muted-foreground">{narration}</span>
          )}
        </div>
      )
    },
  },
  {
    accessorKey: "displayAmount",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Amount
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      const amount = parseFloat(row.getValue("displayAmount"))
      const currency = row.original.displayCurrency

      const formatted = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currency,
      }).format(amount)

      return <div className="font-medium">{formatted}</div>
    },
  },
]
