"use client";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Check,
  CheckCircle2,
  ChevronRight,
  CopyPlus,
  Eye,
  FileStack,
  FileText,
  FileUp,
  GripVertical,
  Hash,
  ListFilter,
  ListOrdered,
  Loader2,
  Mail,
  PenLine,
  Phone,
  Plus,
  Save,
  Search,
  ShieldCheck,
  TextCursorInput,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  api,
  errorMessage,
  normaliseForm,
  type FormRecord,
} from "@nolt/api-client";
import {
  createField,
  fieldTypes,
  formContentSchema,
  type FormContent,
  type FormField,
} from "@nolt/form-schemas";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormPreview } from "./form-preview";
import { toast } from "sonner";

const recipients = {
  EMPLOYEE: "Employee",
  GUARANTOR: "Guarantor",
  REFERENCE: "Reference",
};
const icons = {
  text: TextCursorInput,
  textarea: FileText,
  email: Mail,
  phone: Phone,
  number: Hash,
  date: FileText,
  select: ListOrdered,
  checkbox: CheckCircle2,
  file: FileUp,
  signature: PenLine,
};
const names = {
  text: "Short answer",
  textarea: "Long answer",
  email: "Email",
  phone: "Phone",
  number: "Number",
  date: "Date",
  select: "Dropdown",
  checkbox: "Confirmation",
  file: "Attachment",
  signature: "Signature",
};
type Notice = { kind: "success" | "error"; text: string } | null;

export function FormsWorkspace() {
  const [forms, setForms] = useState<FormRecord[]>([]),
    [active, setActive] = useState<FormRecord | null>(null),
    [csrf, setCsrf] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState<Notice>(null),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("ALL"),
    [createOpen, setCreateOpen] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<{
    title: string;
    recipient: "EMPLOYEE" | "GUARANTOR" | "REFERENCE";
  }>({ defaultValues: { title: "", recipient: "EMPLOYEE" } });
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const session = await api.GET("/api/v1/auth/session");
      if (session.data) setCsrf(session.data.csrfToken);
      const { data, error, response } = await api.GET("/api/v1/forms");
      if (response.status === 401) {
        setCsrf(null);
        return;
      }
      if (error) throw new Error(errorMessage(error));
      setForms((data ?? []).map(normaliseForm));
    } catch (error) {
      setNotice({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "Could not connect to the API.",
      });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (!notice) return;
    if (notice.kind === "error") toast.error(notice.text);
    else toast.success(notice.text);
    setNotice(null);
  }, [notice]);
  async function create(values: {
    title: string;
    recipient: "EMPLOYEE" | "GUARANTOR" | "REFERENCE";
  }) {
    setBusy(true);
    setNotice(null);
    try {
      const { data, error } = await api.POST("/api/v1/forms", {
        headers: { "x-csrf-token": csrf ?? "" },
        body: values,
      });
      if (error || !data) throw new Error(errorMessage(error));
      const record = normaliseForm(data);
      setActive(record);
      setCreateOpen(false);
      reset();
      await refresh();
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Could not create form.",
      });
    } finally {
      setBusy(false);
    }
  }
  async function open(record: FormRecord) {
    setBusy(true);
    setNotice(null);
    try {
      const { data, error } = await api.GET("/api/v1/form-versions/{id}", {
        params: { path: { id: record.id } },
      });
      if (error || !data) throw new Error(errorMessage(error));
      setActive(normaliseForm(data));
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Could not open form.",
      });
    } finally {
      setBusy(false);
    }
  }
  const visible = forms.filter(
    (form) =>
      (filter === "ALL" || form.status === filter) &&
      `${form.title} ${form.recipient}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      {active ? (
        <FormEditor
          key={active.id}
          record={active}
          csrf={csrf ?? ""}
          onBack={() => {
            setActive(null);
            void refresh();
          }}
          onChange={setActive}
          onNotice={setNotice}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold tracking-[0.15em] text-primary">
                YOUR PEOPLE, YOUR PROCESS
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                Form library
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
                Create the forms your people need. Keep every question,
                signature request and version in one place.
              </p>
            </div>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button disabled={!csrf || busy} className="gap-2">
                  <Plus size={17} />
                  Create form
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create a form</DialogTitle>
                  <DialogDescription>
                    Start with a title and decide who will complete it.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit(create)} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="new-title">Form title</Label>
                    <Input
                      id="new-title"
                      placeholder="e.g. Employee information"
                      {...register("title", {
                        required: "Enter a title.",
                        maxLength: 160,
                      })}
                    />
                    {errors.title && (
                      <p className="text-sm text-destructive">
                        {errors.title.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-recipient">Completed by</Label>
                    <select
                      id="new-recipient"
                      className="native-select"
                      {...register("recipient")}
                    >
                      {Object.entries(recipients).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="rounded-lg bg-secondary p-3 text-xs leading-5 text-muted-foreground">
                    Guarantor and reference forms will be sent by the employee.
                    The third party completes and signs their own response.
                  </p>
                  <Button type="submit" disabled={busy} className="w-full">
                    {busy ? (
                      <Loader2 className="animate-spin" size={16} />
                    ) : (
                      <Plus size={16} />
                    )}
                    Create draft
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          <div className="my-7 grid gap-4 sm:grid-cols-3">
            {[
              {
                label: "Forms shown",
                value: forms.length,
                icon: FileStack,
              },
              {
                label: "Published in this view",
                value: forms.filter((f) => f.status === "PUBLISHED").length,
                icon: CheckCircle2,
              },
              {
                label: "Drafts in progress",
                value: forms.filter((f) => f.status === "DRAFT").length,
                icon: PenLine,
              },
            ].map(({ label, value, icon: Icon }) => (
              <div
                key={label}
                className="flex items-center justify-between rounded-xl border bg-white p-5"
              >
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight">
                    {value}
                  </p>
                </div>
                <span className="rounded-xl bg-secondary p-3 text-primary">
                  <Icon size={20} />
                </span>
              </div>
            ))}
          </div>
          <section className="rounded-xl border bg-white">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b p-4 sm:p-5">
              <div className="flex gap-1" aria-label="Filter forms">
                {["ALL", "DRAFT", "PUBLISHED"].map((value) => (
                  <button
                    key={value}
                    onClick={() => setFilter(value)}
                    className={`rounded-md px-3 py-2 text-xs font-medium ${filter === value ? "bg-accent text-primary" : "text-muted-foreground hover:bg-muted"}`}
                  >
                    {value === "ALL"
                      ? "All forms"
                      : value === "DRAFT"
                        ? "Drafts"
                        : "Published"}
                  </button>
                ))}
              </div>
              <div className="relative w-full sm:w-64">
                <Search
                  size={16}
                  className="absolute left-3 top-3 text-muted-foreground"
                />
                <Input
                  aria-label="Search forms"
                  placeholder="Search your forms…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            {loading ? (
              <div className="flex items-center justify-center gap-3 p-16 text-sm text-muted-foreground">
                <Loader2 size={18} className="animate-spin" />
                Loading forms…
              </div>
            ) : visible.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-16 text-center">
                <span className="rounded-2xl bg-secondary p-5 text-primary">
                  <FileStack size={30} />
                </span>
                <h2 className="mt-5 text-lg font-semibold">
                  {search || filter !== "ALL"
                    ? "No matching forms"
                    : "A better onboarding starts here"}
                </h2>
                <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                  {search || filter !== "ALL"
                    ? "Try another search or filter."
                    : "Build your first form, choose its recipient and add the information you need to collect."}
                </p>
                {!search && filter === "ALL" && (
                  <Button
                    variant="outline"
                    className="mt-5"
                    disabled={!csrf}
                    onClick={() => setCreateOpen(true)}
                  >
                    <Plus size={16} />
                    Create your first form
                  </Button>
                )}
              </div>
            ) : (
              <div className="divide-y">
                {visible.map((form) => (
                  <button
                    key={form.id}
                    onClick={() => void open(form)}
                    disabled={busy}
                    className="flex w-full items-center gap-4 p-4 text-left transition hover:bg-background sm:p-5"
                  >
                    <span className="rounded-lg bg-secondary p-3 text-primary">
                      <FileText size={20} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {form.title}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {recipients[form.recipient]} · Version {form.version} ·{" "}
                        {form.fields.length} fields
                      </p>
                    </div>
                    <Badge
                      variant={
                        form.status === "PUBLISHED" ? "default" : "secondary"
                      }
                    >
                      {form.status === "PUBLISHED" ? "Published" : form.status === "UNPUBLISHED" ? "Unpublished" : "Draft"}
                    </Badge>
                    <ChevronRight
                      size={17}
                      className="shrink-0 text-muted-foreground"
                    />
                  </button>
                ))}
              </div>
            )}
          </section>
          <div className="mt-5 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
            <ShieldCheck size={15} className="mt-0.5 shrink-0" />
            Published in this view stay locked. Create a new version to make
            changes without rewriting earlier records.
          </div>
        </>
      )}
    </>
  );
}

function FormEditor({
  record,
  csrf,
  onBack,
  onChange,
  onNotice,
}: {
  record: FormRecord;
  csrf: string;
  onBack: () => void;
  onChange: (record: FormRecord) => void;
  onNotice: (notice: Notice) => void;
}) {
  const [content, setContent] = useState<FormContent>({
      title: record.title,
      description: record.description,
      recipient: record.recipient,
      fields: record.fields,
    }),
    [selected, setSelected] = useState<string | null>(
      record.fields[0]?.id ?? null,
    ),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState(false),
    [confirmAction, setConfirmAction] = useState<"delete" | "unpublish" | null>(null);
  const published = record.status !== "DRAFT",
    dirty =
      JSON.stringify(content) !==
      JSON.stringify({
        title: record.title,
        description: record.description,
        recipient: record.recipient,
        fields: record.fields,
      });
  const field = content.fields.find((item) => item.id === selected);
  useEffect(() => {
    function warn(event: BeforeUnloadEvent) {
      if (dirty) {
        event.preventDefault();
      }
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function editField(patch: Partial<FormField>) {
    setContent((old) => ({
      ...old,
      fields: old.fields.map((item) =>
        item.id === selected ? { ...item, ...patch } : item,
      ),
    }));
  }
  function add(type: FormField["type"]) {
    const item = createField(type, crypto.randomUUID());
    setContent((old) => ({ ...old, fields: [...old.fields, item] }));
    setSelected(item.id);
  }
  function move(id: string, offset: number) {
    setContent((old) => {
      const fields = [...old.fields],
        index = fields.findIndex((item) => item.id === id),
        target = index + offset;
      if (target < 0 || target >= fields.length) return old;
      [fields[index], fields[target]] = [fields[target], fields[index]];
      return { ...old, fields };
    });
  }
  function leave() {
    if (
      !dirty ||
      window.confirm("You have unsaved changes. Leave without saving?")
    )
      onBack();
  }
  async function save(): Promise<FormRecord | null> {
    const result = formContentSchema.safeParse(content);
    if (!result.success) {
      onNotice({
        kind: "error",
        text: result.error.issues.map((x) => x.message).join(" "),
      });
      return null;
    }
    const { data, error } = await api.PUT("/api/v1/form-versions/{id}", {
      params: { path: { id: record.id } },
      headers: { "x-csrf-token": csrf },
      body: { expectedRevision: record.revision, content: result.data },
    });
    if (error || !data) throw new Error(errorMessage(error));
    const saved = normaliseForm(data);
    onChange(saved);
    setContent({
      title: saved.title,
      description: saved.description,
      recipient: saved.recipient,
      fields: saved.fields,
    });
    return saved;
  }
  async function action(publish: boolean) {
    setBusy(true);
    onNotice(null);
    try {
      const saved = dirty ? await save() : record;
      if (!saved) return;
      if (publish) {
        const { data, error } = await api.POST(
          "/api/v1/form-versions/{id}/publish",
          {
            params: { path: { id: record.id } },
            headers: { "x-csrf-token": csrf },
            body: { expectedRevision: saved.revision },
          },
        );
        if (error || !data) throw new Error(errorMessage(error));
        onChange(normaliseForm(data));
      }
      onNotice({
        kind: "success",
        text: publish
          ? "Version published. Its questions and signing settings are now locked."
          : "Draft saved to the database.",
      });
    } catch (error) {
      onNotice({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "Could not save. Please retry.",
      });
    } finally {
      setBusy(false);
    }
  }
  async function nextVersion() {
    setBusy(true);
    try {
      const { data, error } = await api.POST("/api/v1/forms/{id}/versions", {
        params: { path: { id: record.formId } },
        headers: { "x-csrf-token": csrf },
      });
      if (error || !data) throw new Error(errorMessage(error));
      onChange(normaliseForm(data));
      onNotice({
        kind: "success",
        text: "New draft version created. The published version is unchanged.",
      });
    } catch (error) {
      onNotice({
        kind: "error",
        text:
          error instanceof Error ? error.message : "Could not create version.",
      });
    } finally {
      setBusy(false);
    }
  }
  async function changePublication() {
    if (!confirmAction) return;
    const operation = confirmAction;
    setBusy(true);
    onNotice(null);
    try {
      const response = await fetch(
        operation === "delete"
          ? `/api/v1/forms/${record.formId}/draft`
          : `/api/v1/form-versions/${record.id}/unpublish`,
        {
          method: operation === "delete" ? "DELETE" : "POST",
          headers: {
            "x-csrf-token": csrf,
            ...(operation === "unpublish" ? { "content-type": "application/json" } : {}),
          },
          credentials: "same-origin",
          ...(operation === "unpublish"
            ? { body: JSON.stringify({ expectedRevision: record.revision }) }
            : {}),
        },
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(errorMessage(error));
      }
      if (operation === "unpublish") {
        onChange(normaliseForm(await response.json()));
        onNotice({ kind: "success", text: "Form unpublished. Existing assigned copies are preserved." });
      } else {
        onNotice({ kind: "success", text: "Unpublished draft permanently deleted." });
        onBack();
      }
      setConfirmAction(null);
    } catch (error) {
      onNotice({ kind: "error", text: error instanceof Error ? error.message : "Unable to update form." });
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Dialog open={confirmAction !== null} onOpenChange={(open) => { if (!open && !busy) setConfirmAction(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmAction === "delete" ? "Delete this draft?" : "Unpublish this form?"}</DialogTitle>
            <DialogDescription>
              {confirmAction === "delete"
                ? "This permanently deletes a form that has never been published or assigned. This cannot be undone."
                : "This version can no longer be assigned to new employees. Existing assignments, answers and evidence remain unchanged."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 pt-3 sm:flex-row sm:justify-end">
            <Button variant="outline" disabled={busy} onClick={() => setConfirmAction(null)}>Cancel</Button>
            <Button variant={confirmAction === "delete" ? "destructive" : "default"} disabled={busy} onClick={() => void changePublication()}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : null}
              {confirmAction === "delete" ? "Delete draft" : "Unpublish version"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <button
        onClick={leave}
        className="mb-5 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"
      >
        <ArrowLeft size={15} />
        Back to forms
      </button>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="break-words text-2xl font-semibold tracking-tight sm:text-3xl">
              {record.title}
            </h1>
            <Badge variant={published ? "default" : "secondary"}>
              {record.status === "PUBLISHED" ? "Published" : record.status === "UNPUBLISHED" ? "Unpublished" : "Draft"} · v{record.version}
            </Badge>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {published
              ? "This version is locked. Create a new draft to make changes."
              : dirty
                ? "Unsaved changes · save before leaving"
                : "All changes saved"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setPreview(true)}>
            <Eye size={16} />
            Preview
          </Button>
          {published ? (
            <>
            <Button variant="outline" disabled={busy} onClick={() => setConfirmAction("unpublish")}>
              Unpublish
            </Button>
            <Button onClick={nextVersion} disabled={busy}>
              <CopyPlus size={16} />
              New version
            </Button>
            </>
          ) : (
            <>
              {record.version === 1 && (
                <Button variant="destructive" disabled={busy} onClick={() => setConfirmAction("delete")}>
                  <Trash2 size={16} /> Delete draft
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => void action(false)}
                disabled={busy || !dirty}
              >
                <Save size={16} />
                Save draft
              </Button>
              <Button onClick={() => void action(true)} disabled={busy}>
                {busy ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Check size={16} />
                )}
                Publish form
              </Button>
            </>
          )}
        </div>
      </div>
      {content.recipient !== "EMPLOYEE" && (
        <div className="mt-5 flex items-start gap-3 rounded-lg border border-primary/20 bg-accent p-4 text-sm leading-6">
          <Users size={18} className="mt-1 shrink-0 text-primary" />
          <p>
            The employee sends this form to their{" "}
            {recipients[content.recipient].toLowerCase()}. That person completes
            and signs it independently. Sending will be available in the
            external-request milestone.
          </p>
        </div>
      )}
      <div className="mt-6 grid items-start gap-5 xl:grid-cols-[220px_minmax(0,1fr)_280px]">
        <aside className="rounded-xl border bg-white p-4">
          <h2 className="text-sm font-semibold">Add fields</h2>
          <p className="mb-4 mt-1 text-xs leading-5 text-muted-foreground">
            Choose what you need to collect.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-1">
            {fieldTypes.map((type) => {
              const Icon = icons[type];
              return (
                <Button
                  key={type}
                  variant="outline"
                  size="sm"
                  className="justify-start text-xs"
                  disabled={published || busy}
                  onClick={() => add(type)}
                >
                  <Icon size={15} />
                  {names[type]}
                </Button>
              );
            })}
          </div>
          <p className="mt-5 border-t pt-4 text-xs leading-5 text-muted-foreground">
            Attachments and signatures are configured here. Response collection
            and private file handling come next.
          </p>
        </aside>
        <section className="min-w-0 rounded-xl border bg-white p-5 sm:p-7">
          <fieldset disabled={published || busy} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="form-title">Form title</Label>
              <Input
                id="form-title"
                value={content.title}
                maxLength={160}
                onChange={(e) =>
                  setContent({ ...content, title: e.target.value })
                }
                className="text-lg font-semibold"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="form-description">Instructions</Label>
              <Textarea
                id="form-description"
                placeholder="Tell the respondent what this form is for…"
                value={content.description}
                maxLength={2000}
                onChange={(e) =>
                  setContent({ ...content, description: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="form-recipient">Who completes this form?</Label>
              <select
                id="form-recipient"
                className="native-select"
                value={content.recipient}
                onChange={(e) =>
                  setContent({
                    ...content,
                    recipient: e.target.value as FormContent["recipient"],
                  })
                }
              >
                {Object.entries(recipients).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </fieldset>
          <div className="my-6 flex items-center justify-between border-t pt-5">
            <h2 className="text-sm font-semibold">Your questions</h2>
            <span className="text-xs text-muted-foreground">
              {content.fields.length} fields
            </span>
          </div>
          <div className="space-y-3">
            {content.fields.length === 0 ? (
              <div className="rounded-lg border border-dashed px-5 py-14 text-center">
                <Plus size={24} className="mx-auto text-primary" />
                <p className="mt-3 text-sm font-medium">
                  Make this form your own
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Choose a field from the palette to get started.
                </p>
              </div>
            ) : (
              content.fields.map((item, index) => {
                const Icon = icons[item.type];
                return (
                  <div
                    key={item.id}
                    className={`rounded-lg border p-3 ${selected === item.id ? "border-primary bg-accent/30 ring-1 ring-primary/20" : "bg-white"}`}
                  >
                    <button
                      onClick={() => setSelected(item.id)}
                      className="flex w-full items-start gap-3 text-left"
                    >
                      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-secondary text-xs text-muted-foreground">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-medium">
                          {item.label || "Untitled question"}
                          {item.required && (
                            <span className="text-destructive"> *</span>
                          )}
                        </p>
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Icon size={12} />
                          {names[item.type]}
                        </p>
                      </div>
                      <ChevronRight
                        size={16}
                        className="mt-1 shrink-0 text-muted-foreground"
                      />
                    </button>
                    {!published && (
                      <div className="mt-3 flex justify-end gap-1 border-t pt-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          disabled={index === 0 || busy}
                          onClick={() => move(item.id, -1)}
                          aria-label={`Move ${item.label} up`}
                        >
                          <ArrowUp size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          disabled={index === content.fields.length - 1 || busy}
                          onClick={() => move(item.id, 1)}
                          aria-label={`Move ${item.label} down`}
                        >
                          <ArrowDown size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-destructive"
                          disabled={busy}
                          onClick={() => {
                            setContent({
                              ...content,
                              fields: content.fields.filter(
                                (f) => f.id !== item.id,
                              ),
                            });
                            if (selected === item.id) setSelected(null);
                          }}
                          aria-label={`Remove ${item.label}`}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>
        <aside className="min-w-0 rounded-xl border bg-white p-5">
          <h2 className="text-sm font-semibold">Field settings</h2>
          {field ? (
            <fieldset disabled={published || busy} className="mt-5 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="field-label">Question label</Label>
                <Input
                  id="field-label"
                  maxLength={200}
                  value={field.label}
                  onChange={(e) => editField({ label: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="field-help">Help text</Label>
                <Textarea
                  id="field-help"
                  maxLength={1000}
                  value={field.helpText}
                  onChange={(e) => editField({ helpText: e.target.value })}
                />
              </div>
              <label
                className="flex items-center justify-between gap-3 text-sm"
                htmlFor="field-required"
              >
                Required field
                <input
                  id="field-required"
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={field.required}
                  onChange={(e) => editField({ required: e.target.checked })}
                />
              </label>
              {field.type === "select" && (
                <div className="space-y-2">
                  <Label htmlFor="field-options">Options (one per line)</Label>
                  <Textarea
                    id="field-options"
                    value={field.options.join("\n")}
                    onChange={(e) =>
                      editField({ options: e.target.value.split("\n") })
                    }
                  />
                </div>
              )}
              {field.type === "signature" && (
                <div className="space-y-2">
                  <Label htmlFor="signature-method">Signature method</Label>
                  <select
                    id="signature-method"
                    className="native-select"
                    value={field.signatureMethod}
                    onChange={(e) =>
                      editField({
                        signatureMethod: e.target
                          .value as FormField["signatureMethod"],
                      })
                    }
                  >
                    <option value="EITHER">Draw or attach</option>
                    <option value="DRAW">Draw signature</option>
                    <option value="UPLOAD">Attach signature image</option>
                  </select>
                  <p className="text-xs leading-5 text-muted-foreground">
                    The respondent must sign their own form. Captured evidence
                    will reference its exact version.
                  </p>
                </div>
              )}
              {field.type === "file" && (
                <div className="space-y-2">
                  <Label htmlFor="attachment-purpose">Attachment purpose</Label>
                  <select
                    id="attachment-purpose"
                    className="native-select"
                    value={field.attachmentPurpose}
                    onChange={(e) =>
                      editField({
                        attachmentPurpose: e.target
                          .value as FormField["attachmentPurpose"],
                      })
                    }
                  >
                    <option value="SUPPORTING_DOCUMENT">
                      Supporting document
                    </option>
                    <option value="SIGNED_DOCUMENT">Signed document</option>
                  </select>
                </div>
              )}
            </fieldset>
          ) : (
            <p className="mt-4 text-xs leading-6 text-muted-foreground">
              Select a question to edit its label, instructions and validation
              settings.
            </p>
          )}
        </aside>
      </div>
      <Dialog open={preview} onOpenChange={setPreview}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Respondent preview</DialogTitle>
            <DialogDescription>
              Check the layout and questions before publishing.
            </DialogDescription>
          </DialogHeader>
          <div className="py-5">
            <FormPreview content={content} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
