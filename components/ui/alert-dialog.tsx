"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const AlertDialog = Dialog;
const AlertDialogContent = DialogContent;
const AlertDialogDescription = DialogDescription;
const AlertDialogHeader = DialogHeader;
const AlertDialogTitle = DialogTitle;

const AlertDialogAction = React.forwardRef<HTMLButtonElement, React.ComponentPropsWithoutRef<"button">>(
  ({ className = "", type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={`rounded border px-3 py-1 text-sm ${className}`.trim()}
      {...props}
    />
  ),
);
AlertDialogAction.displayName = "AlertDialogAction";

const AlertDialogCancel = React.forwardRef<HTMLButtonElement, React.ComponentPropsWithoutRef<"button">>(
  ({ className = "", type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={`rounded border px-3 py-1 text-sm ${className}`.trim()}
      {...props}
    />
  ),
);
AlertDialogCancel.displayName = "AlertDialogCancel";

const AlertDialogFooter = ({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={`flex justify-end gap-2 pt-2 ${className}`.trim()} {...props} />
);

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
};
