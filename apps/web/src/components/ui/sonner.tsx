"use client";
import { Toaster as SonnerToaster } from "sonner";
import { CheckCircle2, CircleAlert, Info, Loader2, TriangleAlert } from "lucide-react";
export function Toaster() {
  return <SonnerToaster position="top-right" richColors closeButton expand={false} visibleToasts={4}
    toastOptions={{ duration: 4200, classNames: { toast: "font-sans shadow-lg", title: "font-semibold", description: "text-sm" } }}
    icons={{ success: <CheckCircle2 size={17} />, error: <CircleAlert size={17} />, warning: <TriangleAlert size={17} />, info: <Info size={17} />, loading: <Loader2 size={17} className="animate-spin" /> }} />;
}
